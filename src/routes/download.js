// src/routes/download.js — DOWNLOADER: TikTok · YouTube · Facebook · Instagram ·
// Pinterest · MP3 · MP4 · Play · Lyric.
// ?direct= devuelve el archivo en streaming (con Range 206) en lugar de JSON.
const express = require('express');
const P = require('../utils/providers');
const COBALT = require('../utils/cobalt');
const { sendSuccess, sendError, sendText, sendPng, proxyStream, sendFile, wantsDownload } = require('../utils/response');
const { absoluteUrl, fetchWithTimeout, UA_DESKTOP } = require('../utils/http');
const { bratFromLyrics } = require('../utils/lyricArt');

const router = express.Router();

const wantDirect = (req, kinds = ['true']) => {
  const d = String(req.query.direct || '').toLowerCase();
  if (kinds.includes(d)) return d;
  // ?download=true ya implica bajar el archivo (mp4 si el endpoint es de video).
  if (wantsDownload(req)) return kinds.includes('mp4') ? 'mp4' : kinds[0];
  return null;
};
const cleanName = (s, fb = 'Velirius') =>
  String(s || fb).normalize('NFKD').replace(/[^\x20-\x7E]/g, '').replace(/[<>:"/\\|?*]/g, '').replace(/\s+/g, '_').slice(0, 60) || fb;

const handle = fn => async (req, res) => {
  try {
    return await fn(req, res);
  } catch (e) {
    console.error('[downloader]', e.message);
    if (!res.headersSent) {
      return sendError(res, e.status && e.status < 500 ? e.status : 502, e.message,
        e.details ? e.details.slice(0, 3).join(' · ') : undefined);
    }
  }
};

/**
 * Envía un video reproducible: URL remota (con Range) o el MP4 ya pegado con
 * ffmpeg cuando YouTube sólo publicaba video y audio por separado.
 */
async function enviarVideo(req, res, playable, filename) {
  if (playable.file) return sendFile(res, playable.file, { mime: playable.mime || 'video/mp4', filename });
  if (!playable.url) throw new Error('La fuente no devolvió una URL de video');
  return proxyStream(req, res, playable.url, { filename });
}

/**
 * Elige el formato de video para descargar/reproducir.
 * Si ya hay un formato progresivo (video + audio en el mismo archivo) se usa
 * directo; si no, `youtubePlayable` lo arma pegando las dos pistas con ffmpeg.
 * Así el modo automático (sin `quality`) siempre se reproduce con sonido.
 */
async function videoConAudio(info, quality) {
  const q = P.normalizarCalidad(quality);
  const best = P.bestPlayableVideo(info.formats, q);
  if (best?.url && best.hasAudio) {
    return { ...best, hasAudio: true, muxed: false, source: info.source || null };
  }
  try {
    return await P.youtubePlayable(info.id, q);
  } catch (e) {
    const fallback = P.pickVideo(info.formats, q || Number.MAX_SAFE_INTEGER);
    if (fallback?.url && fallback.hasAudio) return { ...fallback, hasAudio: true, muxed: false, source: info.source || null };
    throw e;
  }
}

/**
 * Audio reproducible: primero el formato adaptativo ya resuelto, si no
 * youtubeAudio (youtubei.js). Si YouTube bloquea al servidor por IP, el último
 * recurso es cobalt en modo audio: devuelve un MP3 directo.
 */
async function audioDe(info) {
  const audio = P.pickAudio(info.formats);
  if (audio?.url) return { ...audio, source: info.source || null };
  try {
    return await P.youtubeAudio(info.id);
  } catch (e) {
    const r = await COBALT.pedir(`https://www.youtube.com/watch?v=${info.id}`, { downloadMode: 'audio', audioFormat: 'mp3' });
    return { url: r.url, mime: 'audio/mpeg', quality: 'audio', bitrate: null, source: 'cobalt' };
  }
}

const extAudio = (mime = '') => (/webm/i.test(mime) ? 'webm' : /mpeg|mp3/i.test(mime) ? 'mp3' : 'm4a');

/**
 * Sirve el audio ya convertido a MP3 (lo hace ffmpeg): así suena en cualquier
 * navegador y se puede descargar como `.mp3`. Si la conversión falla, se manda
 * el stream original del proveedor.
 */
async function enviarAudio(req, res, info) {
  const base = cleanName(info.title);
  try {
    const file = await P.youtubeAudioFile(info.id);
    return sendFile(res, file, { mime: 'audio/mpeg', filename: `${base}.mp3`, cache: 'public, max-age=3600' });
  } catch (e) {
    console.error('[downloader/audio]', e.message);
  }
  const audio = await audioDe(info);
  return proxyStream(req, res, audio.url, { filename: `${base}.${extAudio(audio.mime)}` });
}

/** URLs públicas del audio: para reproducir y para descargar el mismo archivo. */
function urlsAudio(req, path, query) {
  const base = `${path}?${query}`;
  return {
    play: absoluteUrl(req, `${base}&direct=true`),
    download: absoluteUrl(req, `${base}&direct=true&download=true`)
  };
}

// ---------- TikTok sin marca de agua ----------
router.get('/tiktok', handle(async (req, res) => {
  const url = String(req.query.url || '').trim();
  if (!url) return sendError(res, 400, 'Falta el parámetro url', 'Ejemplo: /downloader/tiktok?url=https://vt.tiktok.com/…');
  const info = await P.tiktokDownload(url);
  const direct = wantDirect(req, ['true', 'mp4', 'mp3', 'video', 'audio']);
  if (direct === 'mp3' || direct === 'audio') {
    if (!info.audio) throw new Error('Este TikTok no tiene audio extraíble');
    return proxyStream(req, res, info.audio, { filename: `${cleanName(info.title)}.mp3` });
  }
  if (direct) {
    if (!info.video_nowatermark) throw new Error('No hay video sin marca de agua para este enlace');
    return proxyStream(req, res, info.video_nowatermark, { filename: `${cleanName(info.title)}.mp4` });
  }
  return sendSuccess(res, {
    ...info,
    directUrls: {
      mp4: absoluteUrl(req, `/downloader/tiktok?url=${encodeURIComponent(url)}&direct=mp4`),
      mp3: absoluteUrl(req, `/downloader/tiktok?url=${encodeURIComponent(url)}&direct=mp3`)
    }
  });
}));

// ---------- YouTube (info + formatos) ----------
router.get(['/youtube', '/yt'], handle(async (req, res) => {
  const info = await P.resolveYoutubeTarget({ url: req.query.url, query: req.query.query || req.query.q });
  const quality = P.normalizarCalidad(req.query.quality);
  const direct = wantDirect(req, ['true', 'mp4', 'mp3', 'video', 'audio']);
  const watch = `https://www.youtube.com/watch?v=${info.id}`;

  if (direct === 'mp3' || direct === 'audio') return enviarAudio(req, res, info);
  if (direct) {
    const playable = await videoConAudio(info, quality);
    return enviarVideo(req, res, playable, `${cleanName(info.title)}.mp4`);
  }

  // JSON: se intenta resolver el video reproducible; si falla, igual devuelve la info.
  let playable = null;
  let audio = P.pickAudio(info.formats);
  try { playable = await videoConAudio(info, quality); } catch (e) { console.error('[downloader/youtube]', e.message); }
  try { if (!audio?.url) audio = await audioDe(info); } catch (_) { /* opcional */ }
  const base = `/downloader/youtube?url=${encodeURIComponent(watch)}&direct=`;
  const mp4 = absoluteUrl(req, `${base}mp4&quality=${quality || 'auto'}`);
  const mp3 = absoluteUrl(req, `${base}mp3`);
  const mp4Download = absoluteUrl(req, `${base}mp4&quality=${quality || 'auto'}&download=true`);
  const mp3Download = absoluteUrl(req, `${base}mp3&download=true`);

  return sendSuccess(res, {
    id: info.id, title: info.title, author: info.author, duration: info.duration,
    thumbnail: info.thumbnail, url: watch,
    quality: quality || 'auto',
    hasAudio: Boolean(playable?.hasAudio),
    audio: audio ? {
      quality: audio.quality, mime: 'audio/mpeg', bitrate: audio.bitrate || null,
      url: mp3, downloadUrl: mp3Download
    } : null,
    video: playable ? {
      quality: playable.quality || null,
      height: playable.height || null,
      mime: playable.mime || 'video/mp4',
      hasAudio: Boolean(playable.hasAudio),
      mergedWithFfmpeg: Boolean(playable.muxed),
      url: mp4,
      downloadUrl: mp4Download
    } : null,
    formats: info.formats,
    directUrls: { mp4, mp3, mp4Download, mp3Download }
  });
}));

// ---------- Facebook (videos públicos) ----------
router.get(['/facebook', '/fb'], handle(async (req, res) => {
  const url = String(req.query.url || '').trim();
  if (!url) return sendError(res, 400, 'Falta el parámetro url', 'Ejemplo: /downloader/facebook?url=https://www.facebook.com/watch/?v=…');
  const info = await P.facebookDownload(url);
  if (wantDirect(req, ['true', 'mp4', 'video', '1'])) {
    const prefer = String(req.query.quality || '').toLowerCase();
    const chosen = prefer === 'sd' ? (info.sd || info.hd) : (info.hd || info.sd);
    if (!chosen) throw new Error('No se encontró un archivo de video público');
    return proxyStream(req, res, chosen, { filename: `${cleanName(info.title)}.mp4` });
  }
  return sendSuccess(res, {
    ...info,
    directUrls: {
      hd: info.hd ? absoluteUrl(req, `/downloader/facebook?url=${encodeURIComponent(url)}&direct=mp4&quality=hd`) : null,
      sd: info.sd ? absoluteUrl(req, `/downloader/facebook?url=${encodeURIComponent(url)}&direct=mp4&quality=sd`) : null
    }
  });
}));

// ---------- Instagram ----------
router.get(['/instagram', '/ig'], handle(async (req, res) => {
  const url = String(req.query.url || '').trim();
  if (!url) return sendError(res, 400, 'Falta el parámetro url', 'Ejemplo: /downloader/instagram?url=https://www.instagram.com/reel/…');
  const info = await P.instagramDownload(url);
  const lista = info.media || [];
  // `index` elige el slide de un carrusel (0 = el primero).
  const i = Math.max(0, Math.min(Math.max(0, lista.length - 1), parseInt(req.query.index ?? req.query.i, 10) || 0));
  const self = req.originalUrl.split('?')[0];
  const media = lista.map((m, n) => ({
    ...m,
    index: n,
    downloadUrl: absoluteUrl(req, `${self}?url=${encodeURIComponent(url)}&index=${n}&direct=true&download=true`),
    directUrl: absoluteUrl(req, `${self}?url=${encodeURIComponent(url)}&index=${n}&direct=true`)
  }));
  if (wantDirect(req, ['true', '1', 'mp4', 'jpg', 'image', 'video']) && lista[i]) {
    const m = lista[i];
    return proxyStream(req, res, m.url, {
      filename: `velirius-ig-${info.shortcode || 'post'}-${i + 1}.${m.type === 'video' ? 'mp4' : 'jpg'}`,
      headers: { Referer: 'https://www.instagram.com/', 'User-Agent': UA_DESKTOP }
    });
  }
  return sendSuccess(res, { ...info, count: media.length, media });
}));

// ---------- Pinterest ----------
/**
 * Descarga un pin de Pinterest (imagen, GIF o video).
 *   · ?url=https://www.pinterest.com/pin/…  → resuelve y baja el archivo.
 *   · ?direct=true → devuelve el archivo; sin `direct` devuelve JSON con los
 *     links (`image`, `video`, `downloadUrl`).
 */
router.get(['/pinterest', '/pin'], handle(async (req, res) => {
  const url = String(req.query.url || '').trim();
  if (!url) {
    return sendError(res, 400, 'Falta el parámetro url',
      'Ejemplo: /downloader/pinterest?url=https://www.pinterest.com/pin/1234567890/');
  }
  const pin = await P.pinterestDownload(url);
  const archivo = pin.video || pin.image;
  if (!archivo) throw new Error('El pin no tiene imagen ni video público');
  const ext = pin.video ? 'mp4' : (/\.[a-z0-9]{2,5}(?:\?|$)/i.exec(pin.image || '') || [])[1] || 'jpg';
  const nombre = `${cleanName(pin.title || `pinterest-${pin.id || 'pin'}`)}.${ext}`;
  if (wantDirect(req, ['true', 'image', 'img', 'video', 'mp4', '1'])) {
    return proxyStream(req, res, archivo, {
      filename: nombre,
      headers: { Referer: 'https://www.pinterest.com/', 'User-Agent': UA_DESKTOP }
    });
  }
  const self = req.originalUrl.split('?')[0];
  const base = `${self}?url=${encodeURIComponent(url)}&direct=true`;
  return sendSuccess(res, {
    ...pin,
    downloadUrl: absoluteUrl(req, `${base}&download=true`),
    directUrl: absoluteUrl(req, base)
  });
}));

// ---------- MP3 ----------
router.get(['/mp3', '/ytmp3'], handle(async (req, res) => {
  const info = await P.resolveYoutubeTarget({ url: req.query.url, query: req.query.query || req.query.q });
  if (wantDirect(req, ['true', 'mp3', 'audio', '1'])) return enviarAudio(req, res, info);

  const query = `url=${encodeURIComponent(`https://www.youtube.com/watch?v=${info.id}`)}`;
  const urls = urlsAudio(req, '/downloader/mp3', query);
  const audio = await audioDe(info);
  if (!audio?.url) throw new Error('No se encontró audio para este video');
  return sendSuccess(res, {
    id: info.id, title: info.title, author: info.author, duration: info.duration, thumbnail: info.thumbnail,
    audio: {
      quality: audio?.quality || null,
      mime: 'audio/mpeg',
      bitrate: audio?.bitrate || null,
      source: audio?.source || null,
      url: urls.play
    },
    directUrl: urls.play,
    downloadUrl: urls.download
  });
}));

// ---------- MP4 ----------
router.get(['/mp4', '/ytmp4'], handle(async (req, res) => {
  const info = await P.resolveYoutubeTarget({ url: req.query.url, query: req.query.query || req.query.q });
  const quality = P.normalizarCalidad(req.query.quality || req.query.format);
  const baseMp4 = `/downloader/mp4?url=${encodeURIComponent(`https://www.youtube.com/watch?v=${info.id}`)}&quality=${quality || 'auto'}`;
  const directUrl = absoluteUrl(req, `${baseMp4}&direct=true`);
  const downloadUrl = absoluteUrl(req, `${baseMp4}&direct=true&download=true`);
  if (wantDirect(req, ['true', 'mp4', 'video', '1'])) {
    const playable = await videoConAudio(info, quality);
    return enviarVideo(req, res, playable, `${cleanName(info.title)}.mp4`);
  }
  let playable = null;
  try { playable = await videoConAudio(info, quality); } catch (e) { console.error('[downloader/mp4]', e.message); }
  return sendSuccess(res, {
    id: info.id, title: info.title, author: info.author, duration: info.duration, thumbnail: info.thumbnail,
    requestedQuality: quality || 'auto',
    hasAudio: Boolean(playable?.hasAudio),
    video: playable ? {
      quality: playable.quality || null,
      height: playable.height || null,
      mime: playable.mime || 'video/mp4',
      hasAudio: Boolean(playable.hasAudio),
      mergedWithFfmpeg: Boolean(playable.muxed),
      url: directUrl,
      downloadUrl
    } : null,
    directUrl,
    downloadUrl
  });
}));

/** Respaldo de /play: 30 s de la canción desde Deezer/iTunes (siempre suena). */
async function previewDe(query) {
  const prev = await P.previewAudio(query);
  if (!prev?.url) throw new Error('No hay preview disponible para esa canción');
  return prev;
}

// ---------- Play (audio por búsqueda, canción COMPLETA) ----------
/**
 * Devuelve la canción completa (no un preview): busca en YouTube, elige el
 * resultado que mejor coincide y convierte el audio entero a MP3 con ffmpeg.
 * Si el primer resultado falla se prueba con los siguientes (hasta 3), porque
 * los videos con copyright bloquean el audio y la búsqueda trae varios.
 * Sólo si TODO YouTube falla se cae al preview de 30 s de Deezer/iTunes.
 */
router.get('/play', handle(async (req, res) => {
  const query = String(req.query.query || req.query.q || req.query.text || '').trim();
  if (!query) return sendError(res, 400, 'Falta el parámetro query', 'Ejemplo: /downloader/play?query=Lisa+Money');
  const directo = wantDirect(req, ['true', 'mp3', 'audio', '1']);
  const errores = [];
  const intentos = Math.max(1, Math.min(5, parseInt(req.query.tries ?? req.query.intentos, 10) || 3));
  const urls = urlsAudio(req, '/downloader/play', `query=${encodeURIComponent(query)}&tries=${intentos}`);

  // No alcanza con conseguir la ficha del video: también debe poder obtenerse
  // su audio. Si falla cualquiera de los dos pasos, se intenta el siguiente.
  let info = null;
  let audio = null;
  try {
    const search = await P.youtubeSearch(query, intentos);
    const ids = [...new Set((search?.results || []).map(r => r.id).filter(Boolean))].slice(0, intentos);
    const candidates = ids.length ? ids : [null];
    for (const id of candidates) {
      try {
        const candidate = id ? await P.youtubeStreams(id) : await P.resolveYoutubeTarget({ query });
        if (!candidate) throw new Error('sin información del video');
        if (directo) return await enviarAudio(req, res, candidate);
        const found = await audioDe(candidate);
        if (!found?.url) throw new Error('sin audio reproducible');
        info = candidate;
        audio = found;
        break;
      } catch (e) {
        if (res.headersSent) throw e;
        errores.push(`youtube ${id || 'búsqueda'}: ${e.message}`);
      }
    }
  } catch (e) {
    if (res.headersSent) throw e;
    errores.push(`youtube: ${e.message}`);
  }

  if (info && audio) {
    return sendSuccess(res, {
      query, id: info.id, title: info.title, author: info.author, duration: info.duration, thumbnail: info.thumbnail,
      youtubeUrl: `https://www.youtube.com/watch?v=${info.id}`,
      preview: false,
      fullSong: true,
      audio: {
        quality: audio.quality || null,
        mime: 'audio/mpeg',
        bitrate: audio.bitrate || null,
        source: audio.source || audio.provider || 'youtube',
        url: urls.play,
        downloadUrl: urls.download
      },
      playUrl: urls.play,
      downloadUrl: urls.download
    });
  }

  // 2) Respaldo: 30 s reales desde Deezer o iTunes (esto SÍ es un preview).
  const prev = await previewDe(query);
  const nombre = cleanName(`${prev.artist} - ${prev.title}`);
  if (directo) {
    return proxyStream(req, res, prev.url, { filename: `${nombre}.${extAudio(prev.mime)}` });
  }
  return sendSuccess(res, {
    query,
    id: null,
    title: prev.title,
    author: prev.artist,
    album: prev.album,
    duration: prev.duration,
    thumbnail: prev.cover,
    preview: true,
    fullSong: false,
    source: prev.source,
    audio: {
      quality: 'preview',
      mime: prev.mime,
      bitrate: null,
      source: prev.source,
      url: urls.play,
      downloadUrl: urls.download
    },
    playUrl: urls.play,
    downloadUrl: urls.download,
    hint: `YouTube no respondió (${errores.join(' · ')}). Esto es un preview de 30 s de ${prev.source}.`
  });
}));

// ---------- Lyric ----------
router.get(['/lyric', '/lyrics'], handle(async (req, res) => {
  const query = String(req.query.query || req.query.q || req.query.text || '').trim();
  if (!query) return sendError(res, 400, 'Falta el parámetro query', 'Ejemplo: /downloader/lyric?query=Twice+Feel+Special');
  const song = await P.lyricFor(query);
  const format = String(req.query.format || 'json').toLowerCase();
  const base = cleanName(`${song.title} - ${song.artist}`);
  if (format === 'brat' || format === 'sticker' || format === 'png') {
    // La canción COMPLETA como sticker brat: el lienzo crece hacia abajo.
    const art = await bratFromLyrics(song, {
      width: req.query.width,
      bg: req.query.bg ? `#${String(req.query.bg).replace(/^#/, '')}` : undefined,
      color: req.query.color ? `#${String(req.query.color).replace(/^#/, '')}` : undefined,
      size: req.query.size,
      maxHeight: req.query.maxHeight || req.query['canvas.height']
    });
    return sendPng(res, art.buffer, `${base}-brat.png`);
  }
  if (format === 'lrc') {
    return sendText(res, song.syncedLyrics || song.plainLyrics || '', `${base}.lrc`);
  }
  if (format === 'txt' || format === 'text') {
    return sendText(res, `${song.title} — ${song.artist}\n\n${song.plainLyrics || song.syncedLyrics || ''}\n`, `${base}.txt`);
  }
  return sendSuccess(res, song);
}));

module.exports = router;
