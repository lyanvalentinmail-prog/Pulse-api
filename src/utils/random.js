// src/utils/random.js — Imágenes aleatorias de animales (categoría **RANDOM**).
//
// Cada animal intenta primero una API dedicada y, si falla, busca en Wikimedia
// Commons (fotos reales, sin clave). Todos devuelven la imagen original, la
// página de donde salió y un dato curioso cuando la fuente lo trae.
//
//   duck       → random-d.uk
//   dog        → dog.ceo
//   cat        → thecatapi.com
//   rabbit     → bunnies.io
//   panda      → some-random-api
//   koala      → some-random-api
//   babyowl    → Commons («owlet»)
//   squirrel   → Commons
//   capybara   → Commons
//   babybear   → Commons («bear cub»)
//   baby       → un animal bebé al azar (cachorro, gatito, patito, conejito…)
const { fetchJson, firstFast, UA_DESKTOP } = require('./http');

const TIMEOUT = 15000;

function badRequest(message, hint) {
  const e = new Error(message);
  e.status = 400;
  if (hint) e.hint = hint;
  return e;
}

// ------------------------------------------------------------- Wikimedia
const stripHtml = value => String(value || '')
  .replace(/<[^>]*>/g, ' ')
  .replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/\s+/g, ' ')
  .trim();

/**
 * Commons: `query.pages[]` con `imageinfo` (url, thumburl, mime, tamaño y autor).
 * Se descartan mapas, logos y archivos demasiado chicos.
 */
