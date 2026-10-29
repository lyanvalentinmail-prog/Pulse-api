// src/canvas/generators/gaycard.js — gaycard
// Partes: canvas · avatar (foto + arcoíris) · title (arcoíris letra a letra) ·
// name · badge (píldora blanca con el porcentaje).

// Guía: README.md → "Cómo agregar o editar un endpoint".
const {
  sharp, loadImageBuffer, shapedImage, textLayer, measure, imgParam, parsePercent,
  styleOf, P, partsOf, boxOf
} = require('./_helpers');

module.exports = async function gaycard(q) {
  const ov = styleOf(q);
  const parts = partsOf('gaycard');
  const W = Math.round(P.num(q, 'canvas', 'width', parts.canvas.width, 200, 2000));
  const H = Math.round(P.num(q, 'canvas', 'height', parts.canvas.height, 200, 2000));
  const bg = ov.bg || P.bg(q, 'canvas', parts.canvas.bg);
  const name = String(q.name || q.username || 'Velirius').slice(0, 22);
  const pct = parsePercent(q.rank ?? q.percentage ?? q.percent);
  const user = await loadImageBuffer(imgParam(q, 'url', 'image', 'img'));
  const rainbowBands = ['#ff004d', '#ff8a00', '#ffee00', '#00e05a', '#0088ff', '#8a2be2'];

  // ---- avatar: foto → franjas arcoíris → recorte circular → aro ----
  const size = Math.round(P.num(q, 'avatar', 'size', parts.avatar.size) * Math.min(ov.zoom, 1.8));
  let avatar = await shapedImage(user, size, size, {
    zoom: 1, grayscale: ov.grayscale, rotate: ov.rotate, radius: Math.round(size / 2)
  });
  const bandH = size / rainbowBands.length;
  const rainbow = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">` +
    rainbowBands.map((c, i) => `<rect y="${i * bandH}" width="${size}" height="${bandH + 1}" fill="${c}" fill-opacity="0.55"/>`).join('') +
    `</svg>`
  );
  const circleMask = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}"><circle cx="${size / 2}" cy="${size / 2}" r="${size / 2}" fill="#ffffff"/></svg>`
  );
  avatar = await sharp(avatar)
    .composite([{ input: rainbow }, { input: circleMask, blend: 'dest-in' }])
    .png().toBuffer();
  const ring = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">` +
    `<circle cx="${size / 2}" cy="${size / 2}" r="${size / 2 - 3}" fill="none" stroke="${P.color(q, 'avatar', 'ring', parts.avatar.ring)}" stroke-width="4"/></svg>`
  );
  avatar = await sharp(avatar).composite([{ input: ring }]).png().toBuffer();

  const ab = boxOf('gaycard', 'avatar', q);
  const avX = Math.round(((ab.x0 + ab.x1) / 2) * W - size / 2);
  const avY = Math.round(((ab.y0 + ab.y1) / 2) * H - size / 2);

  // ---- píldora del porcentaje ----
  const bb = boxOf('gaycard', 'badge', q);
  const pillW = Math.round((bb.x1 - bb.x0) * W);
  const pillH = Math.round((bb.y1 - bb.y0) * H);
  const pill = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${pillW}" height="${pillH}">` +
    `<rect width="${pillW}" height="${pillH}" rx="${Math.round(pillH / 2)}" fill="${P.color(q, 'badge', 'bg', parts.badge.pill.bg)}"/></svg>`
  );

  const base = await sharp({ create: { width: W, height: H, channels: 4, background: bg } }).png().toBuffer();
  const layers = [
    { input: avatar, left: avX, top: avY },
    { input: pill, left: Math.round(bb.x0 * W), top: Math.round(bb.y0 * H) }
  ];

  // ---- título arcoíris, dibujado letra a letra (nada de <text> en el SVG) ----
  const tb = boxOf('gaycard', 'title', q);
  const tt = P.style(q, 'title', parts.title.font);
  const title = String(q.title || 'GAY PERCENTAGE').slice(0, 24);
  const titleSize = Math.round(parts.title.font.maxFont * tt.size);
  const widths = Array.from(title).map(ch => measure(ch, { family: tt.family, weight: tt.weight, size: titleSize }));
  const totalW = widths.reduce((a, b) => a + b, 0);
  let cursor = Math.round(tb.x0 * W + ((tb.x1 - tb.x0) * W - totalW) / 2);
  Array.from(title).forEach((ch, i) => {
    if (ch !== ' ') {
      layers.push({
        input: textLayer({
          text: ch, width: Math.ceil(widths[i]) + 6, height: Math.round(titleSize * 1.6),
          family: tt.family, weight: tt.weight, maxFont: titleSize, minFont: 8,
          maxLines: 1, fill: rainbowBands[i % rainbowBands.length], align: 'middle', padding: 0
        }).svg,
        left: cursor,
        top: Math.round(tb.y0 * H)
      });
    }
    cursor += Math.round(widths[i]);
  });

  // ---- nombre y porcentaje ----
  const nb = boxOf('gaycard', 'name', q);
  const nt = P.style(q, 'name', parts.name.font);
  layers.push({
    input: textLayer({
      text: name, width: Math.round((nb.x1 - nb.x0) * W), height: Math.round((nb.y1 - nb.y0) * H),
      family: nt.family, weight: nt.weight, maxFont: Math.round(parts.name.font.maxFont * nt.size),
      minFont: 10, maxLines: 1, align: 'middle', fill: ov.fill || P.color(q, 'name', 'fill', parts.name.fill)
    }).svg,
    left: Math.round(nb.x0 * W),
    top: Math.round(nb.y0 * H)
  });
  const bt = P.style(q, 'badge', parts.badge.font);
  layers.push({
    input: textLayer({
      text: `~ ${pct}% ~`, width: pillW, height: pillH,
      family: bt.family, weight: bt.weight, maxFont: Math.round(parts.badge.font.maxFont * bt.size),
      minFont: 10, maxLines: 1, align: 'middle', fill: P.color(q, 'badge', 'fill', parts.badge.fill)
    }).svg,
    left: Math.round(bb.x0 * W),
    top: Math.round(bb.y0 * H)
  });

  return sharp(base).composite(layers).png().toBuffer();
};
