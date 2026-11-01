// Referencias de Drive: plantillas sin textos ni datos personales originales.
const path = require('path');
const { signCanvas, sharp, textLayer, loadImageBuffer, circleImage, normColor } = require('../core');
const { emojiImages } = require('../../utils/emoji');
const { measure } = require('../../utils/textEngine');
const dir = path.join(__dirname, '../../../assets/templates/referencias');
const template = file => path.join(dir, file);
const signs = {
  cartelanime1: ['cartelanime1.jpg', { x0: .42, y0: .49, x1: .89, y1: .88 }],
  cartelanime2: ['cartelanime2.jpg', { x0: .22, y0: .62, x1: .78, y1: .92 }],
  cartelanime3: ['cartelanime3.jpg', { x0: .58, y0: .21, x1: .96, y1: .76 }],
  cartelanime4: ['cartelanime4.jpg', { x0: .34, y0: .71, x1: .89, y1: .97 }],
  cartelbob: ['cartelbob.jpg', { x0: .53, y0: .10, x1: .87, y1: .65 }]
};
async function sign(id, q) {
  const [file, area] = signs[id];
  return signCanvas(file, area, q, { defaultText: 'Hola Pulse', textOpts: { family: 'sans', weight: 700, maxFont: 64, minFont: 14, maxLines: 5, align: 'middle', fill: '#111111', cover: false, padFrac: .06 } });
}

function value(q, key, fallback = '', max = 140) {
  const result = String(q[key] ?? fallback).trim();
  if (result.length > max) {
    const error = new Error(`${key} es demasiado largo (máx. ${max} caracteres)`);
    error.status = 400;
    throw error;
  }
  return result;
}
async function layer(text, left, top, width, height, { size = 32, color = '#fff', align = 'start', family = 'sans', weight = 400, lines = 2, cursor = false } = {}) {
  const rendered = textLayer({ text, width, height, maxFont: size, minFont: 9, maxLines: lines, family, weight, fill: color, align, lineHeight: 1.12, emojiImages: await emojiImages(text) });
  // No devolver un texto cortado silenciosamente cuando no cabe en la referencia.
  if (rendered.lines.join('').replace(/\s/g, '') !== String(text).replace(/\s/g, '')) {
    const error = new Error('El texto no cabe en el espacio de esta plantilla');
    error.status = 400;
    error.hint = 'Probá con un texto más corto';
    throw error;
  }
  let input = rendered.svg;
  if (cursor) {
    const x = Math.min(width - 3, Math.max(0, measure(rendered.lines[0], { family, weight, size: rendered.fontSize }) + 2));
    const y = Math.max(2, (height - rendered.fontSize * 1.12) / 2);
    const stroke = `<path d="M${x.toFixed(1)} ${y.toFixed(1)}v${(rendered.fontSize * 1.1).toFixed(1)}" stroke="${color}" stroke-width="2" stroke-linecap="round"/>`;
    input = Buffer.from(input.toString().replace('</svg>', `${stroke}</svg>`));
  }
  return { input, left, top };
}

