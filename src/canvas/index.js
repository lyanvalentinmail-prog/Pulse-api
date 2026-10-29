// src/canvas/index.js — Registro de canvas y punto de entrada del render.
const { GENERATORS } = require('./generators');
const C = require('./core');

const CANVAS_IDS = Object.keys(GENERATORS).filter(id => typeof GENERATORS[id] === 'function' && !id.startsWith('_'));

async function generateCanvas(id, query) {
  const fn = GENERATORS[String(id).toLowerCase()];
  if (typeof fn !== 'function') return null;
  return fn(query || {});
}

module.exports = {
  generateCanvas, GENERATORS, CANVAS_IDS,
  styleOf: C.styleOf, txt: C.txt,
  placeTextArea: C.placeTextArea, placeImageArea: C.placeImageArea,
  chromaInsert: C.chromaInsert, holeInsert: C.holeInsert, holeMask: C.holeMask,
  holeLayer: C.holeLayer, faceCanvas: C.faceCanvas, innerShade: C.innerShade,
  expandLayer: C.expandLayer
};