function parseCommonsImages(json) {
  const pages = (json && json.query && Array.isArray(json.query.pages)) ? json.query.pages : [];
  const out = [];
  for (const page of pages) {
    const info = page && Array.isArray(page.imageinfo) ? page.imageinfo[0] : null;
    if (!info) continue;
    const mime = String(info.mime || '');
    if (!/^image\/(jpeg|png|webp)$/i.test(mime)) continue;
    if (Number(info.width) && Number(info.width) < 500) continue;
    const title = stripHtml(page.title || '').replace(/^File:/i, '').replace(/\.[a-z0-9]+$/i, '');
    if (/\b(?:map|diagram|logo|icon|coat of arms|range|distribution|chart)\b/i.test(title)) continue;
    const meta = info.extmetadata || {};
    const author = stripHtml((meta.Artist && meta.Artist.value) || '').slice(0, 120);
    out.push({
      image: info.thumburl || info.url || '',
      page: info.descriptionurl || '',
      title,
      author,
      license: stripHtml((meta.LicenseShortName && meta.LicenseShortName.value) || '')
    });
  }
  return out.filter(item => /^https:\/\//i.test(item.image));
}

async function commonsImage(terms) {
  // Un término al azar de la lista: cambia el surtido en cada tirada.
  const term = terms[Math.floor(Math.random() * terms.length)];
  const url = `https://commons.wikimedia.org/w/api.php?${new URLSearchParams({
    action: 'query', format: 'json', formatversion: '2',
    generator: 'search', gsrnamespace: '6', gsrlimit: '30',
    gsrsearch: `${term} filetype:bitmap`,
    prop: 'imageinfo', iiprop: 'url|mime|size|extmetadata', iiurlwidth: '1200'
  })}`;
  const json = await fetchJson(url, { timeoutMs: TIMEOUT, headers: { Accept: 'application/json', 'User-Agent': UA_DESKTOP } });
  const images = parseCommonsImages(json);
  if (!images.length) return null;
  const pick = images[Math.floor(Math.random() * images.length)];
  return { ...pick, source: 'commons.wikimedia.org', term, fact: '' };
}

// ------------------------------------------------------------ APIs propias
/** random-d.uk v2: { type, url, message } */
function parseRandomDuck(json) {
  const url = json && json.url;
  if (!/^https?:\/\//i.test(String(url || ''))) return null;
  return { image: url, fact: stripHtml(json.message || ''), source: 'random-d.uk', page: 'https://random-d.uk/' };
}

/** dog.ceo: { message: "https://images.dog.ceo/breeds/husky/n02110185_10047.jpg", status } */
function parseDogCeo(json) {
  const url = json && json.message;
  if (!/^https?:\/\//i.test(String(url || ''))) return null;
  const breed = (String(url).match(/breeds\/([^/]+)\//) || [])[1] || '';
  return {
    image: url,
    fact: breed ? `Raza: ${breed.replace(/-/g, ' ')}` : '',
    source: 'dog.ceo',
    page: 'https://dog.ceo/'
  };
}

/** thecatapi: [{ url, breeds: [{ name }] }] */
function parseCatApi(json) {
  const first = Array.isArray(json) ? json[0] : json;
  const url = first && first.url;
  if (!/^https?:\/\//i.test(String(url || ''))) return null;
  const breed = first.breeds && first.breeds[0] && first.breeds[0].name;
  return { image: url, fact: breed ? `Raza: ${breed}` : '', source: 'thecatapi.com', page: 'https://thecatapi.com/' };
}

/** bunnies.io: { media: { gif, poster, mp4 } } */
function parseBunnies(json) {
  const media = (json && json.media) || {};
  const url = media.gif || media.poster || media.mp4 || '';
  if (!/^https?:\/\//i.test(String(url))) return null;
  return { image: url, fact: '', source: 'bunnies.io', page: 'https://www.bunnies.io/' };
}

/** some-random-api: { image, fact } */
function parseSomeRandomApi(json) {
  const url = json && json.image;
  if (!/^https?:\/\//i.test(String(url || ''))) return null;
  return { image: url, fact: stripHtml(json.fact || ''), source: 'some-random-api.com', page: 'https://some-random-api.com/' };
}

const BABIES = ['puppy', 'kitten', 'duckling', 'bunny', 'foal', 'calf', 'lamb', 'piglet', 'chick', 'cub'];

/** Catálogo de animales publicados (id → etiqueta, emoji y términos de búsqueda). */
const ANIMALS = {
  duck: { label: 'Duck', emoji: '🦆', terms: ['duck', 'duckling', 'mallard'] },
  dog: { label: 'Dog', emoji: '🐶', terms: ['dog', 'puppy'] },
  cat: { label: 'Cat', emoji: '🐱', terms: ['cat', 'kitten'] },
  rabbit: { label: 'Rabbit', emoji: '🐰', terms: ['rabbit', 'bunny'] },
  squirrel: { label: 'Squirrel', emoji: '🐿️', terms: ['squirrel', 'Sciurus'] },
  panda: { label: 'Panda', emoji: '🐼', terms: ['giant panda', 'Ailuropoda melanoleuca'] },
  koala: { label: 'Koala', emoji: '🐨', terms: ['koala', 'Phascolarctos cinereus'] },
  babyowl: { label: 'Baby owl', emoji: '🦉', terms: ['owlet', 'baby owl', 'juvenile owl'] },
  capybara: { label: 'Capybara', emoji: '🦫', terms: ['capybara', 'Hydrochoerus hydrochaeris'] },
  babybear: { label: 'Baby bear', emoji: '🐻', terms: ['bear cub', 'brown bear cub'] },
  baby: { label: 'Random baby', emoji: '🍼', terms: BABIES }
};

/** Nombre del animal bebé que salió (sólo para `baby`). */
const babyName = term => term.charAt(0).toUpperCase() + term.slice(1);

/** Productores de cada animal: primero la API dedicada, después Commons. */
function producersFor(id) {
  const animal = ANIMALS[id];
  const commons = ['commons.wikimedia.org', () => commonsImage(animal.terms)];
  const dedicated = {
    duck: ['random-d.uk', async () => parseRandomDuck(await fetchJson('https://random-d.uk/api/v2/random', { timeoutMs: TIMEOUT }))],
    dog: ['dog.ceo', async () => parseDogCeo(await fetchJson('https://dog.ceo/api/breeds/image/random', { timeoutMs: TIMEOUT }))],
    cat: ['thecatapi', async () => parseCatApi(await fetchJson('https://api.thecatapi.com/v1/images/search?size=med&mime_types=jpg,png', { timeoutMs: TIMEOUT }))],
    rabbit: ['bunnies.io', async () => parseBunnies(await fetchJson('https://api.bunnies.io/v2/loop/random/?media=gif', { timeoutMs: TIMEOUT }))],
    panda: ['some-random-api', async () => parseSomeRandomApi(await fetchJson('https://some-random-api.com/animal/panda', { timeoutMs: TIMEOUT }))],
    koala: ['some-random-api', async () => parseSomeRandomApi(await fetchJson('https://some-random-api.com/animal/koala', { timeoutMs: TIMEOUT }))]
  }[id];
  return [...(dedicated ? [dedicated] : []), commons];
}

/** Una imagen del animal pedido (o de un bebé al azar si es `baby`). */
async function oneAnimal(id) {
  const animal = ANIMALS[id];
  if (!animal) {
    throw badRequest(`El animal "${id}" no existe`, `Disponibles: ${Object.keys(ANIMALS).join(', ')}`);
  }
  const found = await firstFast(producersFor(id), { timeoutMs: TIMEOUT + 500 }).catch(e => {
    const err = new Error(`No se pudo conseguir una imagen de ${animal.label.toLowerCase()}`);
    err.status = 502;
    err.hint = 'Las fuentes públicas pueden limitar las peticiones; reintentá en unos segundos';
    err.details = e.details;
    throw err;
  });
  const data = found.value;
  return {
    animal: id,
    label: animal.label,
    emoji: animal.emoji,
    image: data.image,
    // `baby` puede tocar cualquier cría: se dice cuál salió.
    kind: id === 'baby' && data.term ? babyName(data.term) : '',
    fact: data.fact || '',
    title: data.title || '',
    author: data.author || '',
    license: data.license || '',
    page: data.page || '',
    source: data.source || found.source,
    nsfw: false
  };
}

/** `count` imágenes (1-10). */
async function randomAnimal(id, count = 1) {
  const total = Math.max(1, Math.min(10, Number(count) || 1));
  if (total === 1) return oneAnimal(id);
  const list = await Promise.all(Array.from({ length: total }, () => oneAnimal(id)));
  return { animal: id, total, items: list, nsfw: false };
}

module.exports = {
  randomAnimal, oneAnimal,
  parseCommonsImages, parseRandomDuck, parseDogCeo, parseCatApi, parseBunnies, parseSomeRandomApi,
  stripHtml, ANIMALS, BABIES
};
