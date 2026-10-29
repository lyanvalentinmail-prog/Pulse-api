// src/utils/providers.js — Fuentes públicas SIN token para toda la API.
//
// Reglas del proyecto:
//  · Nada de contenido NSFW: todas las fuentes usan rutas /sfw/ o el filtro
//    is_nsfw=false. No existe ningún endpoint para adultos.
//  · Nada de IA: no hay generación de texto/imagen por modelos, solo APIs públicas.
//
// Fuentes: PokeAPI · nekos.best · purrbot · danbooru · safebooru · konachan.net ·
// yande.re · pic.re · otakugifs · TikWM · YouTube (youtubei.js + InnerTube +
// Invidious/Piped) · Facebook · Instagram · LRCLIB/lyrics.ovh · Google · DuckDuckGo
// (lite y html) · Bing · Wikipedia · Google Translate · MyMemory.
const { fetchJson, postJson, fetchText, fetchWithTimeout, firstSuccess, firstFast, UA_DESKTOP, UA_MOBILE } = require('./http');
// Respaldo universal (opcional): una instancia de cobalt propia resuelve
// YouTube/Instagram/Facebook cuando las fuentes públicas bloquean la IP.
const COBALT = require('./cobalt');
// YouTube "de verdad": youtubei.js resuelve firmas y n-token (los respaldos
// Invidious/Piped quedaron casi todos con la API apagada).
const YT = require('./youtube');
const { selectVideoQuality } = require('./videoQuality');

const clampLimit = (v, def = 10, max = 25) => {
  const n = parseInt(v, 10);
  return Number.isNaN(n) ? def : Math.max(1, Math.min(max, n));
};
/** Convierte errores de red feos ("fetch failed") en mensajes entendibles. */
const friendly = e => (/(fetch failed|ENOTFOUND|ECONNREFUSED|ETIMEDOUT|aborted)/i.test(String(e && e.message))
  ? new Error('No se pudo contactar con la fuente (sin conexión o servicio caído)')
  : e);
const clampAmount = (v, def = 1, max = 10) => {
  const n = parseInt(v, 10);
  return Number.isNaN(n) ? def : Math.max(1, Math.min(max, n));
};

// ==========================================================================
// 1) ANIME — proveedores de imágenes (Neko / Waifu / Maid / Pokémon)
// ==========================================================================

async function nekosBest(tag, amount = 1) {
  const n = clampAmount(amount, 1, 20);
  const j = await fetchJson(`https://nekos.best/api/v2/${tag}?amount=${n}`, { timeoutMs: 5000 });
  const list = (j?.results || []).filter(r => r && r.url).map(r => ({
    image: r.url,
    provider: 'nekos.best',
    artist: r.artist_name || null,
    artistUrl: r.artist_href || null,
    sourceUrl: r.source_url || null
  }));
  if (!list.length) throw new Error('nekos.best sin imágenes');
  return list;
}

// ---------- Boorus SFW (danbooru / safebooru / konachan.net) ----------
// Los boorus son la fuente más confiable para "maid" (nekos.best no tiene esa
// categoría) y traen artista/fuente. SIEMPRE con filtro de rating seguro:
//   danbooru   → rating:g   (general = sin desnudos)
//   safebooru  → rating:general (el sitio ya es la copia SFW de danbooru)
//   konachan.net → rating:safe (el dominio .net es el espejo SFW)
const BOORU_UA = { 'User-Agent': UA_DESKTOP, Referer: 'https://velirius.app/' };
const randomPage = max => Math.floor(Math.random() * max);
const httpsUrl = url => (!url ? null : String(url).startsWith('http') ? String(url) : `https://${url}`);
/** Tamaño real de la variante que devolvemos como `image` (danbooru trae varias). */
const variantSize = (post, type) => {
  const v = (post?.media_asset?.variants || []).find(x => x && x.type === type);
  return { width: v?.width || null, height: v?.height || null };
};

/** Normaliza un post de danbooru (solo guarda los de rating general). */
function mapDanbooru(posts) {
  return (Array.isArray(posts) ? posts : [posts])
    .filter(p => p && p.rating === 'g')
    .map(p => {
      const sample = Boolean(p.large_file_url);
      const size = sample ? variantSize(p, 'sample') : { width: null, height: null };
      return {
        image: httpsUrl(p.large_file_url || p.file_url),
        full: httpsUrl(p.file_url || p.large_file_url),
        provider: 'danbooru',
        artist: p.tag_string_artist || null,
        artistUrl: p.tag_string_artist
          ? `https://danbooru.donmai.us/posts?tags=${encodeURIComponent(p.tag_string_artist)}`
          : null,
        sourceUrl: p.source || null,
        width: size.width || p.image_width || null,
        height: size.height || p.image_height || null
      };
    })
    .filter(i => i.image);
}

/** Normaliza posts de safebooru (rating "general" únicamente). */
function mapSafebooru(posts) {
  return (Array.isArray(posts) ? posts : [posts])
    .filter(p => p && (!p.rating || p.rating === 'general'))
    .map(p => ({
      image: httpsUrl(p.sample_url || p.file_url),
      full: httpsUrl(p.file_url || p.sample_url),
      provider: 'safebooru',
      artist: null,
      artistUrl: null,
      sourceUrl: p.source || null,
      // si hay muestra, el tamaño que importa es el de la muestra
      width: (p.sample ? p.sample_width : null) || p.width || null,
      height: (p.sample ? p.sample_height : null) || p.height || null,
      tags: p.tags ? String(p.tags).split(' ').slice(0, 12) : []
    }))
    .filter(i => i.image);
}

/** Normaliza posts de konachan.net (rating "s" = safe). */
function mapKonachan(posts) {
  return (Array.isArray(posts) ? posts : [posts])
    .filter(p => p && p.rating === 's' && (p.sample_url || p.file_url || p.jpeg_url))
    .map(p => ({
      image: httpsUrl(p.sample_url || p.jpeg_url || p.file_url),
      full: httpsUrl(p.file_url || p.jpeg_url || p.sample_url),
      provider: 'konachan',
      artist: p.author || null,
      artistUrl: null,
      sourceUrl: p.source || null,
      width: p.sample_width || p.width || null,
      height: p.sample_height || p.height || null
    }))
    .filter(i => i.image);
}

/**
 * Pide `amount` posts al azar de danbooru. Cada `random.json` devuelve uno solo,
 * así que se piden en tandas de 3 para no chocar con el límite de peticiones
 * anónimas (10/s) y se descartan los repetidos.
 */
async function danbooru(tags, amount = 1) {
  const n = clampAmount(amount, 1, 10);
  const url = `https://danbooru.donmai.us/posts/random.json?tags=${encodeURIComponent(tags)}`;
  const posts = [];
  for (let i = 0; i < n; i += 3) {
    const tanda = await Promise.all(Array.from({ length: Math.min(3, n - i) }, () =>
      fetchJson(url, { headers: BOORU_UA, timeoutMs: 6000 }).catch(() => null)));
    posts.push(...tanda.filter(Boolean));
  }
  const vistos = new Set();
  const list = mapDanbooru(posts).filter(i => !vistos.has(i.image) && vistos.add(i.image));
  if (!list.length) throw new Error('danbooru sin imágenes');
  return list;
}

/**
 * Pide una página aleatoria del booru y reintenta si esa página quedó vacía
 * (los tags poco frecuentes pueden no tener resultados en un pid alto).
 */
async function booruPages(name, buildUrl, mapper, amount, maxPage) {
  const n = clampAmount(amount, 1, 20);
  let ultimo = null;
  for (let intento = 0; intento < 3; intento++) {
    try {
      const j = await fetchJson(buildUrl(n, randomPage(maxPage)), { headers: BOORU_UA, timeoutMs: 6000 });
      const list = mapper(j);
      if (list.length) return list.slice(0, n);
      ultimo = new Error(`${name}: esa página vino vacía`);
    } catch (e) {
      ultimo = e; // 403 de Cloudflare, timeout, XML de error…
    }
  }
  // Se guarda el motivo real (bloqueo, timeout…) para que el 502 lo muestre.
  throw new Error(`${name} sin imágenes${ultimo ? ` (${ultimo.message})` : ''}`);
}

const safebooru = (tags, amount = 1) => booruPages(
  'safebooru',
  (n, pid) => 'https://safebooru.org/index.php?page=dapi&s=post&q=index&json=1'
    + `&limit=${n}&pid=${pid}&tags=${encodeURIComponent(tags)}`,
  mapSafebooru, amount, 60
);

const konachan = (tags, amount = 1) => booruPages(
  'konachan',
  (n, pid) => `https://konachan.net/post.json?limit=${n}&pid=${pid}&tags=${encodeURIComponent(tags)}`,
  mapKonachan, amount, 40
);

// yande.re usa la misma API que konachan (moebooru) pero **no** está detrás de
// Cloudflare: es el respaldo que salva `maid` cuando los otros boorus bloquean
// las IPs de los servidores (Vercel/AWS).
const yandere = (tags, amount = 1) => booruPages(
  'yande.re',
  (n, pid) => `https://yande.re/post.json?limit=${n}&pid=${pid}&tags=${encodeURIComponent(tags)}`,
  mapKonachan, amount, 40
);

/** purrbot.site: imágenes por categoría (nekos). */
async function purrbot(kind, amount = 1) {
  const n = clampAmount(amount, 1, 5);
  const list = [];
  for (let i = 0; i < n; i++) {
    const j = await fetchJson(`https://api.purrbot.site/v2/img/sfw/${kind}/img`, { timeoutMs: 5000 });
    if (j?.link) list.push({ image: j.link, provider: 'purrbot' });
  }
  if (!list.length) throw new Error('purrbot sin imágenes');
  return list;
}

