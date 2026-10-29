// src/canvas/generators/x.js — meme "x: …" sobre tu imagen
//   /canvas/x?text=nadie:%20nada%0Ala%20api:%20funciona&image=...
// El prefijo y la caja del texto salen de layouts.js (`x`).

// Guía: README.md → "Cómo agregar o editar un endpoint".
const { captionPart } = require('./_helpers');

module.exports = async function x(q) {
  return captionPart('x', q, 'x:');
};
