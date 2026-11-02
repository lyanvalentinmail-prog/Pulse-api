// src/catalog/herramientas.js — Ficha de la categoría **HERRAMIENTAS**.
//
// ▸ AGREGAR una herramienta (2 pasos):
//   1) la lógica en src/utils/herramientas.js y el handler en src/routes/herramientas.js
//   2) la ficha (desc + params) acá
const { P, O, S } = require('./helpers');

module.exports = {
  id: 'herramientas',
  name: 'HERRAMIENTAS',
  desc: 'Utilidades: emojis mezclados, países, clima, morse, traductor y Minecraft',
  endpoints: [
    { id: 'emojimix', desc: 'Mezcla dos emojis con Emoji Kitchen de Google (si no existe la combinación, la compone con el set local).', media: 'image', params: [
      P('emoji1', '😂', 'Primer emoji (uno solo, sin secuencias)'),
      P('emoji2', '🥰', 'Segundo emoji'),
      O('direct', 'false', 'true = devuelve el PNG en lugar del JSON')
    ] },
    { id: 'country', desc: 'Ficha de un país: capital, región, población, moneda, idiomas, bandera y vecinos.', media: 'json', params: [
      O('q', 'Argentina', 'Nombre del país (restcountries usa nombres en inglés: Argentina, Spain, Japan)'),
      O('code', '', 'Código ISO de dos letras (AR, ES, JP); tiene prioridad sobre q')
    ] },
    { id: 'weather', desc: 'Clima actual y pronóstico de 7 días de Open-Meteo (sin clave).', media: 'json', params: [
      O('city', 'Maldonado', 'Ciudad o localidad'),
      O('lat', '', 'Latitud (si no se manda ciudad)'),
      O('lon', '', 'Longitud (junto con lat)')
    ] },
    { id: 'morse', desc: 'Codifica texto a morse y decodifica morse a texto (sin mode se detecta solo).', media: 'json', params: [
      P('text', 'SOS', 'Texto a codificar o morse a decodificar (… --- …)'),
      S('mode', 'auto', 'auto detecta; encode siempre codifica y decode siempre decodifica', ['auto', 'encode', 'decode'])
    ] },
    { id: 'translate', desc: 'Traduce texto a otro idioma (Google, Lingva o MyMemory). Por defecto traduce a inglés.', media: 'json', params: [
      P('text', 'Hola, ¿cómo estás?', 'Texto a traducir (máx. 2000 caracteres)'),
      O('to', 'en', 'Idioma destino (es, en, pt, fr, ja, zh-CN…)'),
      O('from', 'auto', 'Idioma origen; auto lo detecta')
    ] },
    { id: 'traductor', desc: 'Igual que translate pero traduce al español por defecto.', media: 'json', params: [
      P('text', 'Hello, how are you?', 'Texto a traducir'),
      O('to', 'es', 'Idioma destino (por defecto español)'),
      O('from', 'auto', 'Idioma origen; auto lo detecta')
    ] },
    { id: 'minecraft', desc: 'Últimas versiones de Minecraft (Bedrock por defecto) desde los tags de Mojang, con respaldo en mcpedl.org.', media: 'json', params: [
      S('edition', 'bedrock', 'Edición: bedrock, java o all', ['bedrock', 'java', 'all']),
      O('limit', '10', 'Cuántas versiones devolver (1 - 50)')
    ] }
  ]
};
