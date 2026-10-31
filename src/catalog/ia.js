// src/catalog/ia.js — Ficha de la categoría **IA**.
//
// ▸ AGREGAR un modelo: el handler va en src/routes/ia.js y la ficha acá.
//   Las claves NUNCA se escriben en el repo: se leen de GEMINI_API_KEY o de
//   secrets.local.json (ver src/config.js).
const { P, O, S } = require('./helpers');

module.exports = {
  id: 'ia',
  name: 'IA',
  desc: 'Modelos y utilidades de inteligencia artificial',
  endpoints: [
    { id: 'gemini', desc: 'Pregunta lo que quieras al modelo Gemini de Google (clave del servidor, sin token para el usuario).', media: 'json', params: [
      P('prompt', 'Explica qué es Pulse API en una frase', 'Texto que le mandás al modelo'),
      S('model', 'gemini-2.0-flash', 'Modelo a usar', ['gemini-2.0-flash', 'gemini-1.5-flash', 'gemini-1.5-pro']),
      O('temperature', '0.7', 'Creatividad: 0 = exacto, 2 = muy creativo'),
      O('maxTokens', '1024', 'Máximo de tokens de la respuesta (64 - 4096)')
    ] }
  ]
};