/** pic.re: imagen aleatoria de anime (sin etiquetas, buen último recurso). */
async function picre(amount = 1) {
  const n = clampAmount(amount, 1, 10);
  const list = [];
  const vistos = new Set();
  for (let i = 0; i < n; i++) {
    const j = await fetchJson('https://pic.re/image.json', { timeoutMs: 5000 });
    const image = httpsUrl(j?.file_url);
    const rating = String(j?.rating || '').toLowerCase();
    const tags = Array.isArray(j?.tags) ? j.tags.map(t => String(t).toLowerCase()) : [];
    const safe = ['g', 'general', 's', 'safe'].includes(rating) || (!rating && j?.is_nsfw === false);
    const unsafe = tags.some(t => /^(?:nsfw|explicit|nude|nudity|hentai|porn|sexual)$/i.test(t));
    if (image && safe && !unsafe && !vistos.has(image)) {
      vistos.add(image);
      list.push({
        image,
        provider: 'pic.re',
        artist: j.author || null,
        artistUrl: null,
        sourceUrl: j.source || null,
        width: j.width || null,
        height: j.height || null,
        tags: Array.isArray(j.tags) ? j.tags.slice(0, 12) : []
      });
    }
  }
  if (!list.length) throw new Error('pic.re sin imágenes');
  return list;
}

// Cadena de proveedores por tipo (siempre SFW). El orden es sólo una pista: se
// prueban EN PARALELO (`firstFast`) y responde el primero que conteste. Los
// caídos se sacaron de la lista:
//   · waifu.pics → el servicio está apagado desde 2025 (API sin respuesta)
//   · waifu.im   → cierre definitivo anunciado para el 17/10/2026
//   · nekos.life → Cloudflare bloquea las peticiones del servidor
// `maid` no existe en nekos.best, por eso va primero el booru (danbooru/safebooru).
const ANIME_SOURCES = {
  neko: {
    'nekos.best': (n) => nekosBest('neko', n),
    'purrbot': (n) => purrbot('neko', n),
    'danbooru': (n) => danbooru('cat_ears 1girl solo rating:g', n),
    'safebooru': (n) => safebooru('cat_ears 1girl solo rating:general', n),
    'konachan': (n) => konachan('cat_ears 1girl solo rating:safe', n),
    'yande.re': (n) => yandere('cat_ears 1girl solo rating:s', n)
  },
  waifu: {
    'nekos.best': (n) => nekosBest('waifu', n),
    'danbooru': (n) => danbooru('1girl solo rating:g', n),
    'pic.re': (n) => picre(n),
    'safebooru': (n) => safebooru('1girl solo rating:general', n),
    'konachan': (n) => konachan('1girl solo rating:safe', n),
    'yande.re': (n) => yandere('1girl solo rating:s', n)
  },
  // `maid` no existe en nekos.best/purrbot: van primero los boorus, que tienen
  // la etiqueta y el filtro de rating seguro. yande.re cierra la lista porque no
  // bloquea a los servidores.
  maid: {
    'danbooru': (n) => danbooru('maid 1girl solo rating:g', n),
    'safebooru': (n) => safebooru('maid 1girl solo rating:general', n),
    'konachan': (n) => konachan('maid 1girl solo rating:safe', n),
    'yande.re': (n) => yandere('maid 1girl solo rating:s', n)
  }
};

const ANIME_KINDS = Object.keys(ANIME_SOURCES);

/**
 * Devuelve imágenes SFW de un tipo de anime.
 * @param {'neko'|'waifu'|'maid'} kind
 * @param {{provider?:string, amount?:number}} opts
 */
async function animeImage(kind, { provider = null, amount = 1 } = {}) {
  const key = String(kind || '').toLowerCase();
  const sources = ANIME_SOURCES[key];
  if (!sources) throw new Error(`Tipo desconocido "${kind}". Usa: ${ANIME_KINDS.join(', ')}`);

  if (provider) {
    const name = Object.keys(sources).find(k => k.toLowerCase() === String(provider).toLowerCase());
    if (!name) { const err = new Error(`Proveedor no disponible para ${key}. Usa: ${Object.keys(sources).join(', ')}`); err.status = 400; throw err; }
    const images = await sources[name](amount);
    return { kind: key, provider: name, count: images.length, images };
  }

  // En paralelo: la primera fuente que responde gana. Así una fuente caída ya
  // no hace esperar 12-15 s (Vercel corta la función a los 10 s y el endpoint
  // parecía roto). El presupuesto total es de 8 s.
  const producers = Object.entries(sources).map(([name, fn]) => [name, () => fn(amount)]);
  const { value, source } = await firstFast(producers, { timeoutMs: 8000 });
  return { kind: key, provider: source, count: value.length, images: value };
}

// ---------------- Pokémon (PokeAPI) ----------------
async function pokemon(query, shiny = false) {
  let q = String(query || 'pikachu').trim().toLowerCase();
  if (q === 'random' || q === 'aleatorio' || q === '') q = String(1 + Math.floor(Math.random() * 1025));
  const poke = await fetchJson(`https://pokeapi.co/api/v2/pokemon/${encodeURIComponent(q)}`);
  let species = null;
  try { species = await fetchJson(`https://pokeapi.co/api/v2/pokemon-species/${encodeURIComponent(String(poke.id))}`); } catch (_) { /* opcional */ }
  const flavor = species?.flavor_text_entries?.find(e => e.language.name === 'es')
    || species?.flavor_text_entries?.find(e => e.language.name === 'en');
  const art = poke.sprites?.other?.['official-artwork'];
  const home = poke.sprites?.other?.home;
  return {
    id: poke.id,
    name: poke.name,
    shiny: !!shiny,
    types: (poke.types || []).map(t => t.type.name),
    abilities: (poke.abilities || []).map(a => ({ name: a.ability.name, hidden: a.is_hidden })),
    height_m: poke.height / 10,
    weight_kg: poke.weight / 10,
    stats: Object.fromEntries((poke.stats || []).map(s => [s.stat.name, s.base_stat])),
    description: flavor ? flavor.flavor_text.replace(/\s+/g, ' ') : '',
    genus: species?.genera?.find(g => g.language.name === 'es')?.genus
      || species?.genera?.find(g => g.language.name === 'en')?.genus || '',
    image: shiny
      ? (art?.front_shiny || poke.sprites?.front_shiny || art?.front_default)
      : (art?.front_default || home?.front_default || poke.sprites?.front_default),
    sprite: shiny ? poke.sprites?.front_shiny : poke.sprites?.front_default,
    cries: poke.cries?.latest || null
  };
}

// ==========================================================================
// 2) REACTIONS — proveedores de GIFs (100% SFW)
// ==========================================================================
const REACTION_PROVIDERS = {
  'nekos.best': async (r) => {
    const j = await fetchJson(`https://nekos.best/api/v2/${r}?amount=1`, { timeoutMs: 10000 });
    const u = j?.results?.[0]?.url;
    if (!u) throw new Error('sin gif');
    return u;
  },
  purrbot: async (r) => {
    const j = await fetchJson(`https://purrbot.site/api/img/sfw/${r}/gif`, { timeoutMs: 10000 });
    const u = j?.link;
    if (!u) throw new Error('sin gif');
    return u;
  },
  otakugifs: async (r) => {
    const j = await fetchJson(`https://api.otakugifs.xyz/gif?reaction=${r}&format=gif`, { timeoutMs: 10000 });
    const u = j?.url;
    if (!u) throw new Error('sin gif');
    return u;
  }
};

// Lista blanca de reacciones (solo SFW). El id del endpoint = la reacción.
const REACTIONS = {
  hug: 'Abrazo',
  kiss: 'Beso',
  pat: 'Caricia en la cabeza',
  slap: 'Bofetada de broma',
  cuddle: 'Acurrucarse',
  wave: 'Saludo con la mano',
  wink: 'Guiño',
  blush: 'Sonrojo',
  smile: 'Sonrisa',
  happy: 'Felicidad',
  dance: 'Baile',
  cry: 'Llanto',
  poke: 'Toque con el dedo',
  tickle: 'Cosquillas',
  highfive: 'Choca esos cinco',
  handhold: 'Tomados de la mano',
  nom: 'Comer algo',
  bite: 'Mordisco de broma',
  bonk: 'Bonk',
  baka: 'Baka!',
  smug: 'Cara de suficiencia',
  laugh: 'Risa',
  shrug: 'Encogimiento de hombros',
  sleep: 'Dormir',
  think: 'Pensando',
  thumbsup: 'Pulgar arriba'
};

const REACTION_LIST = Object.keys(REACTIONS);

/**
 * Devuelve el GIF de una reacción probando los proveedores en orden.
 * @param {string} name
 * @param {{provider?:string}} opts
 */
async function reaction(name, { provider = null } = {}) {
  const key = String(name || '').toLowerCase();
  if (!REACTION_LIST.includes(key)) { const err = new Error(`Reacción desconocida "${name}". Usa: ${REACTION_LIST.join(', ')}`); err.status = 404; throw err; }

  if (provider) {
    const fn = REACTION_PROVIDERS[String(provider).toLowerCase()];
    if (!fn) { const err = new Error(`Proveedor no disponible. Usa: ${Object.keys(REACTION_PROVIDERS).join(', ')}`); err.status = 400; throw err; }
    return { reaction: key, label: REACTIONS[key], provider: String(provider).toLowerCase(), gif: await fn(key) };
  }

  const producers = Object.entries(REACTION_PROVIDERS)
    .map(([label, fn]) => [label, () => fn(key)]);
  try {
    // En paralelo y con presupuesto corto: nunca más de 8 s por petición.
    const { value, source } = await firstFast(producers, { timeoutMs: 8000 });
    return { reaction: key, label: REACTIONS[key], provider: source, gif: value };
  } catch (e) {
    e.message = `Ningún proveedor de GIFs tiene la reacción "${key}" ahora mismo.`;
    throw e;
  }
}

