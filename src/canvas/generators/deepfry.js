// src/canvas/generators/deepfry.js — deepfry
// El clásico "deep fried": saturación al máximo, contraste brutal y artefactos
// JPEG (se guarda en JPEG de baja calidad y se vuelve a leer).
//   /canvas/deepfry?url=…&amount=1&noise=true
const { sharp, P, partsOf, flag } = require('./_helpers');
const { loadPhoto } = require('./_filters');

const grainSvg = (w, h) => Buffer.from(
  `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">` +
  `<filter id="n"><feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="3" stitchTiles="stitch"/>` +
  `<feColorMatrix type="saturate" values="3"/></filter>` +
  `<rect width="${w}" height="${h}" filter="url(#n)" opacity="0.16"/></svg>`
);

module.exports = async function deepfry(q) {
  const parts = partsOf('deepfry');
  const { buf, width, height } = await loadPhoto(q, 'deepfry');
  const amount = P.num(q, 'filter', 'amount', parts.filter.amount, 0, 1);
  const saturation = 1 + 3.2 * amount;
  const brightness = 1 + 0.28 * amount;
  const contrast = 1 + 0.85 * amount;
  const quality = Math.max(8, Math.round(48 - 34 * amount));

  let out = await sharp(buf)
    .modulate({ saturation, brightness })
    .linear(contrast, -(128 * (contrast - 1)))
    .sharpen({ sigma: 0.6 + amount })
    .jpeg({ quality, chromaSubsampling: '4:2:0' })
    .toBuffer();
  out = await sharp(out).png().toBuffer();
  if (flag(q.noise ?? q.grain)) {
    out = await sharp(out).composite([{ input: grainSvg(width, height) }]).png().toBuffer();
  }
  return out;
};
