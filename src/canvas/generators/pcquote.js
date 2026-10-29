// src/canvas/generators/pcquote.js — pcquote

// Guía: README.md → "Cómo agregar o editar un endpoint".
const {
  sharp, loadImageBuffer, templateMeta, imgParam, styleOf, flat, placeImageArea,
  placeTextArea, loadImages, areaLayer, P, partsOf, boxOf
} = require('./_helpers');

module.exports = async function pcquote(q) {
  const parts = partsOf('pcquote');
  const { buf, width: W, height: H } = await templateMeta(parts.template);
  const ov = styleOf(q);
  const imageUrl = imgParam(q, 'url', 'image', 'img');
  const text = String(q.text ?? '').trim();
  const mode = String(q.mode || '').toLowerCase();
  const fotos = await loadImages(q, 'avatar1.jpg');
  const useImage = mode === 'image' || (mode !== 'text' && (imageUrl || fotos.length >= 2) && !text);
  const layers = [];
  if (useImage) {
    const user = fotos.length ? fotos : await loadImageBuffer(imageUrl);
    layers.push(await areaLayer('pcquote', 'photo', q, W, H, user, { zoom: ov.zoom }));
  } else {
    const t = P.style(q, 'text', parts.text.font);
    layers.push(placeTextArea(W, H, boxOf('pcquote', 'text', q), text || 'dibujo god', {
      family: t.family, weight: t.weight, fill: ov.fill || t.fill,
      maxFont: Math.round(parts.text.font.maxFont * t.size), maxLines: parts.text.font.maxLines, ov
    }));
  }
  return sharp(buf).composite(flat(layers)).png().toBuffer();
};
