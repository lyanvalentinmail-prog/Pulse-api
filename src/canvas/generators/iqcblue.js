// src/canvas/generators/iqcblue.js — iqcblue
// Captura de iMessage (fondo azul): barra de reacciones + globo + menú con
// "Reply / Copy / Report". El globo crece con el texto; el menú baja solo.
// Medidas: src/canvas/layouts.js → iqcblue. Motor: ./_chat.js

// Guía: README.md → "Cómo agregar o editar un endpoint".
const { chatBubble } = require('./_chat');

module.exports = q => chatBubble('iqcblue', q, { defaultText: 'what if I’m in love with you?' });
