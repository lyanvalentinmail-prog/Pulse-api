// src/catalog/canvas.js — Ficha de la categoría **CANVAS**.
//
// Por ahora la categoría sólo publica los dos endpoints que quedaron tras la
// limpieza: `brat` (PNG) y `bratvideo` (MP4).
//
// ▸ AGREGAR un canvas (4 pasos):
//   1) la plantilla (opcional) → assets/templates/
//   2) el dibujo → src/canvas/generators/<id>.js
//   3) las medidas → src/canvas/layouts.js
//   4) la ficha de acá abajo + habilitar el id en src/routes/canvas.js
//   Guía completa: CONTRIBUTING.md.
//
// `group` = la carpeta de Drive a la que pertenece (ver GROUPS).
const { P, O, S, textStyle } = require('./helpers');

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
      O('bg', 'ffffff', 'Fondo hex sin #'),
      O('canvas.size', '736', 'Lado del PNG en píxeles (200 - 2000)'),
      ...textStyle(),
      S('text.align', 'start', 'Alineación del texto', ['start', 'middle', 'end']),
      O('text.weight', '400', 'Grosor de la tipografía (400 - 900)')
    ] },
    { id: 'bratvideo', group: 'brats', desc: 'Video MP4 como el de Drive: palabras que aparecen progresivamente y emojis a color.', media: 'video', params: [
      P('text', 'Welcome to Pulse API 💚🔥', 'Frase animada palabra por palabra (admite emojis)'),
      O('words', '5', 'Cuántas palabras entran como máximo en cada pantalla (1 - 8)'),
      O('bg', 'ffffff', 'Color de fondo hex (ej. 8ACE00 o ffffff)'),
      O('canvas.size', '512', 'Lado del video en píxeles (200 - 2000; se redondea a par)'),
      ...textStyle(),
      S('text.align', 'start', 'Alineación del texto', ['start', 'middle', 'end']),
      O('text.weight', '400', 'Grosor de la tipografía (400 - 900)')
    ] }
  ]
};
