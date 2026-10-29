// src/canvas/generators/searched.js — searched
// Partes: photo · band + name (franja del nombre al pie de la foto) · reward.

// Guía: README.md → "Cómo agregar o editar un endpoint".
const {
  sharp, loadImageBuffer, templateMeta, textLayer, imgParam, styleOf, flat,
  placeImageArea, loadImages, areaLayer, P, partsOf, boxOf
} = require('./_helpers');

module.exports = async function searched(q) {
  const ov = styleOf(q);
  const parts = partsOf('searched');
  const { buf, width: W, height: H } = await templateMeta(parts.template);
  // Una o varias fotos: con más de una se acomodan en grilla dentro del cartel.
  const fotos = await loadImages(q, 'avatar1.jpg');
  const user = fotos.length ? fotos : await loadImageBuffer(imgParam(q, 'url', 'image', 'img'));
  const layers = [
    await areaLayer('searched', 'photo', q, W, H, user, {
      zoom: ov.zoom, grayscale: ov.grayscale, rotate: ov.rotate
    })
  ];

  const name = String(q.name ?? 'EL MÁS BUSCADO').trim();
  if (name) {
    const bandBox = boxOf('searched', 'band', q);
    const bandX = Math.round(bandBox.x0 * W);
    const bandW = Math.round((bandBox.x1 - bandBox.x0) * W);
    const bandY = Math.round(bandBox.y0 * H);
    const bandH = Math.round((bandBox.y1 - bandBox.y0) * H);
    const opacity = P.num(q, 'band', 'opacity', parts.band.opacity, 0, 1);
    const band = Buffer.from(
      `<svg xmlns="http://www.w3.org/2000/svg" width="${bandW}" height="${bandH}">` +
      `<rect width="${bandW}" height="${bandH}" fill="${P.color(q, 'band', 'bg', parts.band.bg)}" fill-opacity="${opacity}"/></svg>`
    );
    const t = P.style(q, 'name', parts.name.font);
    const size = Math.round(bandH * P.num(q, 'name', 'size', 0.62, 0.2, 1.1));
    const nameLayer = textLayer({
      text: t.uppercase ? name.toUpperCase().slice(0, 26) : name.slice(0, 26),
      width: bandW, height: bandH, family: t.family, weight: t.weight,
      maxFont: size, minFont: 8, maxLines: 1, fill: ov.fill || P.color(q, 'name', 'fill', parts.name.fill),
      align: 'middle'
    });
    layers.push({ input: band, left: bandX, top: bandY });
    layers.push({ input: nameLayer.svg, left: bandX, top: bandY });
  }

  return sharp(buf).composite(flat(layers)).png().toBuffer();
};
