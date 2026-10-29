// src/canvas/generators/blur.js — blur
// Desenfoque gaussiano: `amount` es el radio (sigma) en píxeles.
//   /canvas/blur?url=…&amount=8
const { sharp, P, partsOf } = require('./_helpers');
const { loadPhoto } = require('./_filters');

module.exports = async function blur(q) {
  const parts = partsOf('blur');
  const { buf } = await loadPhoto(q, 'blur');
  const amount = P.num(q, 'filter', 'amount', parts.filter.amount, 0.3, 100);
  const tint = String(q.tint || '').trim();
  let out = sharp(buf).blur(Math.max(0.3, Math.min(100, amount)));
  if (tint && /^#?[0-9a-f]{3,8}$/i.test(tint)) {
    const meta = await sharp(buf).metadata();
    const color = tint.startsWith('#') ? tint : `#${tint}`;
    out = sharp(await out.png().toBuffer()).composite([{
      input: Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${meta.width}" height="${meta.height}"><rect width="100%" height="100%" fill="${color}" fill-opacity="0.18"/></svg>`)
    }]);
  }
  return out.png().toBuffer();
};
