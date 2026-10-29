// src/canvas/generators/messengerquote.js — messengerquote
// Captura de Messenger: barra de reacciones (❤ 👍 👎 HAHA !!) + globo gris +
// menú (Reply / Copy / Translate / Speak / More…). El globo crece con el texto
// y el menú baja solo. Medidas: src/canvas/layouts.js → messengerquote.
const { chatBubble } = require('./_chat');

module.exports = q => chatBubble('messengerquote', q, {
  defaultText: 'You are literally the most unique item in this universe'
});