async function chat(id, q = {}) {
  const text = value(q, 'text', id === 'perfilchat' ? 'Hola, uso Pulse' : 'Hola, ¿cómo estás?');
  const color = normColor(q.color, '#f4f4f4');
  const layers = [];
  let file;
  if (id === 'perfilchat') {
    file = 'perfil.png';
    const avatar = await circleImage(await loadImageBuffer(q.image || q.avatar || ''), 318);
    const camera = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><circle cx="50" cy="50" r="49" fill="#168647"/><path d="M30 37h9l4-5h14l4 5h9v28H30z" fill="none" stroke="#062f19" stroke-width="4" stroke-linejoin="round"/><circle cx="50" cy="51" r="8" fill="none" stroke="#062f19" stroke-width="4"/></svg>');
    layers.push({ input: avatar, left: 201, top: 137 }, { input: camera, left: 422, top: 363 });
    for (const [v, y, fill] of [
      [value(q, 'name', 'Pulse', 50), 604, '#8c9198'], [text, 728, '#288c54'],
      [value(q, 'username', '', 50), 850, '#8c9198'], [value(q, 'phone', '', 32), 973, '#8c9198'],
      [value(q, 'link', '', 80), 1094, '#8c9198']
    ]) if (v) layers.push(await layer(v, 144, y, 475, 27, { size: 19, color: fill, family: 'hand', lines: 1 }));
  } else if (id === 'imessagetyping') {
    file = 'imessage-teclado.png';
    const reply = value(q, 'reply', 'Tú', 55);
    const suggestion = value(q, 'suggestion', '', 20);
    layers.push(await layer(text, 55, 379, 178, 42, { size: 30, color, lines: 1 }));
    layers.push(await layer(reply, 155, 481, 440, 45, { size: 31, color, lines: 1, cursor: true }));
    layers.push(await layer(value(q, 'time', 'Yesterday 8:11 PM', 30), 276, 319, 183, 27, { size: 20, align: 'middle', lines: 1 }));
    if (reply) layers.push(await layer(`“${reply}”`, 65, 597, 120, 42, { size: 25, color: '#c1c1c6', align: 'middle', lines: 1 }));
    if (suggestion) layers.push(await layer(suggestion, 250, 597, 150, 42, { size: 25, color: '#c1c1c6', align: 'middle', lines: 1 }));
  } else if (id === 'whatsappquote') {
    const quote = value(q, 'quote', '');
    const quoted = !!quote || String(q.variant || '').toLowerCase() === 'cita';
    file = quoted ? 'whatsapp-cita.png' : 'whatsapp-simple.png';
    if (quoted) {
      layers.push(await layer(value(q, 'author', 'Tú', 35), 61, 609, 440, 34, { size: 27, color: '#ef8093', weight: 700, lines: 1 }));
      layers.push(await layer(quote, 61, 653, 465, 35, { size: 24, color: '#ccccce', lines: 1 }));
      layers.push(await layer(text, 50, 711, 373, 43, { size: 31, color, lines: 1 }));
      layers.push(await layer(value(q, 'time', '7:32 p. m.', 20), 426, 729, 107, 29, { size: 21, color: '#a8a8aa', align: 'end', lines: 1 }));
    } else {
      layers.push(await layer(text, 54, 346, 475, 68, { size: 32, color, lines: 2 }));
      layers.push(await layer(value(q, 'time', '8:58 p. m.', 20), 412, 410, 118, 28, { size: 21, color: '#a8a8aa', align: 'end', lines: 1 }));
    }
  } else {
    file = 'imessage-menu.png';
    layers.push(await layer(text, 55, 537, 470, 83, { size: 33, color, lines: 2 }));
  }
  return sharp(template(file)).composite(layers).png().toBuffer();
}

// La palabra se curva en perspectiva, como la referencia tipográfica de Drive.
async function curvedWord(text) {
  const width = 736, sourceHeight = 280, outputHeight = 308;
  const rendered = await layer(text, 0, 0, width, sourceHeight, { size: 260, color: '#000', align: 'middle', weight: 900, lines: 1 });
  const { data } = await sharp(rendered.input).png().trim({ background: '#00000000' })
    .resize(width, sourceHeight, { fit: 'fill' }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const output = Buffer.alloc(width * outputHeight * 4);
  for (let y = 0; y < outputHeight; y++) for (let x = 0; x < width; x++) {
    let t = y / sourceHeight;
    let sx = (x - width / 2) / Math.max(.65, 1 - .28 * t) + width / 2;
    t = y / (276 - 55 * (1 - sx / width) ** 2);
    sx = (x - width / 2) / Math.max(.65, 1 - .28 * t) + width / 2;
    const sy = t * sourceHeight;
    if (sx < 0 || sx >= width || sy < 0 || sy >= sourceHeight) continue;
    const src = (Math.floor(sy) * width + Math.floor(sx)) * 4, dst = (y * width + x) * 4;
    data.copy(output, dst, src, src + 4);
  }
  return sharp(output, { raw: { width, height: outputHeight, channels: 4 } }).png().toBuffer();
}
async function love(q = {}) {
  const text = value(q, 'text', 'money', 40) || 'money';
  const original = template('ilove.jpg');
  if (text === 'money') return sharp(original).png().toBuffer();
  const top = await sharp(original).extract({ left: 0, top: 0, width: 736, height: 375 }).png().toBuffer();
  return sharp({ create: { width: 736, height: 693, channels: 4, background: '#fff' } })
    .composite([{ input: top, left: 0, top: 0 }, { input: await curvedWord(text), left: 0, top: 380 }]).png().toBuffer();
}
module.exports = { sign, chat, love };
