// src/utils/herramientas.js — Utilidades de la categoría **HERRAMIENTAS**.
//
//   · emojimix  → mezcla dos emojis (Emoji Kitchen de Google, con respaldo local)
//   · country   → ficha de un país (restcountries.com)
//   · weather   → clima actual y de 7 días (Open-Meteo, sin clave)
//   · morse     → codifica y decodifica morse (sin red)
//   · translate → traduce texto (Google gtx, Lingva, MyMemory)
//   · minecraft → últimas versiones de Minecraft (Bedrock y Java)
//
// Las funciones de red usan los helpers de src/utils/http.js; los parsers
// (parse*) son puros para poder probarlos sin salir a internet.
const { fetchJson, fetchText, firstFast, UA_DESKTOP } = require('./http');
const { emojiPng } = require('./emoji');
const { sharp } = require('./image');

const TIMEOUT = 15000;

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

// =============================================================== Emoji Kitchen
/** Códigos de un emoji sin el selector de variación (FE0F). */
function emojiCodes(emoji) {
  return Array.from(String(emoji || '').trim())
    .map(ch => ch.codePointAt(0).toString(16).toLowerCase())
    .filter(code => code !== 'fe0f');
}

/** Un emoji «simple» (un solo pictograma) es lo único que mezcla Emoji Kitchen. */
function singleEmoji(emoji) {
  const codes = emojiCodes(emoji);
  if (codes.length !== 1) {
    throw badRequest(`"${emoji}" no es un emoji simple`, 'Emoji Kitchen mezcla emojis de un solo carácter (por ejemplo 😂 y 🥰), no secuencias con ZWJ');
  }
  return codes[0];
}

/** Recorre un JSON y devuelve los strings que son URLs (para buscar la mezcla). */
function collectStrings(node, out = [], depth = 0) {
  if (node === null || node === undefined || depth > 8) return out;
  if (typeof node === 'string') { out.push(node); return out; }
  if (Array.isArray(node)) { for (const item of node) collectStrings(item, out, depth + 1); return out; }
  if (typeof node === 'object') { for (const value of Object.values(node)) collectStrings(value, out, depth + 1); }
  return out;
}

/**
 * Busca en el catálogo de Emoji Kitchen la URL de la mezcla `u<emoji1>_u<emoji2>`
 * (o la inversa, que algunos pares guardan al revés).
 */
