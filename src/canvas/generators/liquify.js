// src/canvas/generators/liquify.js — liquify
// "Liquify": la foto se estira como líquido alrededor de un punto. `mode` elige
// si el centro se infla (bulge), se aspira (pinch) o se derrite con ondas (melt).
//   /canvas/liquify?url=…&amount=60&mode=bulge&radius=0.7&cx=0.5&cy=0.5
const { P, partsOf } = require('./_helpers');
const { loadPhoto, warpPixels, centerOf } = require('./_filters');

module.exports = async function liquify(q) {
  const parts = partsOf('liquify');
  const { buf, width, height } = await loadPhoto(q, 'liquify');
  const amount = P.num(q, 'filter', 'amount', parts.filter.amount, -100, 100) / 100;
  const radius = P.num(q, 'filter', 'radius', parts.filter.radius, 0.15, 2);
  const mode = String(q.mode || '').toLowerCase() || parts.mode || 'bulge';
  if (Math.abs(amount) < 0.005) return buf;
  const melt = mode === 'melt' || mode === 'derretir';
  const pinch = mode === 'pinch' || mode === 'aspirar';
  // La fuerza se escala: 1 = efecto suave, 2.2 = el máximo del control.
  const strength = Math.abs(amount) * 2.2;

  const { cx, cy } = centerOf(q, width, height);
  const R = (Math.min(width, height) / 2) * radius;
  return warpPixels(buf, (x, y) => {
    const dx = x - cx;
    const dy = y - cy;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const r = dist / R;
    if (r >= 1) return { x, y };
    const fall = Math.pow(1 - r * r, 2);
    // 1 = quieto; <1 acerca el centro (aspira); >1 lo aleja (infla)
    let scale = pinch ? 1 - strength * fall : 1 + strength * fall;
    scale = Math.max(0.32, Math.min(3.4, scale));
    let angle = 0;
    if (melt) {
      // ondas suaves: el borde del charco se "derrite" y se corre
      angle = strength * fall * 0.9 * Math.sin(Math.atan2(dy, dx) * 3 + r * Math.PI * 2);
      scale = 1 + strength * fall * 0.55 * Math.cos(r * Math.PI);
      scale = Math.max(0.32, Math.min(3.4, scale));
    }
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const nx = dx * cos - dy * sin;
    const ny = dx * sin + dy * cos;
    return { x: cx + nx / scale, y: cy + ny / scale };
  });
};
