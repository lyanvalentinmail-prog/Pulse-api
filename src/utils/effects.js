// src/utils/effects.js — Efectos de imagen de la categoría **IMAGENES**.
//
//   · grayscale → blanco y negro
//   · pixel     → pixelado (bloques cuadrados)
//   · sepia     → tono sepia clásico
//   · blur      → desenfoque gaussiano
//   · invert    → negativo
//   · darkness  → oscurece (o aclara, con level negativo)
//   · gay       → overlay de la bandera arcoíris sobre la foto
//
// Todas reciben un buffer de imagen ya validado (src/utils/image.js) y devuelven
// `{ buffer, mime, ext }`. Los números (`size`, `blur`, `level`, `opacity`) se
// validan acá: fuera de rango es un error 400 con pista, no un valor silencioso.
const { sharp } = require('./image');

const FORMATS = {
  jpeg: { mime: 'image/jpeg', ext: 'jpg' },
  png: { mime: 'image/png', ext: 'png' },
  webp: { mime: 'image/webp', ext: 'webp' }
};

function userError(message, hint) {
  const e = new Error(message);
  e.status = 400;
  if (hint) e.hint = hint;
  return e;
}

/** Número de un parámetro, acotado por rango; `fallback` si viene vacío. */
function readNumber(raw, { name, min, max, fallback }) {
  if (raw === undefined || raw === null || String(raw).trim() === '') return fallback;
  const value = Number(String(raw).replace(',', '.'));
  if (!Number.isFinite(value)) throw userError(`El parámetro ${name} debe ser un número`, `Ejemplo: ${name}=${fallback}`);
  if (value < min || value > max) throw userError(`El parámetro ${name} va de ${min} a ${max}`, `Ejemplo: ${name}=${fallback}`);
  return value;
}

/** `jpeg` (por defecto), `png` o `webp`. */
function readFormat(raw, fallback = 'jpeg') {
  const value = String(raw || '').trim().toLowerCase().replace('jpg', 'jpeg');
  if (!value) return fallback;
  if (!Object.hasOwn(FORMATS, value)) throw userError('El formato no es válido', 'Usá format=jpeg, png o webp');
  return value;
}

// ------------------------------------------------------------------ efectos
/** Polvo de estrellas del overlay `gay`: blanco → verde → violeta → celeste. */
const PRIDE = ['#e40303', '#ff8c00', '#ffed00', '#008026', '#004dff', '#750787'];

/** SVG de franjas arcoíris del tamaño de la imagen. */
function flagSvg(width, height, { direction = 'horizontal', opacity = 55 } = {}) {
  const alpha = Math.max(0, Math.min(1, opacity / 100)).toFixed(3);
  const total = PRIDE.length;
  const stripes = PRIDE.map((color, i) => {
    const from = (i * 100) / total;
    const to = ((i + 1) * 100) / total;
    if (direction === 'vertical') {
      return `<rect x="${(from * width) / 100}" y="0" width="${((to - from) * width) / 100 + 1}" height="${height}" fill="${color}"/>`;
    }
    if (direction === 'diagonal') {
      // Franjas a 45°: el viewBox se agranda y se recorta con un grupo rotado.
      const offset = -width;
      const len = width + height;
      const size = (len * (to - from)) / 100 + Math.ceil(len / total) * 0.02;
      const y = offset + (i * len) / total;
      return `<rect x="${offset}" y="${y}" width="${len * 2}" height="${size}" fill="${color}" transform="rotate(45 ${width / 2} ${height / 2})"/>`;
    }
    return `<rect x="0" y="${(from * height) / 100}" width="${width}" height="${((to - from) * height) / 100 + 1}" fill="${color}"/>`;
  }).join('');
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" shape-rendering="crispEdges">`
    + `<g fill-opacity="${alpha}">${stripes}</g></svg>`
  );
}

