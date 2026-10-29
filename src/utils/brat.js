// src/utils/brat.js — Render compartido por /canvas/brat y /canvas/bratvideo.
// La referencia usa letras regulares y condensadas, emojis a color y una caja
// centrada verticalmente. Sólo las letras se condensan: los emojis conservan
// sus proporciones. No hay fuentes ni imágenes remotas en tiempo de ejecución.
const { sharp } = require('./image');
const { measure, wrapLines, textLayer } = require('./textEngine');
const { emojiImages } = require('./emoji');
const C = require('../canvas/core');
const P = require('../canvas/parts');
const L = require('../canvas/layouts');

const VIDEO_SIZE = 512;

/** Traduce los parámetros de la API a un diseño que también sirve para video. */
function bratSpec(query = {}, { video = false } = {}) {
  const q = { ...query };
  // Conserva los nombres usados por quienes llaman bratVideo() directamente.
  if (q['canvas.size'] == null && q.canvasSize != null) q['canvas.size'] = q.canvasSize;
  if (q['text.weight'] == null && q.weight != null) q['text.weight'] = q.weight;
  const parts = L.get('brat').parts;
  const font = parts.text.font;
  const ov = C.styleOf(q);
  let S = Math.round(P.num(q, 'canvas', 'size', video ? VIDEO_SIZE : parts.canvas.width, 200, 2000));
  // H.264 yuv420p necesita dimensiones pares. El PNG sí admite impares.
  if (video && S % 2) S += 1;
  const area = P.area(q, 'text', parts.text.box);
  const left = Math.min(S - 2, Math.max(0, Math.round(area.x0 * S)));
  const top = Math.min(S - 2, Math.max(0, Math.round(area.y0 * S)));
  const right = Math.min(S, Math.max(left + 2, Math.round(area.x1 * S)));
  const bottom = Math.min(S, Math.max(top + 2, Math.round(area.y1 * S)));
  const style = P.style(q, 'text', {
    ...font,
    family: ov.font || font.family,
    fill: ov.fill || parts.text.fill,
    uppercase: ov.uppercase || font.uppercase,
    align: q.align || font.align
  });
  return {
    S, left, top, width: right - left, height: bottom - top,
    bg: P.color(q, 'canvas', 'bg', ov.bg || parts.canvas.bg),
    fill: P.raw(q, 'text', 'color') !== undefined
      ? P.color(q, 'text', 'color', style.fill)
      : P.color(q, 'text', 'fill', style.fill),
    family: style.family,
    weight: style.weight,
    lineHeight: style.lineHeight,
    spacing: style.spacing + ov.spacing,
    uppercase: style.uppercase,
    align: style.align,
    rotate: style.rotate + ov.rotate,
    offsetX: ov.dx * S,
    offsetY: (parts.text.offsetY || 0) * S + ov.dy * S,
    maxFont: Math.max(1, Math.min(S * 2, Math.round(font.maxFont * S / parts.canvas.width * style.size * ov.scale))),
    horizontalScale: font.horizontalScale,
    emojiScale: font.emojiScale,
    emojiImageScale: font.emojiImageScale,
    emojiOffsetX: font.emojiOffsetX,
    emojiOffsetY: font.emojiOffsetY
  };
}

/** El tamaño mayor que permite mostrar todo, sin cortar palabras ni líneas. */
function fitBratText(text, spec, maxFont = spec.maxFont) {
  const value = String(text ?? '');
  const words = value.split(/\s+/).filter(Boolean);
  const opts = {
    family: spec.family, weight: spec.weight, letterSpacing: spec.spacing,
    horizontalScale: spec.horizontalScale, emojiScale: spec.emojiScale
  };
  // Una búsqueda binaria evita dibujar cientos de tamaños por cada frame.
  let low = 1;
  let high = Math.max(1, Math.round(maxFont));
  let best = null;
  while (low <= high) {
    const size = Math.floor((low + high) / 2);
    const measureOpts = { ...opts, size };
    if (words.some(word => measure(word, measureOpts) > spec.width + 0.5)) {
      high = size - 1;
      continue;
    }
    // No se limita a ocho líneas ni se agrega una elipsis silenciosamente.
    const lines = wrapLines(value, spec.width, { ...measureOpts, maxLines: Math.max(1, value.length + 1) });
    const fits = lines.length * size * spec.lineHeight <= spec.height &&
      lines.every(line => measure(line, measureOpts) <= spec.width + 0.5);
    if (fits) {
      best = { fontSize: size, lines };
      low = size + 1;
    } else {
      high = size - 1;
    }
  }
  if (!best) {
    const error = new Error('El texto es demasiado largo para el tamaño de lienzo solicitado');
    error.status = 400;
    error.hint = 'Acortá el texto o aumentá canvas.size';
    throw error;
  }
  return best;
}

/** Produce un PNG cuadrado. El mapa de emojis puede compartirse entre frames. */
async function renderBrat(text, spec, { emojis = null, maxFont = spec.maxFont } = {}) {
  const value = spec.uppercase ? String(text ?? '').toUpperCase() : String(text ?? '').toLowerCase();
  const fitted = fitBratText(value, spec, maxFont);
  const images = emojis || await emojiImages(value);
  const layer = textLayer({
    text: fitted.lines.join('\n'),
    width: spec.width,
    height: spec.height,
    family: spec.family,
    weight: spec.weight,
    fontSize: fitted.fontSize,
    autoFit: false,
    lineHeight: spec.lineHeight,
    letterSpacing: spec.spacing,
    horizontalScale: spec.horizontalScale,
    emojiScale: spec.emojiScale,
    emojiImageScale: spec.emojiImageScale,
    emojiOffsetX: spec.emojiOffsetX,
    emojiOffsetY: spec.emojiOffsetY,
    emojiImages: images,
    fill: spec.fill,
    align: spec.align,
    offsetX: spec.offsetX,
    offsetY: spec.offsetY,
    rotate: spec.rotate
  });
  // La caja limita el ajuste, no debe recortar descendentes, acentos ni emojis
  // que sobresalgan unos píxeles de ella. El lienzo exterior sí los contiene.
  const nested = layer.svg.toString('utf8').replace('<svg ',
    `<svg x="${spec.left}" y="${spec.top}" overflow="visible" `);
  const svg = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${spec.S}" height="${spec.S}">${nested}</svg>`);
  const blurred = await sharp(svg).blur(0.7).png().toBuffer();
  return sharp({ create: { width: spec.S, height: spec.S, channels: 4, background: spec.bg } })
    .composite([{ input: blurred, left: 0, top: 0 }])
    .png()
    .toBuffer();
}

module.exports = { VIDEO_SIZE, bratSpec, fitBratText, renderBrat };
