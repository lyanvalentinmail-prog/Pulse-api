// src/utils/search.js — Buscadores de la categoría **BUSQUEDAS**.
//
//   · pinterest     → BaseSearchResource (el mismo buscador de la web)
//   · tiktok        → tikwm /api/feed/search
//   · youtube       → Piped /search (instancias públicas)
//   · wallpapers    → besthdwallpapers.org (WordPress, ?s=)
//   · wallpapersv2  → motionbgs.com (fondos en movimiento)
//   · stickerly     → api.sticker.ly (stickers de WhatsApp)
//   · wiki          → MediaWiki API (<lang>.wikipedia.org/w/api.php)
//   · playstore     → HTML de play.google.com/store/search (apps)
//   · aptoide       → API pública de Aptoide (apps y APK)
//   · appstore      → iTunes Search API (apps de la App Store)
//   · play          → Deezer / iTunes: canción por nombre (+ autor) con audio
//
// Los parsers (parse*) son funciones puras para poder probarlos sin red.
const { fetchJson, fetchText, fetchWithTimeout, postJson, firstFast, UA_DESKTOP } = require('./http');
const { randomBytes } = require('crypto');
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

/** Query obligatoria y acotada. `label`/`example` cambian el mensaje de error. */
function readQuery(raw, { max = 90, label = 'q', example = '?q=anime' } = {}) {
  const q = String(raw || '').trim().replace(/\s+/g, ' ');
  if (!q) throw badRequest(`Falta el parámetro ${label}`, `Ejemplo: ${example}`);
  if (q.length > max) throw badRequest(`La búsqueda es demasiado larga (máx. ${max} caracteres)`);
  return q;
}

function readLimit(raw, fallback = 10, max = 30) {
  const n = Math.round(Number(raw));
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.min(max, n);
}

/** Código de idioma para Wikipedia (`es`, `en`, `pt-BR`…). */
function readLang(raw, fallback = 'es') {
  const value = String(raw || '').trim().toLowerCase();
  if (!value) return fallback;
  if (!/^[a-z]{2,3}(?:-[a-z]{2,8})?$/.test(value)) {
    throw badRequest('El idioma no es válido', 'Usá un código como es, en, pt o pt-br');
  }
  return value;
}

