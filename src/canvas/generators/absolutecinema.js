// src/canvas/generators/absolutecinema.js — absolutecinema
// Partes: canvas (lienzo) · bar (franja negra) · sub (palabra chica) · title.

// Guía: README.md → "Cómo agregar o editar un endpoint".
const {
  sharp, loadImageBuffer, templateMeta, textLayer, imgParam, styleOf, P, partsOf, boxOf
} = require('./_helpers');

module.exports = async function absolutecinema(q) {
  const ov = styleOf(q);
  const parts = partsOf('absolutecinema');
  const main = String(q.text || 'CINEMA').toUpperCase().slice(0, 24);
  const sub = String(q.subtext || q.sub || 'ABSOLUTE').toUpperCase().slice(0, 24);
  const url = imgParam(q, 'url', 'image', 'img');
  const tpl = await templateMeta(parts.template || 'absolutecinema.jpg');
  const W = Math.round(P.num(q, 'canvas', 'width', tpl.width, 200, 3000));
  const H = Math.round(P.num(q, 'canvas', 'height', tpl.height, 200, 3000));
  let base;
  if (url) {
    const user = await loadImageBuffer(url);
    const gray = ov.grayscale !== false;
    let img = sharp(user).rotate().resize(W, H, { fit: 'cover' });
    if (gray) img = img.grayscale();
    base = await img.png().toBuffer();
  } else {
    base = W === tpl.width && H === tpl.height
      ? tpl.buf
      : await sharp(tpl.buf).resize(W, H, { fit: 'fill' }).png().toBuffer();
  }

  const bar = boxOf('absolutecinema', 'bar', q);
  const barLayer = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${Math.round((bar.y1 - bar.y0) * H)}">` +
    `<rect width="${W}" height="100%" fill="${P.color(q, 'bar', 'bg', parts.bar.bg)}"/></svg>`
  );

  const put = (text, part) => {
    const a = boxOf('absolutecinema', part, q);
    const t = P.style(q, part, parts[part].font);
    const w = Math.round((a.x1 - a.x0) * W);
    const h = Math.round((a.y1 - a.y0) * H);
    const size = Math.round(parts[part].font.maxFont * t.size * ov.scale);
    return {
      input: textLayer({
        text, width: w, height: h, family: t.family, weight: t.weight,
        maxFont: size, minFont: 10, maxLines: 1,
        letterSpacing: t.spacing + (ov.spacing || 0),
        fill: ov.fill || P.color(q, part, 'fill', parts[part].fill),
        align: 'middle', rotate: t.rotate, offsetX: Math.round(ov.dx * W)
      }).svg,
      left: Math.round(a.x0 * W),
      top: Math.round(a.y0 * H)
    };
  };

  return sharp(base)
    .composite([{ input: barLayer, left: 0, top: Math.round(bar.y0 * H) }, put(sub, 'sub'), put(main, 'title')])
    .png().toBuffer();
};
