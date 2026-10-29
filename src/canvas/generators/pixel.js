// src/canvas/generators/pixel.js — pixel
// Pixelado tipo mosaico: `size` = lado del bloque en píxeles (más grande = más grueso).
//   /canvas/pixel?url=…&size=14&colors=32
const { sharp, P, partsOf } = require('./_helpers');
const { loadPhoto } = require('./_filters');

module.exports = async function pixel(q) {
  const parts = partsOf('pixel');
  const { buf, width, height } = await loadPhoto(q, 'pixel');
  const block = Math.round(P.num(q, 'filter', 'size', parts.filter.size, 2, 200));
  const colors = Math.round(P.num(q, 'filter', 'colors', parts.filter.colors, 0, 256));
  const w = Math.max(1, Math.round(width / block));
  const h = Math.max(1, Math.round(height / block));
  // Se achica sin suavizar y se vuelve a agrandar igual: quedan bloques duros.
  const small = await sharp(buf).resize(w, h, { kernel: 'nearest' }).png().toBuffer();
  const big = await sharp(small).resize(width, height, { kernel: 'nearest' }).png();
  return colors ? big.png({ palette: true, colors }).toBuffer() : big.png().toBuffer();
};
