// src/canvas/generators/iqc.js — iqc
// La burbuja se arma por partes (cita + mensaje + hora) y CRECE hacia abajo
// como en WhatsApp: si la respuesta es larga se agregan líneas, la burbuja se
// estira y el menú de abajo baja lo necesario (el alto de la imagen se ajusta).
// ---------------------------- IQC (chat WhatsApp) ----------------------------
// Partes: bubble (globo) · quote (cita con barra de color) · msg (mensaje) ·
// time (hora). El globo CRECE hacia abajo con el texto y el menú de la plantilla
// baja lo necesario. Todo ajustable: ?msg.size=1.2&quote.color=66ddff&time.text=9:41

// Guía: README.md → "Cómo agregar o editar un endpoint".
const {
  sharp, templateMeta, textLayer, measure, wrapLines, txt, styleOf, flat, insertRows, P,
  partsOf
} = require('./_helpers');
const { emojiImages } = require('../../utils/emoji');

module.exports = async function iqc(q) {
  const ov = styleOf(q);
  const parts = partsOf('iqc');
  const { buf, width: W, height: H } = await templateMeta(parts.template);
  const family = ov.font || parts.msg.font.family;

  const rawMessage = txt(q, 'Yo siempre te voy a amar');
  const message = ov.uppercase ? rawMessage.toUpperCase() : rawMessage;
  const quoteRaw = String(q.replyText ?? q.quote ?? q.quoted ?? 'vooooss seguro').trim();
  const hideQuote = quoteRaw === '' || /^(0|false|no|none|null|-)$/i.test(quoteRaw);
  const replyName = String(q.replyName ?? q.username ?? q.name ?? 'Tú').slice(0, 28);
  const time = P.str(q, 'time', 'text', String(q.time ?? q.hour ?? '7:32 p. m.').slice(0, 18));

  // ---- geometría (px de la plantilla) ----
  const bb = parts.bubble.box;
  const bubbleX = Math.round(bb.x0 * W);
  const bubbleW = Math.round((bb.x1 - bb.x0) * W);
  const bubbleTop = Math.round(bb.y0 * H);
  const baseH = Math.round((bb.y1 - bb.y0) * H);
  const radius = Math.round(bubbleW * parts.bubble.radius);
  const padBottom = Math.round(parts.bubble.pad.bottom * H);
  const gap = Math.round(parts.bubble.pad.gap * H);

  const qb = P.area(q, 'quote', parts.quote.box);
  const quoteX = Math.round(qb.x0 * W);
  const quoteY = Math.round(qb.y0 * H);
  const quoteW = Math.round((qb.x1 - qb.x0) * W);
  const quoteBaseH = Math.round((qb.y1 - qb.y0) * H);
  const barW = Math.max(3, Math.round(parts.quote.barWidth * W));

  const nameX = Math.round(P.num(q, 'quote', 'nameX', parts.quote.name.x) * W);
  const nameY = Math.round(parts.quote.name.y * H);
  const quoteTextX = Math.round(P.num(q, 'quote', 'textX', parts.quote.text.x) * W);
  const msgX = Math.round(P.num(q, 'msg', 'x', parts.msg.x) * W);
  const msgYBase = Math.round(P.num(q, 'msg', 'y', parts.msg.y) * H);
  const timeRight = Math.round(P.num(q, 'time', 'right', parts.time.right) * W);

  // ---- colores y tamaños ----
  const bubbleBg = P.color(q, 'bubble', 'bg', parts.bubble.bg);
  const quoteBg = P.color(q, 'quote', 'bg', parts.quote.bg);
  const barColor = P.color(q, 'quote', 'bar', parts.quote.bar);
  const nameColor = P.color(q, 'quote', 'nameColor', parts.quote.name.fill);
  const quoteColor = P.color(q, 'quote', 'textColor', parts.quote.text.fill);
  const msgFill = ov.fill || P.color(q, 'msg', 'fill', parts.msg.fill);
  const timeFill = P.color(q, 'time', 'fill', parts.time.fill);

  const msgSize = Math.max(12, Math.round(parts.msg.font.size * P.num(q, 'msg', 'size', 1, 0.5, 2.5) * ov.scale));
  const quoteSize = Math.max(10, Math.round(parts.quote.text.font.size * P.num(q, 'quote', 'size', 1, 0.5, 2) * ov.scale));
  const nameSize = Math.max(9, Math.round(parts.quote.name.font.size * P.num(q, 'quote', 'size', 1, 0.5, 2) * ov.scale));
  const timeSize = Math.max(8, Math.round(parts.time.font.size * P.num(q, 'time', 'size', 1, 0.5, 2) * ov.scale));
  const lineHeight = parts.msg.font.lineHeight;

  // ---- emojis a color (se dibujan como PNG dentro del texto) ----
  const emojis = await emojiImages(`${message}\n${hideQuote ? '' : quoteRaw}\n${replyName}`);

  // ---- textos ----
  const timeW = Math.ceil(measure(time, { family, weight: 400, size: timeSize })) + 6;
  const msgPadRight = Math.round(0.0150 * W);
  const contentW = Math.max(60, bubbleX + bubbleW - msgPadRight - msgX);
  const wrapOpts = { family, weight: 400, size: msgSize, letterSpacing: ov.spacing || 0, maxLines: 40 };
  const timeGap = Math.max(10, Math.round(msgSize * 0.40));
  // El texto se envuelve a todo el ancho útil (las palabras largas se cortan por
  // letras, nunca se salen del globo). Después, como en WhatsApp, la hora se
  // sienta al lado de la última línea si entra; si no entra, baja a su propia
  // fila abajo a la derecha y el globo crece una línea.
  const msgLines = wrapLines(message, contentW, wrapOpts);
  const lastLine = msgLines[msgLines.length - 1] || '';
  const timeFitsInline = measure(lastLine, { ...wrapOpts, maxLines: 1 }) + timeGap + timeW <= contentW;
  const timeRowH = Math.round(timeSize * 1.5);
  let msgH = Math.round(msgLines.length * msgSize * lineHeight);

  const quoteLines = hideQuote ? [] : wrapLines(quoteRaw, quoteW - (quoteTextX - quoteX), {
    family, weight: 400, size: quoteSize, letterSpacing: ov.spacing || 0, maxLines: 3
  });
  const quoteH = quoteLines.length
    ? Math.max(quoteBaseH, Math.round((nameY - quoteY) + nameSize * 1.35 + quoteLines.length * quoteSize * 1.32 + 12))
    : 0;

  // El mensaje arranca donde lo dice la plantilla. Si la cita crece (varias
  // líneas) el mensaje baja lo justo, pero NUNCA se centra en el globo: antes,
  // con una respuesta corta, el texto quedaba flotando en el medio y encima de
  // la hora (se pisaban).
  const msgTopBase = quoteH ? Math.max(msgYBase, quoteY + quoteH + gap) : msgYBase;

  // `?x=` / `?y=` mueven el mensaje dentro del globo (acotado para que no se salga).
  const blockW = Math.min(contentW, Math.ceil(Math.max(...msgLines.map(l => measure(l, { ...wrapOpts, maxLines: 1 })), 0)) + 2);
  const offX = Math.round(ov.dx * W);
  const offY = Math.round(ov.dy * H);
  const minLeft = bubbleX + 6;
  const maxLeft = bubbleX + bubbleW - 6 - blockW;
  const msgLeft = Math.round(Math.min(Math.max(msgX + offX, minLeft), Math.max(minLeft, maxLeft)));

  const bottomPad = timeFitsInline ? padBottom : timeRowH;
  const bubbleFloor = bubbleTop + Math.max(baseH, msgTopBase + msgH + bottomPad - bubbleTop);
  const maxTop = bubbleFloor - bottomPad - msgH;
  // El mensaje no puede subir sobre la cita ni salirse por abajo del globo.
  const minTop = Math.max(bubbleTop + 6, quoteH ? quoteY + quoteH + Math.round(gap / 2) : bubbleTop + 6);
  const msgTop = Math.round(Math.min(Math.max(msgTopBase + offY, minTop), Math.max(minTop, maxTop)));

  const bubbleH = Math.max(baseH, msgTop + msgH + bottomPad - bubbleTop);
  const delta = bubbleH - baseH;

  // ---- si crece, se insertan filas justo debajo del globo (el menú baja) ----
  const base = delta > 0 ? await insertRows(buf, W, H, delta, bubbleTop + baseH) : buf;

  const layers = [{
    input: Buffer.from(
      `<svg xmlns="http://www.w3.org/2000/svg" width="${bubbleW}" height="${bubbleH}">` +
      `<rect width="${bubbleW}" height="${bubbleH}" rx="${radius}" ry="${radius}" fill="${bubbleBg}"/></svg>`
    ), left: bubbleX, top: bubbleTop
  }];

  if (quoteH) {
    const barInset = Math.round(quoteH * 0.04);
    layers.push({
      input: Buffer.from(
        `<svg xmlns="http://www.w3.org/2000/svg" width="${quoteW}" height="${quoteH}">` +
        `<rect width="${quoteW}" height="${quoteH}" rx="${Math.round(radius * 0.6)}" fill="${quoteBg}"/>` +
        `<rect x="0" y="${barInset}" width="${barW}" height="${quoteH - barInset * 2}" rx="${Math.round(barW / 2)}" fill="${barColor}"/></svg>`
      ), left: quoteX, top: quoteY
    });
    const nameLayer = textLayer({
      text: replyName, width: quoteW - (nameX - quoteX), height: Math.round(nameSize * 1.35),
      family, weight: 600, maxFont: nameSize, minFont: 8, maxLines: 1, align: 'start', fill: nameColor,
      emojiImages: emojis
    });
    const quoteLayer = textLayer({
      text: quoteLines.join('\n'), width: quoteW - (quoteTextX - quoteX),
      height: Math.round(quoteLines.length * quoteSize * 1.32), family, weight: 400,
      fontSize: quoteSize, autoFit: false, lineHeight: 1.32, maxLines: quoteLines.length,
      align: 'start', fill: quoteColor, letterSpacing: ov.spacing || 0, emojiImages: emojis
    });
    layers.push({ input: nameLayer.svg, left: nameX, top: nameY });
    layers.push({ input: quoteLayer.svg, left: quoteTextX, top: nameY + Math.round(nameSize * 1.35) });
  }

  // Si el mensaje va rotado, la capa es más grande que el texto para que el
  // giro no recorte las puntas (el texto queda en el mismo sitio).
  const msgPad = ov.rotate ? Math.ceil(msgSize * 1.2) : 0;
  const msgLayer = textLayer({
    text: msgLines.join('\n'), width: contentW + msgPad * 2, height: msgH + 4 + msgPad * 2,
    family, weight: 400, fontSize: msgSize, autoFit: false, lineHeight,
    maxLines: msgLines.length, padding: msgPad, align: 'start', fill: msgFill,
    letterSpacing: ov.spacing || 0, rotate: ov.rotate || 0, emojiImages: emojis
  });
  layers.push({ input: msgLayer.svg, left: msgLeft - msgPad, top: msgTop - msgPad });

  // La hora va pegada al borde inferior derecho del globo, como en WhatsApp.
  const timeLayer = textLayer({
    text: time, width: timeW, height: Math.round(timeSize * 1.4), family, weight: 400,
    maxFont: timeSize, minFont: 7, maxLines: 1, align: 'end', fill: timeFill, emojiImages: emojis
  });
  layers.push({
    input: timeLayer.svg,
    left: timeRight - timeW,
    top: bubbleTop + bubbleH - Math.round(timeSize * 1.60)
  });

  return sharp(base).composite(flat(layers)).png().toBuffer();
};
