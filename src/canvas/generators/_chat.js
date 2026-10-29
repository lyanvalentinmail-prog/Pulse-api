// src/canvas/generators/_chat.js — Globos de chat (apoyo, NO es un endpoint).
//
// Las plantillas de la familia "chat" (iqcblue, iqcpink, messengerquote…) son
// capturas reales de la app con la barra de reacciones y el menú contextual ya
// dibujados. Este archivo se encarga de lo único que cambia en cada pedido:
//
//   1. tapa el globo de la plantilla con un globo del MISMO color y lo estira
//      hacia abajo todo lo que haga falta (el texto nunca se corta),
//   2. empuja el menú de abajo con `insertRows` (el fondo se estira solo),
//   3. escribe el texto encima, con emojis a color.
//
// Las medidas de cada canvas están en src/canvas/layouts.js.
const {
  sharp, templateMeta, textLayer, wrapLines, txt, styleOf, flat, insertRows, P,
  partsOf
} = require('./_helpers');
const { emojiImages } = require('../../utils/emoji');

async function chatBubble(id, q, opts = {}) {
  const ov = styleOf(q);
  const parts = partsOf(id);
  const { buf, width: W, height: H } = await templateMeta(parts.template);
  const family = ov.font || parts.msg.font.family;

  const raw = txt(q, opts.defaultText || 'Welcome to Velirius API');
  const message = ov.uppercase ? raw.toUpperCase() : raw;

  // ---- geometría del globo (px de la plantilla) ----
  const bb = P.area(q, 'bubble', parts.bubble.box);
  const bx0 = Math.round(bb.x0 * W);
  const bx1 = Math.round(bb.x1 * W);
  const by0 = Math.round(bb.y0 * H);
  const by1 = Math.round(bb.y1 * H);
  const bw = Math.max(24, bx1 - bx0);
  const baseH = Math.max(24, by1 - by0);
  const radius = Math.round(bw * P.num(q, 'bubble', 'radius', parts.bubble.radius, 0, 0.5));
  const bg = P.color(q, 'bubble', 'bg', parts.bubble.bg);

  // ---- tipografía y márgenes ----
  const size = Math.max(9, Math.round(parts.msg.font.size * P.num(q, 'msg', 'size', 1, 0.4, 2.5) * ov.scale));
  const lh = P.num(q, 'msg', 'lineHeight', parts.msg.font.lineHeight, 0.9, 2.2);
  const padX = Math.round(P.num(q, 'msg', 'padX', parts.msg.padX, 0.005, 0.4) * W);
  const padY = Math.round(P.num(q, 'msg', 'padY', parts.msg.padY, 0, 300));
  const fill = ov.fill || P.color(q, 'msg', 'fill', parts.msg.fill);
  const contentW = Math.max(40, bw - padX * 2);

  // ---- texto: se envuelve a mano para saber cuánto crece el globo ----
  const emojis = await emojiImages(message);
  const wrapOpts = {
    family, weight: parts.msg.font.weight, size,
    letterSpacing: ov.spacing || 0, maxLines: 60
  };
  const lines = wrapLines(message, contentW, wrapOpts);
  const blockH = Math.max(size, Math.ceil(lines.length * size * lh));
  const bubbleH = Math.max(baseH, blockH + padY * 2);
  const delta = bubbleH - baseH;

  // Si el globo crece, se insertan filas justo debajo: el menú baja y el fondo
  // se estira. El globo nuevo tapa el globo original (mismo color, más alto).
  const base = delta > 0 ? await insertRows(buf, W, H, delta, by0 + baseH) : buf;

  const layers = [{
    input: Buffer.from(
      `<svg xmlns="http://www.w3.org/2000/svg" width="${bw}" height="${bubbleH}">` +
      `<rect width="${bw}" height="${bubbleH}" rx="${radius}" ry="${radius}" fill="${bg}"/></svg>`
    ),
    left: bx0, top: by0
  }];

  // El texto se centra en el globo (el globo ya tiene el alto justo del texto)
  // y `?x=`/`?y=` lo mueven dentro, sin que pueda salirse.
  const textTop = by0 + Math.round((bubbleH - blockH) / 2) + Math.round(ov.dy * H);
  const textLeft = bx0 + padX + Math.round(ov.dx * W);
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
  layers.push({ input: msgLayer.svg, left: textLeft - rotPad, top: textTop - rotPad });

  return sharp(base).composite(flat(layers)).png().toBuffer();
}

module.exports = { chatBubble };
