// src/canvas/generators/_filters.js — Motor compartido de los canvas de FILTROS.
//
// Los filtros (`grayscale`, `blur`, `pixel`, `deepfry`, `sketch`, `swirl`,
// `liquify`, `glitch`) hacen lo mismo al principio: agarran la foto del usuario
// (o el avatar por defecto), la enderezan, la achican a un ancho razonable y
// devuelven un PNG. Eso vive acá una sola vez, igual que las dos herramientas
// de pixelado: recorrer la imagen píxel por píxel y muestrear con interpolación
// bilineal (para que un giro o un estiramiento no queden con dientes de sierra).
//
// Archivo de apoyo (`_`): NO es un endpoint.
const {
  sharp, loadImageBuffer, imgParam, P, partsOf
} = require('./_helpers');

/** Foto del usuario (o la de ejemplo) ya lista para filtrar. */
async function loadPhoto(q, id, defMaxWidth = 1024) {
  const parts = partsOf(id);
  const photo = (parts && parts.photo) || {};
  const maxWidth = Math.round(P.num(q, 'photo', 'width', photo.maxWidth || defMaxWidth, 64, 4096));
  const user = await loadImageBuffer(imgParam(q, 'url', 'image', 'img'));
  // Limitar también el alto: un PNG angosto y enorme no debe bloquear filtros
  // que recorren cada píxel. Se mantiene la proporción y nunca se agranda.
  const buf = await sharp(user).rotate().resize({
    width: maxWidth, height: 4096, fit: 'inside', withoutEnlargement: true, kernel: 'lanczos3'
  }).png().toBuffer();
  const m = await sharp(buf).metadata();
  return { buf, width: m.width || 1, height: m.height || 1 };
}

/** La foto ya enderezada, sin límite de tamaño si el canvas lo necesita. */
async function readRaw(buf) {
  return sharp(buf).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
}

const toPng = (data, width, height, channels = 4) =>
  sharp(data, { raw: { width, height, channels } }).png().toBuffer();

/**
 * Recorre la imagen destino y pide a `map(x, y)` de dónde sacar el color.
 * Devuelve un PNG con el mismo tamaño que la entrada.
 */
async function warpPixels(buf, map) {
  const { data, info } = await readRaw(buf);
  const W = info.width;
  const H = info.height;
  const ch = info.channels;
  const out = Buffer.allocUnsafe(W * H * ch);
  const sample = (x, y, o) => {
    if (x < 0) x = 0; else if (x > W - 1) x = W - 1;
    if (y < 0) y = 0; else if (y > H - 1) y = H - 1;
    const x0 = x | 0;
    const y0 = y | 0;
    const x1 = x0 + 1 < W ? x0 + 1 : W - 1;
    const y1 = y0 + 1 < H ? y0 + 1 : H - 1;
    const fx = x - x0;
    const fy = y - y0;
    const i00 = (y0 * W + x0) * ch;
    const i10 = (y0 * W + x1) * ch;
    const i01 = (y1 * W + x0) * ch;
    const i11 = (y1 * W + x1) * ch;
    for (let c = 0; c < ch; c++) {
      const top = data[i00 + c] * (1 - fx) + data[i10 + c] * fx;
      const bottom = data[i01 + c] * (1 - fx) + data[i11 + c] * fx;
      out[o + c] = (top * (1 - fy) + bottom * fy + 0.5) | 0;
    }
  };
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const src = map(x, y, W, H);
      sample(src.x, src.y, (y * W + x) * ch);
    }
  }
  return toPng(out, W, H, ch);
}

/** Generador pseudoaleatorio con semilla: el mismo `?seed=` da el mismo glitch. */
function rng(seed = 1) {
  let a = (Number(seed) || 1) >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Centro del efecto, en píxeles, con overrides `?cx=` / `?cy=` (0-1). */
function centerOf(q, W, H) {
  const cx = P.num(q, 'filter', 'cx', 0.5, 0, 1) * W;
  const cy = P.num(q, 'filter', 'cy', 0.5, 0, 1) * H;
  return { cx, cy };
}

const clamp01 = v => Math.max(0, Math.min(1, v));

module.exports = { loadPhoto, readRaw, warpPixels, toPng, rng, centerOf, clamp01 };
