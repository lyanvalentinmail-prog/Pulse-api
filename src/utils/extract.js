// src/utils/extract.js — Resolución de enlaces de Descargas.
//
// Cada red social se resuelve con la fuente pública que funciona hoy sin token:
//
//   · TikTok     → API de tikwm (devuelve MP4 sin marca de agua + MP3)
//   · Pinterest  → HTML del pin (og:video / og:image / v1.pinimg.com/videos)
//   · Instagram  → página /embed/captioned/ (video_url / display_url)
//   · Facebook   → HTML (playable_url / hd_src / sd_src)
//   · Spotify    → oEmbed (metadatos) + embed (preview de 30 s)
//   · YouTube    → cobalt si está configurado, si no instancias Piped
//   · Audio      → ffmpeg sobre un archivo remoto (mp3)
//
// Los parsers están exportados aparte (parse*) para poder probarlos sin red.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFile } = require('child_process');
const config = require('../config');
const { fetchJson, fetchText, fetchBuffer, postJson, UA_DESKTOP, UA_MOBILE } = require('./http');

const TIMEOUT = 15000;

// ---------------------------------------------------------------- errores
function badRequest(message, hint) {
  const e = new Error(message);
  e.status = 400;
  if (hint) e.hint = hint;
  return e;
}

function notFound(message, hint) {
  const e = new Error(message);
  e.status = 404;
  if (hint) e.hint = hint;
  return e;
}

/** Valida y normaliza una URL de entrada (?url=). */
function normalizeUrl(raw, { hosts = null, label = 'url' } = {}) {
  const value = String(raw || '').trim();
  if (!value) throw badRequest(`Falta el parámetro ${label}`, 'Pasá el enlace, por ejemplo ?url=https://www.tiktok.com/@user/video/123');
  let url;
  try { url = new URL(value.startsWith('http') ? value : `https://${value}`); }
  catch (_) { throw badRequest('La URL no es válida'); }
  if (!['http:', 'https:'].includes(url.protocol)) throw badRequest('Sólo se aceptan enlaces http o https');
  if (hosts && !hosts.some(h => url.hostname === h || url.hostname.endsWith(`.${h}`))) {
    throw badRequest(`Ese enlace no es de ${hosts[0]}`, `Se esperaba algo como https://www.${hosts[0]}/…`);
  }
  return url.toString();
}

