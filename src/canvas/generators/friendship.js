// src/canvas/generators/friendship.js — medidor de amistad (friendship)
// Solo cambia el "tipo": la lógica vive en _helpers.js → meter(kind, q).
//   /canvas/friendship?name1=Ana&name2=Luis&percentage=88&image1=...&image2=...
const {
  meter
} = require('./_helpers');

module.exports = q => meter('friendship', q);
