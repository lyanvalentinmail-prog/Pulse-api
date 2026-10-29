// src/canvas/generators/quotly.js — quotly

// Guía: README.md → "Cómo agregar o editar un endpoint".
const {
  sharp, loadImageBuffer, shapedImage, textLayer, measure, wrapLines, txt, imgParam,
  normColor, styleOf, P, partsOf
} = require('./_helpers');

module.exports = async function quotly(q) {
  const ov = styleOf(q);
  const parts = partsOf('quotly');
  const username = String(q.username || q.name || 'Velirius Api').slice(0, 40);
  const text = txt(q, 'Welcome to Velirius Api');
  const bg = ov.bg && ov.bg !== 'transparent' ? ov.bg : P.bg(q, 'canvas', normColor(q.bg, parts.canvas.bg));
  const dark = ['#000000', '#111111', '#17212b', 'black'].includes(String(bg).toLowerCase());
  const bodyColor = ov.fill || P.color(q, 'body', 'fill', dark ? parts.body.fill : '#111111');
  const nameColor = ov.fill || P.color(q, 'name', 'fill', parts.name.fill);
  const family = ov.font || P.str(q, 'body', 'font', parts.body.font.family);
  const nameFamily = ov.font || P.str(q, 'name', 'font', parts.name.font.family);
  const bodyWeight = P.num(q, 'body', 'weight', parts.body.font.weight, 100, 900);
  const nameWeight = P.num(q, 'name', 'weight', parts.name.font.weight, 100, 900);
  const fontSize = Math.max(8, Math.round(parts.body.font.size * ov.scale * P.num(q, 'body', 'size', 1, 0.2, 3)));
  const lineHeight = P.num(q, 'body', 'lineHeight', parts.body.font.lineHeight, 0.6, 2.5);
  const avatarSize = Math.round(P.num(q, 'avatar', 'size', parts.avatar.size, 16, 300) * Math.min(ov.scale, 1.4));
  const radius = P.num(q, 'avatar', 'radius', parts.avatar.radius, 0, 0.5);
  const padX = P.num(q, 'pad', 'x', parts.pad.x, 0, 200);
  const padY = P.num(q, 'pad', 'y', parts.pad.y, 0, 200);
  const gap = P.num(q, 'pad', 'gap', parts.pad.gap, 0, 200);
  const maxWidth = P.num(q, 'canvas', 'maxWidth', parts.canvas.maxWidth, 400, 2048);
  const nameSize = Math.max(8, Math.round(fontSize * parts.name.font.size * P.num(q, 'name', 'size', 1, 0.2, 3)));
  const nameH = Math.round(nameSize * 1.35);

  // 1) medir el texto con margen suficiente y decidir el ancho del lienzo
  const textPad = 6;
  const narrow = Math.max(60, ...wrapLines(text, 560 - textPad * 2, { family, weight: bodyWeight, size: fontSize })
    .map(l => measure(l, { family, weight: bodyWeight, size: fontSize })));
  const W = Math.round(Math.min(maxWidth, Math.max(400, padX * 2 + avatarSize + gap + Math.ceil(narrow) + 14 + textPad * 2)));
  const textW = Math.max(80, W - padX * 2 - avatarSize - gap);

  // 2) renderizar el texto con el ancho definitivo (altura exacta de las líneas)
  const lines = wrapLines(text, textW - textPad * 2, { family, weight: bodyWeight, size: fontSize });
  const bodyH = Math.max(Math.round(fontSize * lineHeight), Math.round(lines.length * fontSize * lineHeight) + 2);
  const body = textLayer({
    text: lines.join('\n'), width: textW, height: bodyH, family, weight: bodyWeight,
    maxFont: fontSize, minFont: 12, maxLines: lines.length, lineHeight,
    fill: bodyColor, align: 'start', autoFit: false, fontSize, padding: textPad
  });
  const H = Math.round(Math.max(padY * 2 + nameH + bodyH, avatarSize + padY * 2));

  const nameLayer = textLayer({
    text: ov.uppercase ? username.toUpperCase() : username,
    width: textW, height: nameH, family: nameFamily, weight: nameWeight,
    maxFont: nameSize, minFont: 9, maxLines: 1, fill: nameColor, align: 'start', padding: textPad
  });
  // Telegram: avatar cuadrado con esquinas redondeadas (no círculo)
  const rounded = await shapedImage(
    await loadImageBuffer(imgParam(q, 'image', 'url', 'avatar')),
    avatarSize, avatarSize, { radius: Math.round(avatarSize * radius), zoom: ov.zoom }
  );
  const rim = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${avatarSize}" height="${avatarSize}"><rect x="1" y="1" width="${avatarSize - 2}" height="${avatarSize - 2}" rx="${Math.round(avatarSize * radius)}" fill="none" stroke="#ffffff" stroke-opacity="0.16" stroke-width="2"/></svg>`);
  const avatar = await sharp(rounded).composite([{ input: rim }]).png().toBuffer();

  const left = padX + avatarSize + gap;
  const composed = await sharp({ create: { width: W, height: H, channels: 4, background: bg } })
    .composite([
      { input: avatar, left: padX, top: Math.round((H - avatarSize) / 2) },
      { input: nameLayer.svg, left, top: padY },
      { input: body.svg, left, top: padY + nameH }
    ])
    .png().toBuffer();

  if (!ov.rotate && !ov.dx && !ov.dy) return composed;
  const rotated = await sharp(composed)
    .rotate(ov.rotate, { background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png().toBuffer();
  if (!ov.dx && !ov.dy) return rotated;
  const meta = await sharp(rotated).metadata();
  return sharp({ create: { width: meta.width + 160, height: meta.height + 160, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: rotated, left: Math.round(80 + ov.dx * 80), top: Math.round(80 + ov.dy * 80) }])
    .png().toBuffer();
};
