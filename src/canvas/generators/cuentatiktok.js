// src/canvas/generators/cuentatiktok.js — cuentatiktok
// Partes: row (fila negra) · avatar · name · status.

// Guía: README.md → "Cómo agregar o editar un endpoint".
const {
  sharp, loadImageBuffer, templateMeta, circleImage, textLayer, imgParam, flat, P,
  partsOf, boxOf
} = require('./_helpers');

module.exports = async function cuentatiktok(q) {
  const parts = partsOf('cuentatiktok');
  const username = String(q.username ?? q.name ?? 'Account not found').slice(0, 36);
  const status = String(q.status ?? q.text ?? 'Sent').slice(0, 24);
  const { buf, width: W, height: H } = await templateMeta(parts.template);
  const rowBox = boxOf('cuentatiktok', 'row', q);
  const rowTop = Math.round(rowBox.y0 * H);
  const rowH = Math.round((rowBox.y1 - rowBox.y0) * H);
  const nameBox = boxOf('cuentatiktok', 'name', q);
  const statusBox = boxOf('cuentatiktok', 'status', q);
  const textLeft = Math.round(nameBox.x0 * W);
  const textW = Math.round((Math.min(nameBox.x1, statusBox.x1) - nameBox.x0) * W);
  const nameTop = Math.round(nameBox.y0 * H);
  const subTop = Math.round(statusBox.y0 * H);
  const nameH = Math.round((nameBox.y1 - nameBox.y0) * H);
  const subH = Math.round((statusBox.y1 - statusBox.y0) * H);

  // se borra toda la zona de texto de la fila (la fila es negra, no se nota)
  const coverX = Math.round(parts.cover.x0 * W);
  const coverW = Math.round(rowBox.x1 * W) - coverX - Math.round(0.01 * W);
  const cover = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${coverW}" height="${rowH}"><rect width="${coverW}" height="${rowH}" fill="#000000"/></svg>`
  );

  const nameSize = Math.round(rowH * P.num(q, 'name', 'size', 0.255, 0.06, 0.6));
  const statusSize = Math.round(rowH * P.num(q, 'status', 'size', 0.185, 0.04, 0.5));
  const name = textLayer({
    text: username, width: coverW, height: nameH, family: parts.name.font.family,
    weight: parts.name.font.weight, maxFont: nameSize, minFont: 9, maxLines: 1,
    align: 'start', fill: P.color(q, 'name', 'fill', parts.name.fill)
  });
  const sub = textLayer({
    text: status, width: coverW, height: subH, family: parts.status.font.family,
    weight: parts.status.font.weight, maxFont: statusSize, minFont: 7, maxLines: 1,
    align: 'start', fill: P.color(q, 'status', 'fill', parts.status.fill)
  });
  const layers = [
    { input: cover, left: coverX, top: rowTop },
    { input: name.svg, left: textLeft, top: nameTop },
    { input: sub.svg, left: textLeft, top: subTop }
  ];
  // el avatar siempre se dibuja: si no mandan uno, va el del repo
  const avatarUrl = imgParam(q, 'image', 'url', 'avatar');
  const ab = boxOf('cuentatiktok', 'avatar', q);
  const d = Math.round(Math.min((ab.x1 - ab.x0) * W, (ab.y1 - ab.y0) * H));
  const av = await circleImage(await loadImageBuffer(avatarUrl), d);
  layers.push({
    input: av,
    left: Math.round(((ab.x0 + ab.x1) / 2) * W - d / 2),
    top: Math.round(((ab.y0 + ab.y1) / 2) * H - d / 2)
  });
  return sharp(buf).composite(flat(layers)).png().toBuffer();
};
