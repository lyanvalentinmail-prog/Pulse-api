// src/catalog/ia.js — Ficha de la categoría **IA**.
//
// ▸ AGREGAR un modelo: el handler va en src/routes/ia.js y la ficha acá.
//   Las claves NUNCA se escriben en el repo: se leen de GEMINI_API_KEY o de
//   secrets.local.json (ver src/config.js).
const { P, O, S } = require('./helpers');
const { STYLE_NAMES, RESOLUTIONS, PROVIDERS } = require('../utils/perchance');

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
    ] },
    // La imagen sale de la API de Perchance (perchance.org/apigen). Devuelve el
    // archivo (JPEG) y, con ?format=json, el sobre JSON con la imagen en base64.
    { id: 'image', desc: 'Convierte un texto en imagen con la IA de Perchance (perchance.org/apigen). Devuelve la imagen directa; con ?format=json, los datos + base64.', media: 'image', params: [
      P('prompt', 'un gato astronauta flotando en la luna, estilo anime', 'Qué querés que dibuje la IA (en inglés sale mejor)'),
      S('style', 'cinematic', 'Estilo artístico: se suma al prompt', STYLE_NAMES),
      S('resolution', '768x768', 'Tamaño de la imagen', RESOLUTIONS),
      O('seed', '42', 'Semilla: mismo prompt + semilla ≈ misma imagen (vacío = al azar)'),
      O('negativePrompt', '', 'Lo que NO querés que aparezca'),
      O('guidance', '7', 'Qué tanto sigue el prompt (1 - 30)'),
      S('provider', 'auto', 'auto = Perchance con respaldo Pollinations; o forzar uno', PROVIDERS)
    ] }
  ]
};
