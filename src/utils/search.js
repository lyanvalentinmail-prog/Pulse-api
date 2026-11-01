// src/utils/search.js — Buscadores de la categoría **BUSQUEDAS**.
//
//   · pinterest     → BaseSearchResource (el mismo buscador de la web)
//   · tiktok        → tikwm /api/feed/search
//   · youtube       → Piped /search (instancias públicas)
//   · wallpapers    → besthdwallpapers.org (WordPress, ?s=)
//   · wallpapersv2  → motionbgs.com (fondos en movimiento)
//   · stickerly     → api.sticker.ly (stickers de WhatsApp)
//
// Los parsers (parse*) son funciones puras para poder probarlos sin red.
const { fetchJson, fetchText, firstFast, UA_DESKTOP } = require('./http');
const { absolutize, unescape, metaContent } = require('./extract');

const TIMEOUT = 15000;

function badRequest(message, hint) {
  const e = new Error(message);
  e.status = 400;
  if (hint) e.hint = hint;
  return e;
}

function noResults(what, hint) {
  const e = new Error(`Sin resultados de ${what}`);
  e.status = 404;
  if (hint) e.hint = hint;
  return e;
}

/** Query obligatoria y acotada. */
function readQuery(raw, { max = 90 } = {}) {
  const q = String(raw || '').trim().replace(/\s+/g, ' ');
  if (!q) throw badRequest('Falta el parámetro q', 'Ejemplo: ?q=anime');
  if (q.length > max) throw badRequest(`La búsqueda es demasiado larga (máx. ${max} caracteres)`);
  return q;
}

function readLimit(raw, fallback = 10, max = 30) {
  const n = Math.round(Number(raw));
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.min(max, n);
}

/** Busca el primer array de objetos con la clave pedida en un JSON anidado. */
function findArray(node, keys, depth = 0) {
  if (!node || depth > 6) return null;
  if (Array.isArray(node)) {
    if (node.length && node[0] && typeof node[0] === 'object' && keys.some(k => k in node[0])) return node;
    for (const item of node) {
      const found = findArray(item, keys, depth + 1);
      if (found) return found;
    }
    return null;
  }
  if (typeof node === 'object') {
    for (const value of Object.values(node)) {
      const found = findArray(value, keys, depth + 1);
      if (found) return found;
    }
  }
  return null;
}

