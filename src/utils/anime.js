// src/utils/anime.js — Datos de la categoría **ANIME**.
//
//   · animeinfo / mangainfo → Jikan (MyAnimeList) con filtro NSFW
//   · pokemon               → PokeAPI (datos + descripción de la Pokédex)
//   · waifu / maid / neko   → imágenes de nekos.best y waifu.pics (SFW)
//   · gacha                 → tirada aleatoria con rareza sobre esas mismas APIs
//
// Filtro NSFW: Jikan recibe siempre `sfw=true` y, además, se descartan las fichas
// con rating «Rx», géneros Hentai/Erotica o el flag `isAdult`. Las APIs de
// imágenes se usan sólo en sus rutas SFW (nunca `/nsfw/`), y las URLs que
// devuelven se revisan antes de mostrarlas.
const { fetchJson, firstFast } = require('./http');

const TIMEOUT = 15000;
const JIKAN = 'https://api.jikan.moe/v4';
const POKEAPI = 'https://pokeapi.co/api/v2';

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

// =============================================================== Filtro NSFW
const ADULT_GENRES = /^(hentai|erotica|adult|xxx)$/i;
const UNSAFE_URL = /(?:^|[/.\-_])(?:nsfw|hentai|erotic|erotica|lewd|explicit|r18|18\+|adult)(?:[/.\-_]|$)/i;

