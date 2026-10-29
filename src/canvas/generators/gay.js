// src/canvas/generators/gay.js — gay
// Partes: photo (recorte) · overlay (franjas arcoíris) · maxWidth.

// Guía: README.md → "Cómo agregar o editar un endpoint".
const {
  sharp, styleOf, P, partsOf
} = require('./_helpers');
const { loadPhoto } = require('./_filters');

module.exports = async function gay(q) {
  const ov = styleOf(q);
  const parts = partsOf('gay');
  const photo = await loadPhoto(q, 'gay');
  const resized = ov.grayscale ? await sharp(photo.buf).grayscale().png().toBuffer() : photo.buf;
  const m2 = await sharp(resized).metadata();
  const colors = parts.overlay.colors;
  const opacity = P.num(q, 'overlay', 'opacity', ov.opacity || parts.overlay.opacity, 0, 1);
  const ow = m2.width || photo.width;
  const oh = m2.height || 1;
  const band = Math.ceil(oh / colors.length);
  const overlay = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${ow}" height="${oh}">` +
    colors.map((c, i) => `<rect y="${i * band}" width="${ow}" height="${band}" fill="${c}" fill-opacity="${opacity}"/>`).join('') +
    `</svg>`
  );
  return sharp(resized).composite([{ input: overlay }]).png().toBuffer();
};