/** Degradé arcoíris para el modo `glow` (se usa con blend suave). */
function glowSvg(width, height, opacity) {
  const alpha = Math.max(0, Math.min(1, opacity / 100)).toFixed(3);
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`
    + `<defs><linearGradient id="pride" x1="0" y1="0" x2="1" y2="1">`
    + PRIDE.map((color, i) => `<stop offset="${Math.round((i * 100) / (PRIDE.length - 1))}%" stop-color="${color}"/>`).join('')
    + `</linearGradient></defs>`
    + `<rect width="${width}" height="${height}" fill="url(#pride)" fill-opacity="${alpha}"/></svg>`
  );
}

/** Overlay de bandera: mezcla `overlay` + `soft-light` para teñir sin tapar la foto. */
function readDirection(raw) {
  const value = String(raw || 'horizontal').trim().toLowerCase();
  if (!['horizontal', 'vertical', 'diagonal'].includes(value)) {
    throw userError('La dirección no es válida', 'Usá direction=horizontal, vertical o diagonal');
  }
  return value;
}

// --------------------------------------------------------------- aplicación
/** Efectos disponibles: cada uno recibe (buffer, opciones) y devuelve un buffer. */
const EFFECTS = {
  async grayscale(buffer) {
    return sharp(buffer).rotate().grayscale().toBuffer();
  },

  async pixel(buffer, { size }) {
    const base = sharp(buffer).rotate();
    const meta = await base.metadata();
    const w = meta.width || 1;
    const h = meta.height || 1;
    const block = Math.max(1, Math.round(size));
    const smallW = Math.max(1, Math.round(w / block));
    const smallH = Math.max(1, Math.round(h / block));
    const small = await base.resize(smallW, smallH, { kernel: 'nearest' }).png().toBuffer();
    // Se vuelve al tamaño original con vecino más cercano: bloques nítidos.
    return sharp(small).resize(w, h, { kernel: 'nearest' }).png().toBuffer();
  },

  async sepia(buffer) {
    // Matriz sepia clásica normalizada por su fila más alta: sin recortar los
    // blancos (si no, el blanco puro sale 255/255/255 y deja de verse el tono).
    const K = 1.351;
    const matrix = [
      [0.393 / K, 0.769 / K, 0.189 / K, 0],
      [0.349 / K, 0.686 / K, 0.168 / K, 0],
      [0.272 / K, 0.534 / K, 0.131 / K, 0],
      [0, 0, 0, 1]
    ];
    // Dos pasos: se fuerza RGBA antes de recomb (si la foto viene sin alfa,
    // sharp rechaza la matriz de 4 columnas).
    const rgba = await sharp(buffer).rotate().ensureAlpha().png().toBuffer();
    return sharp(rgba).recomb(matrix).toBuffer();
  },

  async blur(buffer, { blur }) {
    // sharp exige sigma >= 0.3; el mínimo llega ya validado desde el router.
    return sharp(buffer).rotate().blur(Math.max(0.3, blur)).toBuffer();
  },

  async invert(buffer) {
    return sharp(buffer).rotate().negate({ alpha: false }).toBuffer();
  },

  async darkness(buffer, { level }) {
    // level = cuánto oscurecer (%); negativo aclara, igual que `brightness`.
    const factor = Math.max(0.05, Math.min(20, 1 - level / 100));
    return sharp(buffer).rotate().modulate({ brightness: factor }).toBuffer();
  },

  async gay(buffer, { opacity, mode, direction }) {
    const base = sharp(buffer).rotate();
    const meta = await base.metadata();
    const w = meta.width || 1;
    const h = meta.height || 1;
    // `source-over` con alfa: se ven los colores reales de la bandera y, debajo,
    // la foto (con `overlay`/`soft-light` los tonos salían apagados).
    const overlay = mode === 'glow'
      ? { input: glowSvg(w, h, opacity), blend: 'over' }
      : { input: flagSvg(w, h, { direction, opacity }), blend: 'over' };
    return base.composite([overlay]).toBuffer();
  }
};

// Rangos de cada parámetro propio (los valida el router/catálogo).
const OPTIONS = {
  pixel: { size: { min: 1, max: 100, fallback: 12 } },
  blur: { blur: { min: 0.3, max: 100, fallback: 8 } },
  darkness: { level: { min: -90, max: 95, fallback: 40 } },
  gay: { opacity: { min: 0, max: 100, fallback: 55 } }
};

/** Opciones del efecto leídas del query/body (con errores 400). */
function readOptions(id, q = {}) {
  const opts = { format: readFormat(q.format) };
  for (const [name, range] of Object.entries(OPTIONS[id] || {})) {
    opts[name] = readNumber(q[name], { name, ...range });
  }
  if (id === 'gay') {
    opts.direction = readDirection(q.direction);
    const mode = String(q.mode || 'flag').trim().toLowerCase();
    if (!['flag', 'glow'].includes(mode)) throw userError('El modo no es válido', 'Usá mode=flag (bandera) o mode=glow (degradé)');
    opts.mode = mode;
  }
  return opts;
}

/**
 * Aplica el efecto `id` y devuelve `{ buffer, mime, ext }` en el formato pedido.
 * `jpeg` aplana la transparencia sobre blanco (JPEG no tiene alfa).
 */
async function applyEffect(id, buffer, q = {}) {
  const effect = Object.hasOwn(EFFECTS, id) ? EFFECTS[id] : null;
  if (!effect) throw userError(`El efecto "${id}" no existe`, 'Revisá la lista en /imagenes');
  const opts = readOptions(id, q);
  const raw = await effect(buffer, opts);
  const format = opts.format;
  const { mime, ext } = FORMATS[format];
  let out = sharp(raw);
  if (format === 'jpeg') out = out.flatten({ background: '#ffffff' }).jpeg({ quality: 90, mozjpeg: true });
  else if (format === 'webp') out = out.webp({ quality: 90 });
  else out = out.png({ compressionLevel: 9 });
  return { buffer: await out.toBuffer(), mime, ext };
}

module.exports = {
  EFFECTS, OPTIONS, FORMATS, applyEffect, readOptions, readFormat, readNumber,
  flagSvg, glowSvg, PRIDE, userError
};
