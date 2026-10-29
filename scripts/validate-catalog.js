// scripts/validate-catalog.js — Revisa el catálogo antes de subir cambios.
//
//   npm run check
//
// Qué comprueba:
//   · que cada categoría tenga id válido y endpoints
//   · que no haya endpoints repetidos dentro de una categoría
//   · que cada endpoint tenga `desc`, `id` en minúsculas y `media` válida
//   · que cada parámetro tenga nombre, tipo (requerido/opcional) y descripción
//   · que no se repitan parámetros dentro del mismo endpoint
//   · que los canvas del catálogo y los del motor (src/canvas) coincidan
//   · que exista el router de cada categoría
const fs = require('fs');
const path = require('path');
const { CATEGORIES } = require('../src/catalog');
const { CANVAS_IDS } = require('../src/utils/canvasEngine');
const { VIDEO_IDS } = require('../src/utils/video');

const MEDIA = new Set([undefined, null, 'image', 'video', 'audio']);
const ROUTES = {
  anime: 'anime.js',
  canvas: 'canvas.js',
  tools: 'tools.js',
  downloader: 'download.js',
  searcher: 'searcher.js',
  reactions: 'reactions.js'
};

const errors = [];
const warnings = [];
const fail = msg => errors.push(msg);
const warn = msg => warnings.push(msg);

let total = 0;
const seenCats = new Set();

for (const cat of CATEGORIES) {
  const where = `categoría "${cat.id}"`;
  if (!cat.id || !/^[a-z][a-z0-9-]*$/.test(cat.id)) fail(`${where}: el id debe ser minúsculas sin espacios`);
  if (seenCats.has(cat.id)) fail(`${where}: categoría repetida`);
  seenCats.add(cat.id);
  if (!cat.name) fail(`${where}: falta "name" (el título que se ve en la web)`);
  if (!Array.isArray(cat.endpoints) || !cat.endpoints.length) fail(`${where}: no tiene endpoints`);

  const routeFile = ROUTES[cat.id];
  if (!routeFile || !fs.existsSync(path.join(__dirname, '..', 'src', 'routes', routeFile))) {
    warn(`${where}: no encontré su router en src/routes (¿categoría nueva sin montar en src/server.js?)`);
  }

  const ids = new Set();
  for (const ep of cat.endpoints || []) {
    total++;
    const at = `${cat.id}/${ep.id}`;
    if (!ep.id) { fail(`${where}: hay un endpoint sin "id"`); continue; }
    if (!/^[a-z0-9][a-z0-9-]*$/.test(ep.id)) fail(`${at}: el id debe ser minúsculas, números o guiones`);
    if (ids.has(ep.id)) fail(`${at}: endpoint repetido en la misma categoría`);
    ids.add(ep.id);
    if (!ep.desc || typeof ep.desc !== 'string') fail(`${at}: falta "desc"`);
    if (!MEDIA.has(ep.media)) fail(`${at}: "media" debe ser image, video o audio`);
    if (!Array.isArray(ep.params)) { fail(`${at}: "params" debe ser un array`); continue; }

    const names = new Set();
    for (const p of ep.params) {
      if (!p || !p.name) { fail(`${at}: hay un parámetro sin "name"`); continue; }
      if (names.has(p.name)) fail(`${at}: parámetro "${p.name}" repetido`);
      names.add(p.name);
      if (typeof p.required !== 'boolean') fail(`${at}: "${p.name}" debe declararse con P() u O()/S()`);
      if (!p.desc) warn(`${at}: el parámetro "${p.name}" no tiene descripción`);
      if (p.options && !Array.isArray(p.options)) fail(`${at}: "${p.name}".options debe ser un array`);
    }
  }
}

// canvas: catálogo ↔ motor
// Acepta los PNG de src/canvas/generators/*.js y los videos de src/utils/video.js.
const canvasCat = CATEGORIES.find(c => c.id === 'canvas');
if (canvasCat) {
  const inCatalog = new Set(canvasCat.endpoints.map(e => e.id));
  const inEngine = new Set([...CANVAS_IDS, ...VIDEO_IDS]);
  for (const id of inCatalog) {
    if (!inEngine.has(id)) fail(`canvas/${id}: está en el catálogo pero no tiene generador (src/canvas/generators/${id}.js)`);
  }
  for (const id of inEngine) if (!inCatalog.has(id)) warn(`canvas/${id}: tiene generador pero no aparece en el catálogo`);
}

for (const w of warnings) console.log(`⚠️  ${w}`);
for (const e of errors) console.log(`❌ ${e}`);

if (errors.length) {
  console.log(`\n${errors.length} error(es) en el catálogo. Revisá el README → "Cómo agregar o editar un endpoint".`);
  process.exit(1);
}

console.log(`✅ Catálogo OK — ${CATEGORIES.length} categorías · ${total} endpoints${warnings.length ? ` · ${warnings.length} aviso(s)` : ''}`);
