// src/canvas/generators/emojimix.js — emojimix
//
// Mezcla dos emojis y devuelve el sticker (Emoji Kitchen de Gboard). Los
// proveedores y el respaldo sin red viven en src/utils/emojimix.js.
//
//   /canvas/emojimix?emoji1=🐱&emoji2=🐶
//   /canvas/emojimix?emoji1=1f431&emoji2=1f436&size=512
const { emojiMix } = require('../../utils/emojimix');

const primero = (q, ...nombres) => {
  for (const n of nombres) {
    const v = String(q[n] ?? '').trim();
    if (v) return v;
  }
  return '';
};

module.exports = async q => {
  const uno = primero(q, 'emoji1', 'emoji', 'e1', 'left', 'a') || '😎';
  // Sin segundo emoji se mezcla el primero consigo mismo (así nunca falla).
  const dos = primero(q, 'emoji2', 'emoji3', 'e2', 'right', 'b') || uno;
  const { buffer } = await emojiMix(uno, dos, { size: q.size ?? q.tamano });
  return buffer;
};
