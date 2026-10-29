// src/canvas/generators/google.js — google
// Buscador de imágenes de Google: 5 paneles de resultados + avatar de la cuenta.
// Cada panel acepta su propia imagen (`url1`…`url5`); si no, se repite `url`.
const {
  sharp, loadImageBuffer, templateMeta, imgParam, styleOf, flat, flag,
  placeImageArea, imageList, P, partsOf, boxOf
} = require('./_helpers');

const PANELS = ['photo1', 'photo2', 'photo3', 'photo4', 'photo5'];

module.exports = async function google(q) {
  const parts = partsOf('google');
  const { buf, width: W, height: H } = await templateMeta(parts.template);
  const ov = styleOf(q);
  // `images=a,b,c` reparte las fotos entre los paneles; `url1`…`url5` mandan.
  const urls = imageList(q);
  const main = await loadImageBuffer(imgParam(q, 'url', 'image', 'img') || urls[0] || '');
  const layers = [];

  for (const part of PANELS) {
    const n = part.slice(-1);
    const own = imgParam(q, `url${n}`, `image${n}`) || urls[Number(n) - 1];
    const img = own ? await loadImageBuffer(own) : main;
    layers.push(await placeImageArea(W, H, boxOf('google', part, q), img, {
      zoom: P.num(q, part, 'zoom', ov.zoom),
      grayscale: flag(q[`${part}.grayscale`]) || ov.grayscale,
      rotate: ov.rotate
    }));
  }

  // Avatar de la cuenta (el círculo verde de arriba a la derecha).
  const avatarUrl = imgParam(q, 'avatar', 'pfp');
  const avatar = avatarUrl ? await loadImageBuffer(avatarUrl) : main;
  layers.push(await placeImageArea(W, H, boxOf('google', 'avatar', q), avatar, {
    radius: P.num(q, 'avatar', 'radius', 0.5, 0, 0.5)
  }));

  return sharp(buf).composite(flat(layers)).png().toBuffer();
};
