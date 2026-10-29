// src/canvas/generators/storyreply.js — storyreply
// Partes: photo (historia) · bubble (globo del SMS) · reply (texto dentro).

// Guía: README.md → "Cómo agregar o editar un endpoint".
const {
  sharp, loadImageBuffer, textLayer, wrapLines, txt, imgParam, styleOf, flat,
  chromaInsert, P, partsOf, boxOf
} = require('./_helpers');

module.exports = async function storyreply(q) {
  const ov = styleOf(q);
  const parts = partsOf('storyreply');
  const photo = boxOf('storyreply', 'photo', q);
  const user = await loadImageBuffer(imgParam(q, 'url', 'image', 'img'));
  const base = await chromaInsert(parts.template, user, photo, {
    zoom: ov.zoom, grayscale: ov.grayscale, rotate: ov.rotate,
    radius: P.num(q, 'photo', 'radius', parts.photo.radius)
  });
  const reply = txt(q, 'jajaja total');
  if (!reply) return base;

  const meta = await sharp(base).metadata();
  const W = meta.width, H = meta.height;
  const bubble = parts.bubble.box;
  const box = boxOf('storyreply', 'reply', q);
  const t = P.style(q, 'reply', parts.reply.font);
  const size = Math.round(parts.reply.font.maxFont * t.size);
  const pad = Math.round(parts.reply.pad * W);
  const availW = Math.max(60, Math.round((box.x1 - box.x0) * W) - pad * 2);
  const lines = wrapLines(reply, availW, { family: t.family, weight: t.weight, size });
  const lineH = Math.round(size * parts.reply.lineHeight);
  const blockH = Math.max(lineH, lines.length * lineH);
  // El globo tiene altura fija: el texto se centra verticalmente en él.
  const centerY = Math.round(((bubble.y0 + bubble.y1) / 2) * H);
  const top = centerY - Math.round(blockH / 2);
  const fill = ov.fill || P.color(q, 'reply', 'fill', parts.reply.fill);
  const comps = lines.map((ln, i) => ({
    input: textLayer({
      text: ln, width: availW, height: lineH, family: t.family, weight: t.weight,
      maxFont: size, minFont: 10, maxLines: 1, fill, align: 'start', padding: 0,
      letterSpacing: t.spacing + (ov.spacing || 0)
    }).svg,
    left: Math.round(box.x0 * W) + pad,
    top: top + i * lineH
  }));
  return sharp(base).composite(flat(comps)).png().toBuffer();
};