// ==========================================================================
// 3) TOOLS — traductor
// ==========================================================================
async function translate(text, to = 'en', from = 'auto') {
  const tl = String(to || 'en').toLowerCase();
  const sl = String(from || 'auto').toLowerCase();
  const { value } = await firstSuccess([
    ['google-gtx', async () => {
      const j = await fetchJson(`https://translate.googleapis.com/translate_a/single?client=gtx&sl=${encodeURIComponent(sl)}&tl=${encodeURIComponent(tl)}&dt=t&q=${encodeURIComponent(text)}`);
      const translated = (j[0] || []).map(seg => seg[0]).join('');
      if (!translated) throw new Error('sin traducción');
      return { originalText: text, translatedText: translated, from: j[2] || sl, to: tl, engine: 'google-gtx' };
    }],
    ['mymemory', async () => {
      const pair = `${sl === 'auto' ? 'autodetect' : sl}|${tl}`;
      const j = await fetchJson(`https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=${encodeURIComponent(pair)}`);
      const translated = j?.responseData?.translatedText;
      if (!translated) throw new Error('sin traducción');
      return { originalText: text, translatedText: translated, from: sl, to: tl, engine: 'mymemory' };
    }]
  ]);
  return value;
}

// ==========================================================================
// 4) DOWNLOADER — TikTok / YouTube / Facebook / Instagram / MP3 / MP4 / Lyric
// ==========================================================================

// ---------------- TikTok (TikWM, sin marca de agua) ----------------
function mapTikTokVideo(v) {
  const author = v.author || {};
  const id = v.video_id || v.id || null;
  return {
    id,
    title: v.title || '',
    url: author.unique_id && id ? `https://www.tiktok.com/@${author.unique_id}/video/${id}` : null,
    cover: v.cover || v.origin_cover || null,
    duration: v.duration ?? null,
    video_nowatermark: v.hdplay || v.play || null,
    video_watermark: v.wmplay || null,
    audio: v.music || v.music_info?.play || null,
    music: v.music_info ? { title: v.music_info.title, author: v.music_info.author } : null,
    author: { nickname: author.nickname || '', username: author.unique_id || '', avatar: author.avatar || null },
    stats: {
      plays: v.play_count ?? null,
      likes: v.digg_count ?? null,
      comments: v.comment_count ?? null,
      shares: v.share_count ?? null
    }
  };
}
async function tiktokDownload(url) {
  const j = await fetchJson(`https://www.tikwm.com/api/?url=${encodeURIComponent(url)}&hd=1`);
  if (j.code !== 0 || !j.data) throw new Error(j.msg || 'TikWM no pudo resolver el enlace');
  const d = mapTikTokVideo(j.data);
  return { ...d, watermark: false, images: j.data.images || null };
}
async function tiktokSearch(query, limit) {
  const count = clampLimit(limit, 10, 30);
  let j;
  try {
    j = await fetchJson(`https://www.tikwm.com/api/feed/search?keywords=${encodeURIComponent(query)}&count=${count}&cursor=0`, { timeoutMs: 15000 });
  } catch (e) {
    throw friendly(e);
  }
  if (j.code !== 0) throw new Error(j.msg || 'TikWM no pudo buscar en TikTok');
  const videos = (j.data?.videos || []).map(mapTikTokVideo).filter(v => v.id);
  if (!videos.length) throw new Error('TikTok no devolvió resultados para esa búsqueda');
  return videos;
}

// ---------------- YouTube (InnerTube + Invidious/Piped) ----------------
// Comprobar el hostname real, no una subcadena de la URL (puede ser engañosa).
function hostIs(host, domain) {
  return host === domain || host.endsWith(`.${domain}`);
}
function parsePublicLink(value) {
  try {
    const url = new URL(String(value || '').trim());
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return null;
    return url;
  } catch (_) { return null; }
}
function youtubeId(input) {
  const value = String(input || '').trim();
  if (/^[\w-]{11}$/.test(value)) return value;
  const url = parsePublicLink(value) || parsePublicLink(`https://${value}`);
  if (!url) return null;
  const host = url.hostname.toLowerCase();
  let id = null;
  if (hostIs(host, 'youtu.be')) id = url.pathname.split('/').filter(Boolean)[0];
  else if (hostIs(host, 'youtube.com') || hostIs(host, 'youtube-nocookie.com')) {
    if (/^\/(?:watch|music)\/?$/.test(url.pathname)) id = url.searchParams.get('v');
    else id = (url.pathname.match(/^\/(?:shorts|live|embed)\/([\w-]+)/) || [])[1];
  }
  return /^[\w-]{11}$/.test(id || '') ? id : null;
}
const INVIDIOUS_FALLBACK = ['https://yt.chocolatemoo53.com'];
let invidiousCache = { at: 0, list: INVIDIOUS_FALLBACK };
async function invidiousInstances() {
  if (Date.now() - invidiousCache.at < 3600000 && invidiousCache.list.length) return invidiousCache.list;
  try {
    const j = await fetchJson('https://api.invidious.io/instances.json', { timeoutMs: 7000 });
    const list = (Array.isArray(j) ? j : [])
      .map(([, info]) => info)
      .filter(info => info && info.type === 'https' && info.api === true && info.uri && !(info.monitor && info.monitor.down))
      .map(info => String(info.uri).replace(/\/$/, ''));
    if (list.length) invidiousCache = { at: Date.now(), list: [...new Set([...list, ...INVIDIOUS_FALLBACK])] };
  } catch (_) { /* se usa el respaldo */ }
  return invidiousCache.list;
}
const PIPED = [
  'https://pipedapi.reallyaweso.me',
  'https://pipedapi.leptons.xyz',
  'https://pipedapi-libre.kavin.rocks',
  'https://pipedapi.adminforge.de'
];

async function youtubeSearchInnerTube(query, limit) {
  const body = {
    context: { client: { clientName: 'WEB', clientVersion: '2.20240111.09.00', hl: 'es', gl: 'US' } },
    query
  };
  const j = await postJson('https://www.youtube.com/youtubei/v1/search?key=AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8', body, { headers: { 'User-Agent': UA_DESKTOP } });
  const sections = j?.contents?.twoColumnSearchResultsRenderer?.primaryContents?.sectionListRenderer?.contents || [];
  const items = [];
  for (const sec of sections) {
    for (const it of sec?.itemSectionRenderer?.contents || []) {
      const v = it?.videoRenderer;
      if (!v?.videoId) continue;
      items.push({
        id: v.videoId,
        title: (v.title?.runs || []).map(r => r.text).join(''),
        url: `https://www.youtube.com/watch?v=${v.videoId}`,
        thumbnail: v.thumbnail?.thumbnails?.at(-1)?.url || null,
        duration: v.lengthText?.simpleText || null,
        author: (v.ownerText?.runs || []).map(r => r.text).join(''),
        views: v.viewCountText?.simpleText || null,
        published: v.publishedTimeText?.simpleText || null
      });
      if (items.length >= limit) return items;
    }
  }
  if (!items.length) throw new Error('InnerTube sin resultados');
  return items;
}

async function youtubeSearch(query, limit) {
  const n = clampLimit(limit, 10, 30);
  const producers = [];
  if (YT.disponible()) producers.push(['youtubei', () => YT.buscar(query, n)]);
  producers.push(['innertube', () => youtubeSearchInnerTube(query, n)]);
  for (const base of await invidiousInstances()) {
    producers.push([base, async () => {
      const j = await fetchJson(`${base}/api/v1/search?q=${encodeURIComponent(query)}&type=video`, { timeoutMs: 10000 });
      const items = (Array.isArray(j) ? j : []).filter(v => v.type === 'video').slice(0, n).map(v => ({
        id: v.videoId,
        title: v.title,
        url: `https://www.youtube.com/watch?v=${v.videoId}`,
        thumbnail: `https://i.ytimg.com/vi/${v.videoId}/hqdefault.jpg`,
        duration: v.lengthSeconds ? `${Math.floor(v.lengthSeconds / 60)}:${String(v.lengthSeconds % 60).padStart(2, '0')}` : null,
        author: v.author || '',
        views: v.viewCount ?? null,
        published: v.publishedText || null
      }));
      if (!items.length) throw new Error('sin resultados');
      return items;
    }]);
  }
  for (const base of PIPED) {
    producers.push([base, async () => {
      const j = await fetchJson(`${base}/search?q=${encodeURIComponent(query)}&filter=videos`, { timeoutMs: 10000 });
      const items = (j.items || []).filter(v => v.url?.includes('watch')).slice(0, n).map(v => {
        const id = (v.url.match(/v=([\w-]{11})/) || [])[1];
        return {
          id,
          title: v.title,
          url: `https://www.youtube.com/watch?v=${id}`,
          thumbnail: v.thumbnail,
          duration: v.duration ? `${Math.floor(v.duration / 60)}:${String(v.duration % 60).padStart(2, '0')}` : null,
          author: v.uploaderName || '',
          views: v.views ?? null,
          published: v.uploadedDate || null
        };
      }).filter(v => v.id);
      if (!items.length) throw new Error('sin resultados');
      return items;
    }]);
  }
  const { value, source } = await firstSuccess(producers);
  return { results: value, source };
}

function pickAudio(formats = []) {
  const available = formats.filter(f => f.hasAudio && f.url);
  const audios = available.filter(f => !f.hasVideo);
  return audios.sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0))[0]
    || available.sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0))[0]
    || null;
}
function pickVideo(formats, quality = 720) {
  const muxed = formats.filter(f => f.hasVideo && f.hasAudio);
  const under = muxed.filter(f => (f.height || 0) <= quality).sort((a, b) => (b.height || 0) - (a.height || 0));
  if (under[0]) return under[0];
  if (muxed[0]) return muxed.sort((a, b) => (a.height || 0) - (b.height || 0))[0];
  const vids = formats.filter(f => f.hasVideo).sort((a, b) => Math.abs((a.height || 0) - quality) - Math.abs((b.height || 0) - quality));
  return vids[0] || null;
}