// ------------------------------------------------------------ utilidades
const absolutize = (value, base) => {
  const raw = String(value || '').replace(/\\u002F/g, '/').replace(/\\\//g, '/').replace(/&amp;/g, '&');
  if (!raw) return '';
  if (/^https?:\/\//i.test(raw)) return raw;
  if (raw.startsWith('//')) return `https:${raw}`;
  try { return new URL(raw, base).toString(); } catch (_) { return ''; }
};

const unescape = value => String(value || '')
  .replace(/\\u002F/gi, '/')
  .replace(/\\\//g, '/')
  .replace(/\\u0026/gi, '&')
  .replace(/&amp;/g, '&')
  .replace(/\\"/g, '"');

/** Busca el contenido de una meta etiqueta (og:video, og:image…). */
function metaContent(html, property) {
  const re = new RegExp(`<meta[^>]+(?:property|name)=["']${property}["'][^>]*content=["']([^"']+)["']`, 'i');
  const re2 = new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]*(?:property|name)=["']${property}["']`, 'i');
  const hit = html.match(re) || html.match(re2);
  return hit ? unescape(hit[1]) : '';
}

function firstMatch(text, patterns) {
  for (const re of patterns) {
    const hit = String(text || '').match(re);
    if (hit && hit[1]) return unescape(hit[1]);
  }
  return '';
}

// ================================================================== TikTok
/** Convierte la respuesta de tikwm en la ficha de Pulse. */
function parseTikTok(json, base = 'https://www.tikwm.com') {
  if (!json || Number(json.code) !== 0 || !json.data) {
    return { error: (json && json.msg) || 'TikTok no devolvió el video' };
  }
  const d = json.data;
  const play = d.hdplay || d.play || d.wmplay || '';
  return {
    id: d.id || '',
    title: d.title || '',
    author: d.author ? `@${d.author.unique_id}` : '',
    nickname: d.author ? d.author.nickname : '',
    duration: Number(d.duration) || null,
    cover: absolutize(d.origin_cover || d.cover, base),
    video: absolutize(play, base),
    videoWatermark: absolutize(d.wmplay, base),
    audio: absolutize(d.music, base),
    images: Array.isArray(d.images) ? d.images.map(u => absolutize(u, base)) : []
  };
}

async function tiktok(rawUrl) {
  const url = normalizeUrl(rawUrl, { hosts: ['tiktok.com', 'douyin.com', 'vt.tiktok.com'], label: 'url' });
  const api = `https://www.tikwm.com/api/?url=${encodeURIComponent(url)}&hd=1`;
  const json = await fetchJson(api, { timeoutMs: TIMEOUT, headers: { Accept: 'application/json' } });
  const data = parseTikTok(json);
  if (data.error) throw notFound(data.error, 'Verificá que el video sea público y que el enlace esté completo');
  return { source: 'tikwm', ...data };
}

// =============================================================== Pinterest
/** Saca el video (o la imagen) del HTML de un pin. */
function parsePinterest(html) {
  const video = metaContent(html, 'og:video')
    || metaContent(html, 'og:video:url')
    || firstMatch(html, [/"contentUrl"\s*:\s*"([^"]+)"/i, /(https:\/\/v\d*\.pinimg\.com\/videos\/[^"'\\\s]+\.mp4)/i]);
  const image = metaContent(html, 'og:image')
    || firstMatch(html, [/"url"\s*:\s*"(https:\/\/i\.pinimg\.com\/[^"]+)"/i]);
  const title = metaContent(html, 'og:title');
  const description = metaContent(html, 'og:description');
  return {
    type: video ? 'video' : 'image',
    video: absolutize(video),
    image: absolutize(image),
    title: unescape(title),
    description: unescape(description)
  };
}

async function pinterest(rawUrl) {
  const url = normalizeUrl(rawUrl, { hosts: ['pinterest.com', 'pin.it'], label: 'url' });
  const html = await fetchText(url, { timeoutMs: TIMEOUT, headers: { Accept: 'text/html', 'Accept-Language': 'es-UY,es;q=0.9,en;q=0.8' } });
  const data = parsePinterest(html);
  if (!data.video && !data.image) throw notFound('No encontré la imagen o el video de ese pin', 'Los tableros privados no se pueden descargar');
  return { source: 'pinterest', ...data };
}

// =============================================================== Instagram
const SHORTCODE = /\/(?:p|reel|reels|tv)\/([A-Za-z0-9_-]{5,})/;

/** Extrae video/imagen del HTML del post (incluye el embed con caption). */
function parseInstagram(html) {
  const video = firstMatch(html, [/"video_url"\s*:\s*"([^"]+)"/i, /"contentUrl"\s*:\s*"([^"]+)"/i, /"video_versions"[^\]]*?"url"\s*:\s*"([^"]+)"/i]);
  const image = firstMatch(html, [/"display_url"\s*:\s*"([^"]+)"/i, /"thumbnail_src"\s*:\s*"([^"]+)"/i])
    || metaContent(html, 'og:image');
  const title = firstMatch(html, [/"edge_media_to_caption":\{"edges":\[\{"node":\{"text":"((?:[^"\\]|\\.)*)"/i]) || metaContent(html, 'og:title');
  const author = firstMatch(html, [/"username"\s*:\s*"([^"]+)"/i]) || firstMatch(html, [/"owner":\{"username":"([^"]+)"/i]);
  return {
    type: video ? 'video' : 'image',
    video: absolutize(video),
    image: absolutize(image),
    title: String(title || '').replace(/\\n/g, ' ').trim(),
    author: author ? `@${author}` : ''
  };
}

async function instagram(rawUrl) {
  const url = normalizeUrl(rawUrl, { hosts: ['instagram.com', 'instagr.am'], label: 'url' });
  const code = (url.match(SHORTCODE) || [])[1];
  if (!code) throw badRequest('El enlace debe ser de un post o reel', 'Ejemplo: https://www.instagram.com/reel/ABC123/');
  const headers = { Accept: 'text/html', 'Accept-Language': 'es-UY,es;q=0.9', 'User-Agent': UA_MOBILE };
  const sources = [
    ['embed', `https://www.instagram.com/p/${code}/embed/captioned/`],
    ['post', `https://www.instagram.com/p/${code}/`]
  ];
  const errors = [];
  for (const [label, target] of sources) {
    try {
      const html = await fetchText(target, { timeoutMs: TIMEOUT, headers });
      const data = parseInstagram(html);
      if (data.video || data.image) return { source: label, shortcode: code, ...data };
      errors.push(`${label}: sin multimedia`);
    } catch (e) { errors.push(`${label}: ${e.message}`); }
  }
  const err = notFound('Instagram no devolvió el archivo', 'Suele pasar con cuentas privadas o cuando bloquea al servidor');
  err.details = errors;
  throw err;
}

// ================================================================ Facebook
/** Rescata las URLs de video del HTML de Facebook (hd > sd > playable). */
function parseFacebook(html) {
  const hd = firstMatch(html, [/"playable_url_quality_hd"\s*:\s*"([^"]+)"/i, /"hd_src(?:_no_ratelimit)?"\s*:\s*"([^"]+)"/i, /hd_src:"([^"]+)"/i]);
  const sd = firstMatch(html, [/"playable_url"\s*:\s*"([^"]+)"/i, /"sd_src(?:_no_ratelimit)?"\s*:\s*"([^"]+)"/i, /sd_src:"([^"]+)"/i]);
  const thumb = metaContent(html, 'og:image');
  const title = metaContent(html, 'og:title') || metaContent(html, 'og:description');
  return {
    type: 'video',
    video: absolutize(hd || sd),
    videoHd: absolutize(hd),
    videoSd: absolutize(sd),
    thumbnail: absolutize(thumb),
    title: unescape(title)
  };
}

async function facebook(rawUrl) {
  const url = normalizeUrl(rawUrl, { hosts: ['facebook.com', 'fb.watch', 'fb.com'], label: 'url' });
  const headers = {
    Accept: 'text/html', 'Accept-Language': 'es-UY,es;q=0.9,en;q=0.8',
    'User-Agent': UA_MOBILE, Cookie: 'locale=es_LA;'
  };
  const mobile = url.replace('://www.', '://m.').replace('://facebook.com', '://m.facebook.com');
  const sources = [
    ['mobile', mobile],
    ['www', url],
    ['mbasic', url.replace(/^https?:\/\/[^/]+/, 'https://mbasic.facebook.com')]
  ];
  const errors = [];
  for (const [label, target] of sources) {
    try {
      const html = await fetchText(target, { timeoutMs: TIMEOUT, headers });
      const data = parseFacebook(html);
      if (data.video) return { source: label, ...data };
      errors.push(`${label}: sin video`);
    } catch (e) { errors.push(`${label}: ${e.message}`); }
  }
  const err = notFound('Facebook no devolvió el video', 'Los videos privados o de grupos cerrados no se pueden descargar');
  err.details = errors;
  throw err;
}

// ================================================================= Spotify
/** Metadatos del oEmbed + preview MP3 del embed (30 s). */
function parseSpotify({ oembed = {}, embedHtml = '' } = {}) {
  const preview = firstMatch(embedHtml, [/"audioPreview"\s*:\s*\{[^}]*"url"\s*:\s*"([^"]+)"/i, /(https:\/\/p\.scdn\.co\/mp3-preview\/[^"'\\\s]+)/i]);
  const kind = (oembed.type || '').toLowerCase();
  return {
    type: kind.includes('track') ? 'track' : kind.includes('album') ? 'album' : kind.includes('playlist') ? 'playlist' : 'unknown',
    title: unescape(oembed.title || ''),
    author: unescape(oembed.author_name || ''),
    thumbnail: absolutize(oembed.thumbnail_url),
    provider: oembed.provider_name || 'Spotify',
    preview: absolutize(preview),
    previewSeconds: preview ? 30 : 0
  };
}

async function spotify(rawUrl) {
  const url = normalizeUrl(rawUrl, { hosts: ['open.spotify.com', 'spotify.link', 'spotify.com'], label: 'url' });
  const oembed = await fetchJson(`https://open.spotify.com/oembed?url=${encodeURIComponent(url)}`, { timeoutMs: TIMEOUT });
  let embedHtml = '';
  const trackId = (url.match(/\/track\/([A-Za-z0-9]{10,})/) || [])[1];
  if (trackId) {
    try { embedHtml = await fetchText(`https://open.spotify.com/embed/track/${trackId}`, { timeoutMs: TIMEOUT, headers: { 'User-Agent': UA_DESKTOP } }); }
    catch (_) { /* sin preview: quedan los metadatos */ }
  }
  const data = parseSpotify({ oembed, embedHtml });
  if (!data.title) throw notFound('Spotify no devolvió los datos del enlace');
  return { source: 'spotify', ...data };
}

// ================================================================= YouTube
const COBALT_PUBLIC = ['https://cobalt-api.kwiatekmiki.com', 'https://co.wuk.sh'];

/** ID de un enlace de YouTube (watch, youtu.be, shorts, embed). */
function parseYouTubeId(raw) {
  const url = String(raw || '');
  return (url.match(/(?:v=|\/shorts\/|\/embed\/|youtu\.be\/|\/live\/)([A-Za-z0-9_-]{11})/) || [])[1] || '';
}

function parsePipedStreams(json, base = 'https://pipedapi.kavin.rocks') {
  const audio = (json.audioStreams || [])
    .filter(s => s && s.url)
    .sort((a, b) => (Number(b.bitrate) || 0) - (Number(a.bitrate) || 0))[0];
  // `quality` llega como "1080p": se compara el número, no el texto.
  const height = s => parseInt(String(s.quality || ''), 10) || 0;
  const video = (json.videoStreams || [])
    .filter(s => s && s.url && s.videoOnly !== true)
    .sort((a, b) => height(b) - height(a))[0];
  return {
    title: json.title || '',
    author: json.uploader || '',
    duration: Number(json.duration) || null,
    thumbnail: absolutize(json.thumbnailUrl),
    audio: audio ? absolutize(audio.url, base) : '',
    video: video ? absolutize(video.url, base) : ''
  };
}

function parseCobalt(json) {
  if (!json || json.status === 'error') {
    return { error: (json && json.error && (json.error.code || json.error)) || 'cobalt no pudo resolver el enlace' };
  }
  return { url: absolutize(json.url), filename: json.filename || '' };
}

async function cobaltResolve(url, mode) {
  const bases = config.cobaltUrl ? [config.cobaltUrl.replace(/\/$/, '')] : COBALT_PUBLIC;
  const errors = [];
  for (const base of bases) {
    try {
      const json = await postJson(`${base}/`, {
        url,
        downloadMode: mode === 'audio' ? 'audio' : 'video',
        videoQuality: '1080',
        audioFormat: 'mp3',
        filenameStyle: 'basic'
      }, { timeoutMs: TIMEOUT, headers: { Accept: 'application/json' } });
      const data = parseCobalt(json);
      if (data.url) return { source: `cobalt:${new URL(base).hostname}`, ...data };
      errors.push(`${base}: ${data.error}`);
    } catch (e) { errors.push(`${base}: ${e.message}`); }
  }
  const err = new Error('cobalt no respondió');
  err.details = errors;
  throw err;
}

async function pipedResolve(id) {
  const bases = ['https://pipedapi.kavin.rocks', 'https://pipedapi.adminforge.de', 'https://api.piped.private.coffee'];
  const errors = [];
  for (const base of bases) {
    try {
      const json = await fetchJson(`${base}/streams/${id}`, { timeoutMs: TIMEOUT });
      const data = parsePipedStreams(json, base);
      if (data.audio || data.video) return { source: `piped:${new URL(base).hostname}`, ...data };
      errors.push(`${base}: sin streams`);
    } catch (e) { errors.push(`${base}: ${e.message}`); }
  }
  const err = new Error('Piped no respondió');
  err.details = errors;
  throw err;
}

async function youtube(rawUrl, mode = 'video') {
  const url = normalizeUrl(rawUrl, { hosts: ['youtube.com', 'youtu.be', 'm.youtube.com', 'music.youtube.com'], label: 'url' });
  const id = parseYouTubeId(url);
  if (!id) throw badRequest('No pude leer el ID del video', 'Acepta /watch?v=ID, youtu.be/ID y /shorts/ID');
  const errors = [];
  try {
    const cobalt = await cobaltResolve(url, mode);
    return { id, mode, title: '', thumbnail: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`, download: cobalt.url, ...cobalt };
  } catch (e) { errors.push(...(e.details || [e.message])); }
  try {
    const piped = await pipedResolve(id);
    return { id, mode, download: mode === 'audio' ? piped.audio : piped.video, ...piped, ...(mode === 'audio' ? { audio: piped.audio } : { video: piped.video }) };
  } catch (e) { errors.push(...(e.details || [e.message])); }
  const err = new Error('Ningún resolvedor de YouTube respondió');
  err.status = 502;
  err.hint = 'Configurá COBALT_API_URL con tu instancia de cobalt (https://github.com/imputnet/cobalt)';
  err.details = errors;
  throw err;
}

// =================================================================== Audio
function ffmpegPath() {
  try { return require('@ffmpeg-installer/ffmpeg').path; } catch (_) { return 'ffmpeg'; }
}

function runFfmpeg(args, timeoutMs = 45000) {
  return new Promise((resolve, reject) => {
    execFile(ffmpegPath(), args, { timeout: timeoutMs }, (err, _out, stderr) => {
      if (err) return reject(new Error(`ffmpeg: ${String(stderr || err.message).slice(-240)}`));
      resolve();
    });
  });
}

/** Descarga un archivo remoto y devuelve su audio como MP3. */
async function toMp3(remoteUrl, { maxBytes = 60 * 1024 * 1024 } = {}) {
  const url = normalizeUrl(remoteUrl, { label: 'url' });
  const buffer = await fetchBuffer(url, { maxBytes, timeoutMs: 30000 });
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pulse-mp3-'));
  try {
    const input = path.join(dir, 'in.bin');
    const output = path.join(dir, 'out.mp3');
    fs.writeFileSync(input, buffer);
    await runFfmpeg(['-y', '-i', input, '-vn', '-c:a', 'libmp3lame', '-b:a', '192k', '-ar', '44100', output]);
    return fs.readFileSync(output);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

module.exports = {
  // resolvedores (red)
  tiktok, pinterest, instagram, facebook, spotify, youtube, toMp3,
  // parsers (puros, testeables sin red)
  parseTikTok, parsePinterest, parseInstagram, parseFacebook, parseSpotify,
  parseYouTubeId, parsePipedStreams, parseCobalt,
  // utilidades
  normalizeUrl, absolutize, unescape, metaContent
};
