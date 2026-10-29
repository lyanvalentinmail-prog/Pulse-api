// src/canvas/generators/pov.js — meme "pov: …" sobre tu imagen
//   /canvas/pov?text=cuando%20abres%20la%20api&image=...
// El prefijo y la caja del texto salen de layouts.js (`pov`).

// Guía: README.md → "Cómo agregar o editar un endpoint".
const { captionPart } = require('./_helpers');

module.exports = async function pov(q) {
  return captionPart('pov', q, 'pov:');
};
