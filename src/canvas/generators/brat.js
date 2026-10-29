// src/canvas/generators/brat.js — Sticker brat basado en la referencia de Drive.
const { txt } = require('./_helpers');
const { bratSpec, renderBrat } = require('../../utils/brat');

module.exports = async function brat(q = {}) {
  return renderBrat(txt(q, 'Welcome to Velirius API'), bratSpec(q));
};
