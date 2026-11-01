// src/catalog/canvas.js — Ficha de la categoría **CANVAS**.
//
// Por ahora la categoría sólo publica los dos endpoints que quedaron tras la
// limpieza: `brat` (PNG) y `bratvideo` (MP4). Los dos comparten los mismos
// cuatro parámetros básicos, para que el probador quede corto:
//
//   text (requerido) · bg · color · canvas.size   (+ words en el video)
//
// El motor sigue aceptando más overrides por URL (`font`, `rotate`, `x`, `y`,
// `spacing`, `uppercase`, `text.align`…): están documentados en el README pero
// no se muestran en la web para no llenar el probador.
//
// ▸ AGREGAR un canvas (4 pasos):
//   1) la plantilla (opcional) → assets/templates/
//   2) el dibujo → src/canvas/generators/<id>.js
//   3) las medidas → src/canvas/layouts.js
//   4) la ficha de acá abajo + habilitar el id en src/routes/canvas.js
//   Guía: CONTRIBUTING.md.
//
// `group` = la carpeta de Drive a la que pertenece (ver GROUPS).
const { P, O } = require('./helpers');

// Carpetas de Drive (`CategoriaCanvas/<nombre>`), conservadas en el catálogo.
const GROUPS = [
  { id: 'brats', name: 'Brats', desc: 'La familia brat: stickers y videos' }
];

module.exports = {
  id: 'canvas',
  name: 'CANVAS',
  desc: 'Memes e imágenes generadas al vuelo',
  groups: GROUPS,
  endpoints: [
    { id: 'brat', group: 'brats', desc: 'Sticker brat como el de Drive: texto grande y condensado, fondo blanco y emojis a color.', media: 'image', params: [
      P('text', 'Hehe this is brat 💸', 'Texto del sticker'),
      O('bg', 'ffffff', 'Color de fondo hex sin #'),
      O('color', '', 'Color del texto hex (vacío = negro)'),
      O('canvas.size', '736', 'Lado del PNG en píxeles (200 - 2000)')
    ] },
    { id: 'bratvideo', group: 'brats', desc: 'Video MP4 como el de Drive: palabras que aparecen progresivamente y emojis a color.', media: 'video', params: [
      P('text', 'Welcome to Pulse API 💚🔥', 'Frase animada palabra por palabra (admite emojis)'),
      O('bg', 'ffffff', 'Color de fondo hex (ej. 8ACE00 o ffffff)'),
      O('color', '', 'Color del texto hex (vacío = negro)'),
      O('words', '5', 'Cuántas palabras entran por pantalla (1 - 8)'),
      O('canvas.size', '512', 'Lado del video en píxeles (200 - 2000; se redondea a par)')
    ] }
  ]
};
