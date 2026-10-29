// src/canvas/generators/index.js — Carga todos los generadores de la carpeta.
//
// ➕ PARA AGREGAR UN CANVAS NUEVO (3 pasos):
//   1) creá `src/canvas/generators/<id>.js` con `module.exports = async (q) => {...}`
//   2) agregá sus medidas por defecto en `src/canvas/layouts.js`
//   3) agregá la ficha en `src/catalog/canvas.js`
//   No hay que tocar este archivo: se detecta solo.
//
// Un archivo que empieza con "_" es de apoyo (por ejemplo `_helpers.js`) y no se
// registra como endpoint.
const fs = require('fs');
const path = require('path');

const GENERATORS = {};

for (const file of fs.readdirSync(__dirname).sort()) {
  if (!file.endsWith('.js') || file.startsWith('_') || file === 'index.js') continue;
  const id = file.slice(0, -3);
  const mod = require(path.join(__dirname, file));
  const fn = typeof mod === 'function' ? mod : mod.default || mod.generate;
  if (typeof fn !== 'function') {
    throw new TypeError(`El generador "${file}" no exporta una función`);
  }
  GENERATORS[id] = fn;
}

module.exports = { GENERATORS };