/** Código de país de dos letras para las tiendas de apps. */
function readCountry(raw, fallback = 'us') {
  const value = String(raw || '').trim().toLowerCase();
  if (!value) return fallback;
  if (!/^[a-z]{2}$/.test(value)) {
    throw badRequest('El país no es válido', 'Usá el código de dos letras: us, es, ar, mx…');
  }
  return value;
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

// La sesión anónima evita que BaseSearchResource rechace peticiones sin CSRF.
let pinterestSession;
let pinterestSessionPromise;
async function getPinterestSession() {
  if (pinterestSession && pinterestSession.expires > Date.now()) return pinterestSession;
  if (pinterestSessionPromise) return pinterestSessionPromise;
  pinterestSessionPromise = (async () => {
    const res = await fetchWithTimeout('https://www.pinterest.com/', {
      headers: { 'User-Agent': UA_DESKTOP, 'Accept-Language': 'en-US,en;q=0.9' }, redirect: 'error'
    }, 8000);
    if (!res.ok) { res.body?.cancel().catch(() => {}); throw new Error(`Pinterest: HTTP ${res.status} al iniciar sesión anónima`); }
    const cookies = res.headers.getSetCookie ? res.headers.getSetCookie() : [];
    res.body?.cancel().catch(() => {});
    const pairs = cookies.map(c => c.split(';')[0]).filter(c => /^(?:csrftoken|_pinterest_sess)=/i.test(c));
    const csrf = pairs.find(c => /^csrftoken=/i.test(c))?.slice('csrftoken='.length) || '';
    pinterestSession = { cookie: pairs.join('; '), csrf, expires: Date.now() + 30 * 60 * 1000 };
    return pinterestSession;
  })();
  try { return await pinterestSessionPromise; } finally { pinterestSessionPromise = null; }
}

async function pinterestSearch(query, limit) {
  const sourceUrl = `/search/pins/?q=${encodeURIComponent(query)}&rs=typed`;
  const data = JSON.stringify({ options: { query, scope: 'pins', page_size: Math.max(limit, 25), source_url: sourceUrl, rs: 'typed', auto_correction_disabled: false }, context: {} });
  const url = 'https://www.pinterest.com/resource/BaseSearchResource/get/'
    + `?source_url=${encodeURIComponent(sourceUrl)}&data=${encodeURIComponent(data)}`;
  let json;
  for (let attempt = 0; attempt < 2; attempt++) {
    const session = await getPinterestSession();
    try {
      json = await fetchJson(url, { timeoutMs: TIMEOUT, redirect: 'error', headers: {
        Accept: 'application/json', 'X-Requested-With': 'XMLHttpRequest',
        'X-Pinterest-PWS-Handler': 'www/search/pins.js', 'X-CSRFToken': session.csrf,
        Referer: `https://www.pinterest.com${sourceUrl}`, ...(session.cookie ? { Cookie: session.cookie } : {})
      } });
      break;
    } catch (e) {
      if (attempt || ![401, 403].includes(e.status)) throw e;
      pinterestSession = null;
    }
  }
  if (json?.resource_response?.status === 'fail') throw new Error('Pinterest rechazó la búsqueda');
  const items = parsePinterestSearch(json, limit).filter(item => item.image || item.video);
  if (!items.length) throw noResults('Pinterest');
  return { query, source: 'pinterest', total: items.length, items };
}

// ================================================================== TikTok
function parseTikTokSearch(json, limit, base = 'https://www.tikwm.com') {
  const videos = (json && json.data && (json.data.videos || json.data.list)) || [];
  return (Array.isArray(videos) ? videos : []).filter(v => v && (v.play || v.hdplay || v.cover || v.origin_cover)).slice(0, limit).map(v => ({
    id: v.video_id || v.id || '',
    title: unescape(v.title || ''),
    author: v.author?.unique_id ? `@${v.author.unique_id}` : '',
    cover: absolutize(v.cover || v.origin_cover, base),
    video: absolutize(v.play || v.hdplay, base),
    duration: Number(v.duration) || null,
    plays: Number(v.play_count) || null,
    link: (v.video_id || v.id) ? `https://www.tiktok.com/@${v.author?.unique_id || '_'}/video/${v.video_id || v.id}` : ''
  }));
}

async function tiktokSearch(query, limit) {
  const url = `https://www.tikwm.com/api/feed/search?keywords=${encodeURIComponent(query)}&count=${Math.max(limit, 12)}&cursor=0&hd=1`;
  const json = await fetchJson(url, { timeoutMs: TIMEOUT });
  if (json?.code !== undefined && Number(json.code) !== 0) throw new Error('TikWM rechazó la búsqueda');
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
  const items = [];
  const seen = new Set();
  const add = (s, pack = {}) => {
    if (!s || typeof s !== 'object') return;
    const prefix = pack.resourceUrlPrefix || s.resourceUrlPrefix || '';
    const file = typeof s === 'string' ? s : s.fileName || s.filename || '';
    const url = absolutize(s.resourceUrl || s.stickerUrl || s.imageUrl || s.url || (file && prefix ? `${prefix.replace(/\/?$/, '/')}${file}` : '') || s.thumbnailUrl || s.thumbnail);
    if (!/^https?:\/\//i.test(url) || seen.has(url)) return;
    seen.add(url);
    const packId = String(pack.packId || s.packId || '');
    const name = unescape(s.name || s.title || pack.name || pack.packName || '');
    items.push({
      id: String(s.stickerId || s.sticker_id || s.sid || (packId ? `${packId}:${file || url}` : s.id || url)),
      name, pack: unescape(s.packName || pack.name || pack.packName || ''),
      author: s.authorName || pack.authorName || pack.user?.userName || '',
      image: url, thumbnail: absolutize(s.thumbnailUrl || s.thumbnail || url),
      animated: !!(s.isAnimated ?? s.animated ?? pack.isAnimated),
      link: packId ? `https://sticker.ly/s/${encodeURIComponent(packId)}` : s.stickerId || s.sticker_id ? `https://sticker.ly/sticker/${encodeURIComponent(s.stickerId || s.sticker_id)}` : ''
    });
  };
  const packs = json?.result?.stickerPacks || json?.result?.packs;
  if (Array.isArray(packs)) {
    for (const pack of packs) {
      if (!pack || typeof pack !== 'object') continue;
      const stickers = pack.stickers || pack.stickerList || pack.resourceFiles;
      if (Array.isArray(stickers)) for (const sticker of stickers) add(typeof sticker === 'string' ? { fileName: sticker } : sticker, pack);
      if (!Array.isArray(stickers) || !stickers.length) add(pack, pack);
      if (items.length >= limit) break;
    }
  } else {
    const list = findArray(json, ['resourceUrl', 'thumbnailUrl', 'stickerUrl', 'stickerId', 'sticker_id', 'sid']) || [];
    for (const sticker of list) add(sticker);
  }
  return items.slice(0, limit);
}

async function stickerlySearch(query, limit) {
  // Sticker.ly expone la búsqueda de paquetes mediante su API móvil no oficial.
  const url = 'http://api.sticker.ly/v3.1/stickerPack/search?withAnimation=true';
  const json = await postJson(url, { keyword: query, cursor: 0 }, { timeoutMs: TIMEOUT, redirect: 'error', headers: {
    'User-Agent': 'androidapp.stickerly/1.17.3 (Redmi 7; U; Android 29; es-ES; es;)',
    Accept: 'application/json', 'x-duid': randomBytes(8).toString('hex')
  } });
  if (json?.error) throw new Error('Sticker.ly rechazó la búsqueda');
  const items = parseStickerly(json, limit);
  if (!items.length) throw noResults('Stickerly');
  return { query, source: 'api.sticker.ly', total: items.length, items };
}

// =============================================================== Wikipedia
/** MediaWiki con `formatversion=2`: pages es un array y trae índice de búsqueda. */
function parseWiki(json, limit, lang = 'es') {
  const pages = json && json.query && json.query.pages;
  const list = Array.isArray(pages) ? pages : Object.values(pages || {});
  return list
    .filter(page => page && (page.title || page.pageid))
    .sort((a, b) => (Number(a.index) || 0) - (Number(b.index) || 0))
    .slice(0, limit)
    .map(page => ({
      id: String(page.pageid || page.title),
      title: unescape(page.title || ''),
      description: String(page.extract || '').replace(/\s+/g, ' ').trim().slice(0, 600),
      image: absolutize(page.thumbnail && page.thumbnail.source),
      lang,
      link: page.fullurl || (page.pageid ? `https://${lang}.wikipedia.org/?curid=${page.pageid}` : '')
    }));
}

/** Fallback con `action=opensearch` (sólo títulos, sin miniatura). */
function parseWikiOpenSearch(json, limit, lang = 'es') {
  const titles = Array.isArray(json && json[1]) ? json[1] : [];
  const descriptions = Array.isArray(json && json[2]) ? json[2] : [];
  const urls = Array.isArray(json && json[3]) ? json[3] : [];
  return titles.slice(0, limit).map((title, index) => ({
    id: String(title),
    title: unescape(title),
    description: unescape(descriptions[index] || ''),
    image: '',
    lang,
    link: absolutize(urls[index], `https://${lang}.wikipedia.org`)
  }));
}

async function wikiSearch(query, limit, ctx = {}) {
  const lang = readLang(ctx.lang);
  const base = `https://${lang}.wikipedia.org/w/api.php`;
  const search = new URLSearchParams({
    action: 'query', format: 'json', formatversion: '2', origin: '*',
    generator: 'search', gsrsearch: query, gsrlimit: String(limit),
    prop: 'extracts|pageimages|info', inprop: 'url',
    exintro: '1', explaintext: '1', exsentences: '3', exlimit: 'max',
    piprop: 'thumbnail', pithumbsize: '600'
  });
  const json = await fetchJson(`${base}?${search}`, { timeoutMs: TIMEOUT, headers: { Accept: 'application/json' } });
  let items = parseWiki(json, limit, lang);
  if (!items.length) {
    const fallback = await fetchJson(`${base}?${new URLSearchParams({
      action: 'opensearch', format: 'json', origin: '*', namespace: '0',
      search: query, limit: String(limit)
    })}`, { timeoutMs: TIMEOUT, headers: { Accept: 'application/json' } });
    items = parseWikiOpenSearch(fallback, limit, lang);
  }
  if (!items.length) throw noResults('Wikipedia', 'Probá con otra palabra o cambiá de idioma con ?lang=en');
  return { query, lang, source: `${lang}.wikipedia.org`, total: items.length, items };
}

// ============================================================= Google Play
/** Tienda de apps de Google: se lee del HTML server-side de /store/search. */
function parsePlayStoreSearch(html, limit, { gl = 'us', hl = 'en' } = {}) {
  const text = String(html || '');
  const clean = value => unescape(value).replace(/\s+/g, ' ').trim();
  const items = [];
  const seen = new Set();
  const anchors = [];
  const re = /<a\b[^>]*href="(?:\.\/|\/)?store\/apps\/details\?id=([\w.]+)[^"]*"[^>]*>/gi;
  let hit;
  while ((hit = re.exec(text))) anchors.push({ pkg: hit[1], start: hit.index, tag: hit[0] });
  for (let i = 0; i < anchors.length && items.length < limit; i++) {
    const { pkg, start, tag } = anchors[i];
    if (seen.has(pkg)) continue;
    const chunk = text.slice(start, i + 1 < anchors.length ? anchors[i + 1].start : start + 8000);
    const icon = (chunk.match(/<img\b[^>]*(?:data-src|src)="(https:\/\/play-lh\.googleusercontent\.com\/[^"]+)"/i) || [])[1];
    const spans = [...chunk.matchAll(/<span[^>]*>([^<]{2,120})<\/span>/gi)]
      .map(m => clean(m[1]))
      .filter(value => value && !/^\d+(?:[.,]\d+)?$/.test(value) && !/^(?:star|stars|rated|contains ads|in-app purchases|installs?)$/i.test(value));
    const labelled = (tag.match(/\btitle="([^"]{2,120})"/i) || chunk.match(/<a\b[^>]*\baria-label="([^"]{2,120})"/i) || [])[1];
    const title = clean(labelled || spans[0] || '');
    if (!title) continue;
    seen.add(pkg);
    const rating = (chunk.match(/aria-label="Rated ([\d.]+) stars?/i) || [])[1];
    items.push({
      id: pkg,
      title,
      package: pkg,
      author: clean(spans[1] || '').slice(0, 80),
      image: absolutize(icon),
      rating: Number(rating) || null,
      gl: String(gl).toUpperCase(),
      hl,
      link: `https://play.google.com/store/apps/details?id=${pkg}`
    });
  }
  return items;
}

async function playStoreSearch(query, limit, ctx = {}) {
  const gl = readCountry(ctx.gl || ctx.country, 'us');
  const hl = readLang(ctx.hl || ctx.lang, 'en');
  const url = `https://play.google.com/store/search?q=${encodeURIComponent(query)}&c=apps&hl=${hl}&gl=${gl.toUpperCase()}`;
  const html = await fetchText(url, { timeoutMs: TIMEOUT, headers: { Accept: 'text/html', 'Accept-Language': `${hl},en;q=0.8` } });
  const items = parsePlayStoreSearch(html, limit, { gl, hl });
  if (!items.length) throw noResults('Google Play', 'Google Play puede mostrar otro HTML a los servidores; probá con ?q=nombre+de+la+app o usá /busquedas/aptoide');
  return { query, source: 'play.google.com', total: items.length, items };
}

// ================================================================= Aptoide
/** Nodos de app de la API v7 (acepta la forma plana y la anidada antigua). */
function aptoideNodes(json) {
  const direct = json && json.list;
  const nested = json && json.datasets && json.datasets.search && json.datasets.search.data && json.datasets.search.data.list;
  const list = Array.isArray(direct) ? direct : Array.isArray(nested) ? nested : [];
  return list.filter(node => node && typeof node === 'object');
}

function aptoideIcon(node) {
  const icon = node.icon;
  if (typeof icon === 'string') return icon;
  return (icon && (icon.url || icon.path)) || '';
}

function parseAptoide(json, limit) {
  const items = [];
  const seen = new Set();
  for (const node of aptoideNodes(json)) {
    const pkg = String(node.package || '');
    const id = pkg || String(node.id || node.name || '');
    if (!id || seen.has(id)) continue;
    seen.add(id);
    const file = node.file || {};
    const stats = node.stats || {};
    const store = node.store || {};
    items.push({
      id,
      title: unescape(node.name || ''),
      package: pkg,
      author: unescape(store.name || store.appearance && store.appearance.name || node.developer_name || ''),
      image: absolutize(aptoideIcon(node)),
      apk: absolutize(file.path || file.path_alt || ''),
      version: file.vername || '',
      size: Number(file.filesize) || null,
      downloads: Number(stats.pdownloads) || null,
      rating: Number(stats.rating && stats.rating.avg) || null,
      link: pkg ? `https://en.aptoide.com/app/${pkg}` : ''
    });
    if (items.length >= limit) break;
  }
  return items;
}

const APTOIDE_HOSTS = ['https://ws75.aptoide.com', 'https://ws2.aptoide.com'];

async function aptoideSearch(query, limit) {
  const producers = APTOIDE_HOSTS.map(base => [base, async () => {
    const json = await fetchJson(`${base}/api/7/apps/search?query=${encodeURIComponent(query)}&limit=${Math.max(limit, 10)}`, { timeoutMs: TIMEOUT });
    const items = parseAptoide(json, limit);
    return items.length ? { query, source: `aptoide:${new URL(base).hostname}`, total: items.length, items } : null;
  }]);
  try {
    return (await firstFast(producers, { timeoutMs: TIMEOUT + 500 })).value;
  } catch (e) {
    const err = new Error('Aptoide no respondió a la búsqueda');
    err.status = 502;
    err.hint = 'La API pública de Aptoide (ws75/ws2) puede estar caída; reintentá en unos segundos';
    err.details = e.details;
    throw err;
  }
}

// ============================================================== App Store
/** iTunes Search API: `entity=software` devuelve apps con su icono y enlace. */
function parseAppStore(json, limit) {
  const results = Array.isArray(json && json.results) ? json.results : [];
  return results
    .filter(app => app && (app.trackName || app.bundleId))
    .slice(0, limit)
    .map(app => ({
      id: String(app.trackId || app.bundleId || ''),
      title: unescape(app.trackName || ''),
      author: unescape(app.artistName || ''),
      bundleId: app.bundleId || '',
      image: absolutize(String(app.artworkUrl512 || app.artworkUrl100 || '').replace(/\/\d+x\d+bb?\./, '/512x512bb.')),
      genre: app.primaryGenreName || '',
      price: app.formattedPrice || '',
      rating: Number(app.averageUserRating) || null,
      link: app.trackViewUrl || ''
    }));
}

async function appStoreSearch(query, limit, ctx = {}) {
  const country = readCountry(ctx.country, 'us');
  const url = `https://itunes.apple.com/search?${new URLSearchParams({
    term: query, entity: 'software', media: 'software', limit: String(limit), country
  })}`;
  const json = await fetchJson(url, { timeoutMs: TIMEOUT });
  const items = parseAppStore(json, limit);
  if (!items.length) throw noResults('App Store', 'Probá con el nombre en inglés o cambiá de tienda con ?country=es');
  return { query, country, source: 'itunes.apple.com', total: items.length, items };
}

// ============================================================ Play (música)
/** Deezer: cada resultado trae un preview MP3 de 30 s. */
function parseDeezer(json, limit) {
  const tracks = Array.isArray(json && json.data) ? json.data : [];
  return tracks
    .filter(track => track && (track.title || track.preview))
    .slice(0, limit)
    .map(track => {
      const album = track.album || {};
      const artist = track.artist || {};
      return {
        id: String(track.id || ''),
        title: unescape(track.title || ''),
        author: unescape(artist.name || ''),
        album: unescape(album.title || ''),
        duration: Number(track.duration) || null,
        audio: absolutize(track.preview),
        thumbnail: absolutize(album.cover_big || album.cover_medium || album.cover || ''),
        previewSeconds: track.preview ? 30 : 0,
        link: track.link || '',
        source: 'deezer'
      };
    });
}

/** iTunes: `entity=song` con `previewUrl` (M4A de 30 s). */
function parseItunesSongs(json, limit) {
  const results = Array.isArray(json && json.results) ? json.results : [];
  return results
    .filter(track => track && (track.previewUrl || track.trackName))
    .slice(0, limit)
    .map(track => ({
      id: String(track.trackId || ''),
      title: unescape(track.trackName || ''),
      author: unescape(track.artistName || ''),
      album: unescape(track.collectionName || ''),
      duration: track.trackTimeMillis ? Math.round(track.trackTimeMillis / 1000) : null,
      audio: absolutize(track.previewUrl),
      thumbnail: absolutize(String(track.artworkUrl100 || '').replace(/\/\d+x\d+bb?\./, '/600x600bb.')),
      previewSeconds: track.previewUrl ? 30 : 0,
      link: track.trackViewUrl || '',
      source: 'itunes'
    }));
}

/**
 * «Play»: una canción por nombre y, opcionalmente, autor.
 * Devuelve el audio reproducible (preview de 30 s de Deezer o iTunes).
 */
async function musicSearch(name, limit, ctx = {}) {
  const clean = value => String(value || '').replace(/["\\]/g, '').trim().slice(0, 90);
  const artist = clean(ctx.author || ctx.artist || ctx.autor);
  const deezerQuery = artist ? `track:"${clean(name)}" artist:"${artist}"` : clean(name);
  const itunesQuery = artist ? `${clean(name)} ${artist}` : clean(name);
  const producers = [
    ['deezer', async () => {
      const json = await fetchJson(`https://api.deezer.com/search?q=${encodeURIComponent(deezerQuery)}&limit=${Math.max(limit, 10)}`, { timeoutMs: TIMEOUT });
      const items = parseDeezer(json, limit);
      return items.length ? { query: clean(name), author: artist, source: 'deezer', total: items.length, items } : null;
    }],
    ['itunes', async () => {
      const json = await fetchJson(`https://itunes.apple.com/search?${new URLSearchParams({
        term: itunesQuery, entity: 'song', media: 'music', limit: String(limit)
      })}`, { timeoutMs: TIMEOUT });
      const items = parseItunesSongs(json, limit);
      return items.length ? { query: clean(name), author: artist, source: 'itunes.apple.com', total: items.length, items } : null;
    }]
  ];
  try {
    return (await firstFast(producers, { timeoutMs: TIMEOUT + 500 })).value;
  } catch (e) {
    const empty = e.details && e.details.length && e.details.every(detail => detail.endsWith(': sin datos'));
    const err = empty ? noResults('esa canción', 'Probá sólo con el nombre o agregá ?author=Artista') : new Error('Las fuentes de audio no respondieron');
    if (!empty) err.status = 502;
    err.details = e.details;
    throw err;
  }
}

// La reproducción vuelve a consultar la búsqueda. Reutilizar resultados recientes
// evita una petición por miniatura y la limitación de frecuencia de TikWM.
// `keyOf` añade a la clave los parámetros que cambian los resultados
// (idioma, país, autor…), así una vista previa con otro idioma no reusa la caché.
function cacheSearch(fn, keyOf) {
  const cache = new Map();
  return async (query, limit, ctx) => {
    const extra = keyOf && ctx ? keyOf(ctx) : null;
    const key = JSON.stringify([query, limit, extra]);
    const current = cache.get(key);
    if (current && current.expires > Date.now()) return current.value;
    const value = Promise.resolve().then(() => fn(query, limit, ctx));
    cache.set(key, { value, expires: Date.now() + 60000 });
    while (cache.size > 100) cache.delete(cache.keys().next().value);
    try { return await value; } catch (e) { if (cache.get(key)?.value === value) cache.delete(key); throw e; }
  };
}
const pinterest = cacheSearch(pinterestSearch);
const tiktok = cacheSearch(tiktokSearch);
const stickerly = cacheSearch(stickerlySearch);
const wiki = cacheSearch(wikiSearch, ctx => String(ctx.lang || 'es').toLowerCase());
const playstore = cacheSearch(playStoreSearch, ctx => [ctx.gl || ctx.country || 'us', ctx.hl || ctx.lang || 'en']);
const aptoide = cacheSearch(aptoideSearch);
const appstore = cacheSearch(appStoreSearch, ctx => String(ctx.country || 'us').toLowerCase());
const play = cacheSearch(musicSearch, ctx => String(ctx.author || ctx.artist || ctx.autor || '').toLowerCase());

module.exports = {
  pinterest, tiktok, youtube, wallpapers, wallpapersV2, stickerly,
  wiki, playstore, aptoide, appstore, play,
  parsePinterestSearch, parseTikTokSearch, parsePipedSearch, parseInvidiousSearch,
  parseBestHdWallpapers, parseMotionBgs, parseStickerly,
  parseWiki, parseWikiOpenSearch, parsePlayStoreSearch, parseAptoide,
  parseAppStore, parseDeezer, parseItunesSongs,
  readQuery, readLimit, readLang, readCountry
};
