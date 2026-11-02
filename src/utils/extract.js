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
//   · MediaFire  → HTML de la página (botón #downloadButton)
//   · Play Store → package de la app resuelto con la API de Aptoide (APK)
//   · CapCut     → HTML/JSON del template (videoUrl del MP4 sin marca)
//
// Los parsers están exportados aparte (parse*) para poder probarlos sin red.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFile } = require('child_process');
const config = require('../config');
const { fetchJson, fetchText, fetchBuffer, fetchWithTimeout, postJson, firstFast, UA_DESKTOP, UA_MOBILE } = require('./http');

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
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw badRequest('Sólo se aceptan enlaces http o https sin credenciales');
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
  const html = await fetchText(url, { publicOnly: true, timeoutMs: TIMEOUT, headers: { Accept: 'text/html', 'Accept-Language': 'es-UY,es;q=0.9,en;q=0.8' } });
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
      const html = await fetchText(target, { publicOnly: true, timeoutMs: TIMEOUT, headers });
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
      const html = await fetchText(target, { publicOnly: true, timeoutMs: TIMEOUT, headers });
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
  const producers = bases.map(base => [base, async () => {
    const json = await postJson(`${base}/`, {
      url, downloadMode: mode === 'audio' ? 'audio' : 'video',
      videoQuality: '1080', audioFormat: 'mp3', filenameStyle: 'basic'
    }, { timeoutMs: TIMEOUT, headers: { Accept: 'application/json' } });
    const data = parseCobalt(json);
    return data.url ? { source: `cobalt:${new URL(base).hostname}`, ...data } : null;
  }]);
  return (await firstFast(producers, { timeoutMs: TIMEOUT + 500 })).value;
}

async function pipedResolve(id, mode) {
  const bases = ['https://pipedapi.kavin.rocks', 'https://pipedapi.adminforge.de', 'https://api.piped.private.coffee'];
  const producers = bases.map(base => [base, async () => {
    const json = await fetchJson(`${base}/streams/${id}`, { timeoutMs: TIMEOUT });
    const data = parsePipedStreams(json, base);
    return (mode === 'audio' ? data.audio : data.video) ? { source: `piped:${new URL(base).hostname}`, ...data } : null;
  }]);
  return (await firstFast(producers, { timeoutMs: TIMEOUT + 500 })).value;
}

