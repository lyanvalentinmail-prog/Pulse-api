// src/canvas/generators/ttp.js — ttp
// Partes: canvas (tamaño/fondo) · text (tipografía, relleno y contorno).

// Guía: README.md → "Cómo agregar o editar un endpoint".
const {
  sharp, textLayer, txt, normColor, styleOf, P, partsOf
} = require('./_helpers');

module.exports = async function ttp(q) {
  const ov = styleOf(q);
  const parts = partsOf('ttp');
  const text = ov.uppercase ? txt(q, 'Hola').toUpperCase() : txt(q, 'Hola');
  const bgIn = String(q.bg || parts.canvas.bg).toLowerCase();
  const bg = bgIn === 'transparent' ? null : normColor(bgIn, '#000000');
  const S = Math.round(P.num(q, 'canvas', 'width', parts.canvas.width, 128, 1200));
  const box = P.area(q, 'text', parts.text.box);
  const t = P.style(q, 'text', parts.text.font);
  const size = Math.round(parts.text.font.maxFont * t.size);
  const strokeW = P.num(q, 'text', 'stroke', parts.text.stroke.width, 0, 0.3);
  const layer = textLayer({
    text,
    width: Math.round((box.x1 - box.x0) * S),
    height: Math.round((box.y1 - box.y0) * S),
    family: t.family, weight: t.weight,
    maxFont: size, minFont: 18, maxLines: parts.text.font.maxLines,
    lineHeight: parts.text.font.lineHeight,
    letterSpacing: size * (parts.text.font.spacing + (ov.spacing || 0)),
    fill: ov.fill || P.color(q, 'text', 'fill', parts.text.fill),
    align: 'middle', padding: 24, uppercase: t.uppercase || ov.uppercase,
    rotate: t.rotate, offsetX: Math.round(ov.dx * S), offsetY: Math.round(ov.dy * S),
    stroke: strokeW > 0 ? P.color(q, 'text', 'stroke', parts.text.stroke.color) : null,
    strokeWidth: strokeW > 0 ? Math.max(2, size * strokeW) : 0
  });
  const canvas = sharp({ create: { width: S, height: S, channels: 4, background: bg || { r: 0, g: 0, b: 0, alpha: 0 } } });
  return canvas.composite([{ input: layer.svg, left: Math.round(box.x0 * S), top: Math.round(box.y0 * S) }]).png().toBuffer();
};
