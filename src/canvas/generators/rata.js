// src/canvas/generators/rata.js — rata
// Partes: template + hole/hole1..3 (los huecos donde entra la cara) o photo.

// Guía: README.md → "Cómo agregar o editar un endpoint".
const {
  facePart
} = require('./_helpers');

module.exports = q => facePart('rata', q);