async function youtube(rawUrl, mode = 'video') {
  const url = normalizeUrl(rawUrl, { hosts: ['youtube.com', 'youtu.be', 'm.youtube.com', 'music.youtube.com'], label: 'url' });
  const id = parseYouTubeId(url);
  if (!id) throw badRequest('No pude leer el ID del video', 'Acepta /watch?v=ID, youtu.be/ID y /shorts/ID');
  try {
    const result = await firstFast([
      ['cobalt', async () => {
        const cobalt = await cobaltResolve(url, mode);
        return { id, mode, title: '', thumbnail: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`, download: cobalt.url, ...cobalt };
      }],
      ['piped', async () => {
        const piped = await pipedResolve(id, mode);
        return { id, mode, download: mode === 'audio' ? piped.audio : piped.video, ...piped };
      }]
    ], { timeoutMs: TIMEOUT + 1000 });
    return result.value;
  } catch (e) {
    const err = new Error('Ningún resolvedor de YouTube respondió');
    err.status = 502;
    err.hint = 'Configurá COBALT_API_URL con tu instancia de cobalt (https://github.com/imputnet/cobalt)';
    err.details = e.details;
    throw err;
  }
}

// ================================================================ MediaFire
/**
 * MediaFire entrega el enlace directo en el botón `#downloadButton` (o en un
 * `window.location.href` para enlaces con clave). El nombre y el tamaño están
 * en la ficha del archivo.
 */
function parseMediaFire(html) {
  const text = String(html || '');
  const direct = firstMatch(text, [
    /id=["']downloadButton["'][^>]*href=["']([^"']+)["']/i,
    /href=["']([^"']+)["'][^>]*id=["']downloadButton["']/i,
    /href=["'](https:\/\/download[^"']*mediafire\.com\/[^"']+)["']/i,
    /window\.location\.href\s*=\s*['"](https?:\/\/[^'"]+)['"]/i
  ]);
  const filename = unescape(firstMatch(text, [
    /<div[^>]*class=["'][^"']*filename[^"']*["'][^>]*>([^<]{1,200})</i,
    /<h1[^>]*>([^<]{1,200})<\/h1>/i
  ]) || metaContent(text, 'og:title') || '').trim();
  const size = unescape(firstMatch(text, [
    /<span[^>]*class=["'][^"']*details[^"']*["'][^>]*>([^<]{1,80})</i,
    /\(([\d.]+\s*(?:KB|MB|GB|TB))\)/i
  ]) || '').trim();
  return {
    filename,
    size,
    thumbnail: absolutize(metaContent(text, 'og:image')),
    direct: absolutize(direct, 'https://www.mediafire.com')
  };
}

async function mediafire(rawUrl) {
  const url = normalizeUrl(rawUrl, { hosts: ['mediafire.com'], label: 'url' });
  const html = await fetchText(url, {
    publicOnly: true, timeoutMs: TIMEOUT,
    headers: { Accept: 'text/html', 'Accept-Language': 'es-UY,es;q=0.9,en;q=0.8' }
  });
  const data = parseMediaFire(html);
  if (!data.direct) {
    throw notFound('MediaFire no entregó el enlace de descarga',
      'Puede ser un archivo eliminado, privado o con contraseña; abrilo en el navegador para confirmarlo');
  }
  return { source: 'mediafire', page: url, ...data };
}

// =============================================================== Play Store
/** package de una URL de Play Store (o de un `com.app` suelto). */
function parsePlayStorePackage(raw) {
  const text = String(raw || '').trim();
  const fromUrl = text.match(/[?&]id=([A-Za-z][A-Za-z0-9_]*(?:\.[A-Za-z0-9_]+)+)/);
  const bare = text.match(/^([A-Za-z][A-Za-z0-9_]*(?:\.[A-Za-z0-9_]+)+)$/);
  return (fromUrl || bare || [])[1] || '';
}

/** Comprueba que un enlace devuelva un archivo (y no un HTML de error). */
async function probeArchive(url) {
  const res = await fetchWithTimeout(url, {
    headers: { 'User-Agent': UA_DESKTOP, Range: 'bytes=0-0' }, publicOnly: true
  }, TIMEOUT);
  const type = (res.headers.get('content-type') || '').toLowerCase();
  res.body?.cancel().catch(() => {});
  if (!res.ok && res.status !== 206) return null;
  if (/^text\/html/i.test(type)) return null;
  return { type };
}

/** Busca el APK en Aptoide por package exacto (Play no permite bajar APK). */
async function aptoideApk(pkg) {
  const producers = ['https://ws75.aptoide.com', 'https://ws2.aptoide.com'].map(base => [base, async () => {
    const json = await fetchJson(`${base}/api/7/apps/search?query=${encodeURIComponent(pkg)}&limit=50`, { timeoutMs: TIMEOUT });
    const list = Array.isArray(json && json.list) ? json.list
      : Array.isArray(json && json.datasets && json.datasets.search && json.datasets.search.data && json.datasets.search.data.list)
        ? json.datasets.search.data.list : [];
    const node = list.find(app => app && app.package === pkg);
    const file = (node && node.file) || {};
    const apk = absolutize(file.path || file.path_alt || '');
    if (!apk) return null;
    const icon = typeof node.icon === 'string' ? node.icon : (node.icon && node.icon.url) || '';
    return {
      source: `aptoide:${new URL(base).hostname}`,
      package: pkg,
      title: unescape(node.name || ''),
      version: file.vername || '',
      size: Number(file.filesize) || null,
      developer: unescape((node.store && node.store.name) || ''),
      icon: absolutize(icon),
      download: apk
    };
  }]);
  return (await firstFast(producers, { timeoutMs: TIMEOUT + 500 })).value;
}

/**
 * Descarga de una app de Play Store. Play no ofrece APK directo sin cuenta:
 * se resuelve el paquete con mirrors públicos (Aptoide y, si falla, APKPure).
 */
async function playstoreDownload(raw) {
  const text = String(raw || '').trim();
  if (!text) throw badRequest('Falta el parámetro url', 'Pasá el enlace de Play Store o el package: ?url=com.whatsapp');
  if (/^https?:\/\//i.test(text) || /^play\.google\.com/i.test(text)) {
    const url = normalizeUrl(text, { hosts: ['play.google.com'], label: 'url' });
    if (!/\/store\/apps\/details/i.test(url)) {
      throw badRequest('El enlace debe ser de la ficha de una app', 'Ejemplo: https://play.google.com/store/apps/details?id=com.whatsapp');
    }
  }
  const pkg = parsePlayStorePackage(text);
  if (!pkg) throw badRequest('No pude leer el paquete de la app', 'Pasá el enlace de Play Store o el package (com.whatsapp)');
  try {
    return await aptoideApk(pkg);
  } catch (e) {
    const mirror = `https://d.apkpure.com/b/APK/${encodeURIComponent(pkg)}?version=latest`;
    const probe = await probeArchive(mirror).catch(() => null);
    if (!probe) {
      const err = new Error('Play Store no ofrece APK directo y los mirrors públicos no respondieron');
      err.status = 502;
      err.hint = 'Reintentá en un rato o buscá la app con /busquedas/aptoide';
      err.details = e.details;
      throw err;
    }
    return {
      source: 'apkpure',
      package: pkg,
      title: pkg,
      version: '',
      size: null,
      developer: '',
      icon: '',
      download: mirror,
      note: 'APK desde un mirror público: Play Store no permite descargar APK sin cuenta.'
    };
  }
}

// =================================================================== CapCut
const CAPCUT_ID = [
  /\/template-detail\/(\d+)/i,
  /[?&]template_id=(\d+)/i,
  /\/t\/([A-Za-z0-9]{5,})/i
];

/** ID numérico de template (o código corto de /t/…) de un enlace de CapCut. */
function parseCapCutId(raw) {
  const text = String(raw || '');
  for (const re of CAPCUT_ID) {
    const hit = text.match(re);
    if (hit && hit[1]) return hit[1];
  }
  return '';
}

/**
 * CapCut sirve el MP4 del template en sus páginas (`videoUrl`, `playUrl`…) y en
 * su endpoint JSON de detalle. Se aceptan HTML y objetos.
 */
function parseCapCut(payload) {
  const text = typeof payload === 'string' ? payload : JSON.stringify(payload || {});
  const video = firstMatch(text, [
    /"videoUrl"\s*:\s*"([^"]+)"/i,
    /"video_url"\s*:\s*"([^"]+)"/i,
    /"playUrl"\s*:\s*"([^"]+)"/i,
    /"play_url"\s*:\s*"([^"]+)"/i,
    /"videoUri"\s*:\s*"([^"]+)"/i,
    /(https?:\/\/[^"'\s\\]+\.mp4[^"'\s\\]*)/i
  ]);
  const cover = firstMatch(text, [
    /"coverUrl"\s*:\s*"([^"]+)"/i,
    /"cover_url"\s*:\s*"([^"]+)"/i,
    /"posterUrl"\s*:\s*"([^"]+)"/i
  ]) || metaContent(text, 'og:image');
  const title = unescape(metaContent(text, 'og:title')
    || firstMatch(text, [/"templateTitle"\s*:\s*"([^"]+)"/i, /"title"\s*:\s*"([^"]{1,200})"/i])
    || (text.match(/<title[^>]*>([^<]{1,200})<\/title>/i) || [])[1] || '').trim();
  const author = unescape(firstMatch(text, [
    /"authorName"\s*:\s*"([^"]+)"/i,
    /"author"\s*:\s*\{[^{}]*"name"\s*:\s*"([^"]+)"/i,
    /"nickname"\s*:\s*"([^"]+)"/i,
    /"userName"\s*:\s*"([^"]+)"/i
  ])).trim();
  const videoClean = absolutize(video, 'https://www.capcut.com');
  // Se descartan imágenes/CSS que aparezcan en el mismo JSON: sólo sirve un video.
  const esVideo = /^https:\/\//i.test(videoClean) && !/\.(?:jpe?g|png|webp|gif|css|js)(?:[?#]|$)/i.test(videoClean);
  return {
    video: esVideo ? videoClean : '',
    cover: absolutize(cover, 'https://www.capcut.com'),
    title,
    author
  };
}

