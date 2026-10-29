// src/canvas/generators/ship.js — medidor de compatibilidad (ship)
// Solo cambia el "tipo": la lógica vive en _helpers.js → meter(kind, q).
//   /canvas/ship?name1=Ana&name2=Luis&percentage=88&image1=...&image2=...
const {
  meter
} = require('./_helpers');

module.exports = q => meter('ship', q);