// =============================================================== Pinterest
function parsePinterestSearch(json, limit) {
  const results = (json && json.resource_response && json.resource_response.data
    && (json.resource_response.data.results || json.resource_response.data.pins)) || [];
  return (Array.isArray(results) ? results : [])
    .filter(pin => pin && (pin.images || pin.videos))
    .slice(0, limit)
    .map(pin => {
      const images = pin.images || {};
      const best = images.orig || images['736x'] || images['564x'] || images['474x'] || Object.values(images)[0] || {};
      const videoList = (pin.videos && pin.videos.video_list) || {};
      // HLS (.m3u8) no es un MP4 reproducible por nuestro proxy.
      const video = Object.entries(videoList)
        .filter(([key, v]) => !/HLS/i.test(key) && v && v.url && !/\.m3u8(?:[?#]|$)/i.test(v.url))
        .sort(([a], [b]) => (b === 'V_720P') - (a === 'V_720P'))[0]?.[1] || null;
      return {
        id: pin.id || '',
        title: unescape(pin.title || pin.grid_title || pin.description || ''),
        author: pin.pinner ? `@${pin.pinner.username}` : '',
        type: video ? 'video' : 'image',
        image: absolutize(best.url),
        video: video ? absolutize(video.url) : '',
        link: pin.id ? `https://www.pinterest.com/pin/${pin.id}/` : ''
      };
    });
}

async function pinterest(query, limit) {
  const data = JSON.stringify({ options: { query, scope: 'pins', page_size: Math.max(limit, 25) }, context: {} });
  const url = 'https://www.pinterest.com/resource/BaseSearchResource/get/'
    + `?source_url=${encodeURIComponent(`/search/pins/?q=${query}`)}&data=${encodeURIComponent(data)}`;
  const json = await fetchJson(url, { timeoutMs: TIMEOUT, headers: { Accept: 'application/json', 'X-Requested-With': 'XMLHttpRequest' } });
  const items = parsePinterestSearch(json, limit);
  if (!items.length) throw noResults('Pinterest');
  return { query, source: 'pinterest', total: items.length, items };
}

// ================================================================== TikTok
function parseTikTokSearch(json, limit, base = 'https://www.tikwm.com') {
  const videos = (json && json.data && (json.data.videos || json.data.list)) || [];
  return (Array.isArray(videos) ? videos : []).filter(v => v && (v.play || v.hdplay || v.cover || v.origin_cover)).slice(0, limit).map(v => ({
    id: v.video_id || v.id || '',
    title: unescape(v.title || ''),
    author: v.author ? `@${v.author.unique_id}` : '',
    cover: absolutize(v.cover || v.origin_cover, base),
    video: absolutize(v.play || v.hdplay, base),
    duration: Number(v.duration) || null,
    plays: Number(v.play_count) || null,
    link: v.video_id ? `https://www.tiktok.com/@${v.author ? v.author.unique_id : '_'}/video/${v.video_id}` : ''
  }));
}

async function tiktok(query, limit) {
  const url = `https://www.tikwm.com/api/feed/search?keywords=${encodeURIComponent(query)}&count=${Math.max(limit, 12)}&cursor=0&hd=1`;
  const json = await fetchJson(url, { timeoutMs: TIMEOUT });
  const items = parseTikTokSearch(json, limit);
  if (!items.length) throw noResults('TikTok');
  return { query, source: 'tikwm', total: items.length, items };
}

// ================================================================= YouTube
const PIPED = ['https://pipedapi.kavin.rocks', 'https://pipedapi.adminforge.de', 'https://api.piped.private.coffee'];
const INVIDIOUS = ['https://inv.nadeko.net', 'https://invidious.nerdvpn.de'];

function parsePipedSearch(json, limit) {
  return (Array.isArray(json?.items) ? json.items : [])
    .filter(i => i && i.url && (!i.type || i.type === 'stream'))
    .slice(0, limit)
    .map(i => ({
      id: String(i.url || '').replace(/^.*(?:v=|youtu\.be\/)/, '').split(/[&#?]/)[0],
      title: unescape(i.title || ''),
      author: unescape(i.uploaderName || ''),
      duration: Number(i.duration) || null,
      views: Number(i.views) || null,
      thumbnail: absolutize(i.thumbnail),
      link: /^https?:\/\/(?:www\.|m\.)?youtube\.com\//i.test(i.url) ? i.url : `https://www.youtube.com${i.url.startsWith('/') ? '' : '/'}${i.url}`
    }));
}

function parseInvidiousSearch(json, limit) {
  return (Array.isArray(json) ? json : [])
    .filter(i => i && i.videoId)
    .slice(0, limit)
    .map(i => ({
      id: i.videoId,
      title: unescape(i.title || ''),
      author: unescape(i.author || ''),
      duration: Number(i.lengthSeconds) || null,
      views: Number(i.viewCount) || null,
      thumbnail: absolutize(`https://i.ytimg.com/vi/${i.videoId}/hqdefault.jpg`),
      link: `https://www.youtube.com/watch?v=${i.videoId}`
    }));
}

async function youtube(query, limit) {
  const piped = PIPED.map(base => [base, async () => {
    const json = await fetchJson(`${base}/search?q=${encodeURIComponent(query)}&filter=videos`, { timeoutMs: TIMEOUT });
    const items = parsePipedSearch(json, limit);
    return items.length ? { query, source: `piped:${new URL(base).hostname}`, total: items.length, items } : null;
  }]);
  const invidious = INVIDIOUS.map(base => [base, async () => {
    const json = await fetchJson(`${base}/api/v1/search?q=${encodeURIComponent(query)}&type=video`, { timeoutMs: TIMEOUT });
    const items = parseInvidiousSearch(json, limit);
    return items.length ? { query, source: `invidious:${new URL(base).hostname}`, total: items.length, items } : null;
  }]);
  try {
    return (await firstFast([...piped, ...invidious], { timeoutMs: TIMEOUT + 500 })).value;
  } catch (e) {
    const empty = e.details?.length && e.details.every(detail => detail.endsWith(': sin datos'));
    const err = empty ? noResults('YouTube') : new Error('No se pudo consultar YouTube');
    if (!empty) err.status = 502;
    err.hint = 'Las instancias públicas de Piped/Invidious pueden estar caídas o no devolver resultados; reintentá en un rato';
    err.details = e.details;
    throw err;
  }
}

// ============================================================= Wallpapers
/** besthdwallpapers.org es un WordPress con galerías: <a href=…><img src=… alt=…></a>. */
function parseBestHdWallpapers(html, limit, base = 'https://besthdwallpapers.org') {
  const items = [];
  const seen = new Set();
  const link = /<a[^>]+href=["']([^"']+)["'][^>]*>(?:(?!<\/a>)[\s\S]){0,2000}?(<img\b[^>]*>)/gi;
  let hit;
  while ((hit = link.exec(html)) && items.length < limit) {
    const tag = hit[2];
    const src = (tag.match(/\bdata-src=["']([^"']+)["']/i) || tag.match(/\bsrc=["']([^"']+)["']/i) || [])[1];
    const alt = (tag.match(/alt=["']([^"']*)["']/i) || [])[1];
    const page = absolutize(hit[1], base);
    const image = absolutize(src, base);
    if (!image || !/\.(jpe?g|png|webp)(?:[?#]|$)/i.test(image) || seen.has(image)) continue;
    seen.add(image);
    items.push({
      title: unescape(alt || metaContent(html, 'og:title') || '').trim(),
      image,
      page
    });
  }
  return items;
}

async function wallpapers(query, limit) {
  const url = `https://besthdwallpapers.org/?s=${encodeURIComponent(query)}`;
  const html = await fetchText(url, { timeoutMs: TIMEOUT, headers: { Accept: 'text/html', 'User-Agent': UA_DESKTOP } });
  const items = parseBestHdWallpapers(html, limit);
  if (!items.length) throw noResults('BestHDWallpapers', 'Probá con una palabra en inglés (por ejemplo ?q=naruto)');
  return { query, source: 'besthdwallpapers.org', total: items.length, items };
}

/** motionbgs.com: fondos de pantalla en movimiento (video/webp). */
function parseMotionBgs(html, limit, base = 'https://motionbgs.com') {
  const items = [];
  const seen = new Set();
  const card = /<a[^>]+href=["'](\/[^"'#?]+)["'][^>]*>(?:(?!<\/a>)[\s\S]){0,600}?<img\b[^>]*>/gi;
  let hit;
  while ((hit = card.exec(html)) && items.length < limit) {
    const page = absolutize(hit[1], base);
    const tag = hit[0].match(/<img\b[^>]*>/i)?.[0] || '';
    const src = (tag.match(/\bdata-src=["']([^"']+)["']/i) || tag.match(/\bsrc=["']([^"']+)["']/i) || [])[1];
    const preview = absolutize(src, base);
    if (!page || !preview || page === base || seen.has(page)) continue;
    seen.add(page);
    items.push({
      title: unescape(page.split('/').filter(Boolean).pop() || '').replace(/-/g, ' '),
      preview,
      page,
      type: /\.(mp4|webm)$/i.test(preview) ? 'video' : 'image'
    });
  }
  return items;
}

async function wallpapersV2(query, limit) {
  const url = `https://motionbgs.com/search?q=${encodeURIComponent(query)}`;
  const html = await fetchText(url, { timeoutMs: TIMEOUT, headers: { Accept: 'text/html', 'User-Agent': UA_DESKTOP } });
  const items = parseMotionBgs(html, limit);
  if (!items.length) throw noResults('MotionBGs', 'Probá con una palabra en inglés (por ejemplo ?q=rain)');
  return { query, source: 'motionbgs.com', total: items.length, items };
}

// ============================================================== Stickerly
function parseStickerly(json, limit) {
  const list = findArray(json, ['resourceUrl', 'thumbnailUrl', 'stickerId', 'sticker_id']) || [];
  return list.slice(0, limit).map(s => ({
    id: s.stickerId || s.sticker_id || s.id || '',
    name: unescape(s.name || s.title || ''),
    pack: s.packName || s.pack_name || (s.pack && s.pack.name) || '',
    author: s.authorName || s.creatorName || (s.pack && s.pack.ownerName) || '',
    image: absolutize(s.resourceUrl || s.stickerUrl || s.url || s.thumbnailUrl),
    thumbnail: absolutize(s.thumbnailUrl || s.thumbnail || s.resourceUrl),
    animated: !!(s.animated || /\.gif|\.webp|\.json/i.test(String(s.resourceUrl || ''))),
    link: (s.stickerId || s.sticker_id) ? `https://sticker.ly/sticker/${s.stickerId || s.sticker_id}` : ''
  }));
}

async function stickerly(query, limit) {
  const url = `https://api.sticker.ly/v4/sticker/search?keyword=${encodeURIComponent(query)}&pageSize=${Math.min(50, Math.max(limit, 20))}&page=1&sortBy=ALL&requireAnimation=true`;
  const json = await fetchJson(url, { timeoutMs: TIMEOUT, headers: { Accept: 'application/json', 'User-Agent': 'okhttp/4.9.0' } });
  const items = parseStickerly(json, limit);
  if (!items.length) throw noResults('Stickerly');
  return { query, source: 'api.sticker.ly', total: items.length, items };
}

module.exports = {
  pinterest, tiktok, youtube, wallpapers, wallpapersV2, stickerly,
  parsePinterestSearch, parseTikTokSearch, parsePipedSearch, parseInvidiousSearch,
  parseBestHdWallpapers, parseMotionBgs, parseStickerly,
  readQuery, readLimit
};
