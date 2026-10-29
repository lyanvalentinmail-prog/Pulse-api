// src/canvas/generators/swirl.js — swirl
// Remolino: la foto gira alrededor de un centro y el giro se apaga hacia los
// bordes (en el centro queda entera, afuera no se mueve).
//   /canvas/swirl?url=…&amount=180&radius=0.6&cx=0.5&cy=0.5
const { P, partsOf } = require('./_helpers');
const { loadPhoto, warpPixels, centerOf } = require('./_filters');

module.exports = async function swirl(q) {
  const parts = partsOf('swirl');
  const { buf, width, height } = await loadPhoto(q, 'swirl');
  const degrees = P.num(q, 'filter', 'amount', parts.filter.amount, -1080, 1080);
  const radius = P.num(q, 'filter', 'radius', parts.filter.radius, 0.15, 2);
  if (Math.abs(degrees) < 0.5) return buf;
  const { cx, cy } = centerOf(q, width, height);
  const R = (Math.min(width, height) / 2) * radius;
  return warpPixels(buf, (x, y) => {
    const dx = x - cx;
    const dy = y - cy;
    const r = Math.sqrt(dx * dx + dy * dy) / R;
    if (r >= 1) return { x, y };
    // el giro es más fuerte en el centro y se va a 0 en el borde
    const t = 1 - r;
    const theta = (degrees * Math.PI / 180) * t * t;
    const cos = Math.cos(theta);
    const sin = Math.sin(theta);
    return { x: cx + dx * cos - dy * sin, y: cy + dx * sin + dy * cos };
  });
};
