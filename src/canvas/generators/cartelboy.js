// src/canvas/generators/cartelboy.js — cartelboy

// Guía: README.md → "Cómo agregar o editar un endpoint".
const {
  signPart
} = require('./_helpers');

module.exports = q => signPart('cartelboy', q, { defaultText: 'tu texto aquí' });