function parseEmojiKitchen(data, emoji1, emoji2) {
  const first = singleEmoji(emoji1);
  const second = singleEmoji(emoji2);
  const urls = collectStrings(data).filter(value => /^https:\/\/www\.gstatic\.com\/android\/keyboard\/emojikitchen\//.test(value));
  const wanted = [
    [`u${first}`, `u${second}`],
    [`u${second}`, `u${first}`]
  ];
  for (const [a, b] of wanted) {
    const hit = urls.find(url => new RegExp(`${a}_${b}(?:_|\\.)`, 'i').test(url) && !url.includes('undefined'));
    if (hit) {
      const date = (hit.match(/emojikitchen\/(\d{8})\//) || [])[1] || '';
      return { image: hit, date, reversed: a !== `u${first}` };
    }
  }
  return null;
}

// El catálogo de Emoji Kitchen se cachea: son ~2 MB y sólo cambia con las fechas nuevas.
let kitchenCache = null;
let kitchenPromise = null;
async function kitchenData() {
  if (kitchenCache) return kitchenCache;
  if (kitchenPromise) return kitchenPromise;
  kitchenPromise = (async () => {
    const sources = [
      ['emojikitchen.dev', 'https://emojikitchen.dev/data.json'],
      ['jsdelivr', 'https://cdn.jsdelivr.net/gh/xsalazar/emoji-kitchen/src/data.json']
    ];
    const producers = sources.map(([label, url]) => [label, async () => {
      const json = await fetchJson(url, { timeoutMs: 20000 });
      return json && typeof json === 'object' ? { data: json, source: label } : null;
    }]);
    const found = await firstFast(producers, { timeoutMs: 22000 });
    kitchenCache = found.value;
    return kitchenCache;
  })();
  try { return await kitchenPromise; } finally { kitchenPromise = null; }
}

/** Respaldo sin red: los dos emojis del set local, uno al lado del otro. */
async function localEmojiMix(emoji1, emoji2) {
  const size = 512;
  const pngs = await Promise.all([emoji1, emoji2].map(async emoji => {
    const png = await emojiPng(String(emoji).trim());
    if (!png) throw badRequest(`El emoji "${emoji}" no está en el set local`, 'Probá con un emoji estándar (😂, 🥰, 🐱…)');
    return sharp(png).resize(300, 300).png().toBuffer();
  }));
  return sharp({ create: { width: size, height: size, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([
      { input: pngs[0], left: 26, top: 150 },
      { input: pngs[1], left: 186, top: 62 }
    ])
    .png()
    .toBuffer();
}

/** Mezcla dos emojis: Emoji Kitchen si existe el par; si no, composición local. */
async function emojimix(emoji1, emoji2) {
  if (!String(emoji1 || '').trim() || !String(emoji2 || '').trim()) {
    throw badRequest('Faltan los dos emojis', 'Ejemplo: ?emoji1=😂&emoji2=🥰');
  }
  singleEmoji(emoji1);
  singleEmoji(emoji2);
  try {
    const catalog = await kitchenData();
    const hit = parseEmojiKitchen(catalog.data, emoji1, emoji2);
    if (hit) return { buffer: null, image: hit.image, date: hit.date, source: `emojikitchen:${catalog.source}` };
  } catch (_) {
    // Sin catálogo (red bloqueada) se sigue con la composición local.
  }
  return { buffer: await localEmojiMix(emoji1, emoji2), image: '', source: 'local', date: '' };
}

// ==================================================================== Países
const COUNTRY_FIELDS = 'name,cca2,cca3,capital,region,subregion,population,area,flags,currencies,languages,timezones,latlng,borders,idd,continents,translations,unMember';

/** Bandera emoji a partir del código ISO de dos letras. */
function flagEmoji(cca2) {
  const code = String(cca2 || '').toUpperCase();
  if (!/^[A-Z]{2}$/.test(code)) return '';
  return String.fromCodePoint(...Array.from(code).map(ch => 0x1f1e6 + ch.charCodeAt(0) - 65));
}

/** Ficha resumida y estable (la API devuelve un array con todas las coincidencias). */
function parseCountry(json) {
  const list = Array.isArray(json) ? json : (json && json[0] ? [json] : []);
  const rows = list
    .filter(c => c && (c.name || c.cca2))
    .map(c => {
      const name = c.name && typeof c.name === 'object' ? (c.name.common || c.name.official || '') : String(c.name || '');
      const currencies = c.currencies && typeof c.currencies === 'object'
        ? Object.entries(c.currencies).map(([code, value]) => ({ code, name: (value && value.name) || '', symbol: (value && value.symbol) || '' }))
        : [];
      return {
        name,
        official: c.name && typeof c.name === 'object' ? c.name.official || '' : '',
        code: c.cca2 || '',
        code3: c.cca3 || '',
        capital: Array.isArray(c.capital) ? c.capital[0] || '' : '',
        region: c.region || '',
        subregion: c.subregion || '',
        continents: Array.isArray(c.continents) ? c.continents : [],
        population: Number(c.population) || null,
        area: Number(c.area) || null,
        languages: c.languages && typeof c.languages === 'object' ? Object.values(c.languages) : [],
        currencies,
        timezones: Array.isArray(c.timezones) ? c.timezones : [],
        latlng: Array.isArray(c.latlng) ? c.latlng : [],
        borders: Array.isArray(c.borders) ? c.borders : [],
        flag: (c.flags && (c.flags.png || c.flags.svg)) || '',
        flagEmoji: flagEmoji(c.cca2),
        unMember: !!c.unMember
      };
    });
  return rows;
}

async function country(query, { code = '' } = {}) {
  const value = String(query || code || '').trim();
  if (!value) throw badRequest('Falta el país', 'Pasá ?q=Argentina o ?code=AR');
  const byCode = /^[a-zA-Z]{2,3}$/.test(value);
  const url = byCode
    ? `https://restcountries.com/v3.1/alpha/${encodeURIComponent(value.toUpperCase())}?fields=${COUNTRY_FIELDS}`
    : `https://restcountries.com/v3.1/name/${encodeURIComponent(value)}?fields=${COUNTRY_FIELDS}`;
  let json;
  try {
    json = await fetchJson(url, { timeoutMs: TIMEOUT });
  } catch (e) {
    if (Number(e.status) === 404) throw notFound(`No encontré el país "${value}"`, 'Probá con el nombre en inglés (Argentina, Spain, Japan) o el código ISO (?code=AR)');
    throw e;
  }
  const [first, ...rest] = parseCountry(json);
  if (!first) throw notFound(`No encontré el país "${value}"`, 'Revisá cómo se escribe; restcountries usa nombres en inglés');
  return { query: value, country: first, others: rest.slice(0, 9), total: 1 + rest.length, source: 'restcountries.com' };
}

// ===================================================================== Clima
/** Códigos WMO → texto (los que devuelve Open-Meteo). */
const WMO = {
  0: 'Cielo despejado', 1: 'Mayormente despejado', 2: 'Parcialmente nublado', 3: 'Nublado',
  45: 'Niebla', 48: 'Niebla con escarcha',
  51: 'Llovizna ligera', 53: 'Llovizna moderada', 55: 'Llovizna intensa',
  56: 'Llovizna helada ligera', 57: 'Llovizna helada intensa',
  61: 'Lluvia ligera', 63: 'Lluvia moderada', 65: 'Lluvia intensa',
  66: 'Lluvia helada ligera', 67: 'Lluvia helada intensa',
  71: 'Nieve ligera', 73: 'Nieve moderada', 75: 'Nieve intensa', 77: 'Granos de nieve',
  80: 'Chaparrones ligeros', 81: 'Chaparrones moderados', 82: 'Chaparrones fuertes',
  85: 'Chubascos de nieve ligeros', 86: 'Chubascos de nieve fuertes',
  95: 'Tormenta', 96: 'Tormenta con granizo ligero', 99: 'Tormenta con granizo fuerte'
};
const weatherText = code => WMO[Number(code)] || 'Sin datos';

/** Un punto del pronóstico diario, con la fecha ya recortada. */
function dailyRow(json, index) {
  const d = (json && json.daily) || {};
  const pick = (key, i = index) => (Array.isArray(d[key]) ? d[key][i] : undefined);
  return {
    date: pick('time'),
    weather: weatherText(pick('weather_code')),
    code: pick('weather_code') ?? null,
    max: pick('temperature_2m_max') ?? null,
    min: pick('temperature_2m_min') ?? null,
    rainChance: pick('precipitation_probability_max') ?? null,
    sunrise: pick('sunrise') || '',
    sunset: pick('sunset') || ''
  };
}

function parseWeather(json, place = {}) {
  const cur = (json && json.current) || {};
  const units = (json && json.current_units) || {};
  const daily = Array.isArray(json && json.daily && json.daily.time) ? json.daily.time.map((_, i) => dailyRow(json, i)) : [];
  return {
    location: {
      name: place.name || '', country: place.country || '', admin1: place.admin1 || '',
      latitude: json.latitude ?? place.latitude ?? null,
      longitude: json.longitude ?? place.longitude ?? null,
      timezone: json.timezone || place.timezone || ''
    },
    current: {
      temperature: cur.temperature_2m ?? null,
      feelsLike: cur.apparent_temperature ?? null,
      humidity: cur.relative_humidity_2m ?? null,
      rain: cur.precipitation ?? null,
      wind: cur.wind_speed_10m ?? null,
      isDay: cur.is_day === 1,
      weather: weatherText(cur.weather_code),
      code: cur.weather_code ?? null,
      units: { temperature: units.temperature_2m || '°C', wind: units.wind_speed_10m || 'km/h', rain: units.precipitation || 'mm' },
      updatedAt: (json && json.current && json.current.time) || ''
    },
    daily
  };
}

function parseGeo(json) {
  const list = (json && Array.isArray(json.results)) ? json.results : [];
  const first = list[0];
  if (!first) return null;
  return {
    name: first.name || '', country: first.country || '', admin1: first.admin1 || '',
    latitude: first.latitude, longitude: first.longitude, timezone: first.timezone || ''
  };
}

async function weather({ city, lat, lon } = {}) {
  let place = {};
  let latitude = Number(lat);
  let longitude = Number(lon);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    const name = String(city || '').trim();
    if (!name) throw badRequest('Falta la ciudad', 'Pasá ?city=Maldonado o las coordenadas ?lat=-34.9&lon=-54.95');
    const geo = await fetchJson(`https://geocoding-api.open-meteo.com/v1/search?${new URLSearchParams({ name, count: '1', language: 'es', format: 'json' })}`, { timeoutMs: TIMEOUT });
    place = parseGeo(geo);
    if (!place) throw notFound(`No encontré la ciudad "${name}"`, 'Probá con el nombre en inglés o usá ?lat=…&lon=…');
    latitude = place.latitude;
    longitude = place.longitude;
  } else if (Math.abs(latitude) > 90 || Math.abs(longitude) > 180) {
    throw badRequest('Las coordenadas están fuera de rango', 'Latitud entre -90 y 90 y longitud entre -180 y 180');
  }
  const forecast = await fetchJson(`https://api.open-meteo.com/v1/forecast?${new URLSearchParams({
    latitude: String(latitude), longitude: String(longitude),
    current: 'temperature_2m,relative_humidity_2m,apparent_temperature,is_day,precipitation,weather_code,wind_speed_10m',
    daily: 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,sunrise,sunset',
    timezone: 'auto', forecast_days: '7'
  })}`, { timeoutMs: TIMEOUT });
  return { ...parseWeather(forecast, place), source: 'open-meteo.com' };
}

// ===================================================================== Morse
// Tabla ITU. La Ñ se agrega aparte (no es estándar internacional).
const MORSE = {
  A: '.-', B: '-...', C: '-.-.', D: '-..', E: '.', F: '..-.', G: '--.', H: '....', I: '..',
  J: '.---', K: '-.-', L: '.-..', M: '--', N: '-.', O: '---', P: '.--.', Q: '--.-', R: '.-.',
  S: '...', T: '-', U: '..-', V: '...-', W: '.--', X: '-..-', Y: '-.--', Z: '--..',
  '0': '-----', '1': '.----', '2': '..---', '3': '...--', '4': '....-', '5': '.....',
  '6': '-....', '7': '--...', '8': '---..', '9': '----.',
  '.': '.-.-.-', ',': '--..--', '?': '..--..', "'": '.----.', '!': '-.-.--', '/': '-..-.',
  '(': '-.--.', ')': '-.--.-', '&': '.-...', ':': '---...', ';': '-.-.-.', '=': '-...-',
  '+': '.-.-.', '-': '-....-', '_': '..--.-', '"': '.-..-.', '$': '...-..-', '@': '.--.-.',
  'Ñ': '--.--', 'Ü': '..--'
};
const MORSE_REVERSE = Object.fromEntries(Object.entries(MORSE).map(([char, code]) => [code, char]));
// Acentos y signos que se pueden escribir con morse: se pasan a su letra base.
const FOLD = { 'Á': 'A', 'À': 'A', 'Ä': 'A', 'Â': 'A', 'É': 'E', 'È': 'E', 'Ë': 'E', 'Ê': 'E', 'Í': 'I', 'Ì': 'I', 'Ï': 'I', 'Î': 'I', 'Ó': 'O', 'Ò': 'O', 'Ö': 'O', 'Ô': 'O', 'Ú': 'U', 'Ù': 'U', 'Ü': 'Ü', 'Ç': 'C', 'Ã': 'A', 'Õ': 'O', 'Ñ': 'Ñ' };

/** Texto → morse. Las letras van separadas por espacio y las palabras por « / ». */
function morseEncode(text) {
  const raw = String(text ?? '').replace(/\s+/g, ' ').trim();
  if (!raw) throw badRequest('Falta el texto a codificar', 'Ejemplo: ?text=SOS&mode=encode');
  const unknown = new Set();
  const words = raw.toUpperCase().split(' ').map(word => word.split('').map(char => {
    const key = FOLD[char] || char;
    if (MORSE[key]) return MORSE[key];
    unknown.add(char);
    return '';
  }).filter(Boolean).join(' '));
  const code = words.filter(Boolean).join(' / ');
  if (!code) throw badRequest(`No se puede codificar "${raw}"`, 'El morse sólo tiene letras A-Z, números y algunos signos');
  return { text: raw, morse: code, unknown: [...unknown], length: code.length };
}

/** Morse → texto. Acepta «/» o «|» como separador de palabras. */
function morseDecode(code) {
  const raw = String(code ?? '').trim();
  if (!raw) throw badRequest('Falta el morse a decodificar', 'Ejemplo: ?text=... --- ...&mode=decode');
  if (!/^[.\-\s/|]+$/.test(raw)) throw badRequest('El texto no es morse válido', 'Sólo se aceptan puntos, guiones, espacios y «/» entre palabras');
  const invalid = [];
  const words = raw.replace(/\|/g, '/').split(/\s*\/\s*/);
  const decoded = words.map(word => word.trim().split(/\s+/).filter(Boolean).map(token => {
    const char = MORSE_REVERSE[token];
    if (!char) { invalid.push(token); return ''; }
    return char;
  }).join('')).join(' ');
  if (invalid.length) {
    throw badRequest(`Código morse desconocido: ${invalid.slice(0, 5).map(t => `"${t}"`).join(', ')}`,
      'Revisá los grupos: las letras se separan con un espacio y las palabras con « / »');
  }
  return { morse: raw, text: decoded, words: words.length };
}

/** `mode=auto` (por defecto en el router decide): ¿parece morse o texto? */
const looksLikeMorse = value => /^[.\-\s/|]+$/.test(String(value || '').trim()) && /[.-]/.test(String(value || ''));

// ================================================================== Traducir
const LANG_RE = /^[a-z]{2,3}(?:-[A-Za-z]{2})?$/;

function readLang(value, name, fallback, { allowAuto = false } = {}) {
  const raw = String(value || '').trim();
  if (!raw) return fallback;
  if (allowAuto && raw.toLowerCase() === 'auto') return 'auto';
  if (!LANG_RE.test(raw)) throw badRequest(`El idioma ${name} no es válido`, 'Usá el código ISO: es, en, pt, fr, ja, zh-CN… (o auto en el origen)');
  return raw;
}

/** Respuesta de translate.googleapis.com (gtx): [[["hola","hello",…]],null,"en",…]. */
function parseGoogleTranslate(json) {
  const chunks = Array.isArray(json && json[0]) ? json[0] : [];
  const text = chunks.map(part => (Array.isArray(part) ? part[0] || '' : '')).join('');
  const detected = typeof (json && json[2]) === 'string' ? json[2] : '';
  return { translatedText: text, from: detected };
}

/** Lingva: { translation: "...", info?: { detectedSource?: "es" } } */
function parseLingva(json) {
  if (!json || typeof json.translation !== 'string') return null;
  return { translatedText: json.translation, from: (json.info && json.info.detectedSource) || '' };
}

/** MyMemory: { responseData: { translatedText }, matches… } */
function parseMyMemory(json) {
  const text = json && json.responseData && json.responseData.translatedText;
  if (typeof text !== 'string' || !text) return null;
  const clean = text.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
  return { translatedText: clean, from: '' };
}

/**
 * Traduce `text` a `to`. Fuentes sin clave: Google (gtx), instancias Lingva y,
 * como último recurso, MyMemory (necesita el idioma de origen explícito).
 */
async function translate(text, { to = 'es', from = 'auto' } = {}) {
  const value = String(text || '').trim();
  if (!value) throw badRequest('Falta el texto a traducir', 'Ejemplo: ?text=hello world&to=es');
  if (value.length > 2000) throw badRequest('El texto es demasiado largo (máx. 2000 caracteres)');
  const target = readLang(to, 'destino', 'es');
  const origin = readLang(from, 'origen', 'auto', { allowAuto: true });
  if (target === origin) throw badRequest('El idioma de origen y destino son iguales', 'Cambiá ?to= por otro idioma');

  const producers = [
    ['google', async () => {
      const json = await fetchJson(`https://translate.googleapis.com/translate_a/single?${new URLSearchParams({
        client: 'gtx', sl: origin, tl: target, dt: 't', q: value
      })}`, { timeoutMs: TIMEOUT });
      const data = parseGoogleTranslate(json);
      return data.translatedText ? { ...data, source: 'google' } : null;
    }],
    ...[
      'https://lingva.garudalinux.org',
      'https://lingva.ml'
    ].map(base => [base, async () => {
      const json = await fetchJson(`${base}/api/v1/${encodeURIComponent(origin)}/${encodeURIComponent(target)}/${encodeURIComponent(value)}`, { timeoutMs: TIMEOUT });
      const data = parseLingva(json);
      return data && data.translatedText ? { ...data, source: `lingva:${new URL(base).hostname}` } : null;
    }]),
    ['mymemory', async () => {
      if (origin === 'auto') return null; // MyMemory no detecta idioma
      const json = await fetchJson(`https://api.mymemory.translated.net/get?${new URLSearchParams({ q: value, langpair: `${origin}|${target}` })}`, { timeoutMs: TIMEOUT });
      const data = parseMyMemory(json);
      return data ? { ...data, source: 'mymemory' } : null;
    }]
  ];

  try {
    const found = await firstFast(producers, { timeoutMs: TIMEOUT + 1000 });
    const data = found.value;
    return {
      translatedText: data.translatedText,
      originalText: value,
      from: String(data.from || origin).toLowerCase(),
      to: target,
      provider: String(data.source || '').split(':')[0],
      source: data.source
    };
  } catch (e) {
    const err = new Error('Ningún traductor público respondió');
    err.status = 502;
    err.hint = 'Los traductores sin clave limitan el uso; reintentá en unos segundos o usá ?from= con el idioma original';
    err.details = e.details;
    throw err;
  }
}

// ================================================================ Minecraft
/** Compara versiones numéricas (1.21.50.28 > 1.21.9). */
function compareVersions(a, b) {
  const pa = String(a).split('.').map(n => parseInt(n, 10) || 0);
  const pb = String(b).split('.').map(n => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const diff = (pa[i] || 0) - (pb[i] || 0);
    if (diff) return diff;
  }
  return 0;
}

const cleanVersion = value => String(value || '').trim().replace(/^[vV]/, '').replace(/[^\d.]/g, '').replace(/\.$/, '');

/** Mojang: version_manifest_v2 (Java Edition). */
function parseJavaManifest(json, limit = 10) {
  const versions = Array.isArray(json && json.versions) ? json.versions : [];
  const rows = versions
    .filter(v => v && v.id)
    .map(v => ({
      version: v.id,
      edition: 'java',
      type: v.type === 'snapshot' ? 'snapshot' : v.type === 'old_beta' || v.type === 'old_alpha' ? 'legacy' : 'release',
      date: v.releaseTime || '',
      link: v.url || `https://www.minecraft.net/en-us/article/minecraft-java-edition-${v.id}`
    }))
    .slice(0, limit);
  return {
    latest: {
      release: (json && json.latest && json.latest.release) || '',
      snapshot: (json && json.latest && json.latest.snapshot) || ''
    },
    versions: rows
  };
}

/** Etiquetas del repo Mojang/bedrock-samples: `v1.21.50.28` (Bedrock). */
function parseBedrockTags(json, limit = 10) {
  const tags = Array.isArray(json) ? json : (Array.isArray(json && json.tags) ? json.tags : []);
  const versions = tags
    .map(tag => (tag && (tag.name || tag.version)) || '')
    .map(name => ({ raw: name, version: cleanVersion(name) }))
    .filter(item => /^\d+\.\d+/.test(item.version));
  // Los tags llegan del más nuevo al más viejo, pero se ordena igual.
  versions.sort((a, b) => compareVersions(b.version, a.version));
  return {
    latest: { release: versions[0] ? versions[0].version : '', beta: '' },
    versions: versions.slice(0, limit).map(item => ({
      version: item.version,
      edition: 'bedrock',
      type: /(?:^|[.\-])preview|beta/i.test(item.raw) ? 'preview' : 'release',
      date: '',
      link: `https://github.com/Mojang/bedrock-samples/releases/tag/${encodeURIComponent(item.raw)}`
    }))
  };
}

/** mcpedl.org u otra web: números de versión sueltos en el HTML (respaldo). */
function parseVersionPage(html, limit = 10) {
  const seen = new Map();
  const re = /\b(1\.\d{1,2}(?:\.\d{1,2}){0,2})\b/g;
  let hit;
  while ((hit = re.exec(String(html || '')))) {
    const version = hit[1];
    if (!seen.has(version)) seen.set(version, true);
  }
  const versions = [...seen.keys()].sort((a, b) => compareVersions(b, a));
  return {
    latest: { release: versions[0] || '', beta: '' },
    versions: versions.slice(0, limit).map(version => ({
      version,
      edition: 'bedrock',
      type: 'release',
      date: '',
      link: 'https://mcpedl.org/'
    }))
  };
}

async function minecraft({ edition = 'bedrock', limit = 10 } = {}) {
  const kind = String(edition || 'bedrock').trim().toLowerCase();
  if (!['bedrock', 'java', 'all'].includes(kind)) {
    throw badRequest('La edición no es válida', 'Usá ?edition=bedrock, java o all');
  }
  const count = Math.max(1, Math.min(50, Number(limit) || 10));
  const producers = [];
  if (kind !== 'java') {
    producers.push(['bedrock-samples', async () => {
      const json = await fetchJson('https://api.github.com/repos/Mojang/bedrock-samples/tags?per_page=100', {
        timeoutMs: TIMEOUT, headers: { Accept: 'application/vnd.github+json' }
      });
      const data = parseBedrockTags(json, count);
      return data.versions.length ? { edition: 'bedrock', source: 'github:Mojang/bedrock-samples', ...data } : null;
    }]);
  }
  if (kind !== 'bedrock') {
    producers.push(['mojang', async () => {
      const json = await fetchJson('https://launchermeta.mojang.com/mc/game/version_manifest_v2.json', { timeoutMs: TIMEOUT });
      const data = parseJavaManifest(json, count);
      return data.versions.length ? { edition: 'java', source: 'launchermeta.mojang.com', ...data } : null;
    }]);
  }
  if (kind !== 'java') {
    producers.push(['mcpedl', async () => {
      const html = await fetchText('https://mcpedl.org/', { timeoutMs: TIMEOUT, headers: { Accept: 'text/html', 'User-Agent': UA_DESKTOP } });
      const data = parseVersionPage(html, count);
      return data.versions.length ? { edition: 'bedrock', source: 'mcpedl.org', ...data } : null;
    }]);
  }
  try {
    const found = await firstFast(producers, { timeoutMs: TIMEOUT + 2000 });
    const result = found.value;
    if (kind === 'all') {
      // En «all» se juntan las dos ediciones (una petición por edición).
      const other = result.edition === 'bedrock'
        ? await fetchJson('https://launchermeta.mojang.com/mc/game/version_manifest_v2.json', { timeoutMs: TIMEOUT }).then(json => ({ edition: 'java', source: 'launchermeta.mojang.com', ...parseJavaManifest(json, count) })).catch(() => null)
        : await fetchJson('https://api.github.com/repos/Mojang/bedrock-samples/tags?per_page=100', { timeoutMs: TIMEOUT, headers: { Accept: 'application/vnd.github+json' } }).then(json => ({ edition: 'bedrock', source: 'github:Mojang/bedrock-samples', ...parseBedrockTags(json, count) })).catch(() => null);
      return { ...result, editions: [result, ...(other ? [other] : [])], note: 'Bedrock viene de los tags oficiales de Mojang; Java, del manifiesto de versiones.' };
    }
    return { ...result, note: result.edition === 'bedrock' ? 'Versiones de Bedrock según los tags oficiales de Mojang/bedrock-samples.' : 'Versiones de Java según el manifiesto oficial de Mojang.' };
  } catch (e) {
    const err = new Error('No se pudieron leer las versiones de Minecraft');
    err.status = 502;
    err.hint = 'GitHub y Mojang limitan las peticiones sin token; reintentá en unos segundos';
    err.details = e.details;
    throw err;
  }
}

module.exports = {
  // endpoints
  emojimix, country, weather, translate, minecraft,
  morseEncode, morseDecode, looksLikeMorse,
  // parsers y ayudas puras
  parseEmojiKitchen, parseCountry, parseWeather, parseGeo, weatherText,
  parseGoogleTranslate, parseLingva, parseMyMemory, readLang,
  parseJavaManifest, parseBedrockTags, parseVersionPage, compareVersions, cleanVersion,
  emojiCodes, singleEmoji, flagEmoji,
  MORSE, MORSE_REVERSE
};