/** Mejor video que realmente puede acompañarse de audio. */
function bestPlayableVideo(formats, quality = 0, requireUrl = false) {
  const audio = pickAudio(formats);
  return selectVideoQuality(formats.filter(f => f.hasVideo && (!requireUrl || f.url)
    && (f.hasAudio || audio?.url)), quality);
}

/**
 * YouTube resuelto con **cobalt** (instancia propia o comunitaria). Se piden en
 * paralelo el video (con audio) y el audio en MP3: así los endpoints de MP3 y
 * MP4 tienen su formato aunque youtubei.js/Invidious estén bloqueados por IP.
 */
async function youtubeDesdeCobalt(id, quality = 0) {
  const watch = `https://www.youtube.com/watch?v=${id}`;
  const q = normalizarCalidad(quality) || 1080;
  const [video, audio] = await Promise.allSettled([
    COBALT.pedir(watch, { downloadMode: 'auto', videoQuality: q }),
    COBALT.pedir(watch, { downloadMode: 'audio', audioFormat: 'mp3', audioBitrate: '128' })
  ]);
  const formats = [];
  if (video.status === 'fulfilled' && video.value?.url) {
    formats.push({
      quality: `${q}p`, height: q, mime: 'video/mp4', url: video.value.url,
      hasVideo: true, hasAudio: true, bitrate: null, filename: video.value.filename || null
    });
  }
  if (audio.status === 'fulfilled' && audio.value?.url) {
    formats.push({
      quality: '128kbps', height: null, mime: 'audio/mpeg', url: audio.value.url,
      hasVideo: false, hasAudio: true, bitrate: 128000, filename: audio.value.filename || null
    });
  }
  if (!formats.length) {
    const errores = [video, audio].map(r => (r.status === 'rejected' ? r.reason?.message : null)).filter(Boolean);
    const e = new Error('cobalt no devolvió formatos para ese video');
    e.details = errores;
    throw e;
  }
  const meta = (video.status === 'fulfilled' && video.value?.filename) || (audio.status === 'fulfilled' && audio.value?.filename) || '';
  return {
    id,
    title: String(meta).replace(/\.[a-z0-9]{2,5}$/i, '').replace(/_/g, ' ') || 'Video de YouTube',
    author: null,
    duration: null,
    thumbnail: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
    formats,
    source: 'cobalt'
  };
}

async function youtubeStreams(id) {
  const producers = [];
  if (YT.disponible()) producers.push(['youtubei', async () => {
    const { meta, formats } = await YT.formatos(id);
    if (!formats.length) throw new Error('sin formatos');
    return { ...meta, formats };
  }]);
  for (const base of await invidiousInstances()) {
    producers.push([base, async () => {
      const j = await fetchJson(`${base}/api/v1/videos/${id}`, { timeoutMs: 12000 });
      if (!j || j.error) throw new Error(j?.error || 'sin datos');
      const formats = [];
      for (const f of j.formatStreams || []) {
        formats.push({ quality: f.qualityLabel || f.quality, height: parseInt(f.qualityLabel) || null, mime: f.type, url: f.url, hasVideo: true, hasAudio: true, bitrate: f.bitrate });
      }
      for (const f of j.adaptiveFormats || []) {
        if (!f.url) continue;
        const isAudio = String(f.type || '').startsWith('audio/');
        formats.push({
          quality: f.qualityLabel || (isAudio ? `${Math.round((f.bitrate || 0) / 1000)}kbps` : f.quality),
          height: parseInt(f.qualityLabel) || null,
          mime: f.type,
          url: f.url,
          hasVideo: !isAudio,
          hasAudio: isAudio,
          bitrate: f.bitrate
        });
      }
      if (!formats.length) throw new Error('sin formatos');
      return { id, title: j.title, author: j.author, duration: j.lengthSeconds, thumbnail: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`, formats };
    }]);
  }
  for (const base of PIPED) {
    producers.push([base, async () => {
      const j = await fetchJson(`${base}/streams/${id}`, { timeoutMs: 12000 });
      if (!j || j.error) throw new Error(j?.error || 'sin datos');
      const formats = [];
      for (const f of j.audioStreams || []) {
        formats.push({ quality: f.quality || `${Math.round((f.bitrate || 0) / 1000)}kbps`, height: null, mime: f.mimeType, url: f.url, hasVideo: false, hasAudio: true, bitrate: f.bitrate });
      }
      for (const f of j.videoStreams || []) {
        formats.push({ quality: f.quality, height: parseInt(f.quality) || f.height || null, mime: f.mimeType, url: f.url, hasVideo: true, hasAudio: !f.videoOnly, bitrate: f.bitrate });
      }
      if (!formats.length) throw new Error('sin formatos');
      return { id, title: j.title, author: j.uploader, duration: j.duration, thumbnail: j.thumbnailUrl || `https://i.ytimg.com/vi/${id}/hqdefault.jpg`, formats };
    }]);
  }
  if (COBALT.disponible()) producers.push(['cobalt', () => youtubeDesdeCobalt(id)]);
  const { value, source } = await firstSuccess(producers);
  return { ...value, source };
}

/**
 * Calidad pedida por query string: '' / 'auto' / 'mejor' → 0 (= la mejor).
 * Acepta 360, 720, '1080p', 'hd'…
 */
function normalizarCalidad(v) {
  const s = String(v == null ? '' : v).toLowerCase().trim();
  if (!s || s === 'auto' || s === 'mejor' || s === 'best' || s === 'max') return 0;
  if (s === 'hd') return 720;
  if (s === 'fhd' || s === 'fullhd') return 1080;
  if (s === 'sd') return 480;
  const n = parseInt(s.replace(/[^0-9]/g, ''), 10);
  return Number.isNaN(n) ? 0 : n;
}

/**
 * Devuelve un video REPRODUCIBLE (con imagen y sonido) de YouTube.
 * 1º youtubei.js: formato progresivo o pegado con ffmpeg.
 * 2º respaldo Invidious/Piped: se usa el formato muxeado si existe.
 * @returns {Promise<{url?:string, file?:string, hasAudio:boolean, height?:number, quality?:string, muxed?:boolean, source:string}>}
 */
async function youtubePlayable(id, quality = 0) {
  const q = normalizarCalidad(quality);
  const errores = [];
  if (YT.disponible()) {
    try {
      return { ...(await YT.videoReproducible(id, q)), source: 'youtubei' };
    } catch (e) { errores.push(`youtubei: ${e.message}`); }
  }
  try {
    const info = await youtubeStreams(id);
    const audio = pickAudio(info.formats);
    const video = bestPlayableVideo(info.formats, q, true);
    if (!video) throw new Error('sin video con audio disponible');
    if (video.hasAudio) {
      return { url: video.url, hasAudio: true, height: video.height || null, quality: video.quality || null, mime: video.mime || 'video/mp4', muxed: false, source: info.source };
    }
    try {
      const file = await YT.pegar(video.url, audio.url, id);
      return { file, hasAudio: true, height: video.height || null, quality: video.quality || null, mime: 'video/mp4', muxed: true, source: info.source };
    } catch (e) {
      // La calidad inferior progresiva es preferible a un video mudo.
      const progressive = selectVideoQuality(info.formats.filter(f => f.url && f.hasVideo && f.hasAudio), q);
      if (progressive) return { url: progressive.url, hasAudio: true, height: progressive.height || null, quality: progressive.quality || null, mime: progressive.mime || 'video/mp4', muxed: false, source: info.source };
      throw e;
    }
  } catch (e) { errores.push(`respaldo: ${e.message}`); }

  const err = new Error('No se pudo obtener un video reproducible de YouTube.');
  err.details = errores;
  throw err;
}

/**
 * MP3 ya convertido (lo hace ffmpeg en youtube.js). Es lo que usan /play y /mp3
 * para que el navegador siempre pueda reproducir y descargar el audio.
 * @returns {Promise<string>} ruta del archivo temporal
 */
async function youtubeAudioFile(id) {
  if (!YT.disponible()) throw new Error('youtubei.js no está disponible');
  return YT.audioArchivo(id);
}

/** Audio reproducible (para /mp3 y /play). */
async function youtubeAudio(id) {
  const errores = [];
  if (YT.disponible()) {
    try {
      const a = await YT.audioReproducible(id);
      return { ...a, provider: 'youtubei' };
    } catch (e) { errores.push(`youtubei: ${e.message}`); }
  }
  try {
    const info = await youtubeStreams(id);
    const audio = pickAudio(info.formats);
    if (!audio) throw new Error('sin audio');
    return { url: audio.url, mime: audio.mime || 'audio/mp4', bitrate: audio.bitrate || null, provider: info.source };
  } catch (e) { errores.push(`respaldo: ${e.message}`); }
  const err = new Error('No se pudo obtener el audio de YouTube.');
  err.details = errores;
  throw err;
}

async function resolveYoutubeTarget({ url, query }) {
  if (url) {
    const id = youtubeId(url);
    if (!id) {
      const err = new Error('URL de YouTube inválida. Ejemplo: https://www.youtube.com/watch?v=XXXXXXXXXXX');
      err.status = 400;
      throw err;
    }
    return youtubeStreams(id);
  }
  if (!query) {
    const err = new Error('Falta el parámetro url o query');
    err.status = 400;
    throw err;
  }
  const { results } = await youtubeSearch(query, 1);
  if (!results.length) throw new Error('Sin resultados para esa búsqueda');
  const info = await youtubeStreams(results[0].id);
  return { ...info, searchResult: results[0] };
}

// ---------------- Facebook ----------------
function fbVideoId(url) {
  const s = String(url || '');
  const m = s.match(/\/videos\/(?:[^/]+\/)?(\d{6,})/)
    || s.match(/[?&]v=(\d{6,})/)
    || s.match(/\/reel\/(\d{6,})/)
    || s.match(/\/watch\/?\?v=(\d{6,})/);
  return m ? m[1] : null;
}
function unescapeJs(s) {
  if (!s) return null;
  try { return JSON.parse(`"${String(s).replace(/"/g, '\\"')}"`); } catch (_) { return String(s).replace(/\\u0025/g, '%').replace(/\\\//g, '/'); }
}
function metaContent(html, prop) {
  const m = html.match(new RegExp(`property="${prop}"[^>]*content="([^"]*)"`, 'i'))
    || html.match(new RegExp(`content="([^"]*)"[^>]*property="${prop}"`, 'i'))
    || html.match(new RegExp(`name="${prop}"[^>]*content="([^"]*)"`, 'i'));
  return m ? m[1].replace(/&amp;/g, '&') : null;
}

/** Patrones de video de Facebook, en orden de calidad (HD primero). */
const FB_PATRONES_HD = [
  /"playable_url_quality_hd":"([^"]+)"/,
  /"browser_native_hd_url":"([^"]+)"/,
  /hd_src(?:_no_ratelimit)?:"([^"]+)"/,
  /"hd_src":"([^"]+)"/,
  /"video_hd_url":"([^"]+)"/
];
const FB_PATRONES_SD = [
  /"playable_url":"([^"]+)"/,
  /"browser_native_sd_url":"([^"]+)"/,
  /sd_src(?:_no_ratelimit)?:"([^"]+)"/,
  /"sd_src":"([^"]+)"/,
  /"video_sd_url":"([^"]+)"/
];
const FB_PATRONES_META = [
  /property="og:video(?::url|:secure_url)?"[^>]*content="([^"]+)"/,
  /"contentUrl":"([^"]+\.mp4[^"]*)"/
];

