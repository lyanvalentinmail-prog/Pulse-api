// src/catalog/canvas.js — Ficha de la categoría **CANVAS**.
//
// La categoría publica dos canvas dibujados (`brat` PNG y `bratvideo` MP4) y el
// editor de textos de video (`videoeditor` + `videotext` + `videotextrender`),
// que no dibuja desde cero: analiza un video subido con OCR local y lo vuelve a
// exportar con los textos cambiados.
//
// Los canvas comparten los mismos cuatro parámetros básicos, para que el
// probador quede corto:
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
const { P, O, S } = require('./helpers');

// Carpetas de Drive (`CategoriaCanvas/<nombre>`), conservadas en el catálogo.
const GROUPS = [
  { id: 'brats', name: 'Brats', desc: 'La familia brat: stickers y videos' },
  { id: 'video', name: 'Video', desc: 'Editor de textos de video (OCR + ffmpeg)' }
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
    ] },
    // ------------------- Editor de textos de video -------------------
    // En el navegador abre el editor HTML; pedido con fetch devuelve la info.
    { id: 'videoeditor', group: 'video', desc: 'Editor de textos de video: subís un video, detecta todos sus textos y los editás sobre la imagen. En el navegador abre el editor.', media: 'json', params: [] },
    { id: 'videotext', group: 'video', desc: 'Analiza un video (OCR local) y devuelve cada texto con su caja, su intervalo de tiempo y su confianza.', media: 'json', params: [
      O('url', 'https://…/video.mp4', 'Video público a analizar (si no, subilo desde el editor)'),
      S('fps', '1', 'Fotogramas por segundo a leer (0.5 - 3; se ajusta solo en videos largos)', ['0.5', '1', '2', '3']),
      O('minConfidence', '45', 'Confianza mínima del OCR (0 - 95)'),
      O('maxFrames', '40', 'Fotogramas máximos a analizar (4 - 40)')
    ] },
    { id: 'videotextrender', group: 'video', desc: 'Tapa los textos originales y dibuja los nuevos con ffmpeg. Devuelve el MP4 editado.', media: 'video', params: [
      O('id', '', 'Id que devolvió /canvas/videotext (el video queda 45 min en memoria)'),
      O('url', '', 'O un video público directo'),
      P('text', 'Texto nuevo', 'Texto a dibujar (o mandá "texts" con la lista completa)'),
      O('start', '0', 'Desde qué segundo se ve'),
      O('end', '3', 'Hasta qué segundo se ve'),
      O('x', '0.1', 'Posición horizontal (0 - 1)'),
      O('y', '0.7', 'Posición vertical (0 - 1)'),
      O('w', '0.4', 'Ancho de la caja (0 - 1)'),
      O('h', '0.1', 'Alto de la caja (0 - 1)'),
      O('color', 'ffd166', 'Color del texto (hex sin #)'),
      O('bgColor', '', 'Color del parche (vacío = lo toma del fondo del video)')
    ] }
  ]
};
