// src/canvas/generators/sketch.js — sketch
// Lápiz: se saca el color, se invierte y se desenfoca, y se divide la foto por
// ese desenfoque (color-dodge). Los bordes quedan negros sobre papel.
//   /canvas/sketch?url=…&detail=8&amount=1&paper=fffdf5
const { sharp, P, partsOf } = require('./_helpers');
const { loadPhoto, readRaw, toPng } = require('./_filters');

module.exports = async function sketch(q) {
  const parts = partsOf('sketch');
  const { buf, width, height } = await loadPhoto(q, 'sketch');
  const detail = P.num(q, 'filter', 'detail', parts.filter.detail, 0.5, 40);
  const amount = P.num(q, 'filter', 'amount', parts.filter.amount, 0, 1);
  const paper = String(q.paper || parts.paper || 'fffdf5').replace(/^#/, '');

  const gray = await sharp(buf).grayscale().png().toBuffer();
  const inverted = await sharp(gray).negate({ alpha: false }).blur(Math.max(0.5, detail)).toBuffer();
  const g = await readRaw(gray);
  const b = await readRaw(inverted);
  const { width: W, height: H, channels: ch } = g.info;
  const out = Buffer.allocUnsafe(W * H * ch);
  const px = parseInt(paper, 16);
  const paperR = (px >> 16) & 255;
  const paperG = (px >> 8) & 255;
  const paperB = px & 255;
  for (let i = 0; i < W * H; i++) {
    const o = i * ch;
    const base = g.data[o];
    const blur = b.data[o];
    const denom = 255 - blur;
    // color-dodge: base / (1 - desenfoque)
    const dodge = denom <= 1 ? 255 : Math.min(255, (base * 255) / denom);
    const v = Math.max(0, Math.min(255, dodge));
    // `amount` mezcla el lápiz con el papel (1 = sólo lápiz)
    const r = v * amount + paperR * (1 - amount);
    const gg = v * amount + paperG * (1 - amount);
    const bb = v * amount + paperB * (1 - amount);
    out[o] = Math.round(r);
    out[o + 1] = Math.round(gg);
    out[o + 2] = Math.round(bb);
    out[o + 3] = 255;
  }
  return toPng(out, W, H, ch);
};