/** ¿La URL apunta a contenido para adultos? (defensa extra, no la única barrera) */
const isSfwUrl = url => {
  const value = String(url || '');
  if (!/^https:\/\//i.test(value)) return false;
  try { return !UNSAFE_URL.test(new URL(value).hostname + new URL(value).pathname); }
  catch (_) { return false; }
};

/** ¿La ficha de Jikan es apta para todo público? */
function isSfwEntry(entry) {
  if (!entry || typeof entry !== 'object') return false;
  if (entry.isAdult === true) return false;
  if (/^Rx/i.test(String(entry.rating || ''))) return false;
  const groups = ['genres', 'explicit_genres', 'themes', 'demographics'];
  for (const key of groups) {
    const list = Array.isArray(entry[key]) ? entry[key] : [];
    if (list.some(item => ADULT_GENRES.test(String((item && item.name) || '')))) return false;
  }
  return true;
}

// ==================================================================== Jikan
/** Normaliza una ficha de anime de Jikan. */
function parseJikanAnime(entry) {
  const images = entry.images || {};
  const jpg = images.jpg || {};
  const aired = entry.aired || {};
  const studios = (entry.studios || []).map(s => s.name).filter(Boolean);
  return {
    id: entry.mal_id,
    title: entry.title || '',
    titleEnglish: entry.title_english || '',
    titleJapanese: entry.title_japanese || '',
    type: entry.type || '',
    episodes: entry.episodes ?? null,
    status: entry.status || '',
    airing: !!entry.airing,
    aired: { from: aired.from || '', to: aired.to || '' },
    year: entry.year ?? null,
    season: entry.season || '',
    duration: entry.duration || '',
    rating: entry.rating || '',
    score: entry.score ?? null,
    scoredBy: entry.scored_by ?? null,
    rank: entry.rank ?? null,
    popularity: entry.popularity ?? null,
    members: entry.members ?? null,
    favorites: entry.favorites ?? null,
    synopsis: entry.synopsis || '',
    genres: (entry.genres || []).map(g => g.name).filter(Boolean),
    themes: (entry.themes || []).map(g => g.name).filter(Boolean),
    studios,
    image: jpg.large_image_url || jpg.image_url || '',
    trailer: (entry.trailer && (entry.trailer.url || entry.trailer.embed_url)) || '',
    link: entry.url || '',
    nsfw: false
  };
}

/** Normaliza una ficha de manga de Jikan. */
function parseJikanManga(entry) {
  const images = entry.images || {};
  const jpg = images.jpg || {};
  const published = entry.published || {};
  return {
    id: entry.mal_id,
    title: entry.title || '',
    titleEnglish: entry.title_english || '',
    titleJapanese: entry.title_japanese || '',
    type: entry.type || '',
    chapters: entry.chapters ?? null,
    volumes: entry.volumes ?? null,
    status: entry.status || '',
    published: { from: published.from || '', to: published.to || '' },
    score: entry.score ?? null,
    rank: entry.rank ?? null,
    members: entry.members ?? null,
    favorites: entry.favorites ?? null,
    synopsis: entry.synopsis || '',
    authors: (entry.authors || []).map(a => a.name).filter(Boolean),
    genres: (entry.genres || []).map(g => g.name).filter(Boolean),
    themes: (entry.themes || []).map(g => g.name).filter(Boolean),
    image: jpg.large_image_url || jpg.image_url || '',
    link: entry.url || '',
    nsfw: false
  };
}

/** Lista filtrada (nunca devuelve nada marcado como adulto). */
function parseJikanList(json, limit, kind) {
  const data = Array.isArray(json && json.data) ? json.data : [];
  const map = kind === 'manga' ? parseJikanManga : parseJikanAnime;
  return data.filter(isSfwEntry).slice(0, limit).map(map);
}

// Jikan limita a 3 peticiones por segundo: se reutiliza el resultado un minuto.
function withCache(fn) {
  const cache = new Map();
  return async (...args) => {
    const key = JSON.stringify(args);
    const hit = cache.get(key);
    if (hit && hit.expires > Date.now()) return hit.value;
    const value = Promise.resolve().then(() => fn(...args));
    cache.set(key, { value, expires: Date.now() + 60000 });
    while (cache.size > 60) cache.delete(cache.keys().next().value);
    try { return await value; } catch (e) { cache.delete(key); throw e; }
  };
}

/** Query obligatoria y acotada. */
function readQuery(raw, { name = 'q', example = '?q=naruto', max = 90 } = {}) {
  const value = String(raw || '').trim().replace(/\s+/g, ' ');
  if (!value) throw badRequest(`Falta el parámetro ${name}`, `Ejemplo: ${example}`);
  if (value.length > max) throw badRequest(`La búsqueda es demasiado larga (máx. ${max} caracteres)`);
  return value;
}

function readLimit(raw, fallback = 5, max = 20) {
  const n = Math.round(Number(raw));
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.min(max, n);
}

/** `/anime` o `/manga` en Jikan: por id (ficha completa) o por texto (búsqueda). */
async function jikanSearch(kind, query, limit) {
  const numericId = /^\d+$/.test(String(query));
  const producers = [
    ['full', async () => {
      if (!numericId) return null;
      const json = await fetchJson(`${JIKAN}/${kind}/${query}/full`, { timeoutMs: TIMEOUT });
      const entry = json && json.data;
      if (!entry || !isSfwEntry(entry)) return null;
      const item = kind === 'manga' ? parseJikanManga(entry) : parseJikanAnime(entry);
      return { query, source: 'jikan:full', total: 1, items: [item] };
    }],
    ['search', async () => {
      const url = `${JIKAN}/${kind}?${new URLSearchParams({
        q: String(query), limit: String(Math.max(limit, 5)), sfw: 'true', order_by: 'members', sort: 'desc'
      })}`;
      const json = await fetchJson(url, { timeoutMs: TIMEOUT });
      const items = parseJikanList(json, limit, kind);
      return items.length ? { query, source: 'jikan:search', total: items.length, items } : null;
    }]
  ];
  try {
    const found = await firstFast(producers, { timeoutMs: TIMEOUT + 500 });
    const data = found.value;
    return { kind, ...data, sfw: true };
  } catch (e) {
    // «sin datos» = Jikan respondió y no hay coincidencias (404); el resto es caída (502).
    const empty = Array.isArray(e.details) && e.details.length && e.details.every(detail => detail.endsWith(': sin datos'));
    const err = new Error(numericId
      ? `No encontré ${kind === 'manga' ? 'ese manga' : 'ese anime'} (o está marcado como adulto)`
      : `Jikan no devolvió resultados de ${kind}`);
    err.status = empty ? 404 : 502;
    err.hint = empty
      ? 'Probá con el título en inglés o con el ID de MyAnimeList; el contenido adulto se filtra siempre'
      : 'Jikan limita a 3 peticiones por segundo; esperá un momento y reintentá';
    err.details = e.details;
    throw err;
  }
}
const animeInfo = withCache((query, limit) => jikanSearch('anime', query, limit));
const mangaInfo = withCache((query, limit) => jikanSearch('manga', query, limit));

// ================================================================== PokéAPI
const POKEMON_MAX = 1025;

function parsePokemon(pokemon, species) {
  const sprites = pokemon.sprites || {};
  const other = sprites.other || {};
  const artwork = other['official-artwork'] || {};
  const home = other.home || {};
  const flavor = (species && Array.isArray(species.flavor_text_entries) ? species.flavor_text_entries : []);
  const pickFlavor = () => {
    const es = flavor.find(entry => entry.language && entry.language.name === 'es');
    const en = flavor.find(entry => entry.language && entry.language.name === 'en');
    const text = (es || en || {}).flavor_text || '';
    return String(text).replace(/[\n\f\r]+/g, ' ').replace(/\s+/g, ' ').trim();
  };
  const genusEntry = (species && Array.isArray(species.genera) ? species.genera : [])
    .find(entry => entry.language && entry.language.name === 'es')
    || (species && Array.isArray(species.genera) ? species.genera : []).find(entry => entry.language && entry.language.name === 'en');
  return {
    id: pokemon.id,
    name: pokemon.name || '',
    types: (pokemon.types || []).map(t => (t.type && t.type.name) || '').filter(Boolean),
    abilities: (pokemon.abilities || []).map(a => ({ name: (a.ability && a.ability.name) || '', hidden: !!a.is_hidden })),
    stats: Object.fromEntries((pokemon.stats || []).map(s => [(s.stat && s.stat.name) || '', s.base_stat ?? 0])),
    height: pokemon.height ? pokemon.height / 10 : null,
    weight: pokemon.weight ? pokemon.weight / 10 : null,
    baseExperience: pokemon.base_experience ?? null,
    image: artwork.front_default || home.front_default || sprites.front_default || '',
    shiny: artwork.front_shiny || home.front_shiny || sprites.front_shiny || '',
    description: pickFlavor(),
    genus: genusEntry ? genusEntry.genus : '',
    legendary: !!(species && species.is_legendary),
    mythical: !!(species && species.is_mythical),
    generation: species && species.generation ? species.generation.name : '',
    color: species && species.color ? species.color.name : '',
    link: `https://www.pokemon.com/us/pokedex/${pokemon.name}`
  };
}

/** `random` o un nombre/id concreto. */
async function pokemon(rawName) {
  const wanted = String(rawName || '').trim().toLowerCase();
  const id = wanted && /^\d+$/.test(wanted) ? Number(wanted) : null;
  if (id !== null && (id < 1 || id > POKEMON_MAX + 200)) {
    throw badRequest('El número de Pokédex está fuera de rango', `Usá un id entre 1 y ${POKEMON_MAX}`);
  }
  if (wanted && !/^[a-z0-9-]{2,40}$/.test(wanted) && id === null) {
    throw badRequest('El nombre del Pokémon no es válido', 'Ejemplo: ?name=pikachu o ?name=25');
  }
  const target = wanted || String(1 + Math.floor(Math.random() * POKEMON_MAX));
  const data = await fetchJson(`${POKEAPI}/pokemon/${encodeURIComponent(target)}`, { timeoutMs: TIMEOUT }).catch(e => {
    if (Number(e.status) === 404) throw notFound(`No encontré el Pokémon "${target}"`, 'Probá con el nombre en inglés (pikachu) o el número (25)');
    throw e;
  });
  if (!data || !data.id) throw notFound(`No encontré el Pokémon "${target}"`, 'Probá con el nombre en inglés (pikachu) o el número (25)');
  const species = await fetchJson(`${POKEAPI}/pokemon-species/${data.id}`, { timeoutMs: TIMEOUT }).catch(() => null);
  return { query: target, source: 'pokeapi.co', ...parsePokemon(data, species), nsfw: false };
}

// ======================================================= Imágenes (SFW)
const NEKOS = 'https://nekos.best/api/v2';
const WAIFU_PICS = 'https://api.waifu.pics/sfw';

/** nekos.best v2: { results: [{ url, artist_name, artist_href, source_url }] } */
function parseNekosBest(json) {
  const list = (json && Array.isArray(json.results)) ? json.results : [];
  return list
    .filter(item => item && isSfwUrl(item.url))
    .map(item => ({
      image: item.url,
      artist: item.artist_name || '',
      artistUrl: item.artist_href || '',
      sourceUrl: item.source_url || '',
      api: 'nekos.best'
    }));
}

/** waifu.pics: { url: "…" } */
function parseWaifuPics(json) {
  const url = json && json.url;
  if (!isSfwUrl(url)) return [];
  return [{ image: url, artist: '', artistUrl: '', sourceUrl: '', api: 'waifu.pics' }];
}

/** Categorías publicadas → ruta de cada API (siempre SFW). */
const IMAGE_KINDS = {
  waifu: { nekos: 'waifu', waifuPics: 'waifu', label: 'Waifu' },
  maid: { nekos: 'maid', waifuPics: 'maid', label: 'Maid' },
  neko: { nekos: 'neko', waifuPics: 'neko', label: 'Neko' }
};

async function imageFor(kind) {
  const config = IMAGE_KINDS[kind];
  if (!config) throw badRequest(`La categoría "${kind}" no existe`, `Usá una de: ${Object.keys(IMAGE_KINDS).join(', ')}`);
  const producers = [
    ['nekos.best', async () => {
      const json = await fetchJson(`${NEKOS}/${config.nekos}`, { timeoutMs: TIMEOUT });
      const list = parseNekosBest(json);
      return list.length ? list[0] : null;
    }],
    ['waifu.pics', async () => {
      const json = await fetchJson(`${WAIFU_PICS}/${config.waifuPics}`, { timeoutMs: TIMEOUT });
      const list = parseWaifuPics(json);
      return list.length ? list[0] : null;
    }]
  ];
  const found = await firstFast(producers, { timeoutMs: TIMEOUT + 500 }).catch(e => {
    const err = new Error(`Las APIs de imágenes no respondieron (${config.label})`);
    err.status = 502;
    err.hint = 'nekos.best y waifu.pics limitan el uso; reintentá en unos segundos';
    err.details = e.details;
    throw err;
  });
  return { category: kind, label: config.label, ...found.value, nsfw: false, safe: 'Sólo categorías SFW de la API' };
}

/** Una o varias imágenes (count 1-10). */
async function images(kind, count = 1) {
  const total = Math.max(1, Math.min(10, Number(count) || 1));
  const list = await Promise.all(Array.from({ length: total }, () => imageFor(kind)));
  if (total === 1) return list[0];
  return { category: kind, total, items: list, nsfw: false };
}

// =================================================================== Gacha
const RARITIES = [
  { id: 'comun', label: 'Común', stars: 1, weight: 45, color: '#9ca3af' },
  { id: 'poco-comun', label: 'Poco común', stars: 2, weight: 28, color: '#22c55e' },
  { id: 'raro', label: 'Raro', stars: 3, weight: 15, color: '#3b82f6' },
  { id: 'epico', label: 'Épico', stars: 4, weight: 8, color: '#a855f7' },
  { id: 'legendario', label: 'Legendario', stars: 5, weight: 4, color: '#f59e0b' }
];

/** Elige una rareza según los pesos (45/28/15/8/4). */
function rollRarity(random = Math.random) {
  const total = RARITIES.reduce((sum, r) => sum + r.weight, 0);
  let roll = random() * total;
  for (const rarity of RARITIES) {
    if (roll < rarity.weight) return rarity;
    roll -= rarity.weight;
  }
  return RARITIES[0];
}

/**
 * Tirada de gacha: una imagen SFW de personaje + rareza + poder simulado.
 * `random` se puede inyectar para probar los pesos sin azar.
 */
async function gacha({ kind = '', random = Math.random } = {}) {
  const rarity = rollRarity(random);
  const categories = Object.keys(IMAGE_KINDS);
  const chosen = IMAGE_KINDS[String(kind || '').toLowerCase()] ? String(kind).toLowerCase() : categories[Math.floor(random() * categories.length)];
  const card = await imageFor(chosen);
  const stars = rarity.stars;
  return {
    category: chosen,
    rarity: rarity.id,
    rarityLabel: rarity.label,
    stars,
    color: rarity.color,
    power: Math.round((40 + random() * 60) * stars),
    image: card.image,
    artist: card.artist,
    artistUrl: card.artistUrl,
    sourceUrl: card.sourceUrl,
    api: card.api,
    nsfw: false,
    safe: 'Sólo categorías SFW de la API'
  };
}

module.exports = {
  animeInfo, mangaInfo, pokemon, images, imageFor, gacha,
  parseJikanAnime, parseJikanManga, parseJikanList, parsePokemon,
  parseNekosBest, parseWaifuPics, rollRarity, RARITIES,
  isSfwEntry, isSfwUrl, readQuery, readLimit, IMAGE_KINDS, POKEMON_MAX
};