const primerMatch = (html, patrones) => {
  for (const re of patrones) {
    const m = html.match(re);
    if (m && m[1]) {
      const u = unescapeUrl(unescapeJs(m[1]));
      if (u && /^https?:\/\//i.test(u)) return u;
    }
  }
  return null;
};

function parseFacebookHtml(html) {
  const hd = primerMatch(html, FB_PATRONES_HD) || primerMatch(html, FB_PATRONES_META);
  const sd = primerMatch(html, FB_PATRONES_SD);
  const title = metaContent(html, 'og:title') || (html.match(/<title[^>]*>([^<]+)<\/title>/i) || [])[1] || 'Facebook video';
  const thumbnail = metaContent(html, 'og:image');
  const todos = [...new Set([hd, sd].filter(Boolean))];
  return {
    hd: hd || null,
    sd: sd && sd !== hd ? sd : (todos.length > 1 ? todos[1] : null),
    title: String(title).replace(/\s+/g, ' ').trim(),
    thumbnail: thumbnail ? unescapeUrl(thumbnail) : null
  };
}

/** fb.watch y fb.me redirigen: hay que quedarse con la URL final. */
async function resolverFbWatch(url) {
  if (!/(?:fb\.watch|fb\.me|facebook\.com\/share)/i.test(url)) return url;
  try {
    const res = await fetchWithTimeout(url, { headers: { 'User-Agent': UA_MOBILE }, publicOnly: true }, 12000);
    await res.body?.cancel?.();
    return res.url || url;
  } catch (_) {
    return url;
  }
}

async function facebookDownload(url) {
  const original = String(url || '').trim();
  const parsed = parsePublicLink(original);
  if (!parsed || !['facebook.com', 'fb.watch', 'fb.me'].some(domain => hostIs(parsed.hostname.toLowerCase(), domain))) {
    const err = new Error('URL de Facebook inválida (usa facebook.com/… o fb.watch/…)');
    err.status = 400;
    throw err;
  }
  const target = await resolverFbWatch(original);
  const resolved = parsePublicLink(target);
  if (!resolved || !['facebook.com', 'fb.watch', 'fb.me'].some(domain => hostIs(resolved.hostname.toLowerCase(), domain))) {
    throw new Error('El enlace de Facebook redirigió a un dominio no permitido');
  }
  const id = fbVideoId(target);
  const propio = Boolean(String(process.env.COBALT_API_URL || process.env.COBALT_API_URLS || '').trim());
  const productores = [];
  const porCobalt = ['cobalt', async () => {
    const r = await COBALT.pedir(original, { downloadMode: 'auto' });
    return {
      title: r.filename ? String(r.filename).replace(/\.[a-z0-9]+$/i, '').replace(/_/g, ' ') : 'Facebook video',
      thumbnail: null,
      hd: r.url,
      sd: null,
      video: r.url,
      source: 'cobalt'
    };
  }];
  if (propio && COBALT.disponible()) productores.push(porCobalt);
  productores.push(
    ['facebook-mobile', async () => {
      const html = await fetchText(target, { headers: { 'User-Agent': UA_MOBILE, 'Accept-Language': 'en-US,en;q=0.9' }, timeoutMs: 20000, publicOnly: true });
      const parsed = parseFacebookHtml(html);
      if (!parsed.hd && !parsed.sd) throw new Error('sin video público (¿es privado?)');
      return parsed;
    }],
    ['facebook-embed', async () => {
      const html = await fetchText(`https://www.facebook.com/plugins/video.php?href=${encodeURIComponent(target)}&show_text=false`, {
        headers: { 'User-Agent': UA_MOBILE, 'Accept-Language': 'en-US,en;q=0.9' }, timeoutMs: 20000
      });
      const parsed = parseFacebookHtml(html);
      if (!parsed.hd && !parsed.sd) throw new Error('sin video en el embed');
      return parsed;
    }]
  );
  if (id) {
    productores.push(
      ['facebook-watch', async () => {
        const html = await fetchText(`https://www.facebook.com/watch/?v=${id}`, { headers: { 'User-Agent': UA_DESKTOP }, timeoutMs: 20000 });
        const parsed = parseFacebookHtml(html);
        if (!parsed.hd && !parsed.sd) throw new Error('sin video');
        return parsed;
      }],
      ['facebook-mbasic', async () => {
        const html = await fetchText(`https://mbasic.facebook.com/video_redirect/?src=https%3A%2F%2Fwww.facebook.com%2Fwatch%2F%3Fv%3D${id}`, {
          headers: { 'User-Agent': UA_MOBILE }, timeoutMs: 20000
        });
        const parsed = parseFacebookHtml(html);
        if (!parsed.hd && !parsed.sd) throw new Error('sin video en mbasic');
        return parsed;
      }]
    );
  }
  if (!propio && COBALT.disponible()) productores.push(porCobalt);

  const { value, source } = await firstSuccess(productores);
  return {
    id: id || null,
    title: value.title || 'Facebook video',
    thumbnail: value.thumbnail || null,
    hd: value.hd || null,
    sd: value.sd || null,
    video: value.hd || value.sd || null,
    url: target,
    source: value.source || source
  };
}

// ---------------- Instagram ----------------
// Instagram esconde el media detrás del login. Se resuelve con los "fixers" de
// embeds (InstaFix y sus forks mantenidos), que sirven el post con los
// og:video / og:image completos. Se prueban varios hosts porque cada uno se cae
// o lo ratean en momentos distintos; gana el primero que devuelva media.
const IG_MIRRORS = [
  'oginstagram.com',
  'kkinstagram.com',
  'instagramez.com',
  'vxinstagram.com',
  'kirkstagram.com',
  'uuinstagram.com',
  'gginstagram.com',
  'instagramfix.com',
  'zzinstagram.com',
  'd.ddinstagram.com',
  'ddinstagram.com'
];

function igShortcode(input) {
  const url = parsePublicLink(input);
  if (!url || !hostIs(url.hostname.toLowerCase(), 'instagram.com')) return null;
  const m = url.pathname.match(/^\/(?:[^/]+\/)?(?:p|reel|reels|tv)\/([-A-Za-z0-9_]+)/);
  return m ? m[1] : null;
}
function igKind(url) {
  return /\/(?:reel|reels)\//.test(String(url)) ? 'reel' : /\/tv\//.test(String(url)) ? 'tv' : 'p';
}
const unescapeUrl = u => String(u || '')
  .replace(/\\u0026/gi, '&')
  .replace(/\\u002F/gi, '/')
  .replace(/\\\//g, '/')
  .replace(/&amp;/g, '&')
  .trim();

/**
 * Media de un post de Instagram a partir del HTML de un fixer o del embed
 * oficial. Devuelve video, imagen y todos los slides de un carrusel.
 */
function parseInstagramHtml(html, code = null) {
  const texto = String(html || '');
  const media = [];
  const add = (type, url, thumb = null) => {
    const u = unescapeUrl(url);
    if (!/^https?:\/\//i.test(u) || /instagram\.com\/(?:p|reel)\//.test(u)) return;
    if (media.some(m => m.url === u)) return;
    media.push({ type, url: u, thumbnail: thumb ? unescapeUrl(thumb) : null });
  };
  const video = metaContent(texto, 'og:video:secure_url')
    || metaContent(texto, 'og:video')
    || metaContent(texto, 'og:video:url');
  const image = metaContent(texto, 'og:image:secure_url') || metaContent(texto, 'og:image');
  if (video) add('video', video, image);
  else if (image) add('image', image);
  // Carrusel / varios slides: incluir también og:image y evitar duplicados.
  // display_url y el JSON-LD del embed
  const displays = [...texto.matchAll(/"display_url":"([^"]+)"/g)].map(m => m[1]);
  const contentUrls = [...texto.matchAll(/"contentUrl":"([^"]+)"/g)].map(m => m[1]);
  const embeds = [...texto.matchAll(/<img[^>]+class="[^"]*EmbeddedMediaImage[^"]*"[^>]*src="([^"]+)"/gi)]
    .concat([...texto.matchAll(/<img[^>]+src="([^"]+)"[^>]*class="[^"]*EmbeddedMediaImage/gi)])
    .map(m => m[1]);
  for (const u of [...displays, ...contentUrls, ...embeds]) add(/\.mp4|video/i.test(u) ? 'video' : 'image', u, image);
  if (!media.length && image) add('image', image);
  const title = metaContent(texto, 'og:title') || metaContent(texto, 'twitter:title') || '';
  const author = (texto.match(/"owner":\{"username":"([^"]+)"/) || [])[1]
    || (texto.match(/@([A-Za-z0-9._]{2,30})/) || [])[1] || null;
  return { shortcode: code, title: String(title).replace(/\s+/g, ' ').trim(), author, media };
}

async function instagramDownload(url) {
  const code = igShortcode(url);
  if (!code) {
    const err = new Error('URL de Instagram inválida (usa /p/…, /reel/… o /tv/…)');
    err.status = 400;
    throw err;
  }
  const kind = igKind(url);
  const path = `/${kind}/${code}/`;
  const propio = Boolean(String(process.env.COBALT_API_URL || process.env.COBALT_API_URLS || '').trim());

  const desdeMirror = host => async () => {
    const html = await fetchText(`https://${host}${path}`, {
      headers: { 'User-Agent': UA_MOBILE, Accept: 'text/html,application/xhtml+xml' },
      timeoutMs: 10000
    });
    const parsed = parseInstagramHtml(html, code);
    if (!parsed.media.length) throw new Error('sin media');
    return parsed;
  };
  const porCobalt = async () => {
    const r = await COBALT.pedir(url, { downloadMode: 'auto' });
    const esVideo = /\.(?:mp4|webm|mov)(?:\?|$)/i.test(r.url) || /video/i.test(r.filename || '');
    return {
      shortcode: code, title: r.filename || '', author: null,
      media: [{ type: esVideo ? 'video' : 'image', url: r.url, thumbnail: null }], source: 'cobalt'
    };
  };
  const desdeEmbed = async () => {
    const html = await fetchText(`https://www.instagram.com/${kind}/${code}/embed/captioned/`, {
      headers: { 'User-Agent': UA_MOBILE }, timeoutMs: 12000
    });
    const parsed = parseInstagramHtml(html, code);
    if (!parsed.media.length) throw new Error('sin media en el embed');
    return parsed;
  };

  const mirrors = IG_MIRRORS.map(host => [host, desdeMirror(host)]);

  // Con instancia propia de cobalt configurada se prueba primero (es la que
  // mejor resuelve reels con música y carruseles).
  if (propio && COBALT.disponible()) {
    try {
      const media = await porCobalt();
      return { ...media, url: `https://www.instagram.com${path}`, source: 'cobalt' };
    } catch (_) { /* sigue con los mirrors */ }
  }

  // Estrategia de tiempo: 3 mirrors en serie (casi siempre responden) y el
  // resto en paralelo con presupuesto de 8 s, para no comerse el límite de
  // Vercel si los primeros están caídos.
  const errores = [];
  const rapido = async lista => {
    try {
      const { value, source } = await firstSuccess(lista);
      return { ...value, url: `https://www.instagram.com${path}`, source: value.source || source };
    } catch (e) {
      if (e.details) errores.push(...e.details);
      return null;
    }
  };
  const primeros = await rapido(mirrors.slice(0, 3));
  if (primeros) return primeros;
  if (mirrors.length > 3) {
    try {
      const { value, source } = await firstFast(mirrors.slice(3), { timeoutMs: 8000 });
      return { ...value, url: `https://www.instagram.com${path}`, source: value.source || source };
    } catch (e) {
      if (e.details) errores.push(...e.details);
    }
  }
  const finales = [['instagram-embed', desdeEmbed]];
  if (COBALT.disponible()) finales.push(['cobalt', porCobalt]);
  const ultimo = await rapido(finales);
  if (ultimo) return ultimo;

  const err = new Error('Ningún mirror de Instagram respondió. Prueba de nuevo o configura COBALT_API_URL.');
  err.details = errores.slice(0, 4);
  throw err;
}

// ---------------- Preview de música (Deezer / iTunes) ----------------
// Respaldo de /downloader/play: si YouTube no entrega el audio, estos servicios
// públicos devuelven 30 s de la canción (sin token) y siempre suenan.
function mapDeezer(t) {
  return {
    url: t.preview || null,
    mime: 'audio/mpeg',
    title: t.title || t.title_short || '',
    artist: t.artist?.name || '',
    album: t.album?.title || '',
    cover: t.album?.cover_xl || t.album?.cover_big || null,
    duration: t.duration || null,
    preview: true,
    source: 'deezer'
  };
}

function mapItunes(t) {
  return {
    url: t.previewUrl || null,
    mime: 'audio/mp4',
    title: t.trackName || '',
    artist: t.artistName || '',
    album: t.collectionName || '',
    cover: t.artworkUrl100 ? String(t.artworkUrl100).replace('100x100', '600x600') : null,
    duration: t.trackTimeMillis ? Math.round(t.trackTimeMillis / 1000) : null,
    preview: true,
    source: 'itunes'
  };
}

/** 30 segundos de una canción (Deezer → iTunes). */
async function previewAudio(query, limit = 1) {
  const n = clampLimit(limit, 1, 10);
  const { value, source } = await firstSuccess([
    ['deezer', async () => {
      const j = await fetchJson(`https://api.deezer.com/search?q=${encodeURIComponent(query)}&limit=${n}`, { timeoutMs: 12000 });
      const list = (j?.data || []).map(mapDeezer).filter(t => t.url);
      if (!list.length) throw new Error('Deezer sin preview');
      return list;
    }],
    ['itunes', async () => {
      const j = await fetchJson(`https://itunes.apple.com/search?term=${encodeURIComponent(query)}&media=music&limit=${n}`, { timeoutMs: 12000 });
      const list = (j?.results || []).map(mapItunes).filter(t => t.url);
      if (!list.length) throw new Error('iTunes sin preview');
      return list;
    }]
  ]);
  return { provider: source, count: value.length, tracks: value, ...value[0] };
}

// ---------------- Lyric (LRCLIB + lyrics.ovh) ----------------
async function lyricsSearch(query, limit) {
  let j = null;
  try {
    j = await fetchJson(`https://lrclib.net/api/search?q=${encodeURIComponent(query)}`, { headers: { 'Lrclib-Client': 'Velirius-API' } });
  } catch (_) { j = null; }
  if (!Array.isArray(j) || !j.length) {
    const sug = await fetchJson(`https://api.lyrics.ovh/suggest/${encodeURIComponent(query)}`);
    return (sug?.data || []).slice(0, clampLimit(limit, 10, 30)).map(t => ({
      id: t.id,
      title: t.title,
      artist: t.artist?.name || '',
      album: t.album?.title || null,
      duration: t.duration || null,
      instrumental: false,
      hasSynced: false,
      plainLyrics: null,
      syncedLyrics: null
    }));
  }
  return j.slice(0, clampLimit(limit, 10, 30)).map(t => ({
    id: t.id,
    title: t.trackName,
    artist: t.artistName,
    album: t.albumName,
    duration: t.duration,
    instrumental: !!t.instrumental,
    hasSynced: !!t.syncedLyrics,
    plainLyrics: t.plainLyrics || null,
    syncedLyrics: t.syncedLyrics || null
  }));
}
async function lyricFor(query) {
  const list = await lyricsSearch(query, 5);
  const hit = list.find(t => t.plainLyrics || t.syncedLyrics) || list[0];
  if (hit && (hit.plainLyrics || hit.syncedLyrics)) return { ...hit, query, source: 'lrclib' };
  if (hit && hit.title && hit.artist) {
    const lyr = await fetchJson(`https://api.lyrics.ovh/v1/${encodeURIComponent(hit.artist)}/${encodeURIComponent(hit.title)}`);
    if (lyr?.lyrics) return { ...hit, plainLyrics: lyr.lyrics, hasSynced: false, syncedLyrics: null, query, source: 'lyrics.ovh' };
  }
  const sug = await fetchJson(`https://api.lyrics.ovh/suggest/${encodeURIComponent(query)}`);
  const song = sug?.data?.[0];
  if (!song) throw new Error('No se encontró la letra de esa canción');
  const lyr = await fetchJson(`https://api.lyrics.ovh/v1/${encodeURIComponent(song.artist.name)}/${encodeURIComponent(song.title)}`);
  return {
    title: song.title,
    artist: song.artist.name,
    album: song.album?.title || null,
    duration: song.duration || null,
    hasSynced: false,
    plainLyrics: lyr.lyrics || null,
    syncedLyrics: null,
    query,
    source: 'lyrics.ovh'
  };
}

// ==========================================================================
// 5) SEARCHER — TikTok / YouTube / Google / Wikipedia / Pinterest
// ==========================================================================

// ---------------- Pinterest ----------------
// Pinterest devuelve los pines por su "resource" interno (el mismo que usa la
// web: BaseSearchResource / PinResource). Si responde 403 (rate limit) se cae al
// HTML de la búsqueda, que trae las imágenes de i.pinimg.com.
const PIN_HEADERS = {
  'User-Agent': UA_DESKTOP,
  Accept: 'application/json, text/javascript, */*, q=0.01',
  'Accept-Language': 'es-UY,es;q=0.9,en;q=0.8',
  'X-Requested-With': 'XMLHttpRequest',
  'X-APP-VERSION': 'cb1f4b0',
  'X-Pinterest-AppState': 'active',
  'X-Pinterest-PWS-Handler': 'www/index.js'
};

function pinterestHost(host) {
  return hostIs(host, 'pin.it') || /(?:^|\.)pinterest\.(?:com|[a-z]{2}|(?:com|co)\.[a-z]{2})$/i.test(host);
}
function pinterestPinId(input) {
  const value = String(input || '').trim();
  if (/^\d{6,}$/.test(value)) return value;
  const url = parsePublicLink(value);
  if (!url || !pinterestHost(url.hostname.toLowerCase())) return null;
  const m = url.pathname.match(/\/pin\/(\d+)(?:\/|$)/i);
  return m ? m[1] : null;
}

/** Un pin de Pinterest → resultado normalizado (imagen o video). */
function mapPinterestPin(pin, source = 'pinterest') {
  const imgs = pin?.images || {};
  const best = imgs.orig?.url || imgs['736x']?.url || imgs['564x']?.url || imgs['474x']?.url || pin?.image || null;
  const thumbs = imgs['236x']?.url || imgs['474x']?.url || best;
  const videos = pin?.videos?.video_list ? Object.entries(pin.videos.video_list) : [];
  const video = videos
    .map(([key, v]) => ({ key, url: v?.url, w: v?.width || 0 }))
    .filter(v => v.url)
    .sort((a, b) => b.w - a.w)[0]?.url || null;
  if (!best && !video) return null;
  return {
    id: pin?.id ? String(pin.id) : null,
    type: video ? 'video' : /\.gif(?:\\?|$)/i.test(String(best)) ? 'gif' : 'image',
    title: pin?.grid_title || pin?.title || pin?.closeup_unified_title || null,
    description: pin?.description || pin?.closeup_unified_description || null,
    url: pin?.id ? `https://www.pinterest.com/pin/${pin.id}/` : null,
    image: best,
    thumbnail: thumbs || best,
    video,
    width: Number(imgs.orig?.width) || null,
    height: Number(imgs.orig?.height) || null,
    author: pin?.pinner?.username || pin?.closeup_attribution?.full_name || null,
    source
  };
}

/** Búsqueda de pines por la API interna (JSON). */
async function pinterestResource(resource, options, sourceUrl) {
  const data = encodeURIComponent(JSON.stringify({ options: { ...options, gated: false }, context: {} }));
  const url = `https://www.pinterest.com/resource/${resource}/get/?source_url=${encodeURIComponent(sourceUrl)}&data=${data}`;
  const j = await fetchJson(url, { headers: PIN_HEADERS, timeoutMs: 15000 });
  return j?.resource_response?.data ?? null;
}

async function pinterestSearch(query, limit = 20, page = 1) {
  const n = clampLimit(limit, 20, 50);
  const pagina = Math.max(1, Math.min(20, parseInt(page, 10) || 1));
  const sourceUrl = `/search/pins/?q=${encodeURIComponent(query)}`;
  const productores = [
    ['pinterest-api', async () => {
      let bookmark = null;
      let pines = [];
      // se piden páginas hasta llegar al `page` pedido (Pinterest pagina con bookmarks)
      for (let i = 0; i < pagina; i++) {
        const base = { query, scope: 'pins', page_size: Math.min(50, n) };
        const data = await pinterestResource('BaseSearchResource', bookmark ? { ...base, bookmarks: [bookmark] } : base, sourceUrl);
        const resultados = data?.results || [];
        pines = resultados;
        bookmark = (data?.bookmarks || [])[0] || null;
        if (!bookmark) break;
      }
      const list = pines.map(p => mapPinterestPin(p, 'pinterest')).filter(Boolean).slice(0, n);
      if (!list.length) throw new Error('sin resultados');
      return list;
    }],
    ['pinterest-html', async () => {
      const html = await fetchText(`https://www.pinterest.com/search/pins/?q=${encodeURIComponent(query)}`, {
        headers: { 'User-Agent': UA_DESKTOP, 'Accept-Language': 'es-UY,es;q=0.9' }, timeoutMs: 15000
      });
      const urls = [...html.matchAll(/https:\/\/i\.pinimg\.com\/(?:originals|736x|564x)\/[^"'\s\\]+?\.(?:jpe?g|png|gif|webp)/g)]
        .map(m => m[0].replace(/\\\//g, '/'));
      const unicos = [...new Set(urls)].slice(0, n);
      if (!unicos.length) throw new Error('sin imágenes en el HTML');
      return unicos.map((u, i) => ({
        id: null, type: 'image', title: null, description: null, url: null,
        image: u, thumbnail: u.replace(/\/(?:originals|736x|564x)\//, '/236x/'),
        video: null, width: null, height: null, author: null, source: 'pinterest-html', position: i + 1
      }));
    }]
  ];
  const { value, source } = await firstSuccess(productores);
  return { query, page: pagina, source, count: value.length, results: value };
}

/** Descarga de un pin: por ID (API interna) o por la URL del pin (og:video/og:image). */
async function pinterestDownload(url) {
  const id = pinterestPinId(url);
  const parsed = parsePublicLink(url);
  if (!id && (!parsed || !pinterestHost(parsed.hostname.toLowerCase()))) {
    const err = new Error('URL de Pinterest inválida (usa https://www.pinterest.com/pin/<id>/ o pin.it/…)');
    err.status = 400;
    throw err;
  }
  const propio = Boolean(String(process.env.COBALT_API_URL || process.env.COBALT_API_URLS || '').trim());
  const productores = [];
  const porCobalt = ['cobalt', async () => {
    const r = await COBALT.pedir(url, { downloadMode: 'auto' });
    return {
      id: id || null, type: /\.(?:mp4|webm|mov)(?:\?|$)/i.test(r.url) ? 'video' : 'image',
      title: r.filename ? String(r.filename).replace(/\.[a-z0-9]+$/i, '').replace(/_/g, ' ') : null,
      description: null, url: id ? `https://www.pinterest.com/pin/${id}/` : url,
      image: /\.(?:mp4|webm|mov)(?:\?|$)/i.test(r.url) ? null : r.url,
      thumbnail: null, video: /\.(?:mp4|webm|mov)(?:\?|$)/i.test(r.url) ? r.url : null,
      width: null, height: null, author: null, source: 'cobalt'
    };
  }];
  if (propio && COBALT.disponible()) productores.push(porCobalt);
  if (id) {
    productores.push(['pinterest-api', async () => {
      const data = await pinterestResource('PinResource', { id, field_set_key: 'auth_web_main_pin' }, `/pin/${id}/`);
      const pin = data?.data || data;
      if (!pin || typeof pin !== 'object') throw new Error('sin datos del pin');
      const item = mapPinterestPin(pin, 'pinterest');
      if (!item) throw new Error('el pin no tiene media');
      return item;
    }]);
  }
  productores.push(['pinterest-html', async () => {
    const target = id ? `https://www.pinterest.com/pin/${id}/` : String(url);
    const html = await fetchText(target, { headers: { 'User-Agent': UA_DESKTOP, 'Accept-Language': 'es-UY,es;q=0.9' }, timeoutMs: 15000, publicOnly: true });
    const video = metaContent(html, 'og:video:secure_url') || metaContent(html, 'og:video')
      || (html.match(/"contentUrl":"([^"]+\.mp4[^"]*)"/) || [])[1];
    const image = metaContent(html, 'og:image:secure_url') || metaContent(html, 'og:image')
      || (html.match(/"image":\{"[^"]*url":"([^"]+)"/) || [])[1];
    const title = metaContent(html, 'og:title');
    if (!video && !image) throw new Error('sin media en el pin');
    return {
      id: id || null, type: video ? 'video' : 'image',
      title: title ? String(title).replace(/\s+/g, ' ').trim() : null,
      description: metaContent(html, 'og:description'),
      url: target,
      image: image ? unescapeUrl(image) : null,
      thumbnail: image ? unescapeUrl(image) : null,
      video: video ? unescapeUrl(video) : null,
      width: null, height: null, author: null, source: 'pinterest-html'
    };
  }]);
  if (!propio && COBALT.disponible()) productores.push(porCobalt);

  const { value, source } = await firstSuccess(productores);
  return { ...value, source: value.source || source };
}


const stripTags = html => String(html || '')
  .replace(/<script[\s\S]*?<\/script>/gi, ' ')
  .replace(/<style[\s\S]*?<\/style>/gi, ' ')
  .replace(/<[^>]+>/g, ' ')
  .replace(/&nbsp;/g, ' ')
  .replace(/&amp;/g, '&')
  .replace(/&quot;/g, '"')
  .replace(/&#39;/g, "'")
  .replace(/&lt;/g, '<')
  .replace(/&gt;/g, '>')
  .replace(/\s+/g, ' ')
  .trim();

function decodeGoogleUrl(href) {
  if (!href) return null;
  if (href.startsWith('/url?q=')) {
    const raw = href.slice(7).split('&')[0];
    try { return decodeURIComponent(raw); } catch (_) { return raw; }
  }
  if (href.startsWith('http')) return href;
  return null;
}

/**
 * Google dejó de mandar `/url?q=…`: ahora el enlace es directo y el título va
 * dentro de un `<h3>`. Se buscan los `<a href="http…">` que envuelvan un `<h3>`.
 */
function parseGoogleModerno(html, limit) {
  const out = [];
  const re = /<a[^>]+href="(https?:\/\/[^"]+)"[^>]*>((?:(?!<\/a>)[\s\S]){0,800}?)<\/a>/gi;
  let m;
  while ((m = re.exec(html)) && out.length < limit) {
    const url = m[1];
    if (/^(?:https?:\/\/)?(?:www\.)?(google\.[a-z.]+\/|accounts\.google|policies\.google|support\.google|gstatic\.|youtube\.com\/redirect)/i.test(url)) continue;
    const titulo = m[2].match(/<h3[^>]*>([\s\S]*?)<\/h3>/i);
    if (!titulo) continue;
    const title = stripTags(titulo[1]);
    if (!title || title.length < 3) continue;
    if (out.some(r => r.url === url)) continue;
    const after = html.slice(m.index + m[0].length, m.index + m[0].length + 1200);
    out.push({ title, url, snippet: stripTags(after).slice(0, 260) });
  }
  return out;
}

/** Versión vieja (enlaces `/url?q=…`), todavía aparece en `gbv=1`. */
function parseGoogle(html, limit) {
  const out = [];
  const re = /<a[^>]+href="(\/url\?q=[^"]+|https?:\/\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
  let m;
  while ((m = re.exec(html)) && out.length < limit) {
    const url = decodeGoogleUrl(m[1]);
    if (!url) continue;
    if (/google\.|gstatic\.|youtube\.com\/redirect|accounts\./.test(url)) continue;
    const title = stripTags(m[2]);
    if (!title || title.length < 3) continue;
    if (out.some(r => r.url === url)) continue;
    const after = html.slice(m.index + m[0].length, m.index + m[0].length + 900);
    out.push({ title, url, snippet: stripTags(after).slice(0, 260) });
  }
  return out;
}

/**
 * DuckDuckGo "lite". El marcado es `<a rel="nofollow" href="…" class='result-link'>`
 * (el class va DESPUÉS del href, por eso se mira el tag entero) y el extracto en
 * `<td class='result-snippet'>`.
 */
function parseDuckDuckGoLite(html, limit) {
  const out = [];
  const snips = [];
  const reSnip = /class=['"][^'"]*result-snippet[^'"]*['"][^>]*>([\s\S]*?)<\/td>/gi;
  let ms;
  while ((ms = reSnip.exec(html))) snips.push(stripTags(ms[1]).slice(0, 260));
  const re = /<a\b([^>]*)>([\s\S]*?)<\/a>/gi;
  let m;
  let idx = 0;
  while ((m = re.exec(html)) && out.length < limit) {
    if (!/result-link/.test(m[1])) continue;
    const href = (m[1].match(/href=["']([^"']+)["']/i) || [])[1];
    if (!href) continue;
    let url = href.replace(/&amp;/g, '&');
    const uddg = url.match(/[?&]uddg=([^&]+)/);
    if (uddg) { try { url = decodeURIComponent(uddg[1]); } catch (_) { /* deja la original */ } }
    const title = stripTags(m[2]);
    if (!title || !/^https?:/i.test(url)) continue;
    if (out.some(r => r.url === url)) continue;
    out.push({ title, url, snippet: snips[idx] || '' });
    idx++;
  }
  return out;
}

/** DuckDuckGo HTML: resultados en enlaces result__a y extractos result__snippet. */
function parseDuckDuckGo(html, limit) {
  const out = [];
  const texto = String(html || '');
  const re = /<a\b([^>]*)>([\s\S]*?)<\/a>/gi;
  let m;
  while ((m = re.exec(texto)) && out.length < limit) {
    if (!/class\s*=\s*["'][^"']*\bresult__a\b/i.test(m[1])) continue;
    const href = (m[1].match(/href\s*=\s*["']([^"']+)["']/i) || [])[1];
    if (!href) continue;
    let url;
    try {
      const parsed = new URL(href.replace(/&amp;/gi, '&'), 'https://duckduckgo.com');
      const redirect = /(^|\.)duckduckgo\.com$/i.test(parsed.hostname) && parsed.searchParams.get('uddg');
      url = new URL(redirect || parsed.href);
    } catch (_) { continue; }
    if (!['http:', 'https:'].includes(url.protocol) || /(^|\.)duckduckgo\.com$/i.test(url.hostname)) continue;
    const title = stripTags(m[2]);
    if (!title || out.some(r => r.url === url.href)) continue;
    const after = texto.slice(re.lastIndex, re.lastIndex + 4000);
    const next = after.search(/class\s*=\s*["'][^"']*\bresult__a\b/i);
    const section = next < 0 ? after : after.slice(0, next);
    const snippet = section.match(/<([a-z0-9]+)\b[^>]*class\s*=\s*["'][^"']*\bresult__snippet\b[^"']*["'][^>]*>([\s\S]*?)<\/\1>/i);
    out.push({ title, url: url.href, snippet: snippet ? stripTags(snippet[2]).slice(0, 260) : '' });
  }
  return out;
}

/** Bing: cada resultado vive en un `<li class="b_algo">` con `<h2><a href>`. */
function parseBing(html, limit) {
  const out = [];
  const bloques = String(html || '').split(/<li class="b_algo"/i).slice(1);
  for (const bloque of bloques) {
    if (out.length >= limit) break;
    const a = bloque.match(/<h2[^>]*>\s*<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i);
    if (!a) continue;
    const url = decodeGoogleUrl(a[1].replace(/&amp;/g, '&'));
    if (!url || !/^https?:/i.test(url)) continue;
    if (out.some(r => r.url === url)) continue;
    const title = stripTags(a[2]);
    if (!title) continue;
    const p = bloque.match(/<p[^>]*>([\s\S]*?)<\/p>/i);
    out.push({ title, url, snippet: p ? stripTags(p[1]).slice(0, 260) : '' });
  }
  return out;
}

async function googleSearch(query, limit, lang = 'es') {
  const n = clampLimit(limit, 10, 20);
  const headers = {
    'User-Agent': UA_DESKTOP,
    'Accept-Language': `${lang}-ES,${lang};q=0.9`,
    Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    // Evita la pantalla de consentimiento de la UE que tapa los resultados.
    Cookie: 'CONSENT=YES+cb; SOCS=CAI'
  };
  const q = encodeURIComponent(query);
  let results, source;
  try {
    ({ value: results, source } = await firstSuccess([
      ['google', async () => {
        const html = await fetchText(`https://www.google.com/search?q=${q}&num=${n}&hl=${encodeURIComponent(lang)}&gbv=1&pws=0&filter=0`, { headers, timeoutMs: 15000 });
        const vistos = new Set();
        const found = [...parseGoogleModerno(html, n), ...parseGoogle(html, n)]
          .filter(r => !vistos.has(r.url) && vistos.add(r.url))
          .slice(0, n);
        if (!found.length) throw new Error('Google no devolvió resultados parseables');
        return found;
      }],
      ['duckduckgo-lite', async () => {
        const html = await fetchText(`https://lite.duckduckgo.com/lite/?q=${q}`, { headers, timeoutMs: 15000 });
        const found = parseDuckDuckGoLite(html, n);
        if (!found.length) throw new Error('DuckDuckGo lite sin resultados');
        return found;
      }],
      ['duckduckgo', async () => {
        const html = await fetchText(`https://html.duckduckgo.com/html/?q=${q}&kl=wt-wt`, { headers, timeoutMs: 15000 });
        const found = parseDuckDuckGo(html, n);
        if (!found.length) throw new Error('DuckDuckGo sin resultados');
        return found;
      }],
      ['bing', async () => {
        const html = await fetchText(`https://www.bing.com/search?q=${q}&count=${n}&setlang=${encodeURIComponent(lang)}`, { headers, timeoutMs: 15000 });
        const found = parseBing(html, n);
        if (!found.length) throw new Error('Bing sin resultados');
        return found;
      }]
    ]));
  } catch (e) {
    const err = friendly(e);
    if (!err.details && e.details) err.details = e.details.map(d => d.replace(/fetch failed/gi, 'sin conexión'));
    throw err;
  }
  return { query, engine: source, lang, count: results.length, results };
}

async function wikipediaSearch(query, limit, lang = 'es') {
  const n = clampLimit(limit, 8, 20);
  const code = String(lang || 'es').toLowerCase().slice(0, 5).replace(/[^a-z-]/g, '') || 'es';
  const params = new URLSearchParams({
    action: 'query',
    generator: 'search',
    gsrsearch: query,
    gsrlimit: String(n),
    prop: 'extracts|pageimages|info',
    exintro: '1',
    explaintext: '1',
    exsentences: '3',
    piprop: 'thumbnail',
    pithumbsize: '420',
    inprop: 'url',
    format: 'json',
    origin: '*'
  });
  let j;
  try {
    j = await fetchJson(`https://${code}.wikipedia.org/w/api.php?${params.toString()}`, { timeoutMs: 15000 });
  } catch (e) {
    throw friendly(e);
  }
  const pages = Object.values(j?.query?.pages || {});
  const results = pages
    .sort((a, b) => (a.index || 0) - (b.index || 0))
    .map(p => ({
      id: p.pageid,
      title: p.title,
      extract: (p.extract || '').trim(),
      image: p.thumbnail?.source || null,
      url: p.fullurl || `https://${code}.wikipedia.org/wiki/${encodeURIComponent(String(p.title).replace(/ /g, '_'))}`
    }))
    .filter(p => p.title);
  if (!results.length) throw new Error('Wikipedia no encontró artículos para esa búsqueda');
  return { query, lang: code, count: results.length, results };
}

module.exports = {
  clampLimit,
  // anime
  ANIME_KINDS, ANIME_SOURCES, animeImage, pokemon,
  mapDanbooru, mapSafebooru, mapKonachan,
  // reactions
  REACTIONS, REACTION_LIST, REACTION_PROVIDERS, reaction,
  // tools
  translate,
  // downloader
  tiktokDownload, tiktokSearch, mapTikTokVideo,
  youtubeId, youtubeSearch, youtubeStreams, resolveYoutubeTarget, pickAudio, pickVideo, bestPlayableVideo,
  youtubePlayable, youtubeAudio, youtubeAudioFile, normalizarCalidad,
  facebookDownload, instagramDownload,
  lyricsSearch, lyricFor,
  previewAudio, mapDeezer, mapItunes,
  // searcher
  googleSearch, wikipediaSearch,
  pinterestSearch, pinterestDownload, mapPinterestPin, pinterestPinId, parseInstagramHtml, parseFacebookHtml,
  parseGoogle, parseGoogleModerno, parseDuckDuckGoLite, parseDuckDuckGo, parseBing
};
