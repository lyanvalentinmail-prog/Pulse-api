// src/utils/perchance.js — Imágenes con IA (texto → imagen) usando Perchance.
//
// Perchance no publica una API oficial para servidores, pero la página
// https://perchance.org/apigen ("AI Image Generator", la misma que usa
// perchance.org/api-gen) genera con la API interna de
// image-generation.perchance.org. Ese es el camino que hacemos acá:
//
//   1. GET  perchance.org/api/getAccessCodeForAdPoweredStuff  → código de 64 hex
//   2. GET  image-generation.perchance.org/api/verifyUser     → userKey (64 hex)
//   3. POST image-generation.perchance.org/api/generate       → imageId + token
//   4. GET  .../downloadTemporaryImageViaProxy (o `imageDataUrls`) → los bytes
//
// El userKey dura ~30 s y está atado a la IP que lo pidió, así que se guarda en
// memoria y se renueva solo. Perchance sólo deja una generación a la vez por
// sesión (`waiting_for_prev_request_to_finish`), por eso las llamadas pasan por
// una fila de a una.
//
// Cloudflare puede pedir Turnstile a IPs de datacenter (Render, Vercel, AWS…).
// Cuando eso pasa —o cuando Perchance devuelve cualquier error— `generateImage`
// cae al respaldo de Pollinations (image.pollinations.ai), que también es gratis
// y sin clave, para que /ia/image no quede muerto en producción. El campo
// `provider` de la respuesta dice de dónde salió la imagen.
const crypto = require('crypto');
const config = require('../config');
const { fetchWithTimeout, UA_DESKTOP } = require('./http');

// ---------- Endpoints ----------
const API = {
  page: 'https://perchance.org/apigen',
  adCode: 'https://perchance.org/api/getAccessCodeForAdPoweredStuff',
  verify: 'https://image-generation.perchance.org/api/verifyUser',
  generate: 'https://image-generation.perchance.org/api/generate',
  download: 'https://image-generation.perchance.org/api/downloadTemporaryImage',
  proxy: 'https://image-generation.perchance.org/api/downloadTemporaryImageViaProxy',
  pollinations: 'https://image.pollinations.ai/prompt'
};
const EMBED_ORIGIN = 'https://image-generation.perchance.org';

// Hash de versión del cliente de Perchance (cambia cada tanto: si responde
// `client_update_required`, actualizalo con PERCHANCE_CLIENT_VERSION).
const DEFAULT_VERSION = '9b43eec2e71907610e4e9317b54c208495f6850086e92239a869811d2e2d77ee';
const DEFAULT_CHANNEL = 'ai-text-to-image-generator';

// ---------- Parámetros ----------
const RESOLUTIONS = ['512x512', '512x768', '768x512', '768x768'];
const RESOLUTION_ALIASES = {
  square: '768x768', cuadrado: '768x768',
  portrait: '512x768', vertical: '512x768', retrato: '512x768',
  landscape: '768x512', horizontal: '768x512', apaisado: '768x512'
};
const DEFAULT_NEGATIVE = 'NSFW, nudity, blurry, low quality, text, watermark';

// Estilos: se suman al prompt (y algunos a la lista de negativos), igual que
// hace la página. `?style=` acepta la clave o el nombre tal cual.
const STYLES = {
  anime: { prompt: 'anime style, detailed illustration, vibrant colors, clean lineart', negative: 'photo, realistic' },
  cinematic: { prompt: 'cinematic shot, dramatic lighting, 75mm lens, sharp focus, film still' },
  photo: { prompt: 'professional photography, natural lighting, 85mm, high detail, sharp focus', negative: 'cartoon, anime, illustration' },
  'digital-art': { prompt: 'digital painting, concept art, highly detailed, artstation' },
  'pixel-art': { prompt: 'pixel art, 16-bit, retro game sprite, limited palette', negative: 'photo, blurry' },
  '3d': { prompt: '3d render, octane render, soft studio lighting, highly detailed' },
  'oil-painting': { prompt: 'oil painting, thick brush strokes, classical fine art' },
  watercolor: { prompt: 'watercolor painting, soft washes, textured paper' },
  comic: { prompt: 'comic book art, bold ink lines, halftone shading, vibrant colors' },
  minimal: { prompt: 'minimalist flat illustration, simple shapes, clean background' }
};
const STYLE_NAMES = Object.keys(STYLES);

