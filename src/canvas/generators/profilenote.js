// src/canvas/generators/profilenote.js — profilenote
// "Tu nota" de WhatsApp: el globo oscuro de arriba (el texto crece y el globo se
// estira), el avatar circular de abajo y la etiqueta "Tu nota".
//
// Partes: bubble (globo) · msg (texto) · avatar (foto) · dot (puntito gris que
// une el globo con el avatar) · label (etiqueta "Tu nota").
// Todo ajustable: ?msg.size=1.2&bubble.bg=1f1f1f&label.text=Mi nota&image=<url>

// Guía: README.md → "Cómo agregar o editar un endpoint".
const {
  sharp, loadImageBuffer, templateMeta, circleImage, textLayer, wrapLines, txt, imgParam,
  styleOf, flat, insertRows, P, partsOf, boxOf
} = require('./_helpers');
const { emojiImages } = require('../../utils/emoji');

module.exports = async function profilenote(q) {
  const ov = styleOf(q);
  const parts = partsOf('profilenote');
  const { buf, width: W, height: H } = await templateMeta(parts.template);
  const family = ov.font || parts.msg.font.family;

  const raw = txt(q, 'Welcome to Velirius API');
  const message = ov.uppercase ? raw.toUpperCase() : raw;
  const labelRaw = String(q.label ?? q.nota ?? parts.label.text ?? 'Tu nota').slice(0, 40);

  // `delta` = lo que crece el globo; todo lo que está debajo baja lo mismo.

  // ---- globo ----
  const bb = P.area(q, 'bubble', parts.bubble.box);
  const bx0 = Math.round(bb.x0 * W);
  const bx1 = Math.round(bb.x1 * W);
  const by0 = Math.round(bb.y0 * H);
  const by1 = Math.round(bb.y1 * H);
  const bw = Math.max(24, bx1 - bx0);
  const baseH = Math.max(24, by1 - by0);
  const radius = Math.round(bw * P.num(q, 'bubble', 'radius', parts.bubble.radius, 0, 0.5));
  const bg = P.color(q, 'bubble', 'bg', parts.bubble.bg);

  const size = Math.max(9, Math.round(parts.msg.font.size * P.num(q, 'msg', 'size', 1, 0.4, 2.5) * ov.scale));
  const lh = P.num(q, 'msg', 'lineHeight', parts.msg.font.lineHeight, 0.9, 2.2);
  const padX = Math.round(P.num(q, 'msg', 'padX', parts.msg.padX, 0.005, 0.4) * W);
  const padY = Math.round(P.num(q, 'msg', 'padY', parts.msg.padY, 0, 300));
  const fill = ov.fill || P.color(q, 'msg', 'fill', parts.msg.fill);
  const contentW = Math.max(40, bw - padX * 2);

  const emojis = await emojiImages(`${message}\n${labelRaw}`);
  const lines = wrapLines(message, contentW, {
    family, weight: parts.msg.font.weight, size,
    letterSpacing: ov.spacing || 0, maxLines: 60
  });
  const blockH = Math.max(size, Math.ceil(lines.length * size * lh));
  const bubbleH = Math.max(baseH, blockH + padY * 2);
  const delta = bubbleH - baseH;

  // Si el texto no entra, el globo se estira y TODO lo de abajo (avatar,
  // puntito y etiqueta) baja: nada se recorta.
  const base = delta > 0 ? await insertRows(buf, W, H, delta, by0 + baseH) : buf;

  // El globo de la plantilla ya viene vacío (y con su colita abajo a la
  // izquierda), así que solo se redibuja cuando el texto lo hace crecer.
  const layers = [];
  if (delta > 0) {
    layers.push({
      input: Buffer.from(
        `<svg xmlns="http://www.w3.org/2000/svg" width="${bw}" height="${bubbleH}">` +
        `<rect width="${bw}" height="${bubbleH}" rx="${radius}" ry="${radius}" fill="${bg}"/></svg>`
      ),
      left: bx0, top: by0
    });
  }

  const textTop = by0 + Math.round((bubbleH - blockH) / 2) + Math.round(ov.dy * H);
  const rotPad = ov.rotate ? Math.ceil(size * 1.2) : 0;
  const msgLayer = textLayer({
    text: lines.join('\n'),
    width: contentW + rotPad * 2,
    height: blockH + 4 + rotPad * 2,
    family,
    weight: parts.msg.font.weight,
    fontSize: size,
    autoFit: false,
    lineHeight: lh,
    maxLines: lines.length,
    padding: rotPad,
    align: 'start',
    fill,
    letterSpacing: ov.spacing || 0,
    rotate: ov.rotate || 0,
    emojiImages: emojis
  });
  layers.push({
    input: msgLayer.svg,
    left: bx0 + padX + Math.round(ov.dx * W) - rotPad,
    top: textTop - rotPad
  });

  // ---- avatar: la foto del usuario (o el círculo verde de la plantilla) ----
  const avatarUrl = imgParam(q, 'image', 'url', 'avatar');
  if (avatarUrl) {
    const ab = boxOf('profilenote', 'avatar', q);
    const d = Math.round(Math.min((ab.x1 - ab.x0) * W, (ab.y1 - ab.y0) * H));
    const av = await circleImage(await loadImageBuffer(avatarUrl), d);
    layers.push({
      input: av,
      left: Math.round(((ab.x0 + ab.x1) / 2) * W - d / 2),
      top: Math.round(((ab.y0 + ab.y1) / 2) * H - d / 2) + delta
    });
    // el puntito gris que une el globo con el avatar vuelve a quedar arriba
    const dot = parts.dot;
    const cx = Math.round(P.num(q, 'dot', 'x', dot.x, 0, 1) * W);
    const cy = Math.round(P.num(q, 'dot', 'y', dot.y, 0, 1) * H) + delta;
    const dr = Math.round(P.num(q, 'dot', 'r', dot.r, 0.002, 0.2) * W);
    layers.push({
      input: Buffer.from(
        `<svg xmlns="http://www.w3.org/2000/svg" width="${dr * 2}" height="${dr * 2}">` +
        `<circle cx="${dr}" cy="${dr}" r="${dr}" fill="${P.color(q, 'dot', 'fill', dot.fill)}"/></svg>`
      ),
      left: cx - dr, top: cy - dr
    });
  }

  // ---- etiqueta "Tu nota" (se borra la de la plantilla y se escribe encima) ----
  const lb = parts.label;
  const lbox = boxOf('profilenote', 'label', q);
  const lx = Math.round(lbox.x0 * W);
  const ly = Math.round(lbox.y0 * H) + delta;
  const lw = Math.round((lbox.x1 - lbox.x0) * W);
  const lh2 = Math.round((lbox.y1 - lbox.y0) * H);
  const labelSize = Math.max(10, Math.round(lb.font.size * P.num(q, 'label', 'size', 1, 0.4, 2) * ov.scale));
  layers.push({
    input: Buffer.from(
      `<svg xmlns="http://www.w3.org/2000/svg" width="${lw}" height="${lh2}">` +
      `<rect width="${lw}" height="${lh2}" fill="${P.color(q, 'label', 'cover', lb.cover)}"/></svg>`
    ),
    left: lx, top: ly
  });
  const labelLayer = textLayer({
    text: labelRaw, width: lw, height: lh2, family, weight: lb.font.weight,
    maxFont: labelSize, minFont: 9, maxLines: 1, align: 'middle',
    fill: P.color(q, 'label', 'fill', lb.fill), emojiImages: emojis
  });
  layers.push({ input: labelLayer.svg, left: lx, top: ly });

  return sharp(base).composite(flat(layers)).png().toBuffer();
};
