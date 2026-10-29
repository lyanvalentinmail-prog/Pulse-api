// src/canvas/parts.js — Sistema de PARTES de los canvas.
//
// Cada canvas está partido en partes con nombre (`bg`, `title`, `photo`, `bubble`,
// `msg`, `time`, `quote`, `badge`…) y cada parte tiene sus números por defecto en
// layouts.js. Todos esos valores se pueden cambiar **desde la URL** sin tocar el
// código, con la sintaxis `<parte>.<clave>=valor`:
//
//   /canvas/iqc?msg.size=1.3&msg.color=ffe066&bubble.width=0.6&time.color=9ad0ff
//   /canvas/bratestirado?text.size=1.2&text.fill=ff0044&lens.stretch=1.3
//   /canvas/searched?photo.y0=0.32&photo.zoom=1.2&name.size=1.4
//
// Claves reconocidas en cualquier parte:
//   x0, y0, x1, y1   área en fracciones (0-1) de la plantilla/lienzo
//   color / fill     color de texto o de relleno
//   bg               color de fondo
//   size             escala tipográfica
//   font             sans | serif | mono
//   weight           100-900
//   align            start | middle | end
//   uppercase / rotate / spacing / pad / radius
const C = require('./core');

const raw = (q, part, key) => {
  if (!q || !part) return undefined;
  const v = q[`${part}.${key}`];
  return v === undefined || v === '' ? undefined : v;
};

/** ¿La query toca esta parte? (útil para saber si hay overrides) */
function has(q, part) {
  const prefix = `${part}.`;
  return Object.keys(q || {}).some(k => k.startsWith(prefix));
}

/** Número con override `<parte>.<clave>`. */
function num(q, part, key, def, min = -1e9, max = 1e9) {
  const v = raw(q, part, key);
  const n = parseFloat(v);
  if (!Number.isFinite(n)) return def;
  return Math.max(min, Math.min(max, n));
}

/** Color con override `<parte>.<clave>` (acepta hex con/sin # y nombres). */
function color(q, part, key, def) {
  const v = raw(q, part, key);
  if (v === undefined) return def;
  return C.normColor(v, def);
}

/** Booleano con override `<parte>.<clave>`. */
function flagOf(q, part, key, def) {
  const v = raw(q, part, key);
  if (v === undefined) return def;
  return C.flag(v);
}

/** Texto libre con override (ej. la hora del globo). */
function str(q, part, key, def) {
  const v = raw(q, part, key);
  return v === undefined ? def : String(v);
}

/**
 * Área de una parte: { x0, y0, x1, y1 } en fracciones.
 * Overrides: `<parte>.x0`, `<parte>.y0`, `<parte>.x1`, `<parte>.y1`,
 * `<parte>.x`/`<parte>.y` (desplazamiento en fracciones) y `<parte>.pad` (encoge).
 */
function area(q, part, def) {
  const pad = num(q, part, 'pad', 0, -0.4, 0.4);
  const dx = num(q, part, 'x', 0, -1, 1);
  const dy = num(q, part, 'y', 0, -1, 1);
  const a = {
    x0: num(q, part, 'x0', def.x0 + pad) + dx,
    y0: num(q, part, 'y0', def.y0 + pad) + dy,
    x1: num(q, part, 'x1', def.x1 - pad) + dx,
    y1: num(q, part, 'y1', def.y1 - pad) + dy
  };
  a.x0 = Math.max(0, Math.min(1, a.x0));
  a.y0 = Math.max(0, Math.min(1, a.y0));
  a.x1 = Math.max(a.x0 + 0.01, Math.min(1, a.x1));
  a.y1 = Math.max(a.y0 + 0.01, Math.min(1, a.y1));
  return a;
}

/** Estilo tipográfico de una parte (family, weight, fill, align, uppercase…). */
function style(q, part, def = {}) {
  const out = {
    family: str(q, part, 'font', def.family || 'sans'),
    weight: num(q, part, 'weight', def.weight ?? 700, 100, 900),
    fill: color(q, part, 'color', def.fill || null) || color(q, part, 'fill', def.fill || null) || def.fill || null,
    align: str(q, part, 'align', def.align || 'middle'),
    uppercase: flagOf(q, part, 'uppercase', !!def.uppercase),
    rotate: num(q, part, 'rotate', def.rotate ?? 0, -180, 180),
    spacing: num(q, part, 'spacing', def.spacing ?? 0, -50, 200),
    lineHeight: num(q, part, 'lineHeight', def.lineHeight ?? 1.18, 0.6, 2.5),
    size: num(q, part, 'size', def.size ?? 1, 0.2, 3),
    pad: num(q, part, 'pad', def.pad ?? 0, 0, 0.4)
  };
  return out;
}

/** Fondo de una parte (color) con override `<parte>.bg`. */
function bg(q, part, def) {
  return color(q, part, 'bg', def);
}

/** Resumen legible de las partes de un canvas (para /docs). */
function describe(layout) {
  if (!layout || !layout.parts) return [];
  return Object.entries(layout.parts).map(([name, def]) => ({
    part: name,
    area: def.area || def.box || null,
    keys: Object.keys(def).filter(k => k !== 'area' && k !== 'box')
  }));
}

module.exports = { raw, has, num, color, flagOf, str, area, style, bg, describe };