// ---------- Errores ----------
// Mismo contrato que el resto del repo: status (HTTP) + hint para el usuario.
class ImageError extends Error {
  constructor(message, { status = 502, hint, code = 'image', details, fatal = false } = {}) {
    super(message);
    this.name = 'ImageError';
    this.status = status;
    this.hint = hint;
    this.code = code;
    this.fatal = fatal;
    if (details) this.details = details;
  }
}

// ---------- Utilidades puras (probadas en scripts/test-image.js) ----------
const randomHex = bytes => crypto.randomBytes(bytes).toString('hex');
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

/** Normaliza `resolution` (acepta 768x768, "square", "portrait", 768×768…). */
function normResolution(value) {
  const raw = String(value || '').toLowerCase().trim();
  if (RESOLUTION_ALIASES[raw]) return RESOLUTION_ALIASES[raw];
  const clean = raw.replace(/[×*]/g, 'x').replace(/\s+/g, '');
  if (RESOLUTIONS.includes(clean)) return clean;
  return '768x768';
}

/** Semilla: entero >= 0; cualquier otra cosa (-1, vacío, texto) = al azar. */
function normSeed(value) {
  if (value === undefined || value === null || value === '' || value === true) return -1;
  const n = Math.trunc(Number(value));
  if (!Number.isFinite(n) || n < 0) return -1;
  return Math.min(2147483647, n);
}

/** guidanceScale 1 - 30 (7 por defecto, igual que Perchance). */
function normGuidance(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 7;
  return Math.min(30, Math.max(1, n));
}

/**
 * Suma el estilo elegido al prompt (y a los negativos).
 * Si el estilo no existe, el prompt queda igual: nunca rompe la petición.
 */
function applyStyle(prompt, style, negative = '') {
  const key = String(style || '').toLowerCase().trim();
  const entry = STYLES[key];
  if (!entry) return { prompt, negative };
  const full = prompt ? `${prompt}, ${entry.prompt}` : entry.prompt;
  const neg = [negative, entry.negative].filter(Boolean).join(', ');
  return { prompt: full, negative: neg };
}

/** data:image/jpeg;base64,… → { mime, buffer } (o null si no es un data URL). */
function parseDataUrl(value) {
  const match = /^data:(image\/[a-z0-9.+-]+);base64,([\s\S]+)$/i.exec(String(value || ''));
  if (!match) return null;
  const buffer = Buffer.from(match[2], 'base64');
  return buffer.length ? { mime: match[1].toLowerCase(), buffer } : null;
}

/** Tipo real de la imagen por sus primeros bytes (no nos fiamos del header). */
function sniffMime(buffer) {
  if (!buffer || buffer.length < 12) return null;
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'image/jpeg';
  if (buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (buffer.subarray(0, 4).toString('ascii') === 'RIFF' && buffer.subarray(8, 12).toString('ascii') === 'WEBP') return 'image/webp';
  if (buffer.subarray(0, 4).toString('ascii') === 'GIF8') return 'image/gif';
  return null;
}

const extFor = mime => ({
  'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif'
}[mime] || 'jpg');

/** Busca el token/URL de descarga del proxy dentro de la respuesta de Perchance. */
function findProxyUrl(value, depth = 0) {
  if (depth > 6 || value === null || value === undefined) return null;
  if (typeof value === 'string') {
    if (value.includes('downloadTemporaryImageViaProxy')) return value;
    if (/^v1\.[\w.-]{40,}$/.test(value)) return `${API.proxy}?t=${encodeURIComponent(value)}`;
    return null;
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findProxyUrl(item, depth + 1);
      if (found) return found;
    }
    return null;
  }
  if (typeof value === 'object') {
    for (const item of Object.values(value)) {
      const found = findProxyUrl(item, depth + 1);
      if (found) return found;
    }
  }
  return null;
}

