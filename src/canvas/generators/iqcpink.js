// src/canvas/generators/iqcpink.js — iqcpink
// Igual que iqcblue pero con el fondo rosa y el menú largo (Reply / Forward /
// Copy / …). Medidas: src/canvas/layouts.js → iqcpink.
const { chatBubble } = require('./_chat');

module.exports = q => chatBubble('iqcpink', q, { defaultText: 'Ur so pretty!!💗' });
