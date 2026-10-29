// src/canvas/generators/grayscale.js — grayscale
// Blanco y negro con intensidad regulable: 1 = todo gris, 0.5 = mitad y mitad.
//   /canvas/grayscale?url=…&amount=0.8&tone=sepia
const { sharp, P, partsOf } = require('./_helpers');
const { loadPhoto } = require('./_filters');

// Tintes de cámara: se aplican sobre la foto ya gris (sharp.tint).
const TONES = { sepia: '#c79a5b', cold: '#8fb4e0', warm: '#e8b06a' };

module.exports = async function grayscale(q) {
  const parts = partsOf('grayscale');
  const { buf } = await loadPhoto(q, 'grayscale');
  const amount = P.num(q, 'filter', 'amount', parts.filter.amount, 0, 1);
  const tone = String(q.tone || '').toLowerCase();

  let gray = sharp(buf).grayscale();
  if (TONES[tone]) gray = sharp(await gray.png().toBuffer()).tint(TONES[tone]);
  const out = await gray.png().toBuffer();
  if (amount >= 0.999) return out;
  // Mezcla con la foto original: `amount` = cuánto blanco y negro se ve.
  const alpha = await sharp(buf).ensureAlpha(amount).png().toBuffer();
  return sharp(out).composite([{ input: alpha }]).png().toBuffer();
};
