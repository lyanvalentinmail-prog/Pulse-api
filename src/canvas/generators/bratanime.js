// src/canvas/generators/bratanime.js — bratanime
// Todos comparten la misma estructura de partes: sign (dónde va el cartel) y
// text (tipografía, color y si hay que borrar el texto de ejemplo).

// Guía: README.md → "Cómo agregar o editar un endpoint".
const {
  signPart
} = require('./_helpers');

module.exports = q => signPart('bratanime', q);
