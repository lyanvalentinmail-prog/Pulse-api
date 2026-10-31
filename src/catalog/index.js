// src/catalog/index.js — Catálogo de la API (una lista por categoría).
//
// Alimenta /home, las páginas de categoría, /docs y el probador TEST de la web.
//
// 📁 Cada categoría vive en su propio archivo, así es fácil de leer y editar:
//
//   src/catalog/helpers.js       → P(), O(), S(), AV, AV2, textStyle(), photoStyle()
//   src/catalog/anime.js         → ANIME         (0)   GET /anime/:id
//   src/catalog/canvas.js        → CANVAS        (2)   GET /canvas/:id  (brat, bratvideo)
//   src/catalog/ia.js            → IA            (0)   GET /ia/:id
//   src/catalog/descargas.js     → DESCARGAS     (0)   GET /descargas/:id
//   src/catalog/busquedas.js     → BUSQUEDAS     (0)   GET /busquedas/:id
//   src/catalog/imagenes.js      → IMAGENES      (0)   GET /imagenes/:id
//   src/catalog/herramientas.js  → HERRAMIENTAS  (0)   GET /herramientas/:id
//   src/catalog/juegos.js        → JUEGOS        (0)   GET /juegos/:id
//   src/catalog/audios.js        → AUDIOS        (0)   GET /audios/:id
//
// Los nueve routers están montados en src/server.js y hoy sólo CANVAS publica
// endpoints. El resto son categorías listas para llenar.
//
// ➕ AGREGAR UN ENDPOINT: se hace en 2 pasos.
//    1) el código que responde, en src/routes/<categoría>.js
//    2) la ficha (descripción + parámetros) en src/catalog/<categoría>.js
//    Después corré `npm run check` para validar y ábrelo en la web.
//
// ➕ AGREGAR UNA CATEGORÍA: creá src/catalog/<id>.js copiando otra, importala
//    aquí abajo y sumala a CATEGORIES, y montá su router en src/server.js.
//
// 📖 Tutorial completo:
//    · README.md   → "Cómo agregar o editar un endpoint" (versión corta)
//    · CONTRIBUTING.md (guía paso a paso, con plantillas para copiar)
const anime = require('./anime');
const canvas = require('./canvas');
const ia = require('./ia');
const descargas = require('./descargas');
const busquedas = require('./busquedas');
const imagenes = require('./imagenes');
const herramientas = require('./herramientas');
const juegos = require('./juegos');
const audios = require('./audios');
const { P, O, S, AV, AV2, textStyle, photoStyle } = require('./helpers');

// /home ordena las carpetas por nombre; este orden se conserva en /docs.
const CATEGORIES = [anime, canvas, ia, descargas, busquedas, imagenes, herramientas, juegos, audios];

// ---------- Parámetros "avanzados" (se ocultan tras un botón en la web) ----------
// Los estilos de texto/foto no hacen falta para probar un endpoint: se agrupan
// detrás de "Opciones avanzadas" para que el probador no quede lleno de campos.
const ADVANCED_PARAMS = new Set([
  'color', 'bg', 'size', 'font', 'uppercase', 'x', 'y', 'rotate', 'spacing',
  'zoom', 'grayscale', 'shadow', 'mode', 'align', 'opacity', 'subtext',
  'canvas.size', 'text.align', 'text.weight',
  'lens.stretch', 'lens.aspect', 'lens.radius', 'lens.y'
]);
for (const cat of CATEGORIES) {
  for (const ep of cat.endpoints) {
    for (const p of ep.params) {
      if (ADVANCED_PARAMS.has(String(p.name).toLowerCase())) p.advanced = true;
    }
  }
}

function totals() {
  return {
    routers: CATEGORIES.length,
    endpoints: CATEGORIES.reduce((n, c) => n + c.endpoints.length, 0)
  };
}

function findCategory(id) {
  return CATEGORIES.find(c => c.id === String(id).toLowerCase()) || null;
}

function findEndpoint(categoryId, endpointId) {
  const cat = findCategory(categoryId);
  if (!cat) return null;
  return cat.endpoints.find(e => e.id === String(endpointId).toLowerCase()) || null;
}

function exampleQuery(endpoint, avatarUrl, avatar2Url) {
  const qs = new URLSearchParams();
  for (const p of endpoint.params) {
    if (p.example === '' || p.example === undefined || p.example === null) continue;
    let v = String(p.example);
    if (v === AV) { if (!avatarUrl) continue; v = avatarUrl; }
    if (v === AV2) { if (!avatar2Url) continue; v = avatar2Url; }
    qs.set(p.name, v);
  }
  const s = qs.toString();
  return s ? `?${s}` : '';
}

module.exports = {
  CATEGORIES, ADVANCED_PARAMS, totals, findCategory, findEndpoint, exampleQuery,
  // helpers, por si algún día se declara un endpoint en otro sitio
  P, O, S, AV, AV2, textStyle, photoStyle
};
