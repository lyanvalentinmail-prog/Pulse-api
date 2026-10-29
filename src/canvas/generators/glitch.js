// src/canvas/generators/glitch.js — glitch
// Fallo digital: separación de canales RGB + franjas horizontales corridas +
// líneas de barrido. Con `?seed=` sale siempre igual (y si no, cambia).
//   /canvas/glitch?url=…&amount=0.6&slices=18&seed=7
const { P, partsOf } = require('./_helpers');
const { loadPhoto, readRaw, toPng, rng } = require('./_filters');

module.exports = async function glitch(q) {
  const parts = partsOf('glitch');
  const { buf, width, height } = await loadPhoto(q, 'glitch');
  const amount = P.num(q, 'filter', 'amount', parts.filter.amount, 0, 1);
  const slices = Math.round(P.num(q, 'filter', 'slices', parts.filter.slices, 0, 80));
  const seed = Math.round(P.num(q, 'filter', 'seed', parts.filter.seed, 1, 1e9));
  const scan = P.num(q, 'filter', 'scanlines', parts.filter.scanlines, 0, 1);

  const { data, info } = await readRaw(buf);
  const W = info.width;
  const H = info.height;
  const ch = info.channels;
  const out = Buffer.from(data);
  const shift = Math.max(1, Math.round(W * 0.012 * amount + 1));

  // 1) separación RGB: el rojo se va a la izquierda y el azul a la derecha.
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const o = (y * W + x) * ch;
      const xr = Math.min(W - 1, Math.max(0, x - shift));
      const xb = Math.min(W - 1, Math.max(0, x + shift));
      out[o] = data[(y * W + xr) * ch];
      out[o + 2] = data[(y * W + xb) * ch + 2];
    }
  }

  // 2) franjas horizontales corridas (lo que "rompe" la imagen)
  const rand = rng(seed);
  for (let i = 0; i < slices; i++) {
    // Dos de cada tres franjas se corren: así se ve roto pero sigue leyéndose.
    if (rand() > 0.66) continue;
    const y0 = Math.floor(rand() * H);
    const h = Math.max(2, Math.round(rand() * (H * 0.03) + 2));
    const dx = Math.round((rand() * 2 - 1) * W * 0.08 * amount);
    if (!dx) continue;
    for (let y = y0; y < Math.min(H, y0 + h); y++) {
      const row = Buffer.alloc(W * ch);
      for (let x = 0; x < W; x++) {
        const src = Math.min(W - 1, Math.max(0, x - dx));
        const o = (y * W + x) * ch;
        const s = (y * W + src) * ch;
        row[o] = out[s];
        row[o + 1] = out[s + 1];
        row[o + 2] = out[s + 2];
        row[o + 3] = out[s + 3];
      }
      row.copy(out, y * W * ch);
    }
  }

  // 3) líneas de barrido suaves (el brillo baja una fila de cada tres)
  if (scan > 0) {
    for (let y = 0; y < H; y += 3) {
      const f = 1 - 0.22 * scan;
      for (let x = 0; x < W; x++) {
        const o = (y * W + x) * ch;
        out[o] = Math.round(out[o] * f);
        out[o + 1] = Math.round(out[o + 1] * f);
        out[o + 2] = Math.round(out[o + 2] * f);
      }
    }
  }

  return toPng(out, W, H, ch);
};
