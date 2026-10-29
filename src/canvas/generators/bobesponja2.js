// src/canvas/generators/bobesponja2.js — bobesponja2

// Guía: README.md → "Cómo agregar o editar un endpoint".
const {
  signPart
} = require('./_helpers');

module.exports = q => signPart('bobesponja2', q, { defaultText: 'mi tarea' });
