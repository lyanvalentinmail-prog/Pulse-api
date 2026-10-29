// src/canvas/generators/invert.js — negativo de la foto.
const { sharp } = require('./_helpers');
const { loadPhoto } = require('./_filters');

module.exports = async function invert(q) {
  const { buf } = await loadPhoto(q, 'invert');
  return sharp(buf).negate({ alpha: false }).png().toBuffer();
};
