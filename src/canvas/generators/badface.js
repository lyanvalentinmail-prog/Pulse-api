// src/canvas/generators/badface.js — badface

// Guía: README.md → "Cómo agregar o editar un endpoint".
const {
  chromaPart
} = require('./_helpers');

// Tu foto ocupa la pantalla verde de la plantilla; lo que NO es verde
// (lentes, cara, rejas, marco del monitor…) queda encima.
module.exports = q => chromaPart('badface', q);