async function capcut(rawUrl) {
  const url = normalizeUrl(rawUrl, { hosts: ['capcut.com'], label: 'url' });
  if (!/\/template-detail\//i.test(url) && !/[?&]template_id=/i.test(url) && !/\/t\//i.test(url)) {
    throw badRequest('El enlace no parece de un template de CapCut',
      'Ejemplo: https://www.capcut.com/template-detail/7123456789…');
  }
  const headers = { Accept: 'text/html', 'Accept-Language': 'es-UY,es;q=0.9,en;q=0.8' };
  const producers = [];
  const id = parseCapCutId(url);
  if (/^\d+$/.test(id)) {
    producers.push(['detail', () => fetchText(`https://www.capcut.com/template-detail/${id}`, { timeoutMs: TIMEOUT, headers })]);
    producers.push(['api', () => fetchJson(`https://www.capcut.com/api/template/detail?template_id=${id}`, { timeoutMs: TIMEOUT, headers: { Accept: 'application/json' } })]);
  }
  producers.push(['page', () => fetchText(url, { timeoutMs: TIMEOUT, headers })]);
  const attempts = producers.map(([label, run]) => [label, async () => {
    const payload = await run();
    const data = parseCapCut(payload);
    return data.video ? { source: label, ...data } : null;
  }]);
  try {
    const result = (await firstFast(attempts, { timeoutMs: TIMEOUT + 500 })).value;
    return { page: url, ...result };
  } catch (e) {
    const err = notFound('CapCut no entregó el video del template',
      'CapCut cambia su API a menudo y puede pedir captcha al servidor; probá con el enlace público del template o más tarde');
    err.details = e.details;
    throw err;
  }
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
  const buffer = await fetchBuffer(url, { publicOnly: true, maxBytes, timeoutMs: 30000 });
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
  mediafire, playstoreDownload, capcut,
  // parsers (puros, testeables sin red)
  parseTikTok, parsePinterest, parseInstagram, parseFacebook, parseSpotify,
  parseYouTubeId, parsePipedStreams, parseCobalt,
  parseMediaFire, parsePlayStorePackage, parseCapCut, parseCapCutId,
  // utilidades
  normalizeUrl, absolutize, unescape, metaContent
};
