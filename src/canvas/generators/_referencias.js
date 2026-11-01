// Diseños inspirados en las referencias de Drive; no se incluyen capturas con datos personales.
const { signCanvas, sharp, textLayer, loadImageBuffer, circleImage } = require('../core');
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

function layer(text, left, top, width, height, size = 32, color = '#fff', align = 'start') {
  return { input: textLayer({ text: String(text).slice(0, 400), width, height, maxFont: size, minFont: 14, maxLines: 4, family: 'sans', weight: 400, fill: color, align }).svg, left, top };
}
async function chat(id, q) {
  const w = 736, h = 1280;
  const isProfile = id === 'perfilchat';
  const isTyping = id === 'imessagetyping';
  const wa = id === 'whatsappquote';
  const quote = wa && String(q.quote || '').trim();
  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><defs><linearGradient id="b" x2="1" y2="1"><stop stop-color="#253343"/><stop offset="1" stop-color="#080e12"/></linearGradient></defs><rect width="100%" height="100%" fill="${isProfile ? '#090d12' : 'url(#b)'}"/>`;
  const layers = [];
  if (isProfile) {
    svg += '<path d="M38 44h30 M38 44l14 -14 M38 44l14 14" stroke="#aaa" stroke-width="4" fill="none"/>';
    layers.push(layer('Perfil', 102, 24, 250, 45, 30));
    layers.push({ input: await circleImage(await loadImageBuffer(q.image || q.avatar || ''), 280), left: 228, top: 130 });
    layers.push(layer('Nombre', 130, 560, 400, 35, 22, '#aaa'), layer(q.name || 'Pulse', 130, 600, 450, 40, 27), layer('Info.', 130, 710, 400, 35, 22, '#aaa'), layer(q.text || 'Hola, uso Pulse', 130, 750, 500, 60, 27, '#6bd99b'));
  } else if (isTyping) {
    svg += '<rect x="28" y="350" width="400" height="90" rx="40" fill="#202326"/><rect x="28" y="465" width="680" height="76" rx="38" fill="#303439"/><rect x="0" y="575" width="736" height="705" rx="50" fill="#171c21"/>';
    layers.push(layer(q.text || '¿Qué quieres?', 55, 370, 345, 50, 31), layer(q.reply || 'Tú', 55, 480, 570, 45, 32), layer('q   w   e   r   t   y   u   i   o   p', 40, 680, 650, 50, 26), layer('a   s   d   f   g   h   j   k   l', 60, 790, 610, 50, 26), layer('z   x   c   v   b   n   m', 90, 900, 560, 50, 26));
  } else {
    svg += '<rect x="28" y="190" width="640" height="90" rx="45" fill="#1c2021"/><rect x="30" y="315" width="545" height="'+(quote ? '200' : '135')+'" rx="25" fill="#202527"/><rect x="30" y="'+(quote ? 545 : 480)+'" width="480" height="470" rx="25" fill="#303437"/>';
    layers.push(layer(wa ? '👍   ❤️   😂   😮   😢   🙏' : '♥   👍   👎   HA   !!   ?', 55, 211, 590, 48, 29, '#ddd'));
    if (quote) layers.push(layer(q.quote, 55, 335, 480, 60, 23, '#ff8191'));
    layers.push(layer(q.text || 'Hola, ¿cómo estás?', 55, quote ? 405 : 340, 475, 85, 31));
    const top = quote ? 570 : 505;
    (wa ? ['Responder', 'Reenviar', 'Copiar', 'Destacar', 'Eliminar'] : ['Reply', 'Add Sticker', 'Copy', 'Translate', 'More...']).forEach((s, i) => layers.push(layer(s, 60, top + i * 85, 370, 55, 29, i === 4 && wa ? '#ff8191' : '#eee')));
  }
  svg += '</svg>';
  return sharp(Buffer.from(svg)).composite(layers).png().toBuffer();
}
async function love(q) {
  const text = String(q.text || 'money').slice(0, 80);
  const base = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="736" height="736"><rect width="736" height="736" fill="white"/></svg>');
  return sharp(base).composite([layer('i <3', 75, 20, 586, 290, 230, '#000', 'middle'), layer(text, 20, 330, 696, 300, 220, '#000', 'middle')]).png().toBuffer();
}
module.exports = { sign, chat, love };