/** Deja absoluta la URL de descarga (Perchance a veces devuelve rutas relativas). */
function absoluteProxyUrl(value) {
  if (!value) return null;
  if (/^https?:\/\//i.test(value)) return value;
  if (value.startsWith('/api/')) return `${EMBED_ORIGIN}${value}`;
  if (value.startsWith('/download')) return `${EMBED_ORIGIN}/api${value}`;
  if (value.startsWith('/')) return `${EMBED_ORIGIN}${value}`;
  return `${API.proxy}?t=${encodeURIComponent(value)}`;
}

/**
 * Saca de la respuesta de /api/generate cómo bajar la imagen:
 *   { buffer, mime } → vino embebida como data URL
 *   { proxy }        → token/URL del proxy (downloadTemporaryImageViaProxy)
 *   { imageId }      → hay que pedirla a downloadTemporaryImage
 */
function extractImage(json) {
  const data = (json && (json.imageDataUrls || json.imageDataUrl)) || [];
  const list = Array.isArray(data) ? data : [data];
  for (const item of list) {
    const parsed = parseDataUrl(item);
    if (parsed) return parsed;
  }
  const proxy = findProxyUrl(json);
  if (proxy) return { proxy: absoluteProxyUrl(proxy) };
  if (json && json.imageId) return { imageId: String(json.imageId) };
  return null;
}

// ---------- Sesión (browserId, código de anuncios, userKey) ----------
const state = {
  browserId: randomHex(16),
  adCode: '',
  adCodeAt: 0,
  userKey: '',
  userKeyAt: 0
};
const AD_TTL = 8 * 60 * 1000;   // el código de anuncios dura ~10 min
const KEY_TTL = 25 * 1000;      // el userKey dura ~30 s

// Cookies de Cloudflare (cf_clearance) por host: sin ellas la descarga da 403.
const cookies = new Map();

function cookieHeaderFor(host) {
  const jar = cookies.get(host);
  if (!jar || !jar.size) return '';
  return [...jar.entries()].map(([name, value]) => `${name}=${value}`).join('; ');
}

function saveCookies(host, headers) {
  let list = [];
  if (typeof headers.getSetCookie === 'function') list = headers.getSetCookie();
  else if (headers.get('set-cookie')) list = [headers.get('set-cookie')];
  if (!list.length) return;
  const jar = cookies.get(host) || new Map();
  for (const raw of list) {
    const pair = String(raw).split(';')[0];
    const index = pair.indexOf('=');
    if (index <= 0) continue;
    jar.set(pair.slice(0, index).trim(), pair.slice(index + 1).trim());
  }
  cookies.set(host, jar);
}

/** fetch con cabeceras de navegador, cookies por host y persistencia de sesión. */
async function request(url, { method = 'GET', headers = {}, body, timeoutMs = 15000 } = {}) {
  const host = new URL(url).host;
  const cookie = cookieHeaderFor(host);
  const res = await fetchWithTimeout(url, {
    method,
    body,
    redirect: 'follow',
    headers: {
      'User-Agent': UA_DESKTOP,
      Accept: '*/*',
      'Accept-Language': 'en-US,en;q=0.9',
      'sec-ch-ua': '"Chromium";v="126", "Not.A/Brand";v="8"',
      'sec-ch-ua-mobile': '?0',
      'sec-ch-ua-platform': '"Windows"',
      ...(cookie ? { Cookie: cookie } : {}),
      ...headers
    }
  }, timeoutMs);
  saveCookies(host, res.headers);
  return res;
}

async function readText(res, maxBytes = 1024 * 1024) {
  const text = await res.text();
  return text.length > maxBytes ? text.slice(0, maxBytes) : text;
}

async function readBuffer(res, maxBytes = 25 * 1024 * 1024) {
  const length = Number(res.headers.get('content-length'));
  if (Number.isFinite(length) && length > maxBytes) {
    res.body?.cancel().catch(() => {});
    throw new ImageError('La imagen remota supera el tamaño máximo permitido', { code: 'size' });
  }
  const buffer = Buffer.from(await res.arrayBuffer());
  if (buffer.length > maxBytes) throw new ImageError('La imagen remota supera el tamaño máximo permitido', { code: 'size' });
  return buffer;
}

const BLOCKED_HINT = 'El servidor no pudo pasar el filtro de Perchance (Cloudflare/Turnstile). ' +
  'Probá ?provider=pollinations, o cargá PERCHANCE_AD_CODE con un código fresco.';

/** Código de anuncios: es lo que habilita la generación gratis. */
async function getAdCode({ force = false, timeoutMs = 12000 } = {}) {
  if (config.perchanceAdCode) return config.perchanceAdCode;
  if (!force && state.adCode && Date.now() - state.adCodeAt < AD_TTL) return state.adCode;
  const res = await request(`${API.adCode}?__cacheBust=${Math.random()}`, {
    timeoutMs,
    headers: { Referer: API.page, Origin: 'https://perchance.org', Accept: '*/*' }
  });
  if (!res.ok) {
    throw new ImageError(
      res.status === 403 || res.status === 503 ? 'Perchance bloqueó la petición (Cloudflare)' : `Perchance respondió HTTP ${res.status}`,
      { code: 'blocked', hint: BLOCKED_HINT }
    );
  }
  const text = (await readText(res, 64 * 1024)).trim();
  const code = (text.match(/[a-f0-9]{32,128}/i) || [])[0];
  if (!code) throw new ImageError('Perchance no entregó el código de acceso', { code: 'blocked', hint: BLOCKED_HINT });
  state.adCode = code;
  state.adCodeAt = Date.now();
  return code;
}

/** userKey: la credencial corta que firma la generación (dura ~30 s). */
async function getUserKey({ force = false, timeoutMs = 12000 } = {}) {
  if (!force && state.userKey && Date.now() - state.userKeyAt < KEY_TTL) return state.userKey;
  const accessCode = await getAdCode({ force, timeoutMs });
  let status = 'sin respuesta';

  // El parámetro se llamó de las dos formas según la versión del embed.
  for (const field of ['accessCode', 'token']) {
    const url = `${API.verify}?browserId=${state.browserId}&${field}=${encodeURIComponent(accessCode)}` +
      `&thread=0&__cacheBust=${Math.random()}`;
    const res = await request(url, {
      timeoutMs,
      headers: {
        Referer: `${EMBED_ORIGIN}/embed`,
        Origin: EMBED_ORIGIN,
        Accept: 'application/json, text/plain, */*'
      }
    });
    const text = await readText(res, 256 * 1024);
    let json = null;
    try { json = JSON.parse(text); } catch (_) { /* a veces contesta HTML */ }
    const key = (json && (json.userKey || json.key)) || (text.match(/"userKey"\s*:\s*"([a-f0-9]{64})"/i) || [])[1];
    if (key && /^[a-f0-9]{64}$/i.test(key)) {
      state.userKey = key;
      state.userKeyAt = Date.now();
      return key;
    }
    status = json ? `${json.status || 'error'}${json.reason ? ` (${json.reason})` : ''}` : `HTTP ${res.status}`;
    if (!res.ok) break; // Cloudflare: no tiene sentido probar la otra variante
  }

  throw new ImageError(`Perchance no verificó la sesión: ${status}`, { code: 'turnstile', hint: BLOCKED_HINT });
}

// Perchance sólo atiende una generación por vez: una fila, sin paralelismo.
let queue = Promise.resolve();
function enFila(fn) {
  const run = queue.then(fn, fn);
  queue = run.then(() => undefined, () => undefined);
  return run;
}

/** Baja la imagen que devolvió /api/generate y la deja como buffer + mime. */
async function readPerchanceImage(json, { timeoutMs = 25000 } = {}) {
  const found = extractImage(json);
  if (!found) throw new ImageError('Perchance no devolvió la imagen', { code: 'no_image' });

  let buffer = null;
  let mime = null;
  if (found.buffer) {
    buffer = found.buffer;
    mime = found.mime;
  } else {
    const url = found.proxy || `${API.download}?imageId=${encodeURIComponent(found.imageId)}`;
    const res = await request(url, {
      timeoutMs,
      headers: { Accept: 'image/*,*/*', Referer: `${EMBED_ORIGIN}/embed`, Origin: EMBED_ORIGIN }
    });
    if (!res.ok) {
      throw new ImageError(`Perchance no dejó descargar la imagen (HTTP ${res.status})`, { code: 'download', hint: BLOCKED_HINT });
    }
    buffer = await readBuffer(res);
    mime = (res.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
  }

  mime = sniffMime(buffer) || (mime && mime.startsWith('image/') ? mime : 'image/jpeg');
  if (!buffer || buffer.length < 100) throw new ImageError('La imagen de Perchance llegó vacía', { code: 'no_image' });

  return {
    buffer,
    mime,
    extension: extFor(mime),
    seed: Number(json.seed) || null,
    width: Number(json.width) || null,
    height: Number(json.height) || null,
    prompt: typeof json.prompt === 'string' ? json.prompt : null,
    nsfw: json.maybeNsfw === true,
    source: 'perchance'
  };
}

/** Genera con la API interna de Perchance (la de perchance.org/apigen). */
async function fromPerchance(opts, { timeoutMs = 30000 } = {}) {
  return enFila(async () => {
    const mintMs = Math.min(timeoutMs, 15000);
    // getAdCode sale de la caché (o de PERCHANCE_AD_CODE), así que no cuesta red.
    let adCode = await getAdCode({ timeoutMs: mintMs });
    let userKey = await getUserKey({ timeoutMs: mintMs });

    for (let attempt = 0; attempt < 3; attempt++) {
      const requestId = `0.${Math.random().toString(36).slice(2)}`;
      const query = new URLSearchParams({
        userKey,
        requestId,
        adAccessCode: adCode,
        v: config.perchanceVersion || DEFAULT_VERSION,
        __cacheBust: String(Math.random())
      });
      const body = {
        prompt: opts.prompt,
        negativePrompt: opts.negativePrompt || '',
        seed: opts.seed,
        resolution: opts.resolution,
        guidanceScale: opts.guidanceScale,
        channel: config.perchanceChannel || DEFAULT_CHANNEL,
        subChannel: 'public',
        userKey,
        adAccessCode: adCode,
        requestId
      };
      const res = await request(`${API.generate}?${query}`, {
        method: 'POST',
        timeoutMs,
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json, text/plain, */*',
          Origin: EMBED_ORIGIN,
          Referer: `${EMBED_ORIGIN}/embed`
        },
        body: JSON.stringify(body)
      });
      // La respuesta puede traer la imagen embebida (base64): margen amplio.
      const text = await readText(res, 20 * 1024 * 1024);
      let json = null;
      try { json = JSON.parse(text); } catch (_) { /* Cloudflare devuelve HTML */ }

      if (!res.ok || !json) {
        const blocked = res.status === 403 || res.status === 503 || /Just a moment|challenge/i.test(text);
        throw new ImageError(
          blocked ? 'Perchance bloqueó la petición (Cloudflare)' : `Perchance respondió HTTP ${res.status}${json ? '' : ' sin JSON'}`,
          { code: blocked ? 'blocked' : 'perchance', hint: BLOCKED_HINT }
        );
      }

      const status = String(json.status || '');
      if (status === 'success' || json.imageId || json.imageDataUrls) {
        return await readPerchanceImage(json, { timeoutMs: Math.min(timeoutMs, 25000) });
      }
      if (status === 'invalid_key') {
        userKey = await getUserKey({ force: true, timeoutMs: mintMs });
        adCode = state.adCode || adCode;
        continue;
      }
      if (status === 'invalid_access_code') {
        adCode = await getAdCode({ force: true, timeoutMs: mintMs });
        userKey = await getUserKey({ force: true, timeoutMs: mintMs });
        continue;
      }
      if (status === 'waiting_for_prev_request_to_finish') {
        await sleep(6000);
        continue;
      }
      if (status === 'failed_verification') {
        throw new ImageError('Perchance pidió verificación Turnstile', { code: 'turnstile', hint: BLOCKED_HINT });
      }
      if (status === 'client_update_required') {
        throw new ImageError('La versión del cliente de Perchance cambió', {
          code: 'client_update',
          hint: 'Actualizá PERCHANCE_CLIENT_VERSION con el hash actual del embed de image-generation.perchance.org.'
        });
      }
      throw new ImageError(`Perchance devolvió "${status || 'sin estado'}"`, {
        code: 'perchance',
        hint: 'Probá de nuevo en unos segundos o usá ?provider=pollinations.'
      });
    }
    throw new ImageError('Perchance no completó la generación', { code: 'perchance' });
  });
}

/** Respaldo: Pollinations (gratis y sin clave, con límite suave de 1 cada 15 s). */
async function fromPollinations(opts, { timeoutMs = 30000 } = {}) {
  const [width, height] = opts.resolution.split('x').map(Number);
  const seed = opts.seed >= 0 ? opts.seed : Math.floor(Math.random() * 2147483647);
  const query = new URLSearchParams({
    width: String(width),
    height: String(height),
    seed: String(seed),
    model: 'flux',
    nologo: 'true'
  });
  const url = `${API.pollinations}/${encodeURIComponent(opts.prompt)}?${query}`;
  const res = await request(url, { timeoutMs, headers: { Accept: 'image/*,*/*', Referer: 'https://pollinations.ai/' } });
  if (!res.ok) {
    throw new ImageError(
      res.status === 429 ? 'Pollinations está limitando las peticiones' : `Pollinations respondió HTTP ${res.status}`,
      {
        status: res.status === 429 ? 429 : 502,
        code: 'pollinations',
        hint: res.status === 429 ? 'El plan anónimo permite una imagen cada 15 s: esperá un toque y reintentá.' : undefined
      }
    );
  }
  const buffer = await readBuffer(res);
  const mime = sniffMime(buffer);
  if (!mime) throw new ImageError('Pollinations no devolvió una imagen válida', { code: 'pollinations' });
  return {
    buffer,
    mime,
    extension: extFor(mime),
    seed,
    width,
    height,
    prompt: opts.prompt,
    nsfw: false,
    source: 'pollinations'
  };
}

// ---------- Caché en memoria ----------
// Mismo prompt + mismas opciones ≈ misma imagen: se guarda un rato para que el
// probador de la web y los reintentos no vuelvan a generar (y para no abusar).
const cache = new Map();
const CACHE_TTL = 15 * 60 * 1000;
const CACHE_MAX = 16;

function cacheKey(opts) {
  // `provider` entra en la clave: pedir ?provider=pollinations no debe devolver
  // la imagen que generó (y cacheó) Perchance.
  return JSON.stringify([opts.provider, opts.prompt, opts.negativePrompt, opts.resolution, opts.seed, opts.guidanceScale]);
}

function remember(key, value) {
  cache.set(key, { at: Date.now(), value });
  while (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value);
}

/** Proveedores válidos para `?provider=`. */
const PROVIDERS = ['auto', 'perchance', 'pollinations'];

/**
 * Genera una imagen y devuelve `{ buffer, mime, extension, seed, width, height,
 * provider, prompt, negativePrompt, resolution, cached, ms }`.
 *
 * `options.provider` = auto (Perchance y, si falla, Pollinations) | perchance | pollinations.
 * `deps.impl` permite inyectar los proveedores en las pruebas sin tocar la red:
 *   generateImage(opts, { impl: { perchance: async () => ({…}) } })
 */
async function generateImage(options = {}, deps = {}) {
  const prompt = String(options.prompt || '').trim();
  if (!prompt) throw new ImageError('Falta el prompt', { status: 400, code: 'prompt', hint: 'Ejemplo: /ia/image?prompt=un gato astronauta' });

  const wanted = String(options.provider || config.imageProvider || 'auto').toLowerCase();
  const provider = PROVIDERS.includes(wanted) ? wanted : 'auto';
  const opts = {
    prompt,
    negativePrompt: String(options.negativePrompt === undefined ? DEFAULT_NEGATIVE : options.negativePrompt).slice(0, 400),
    resolution: normResolution(options.resolution),
    seed: normSeed(options.seed),
    guidanceScale: normGuidance(options.guidanceScale),
    provider
  };
  const budget = Number(options.timeoutMs) > 0 ? Math.min(55000, Number(options.timeoutMs)) : 45000;

  const key = cacheKey(opts);
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL) return { ...hit.value, cached: true, ms: 0 };

  const providers = deps.providers || (provider === 'auto' ? ['perchance', 'pollinations'] : [provider]);
  const errors = [];
  const started = Date.now();

  for (const name of providers) {
    const left = budget - (Date.now() - started);
    if (left < 3000) {
      errors.push(`${name}: sin tiempo`);
      break;
    }
    try {
      const impl = (deps.impl && deps.impl[name]) || (name === 'pollinations' ? fromPollinations : fromPerchance);
      const value = await impl(opts, { timeoutMs: Math.min(left, 30000) });
      if (value.nsfw) {
        // Política del repo: nada para adultos. No se sirve ni se reintenta.
        throw new ImageError('La imagen salió marcada como NSFW y no se sirve', {
          status: 422, code: 'nsfw', fatal: true,
          hint: 'Cambiá el prompt: Pulse API no devuelve contenido para adultos.'
        });
      }
      // Lo que informa el proveedor manda (semilla real usada, medidas); lo
      // demás sale de las opciones pedidas.
      const [w, h] = opts.resolution.split('x').map(Number);
      const result = {
        ...opts,
        ...value,
        prompt: value.prompt || opts.prompt,
        seed: value.seed === null || value.seed === undefined ? opts.seed : value.seed,
        width: value.width || w,
        height: value.height || h,
        provider: name,
        cached: false,
        ms: Date.now() - started,
        errors
      };
      remember(key, result);
      return result;
    } catch (e) {
      if (e.fatal) throw e;
      errors.push(`${name}: ${e.message}`);
    }
  }

  throw new ImageError('No se pudo generar la imagen', {
    status: 502,
    code: 'image',
    hint: 'Probá de nuevo en unos segundos. Si Perchance está bloqueando al servidor, ?provider=pollinations suele andar.',
    details: errors
  });
}

module.exports = {
  ImageError,
  generateImage,
  applyStyle,
  normResolution,
  normSeed,
  normGuidance,
  parseDataUrl,
  sniffMime,
  findProxyUrl,
  absoluteProxyUrl,
  extractImage,
  // constantes reutilizadas por el catálogo y las pruebas
  STYLES,
  STYLE_NAMES,
  RESOLUTIONS,
  PROVIDERS,
  DEFAULT_NEGATIVE,
  // sólo para pruebas: limpiar la sesión y la caché entre casos
  _reset() {
    state.adCode = '';
    state.adCodeAt = 0;
    state.userKey = '';
    state.userKeyAt = 0;
    state.browserId = randomHex(16);
    cache.clear();
    cookies.clear();
  },
  _cache: cache
};
