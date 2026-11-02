// src/routes/herramientas.js — Router de la categoría **HERRAMIENTAS**.
//
//   GET|POST /herramientas/emojimix  ?emoji1=😂&emoji2=🥰   mezcla dos emojis
//   GET|POST /herramientas/country   ?q=Argentina            ficha del país
//   GET|POST /herramientas/weather   ?city=Maldonado          clima actual + 7 días
//   GET|POST /herramientas/morse     ?text=SOS&mode=encode   morse (y decode)
//   GET|POST /herramientas/translate ?text=hello&to=es       traducir
//   GET|POST /herramientas/traductor ?text=hola&to=en        traducir (alias en español)
//   GET|POST /herramientas/minecraft ?edition=bedrock        últimas versiones
//
// Todos responden el sobre JSON de siempre; `emojimix` puede devolver la imagen
// directamente con `?direct=true`.
const express = require('express');
const H = require('../utils/herramientas');
const { networkMessage } = require('../utils/http');
const { sendSuccess, sendError, sendMedia, proxyStream } = require('../utils/response');
const { findEndpoint } = require('../catalog');

const router = express.Router();
const jsonBody = express.json({ limit: '1mb' });

const ALLOWED = new Set(['emojimix', 'country', 'weather', 'morse', 'translate', 'traductor', 'minecraft']);
const truthy = v => ['true', '1', 'yes', 'si', 'sí'].includes(String(v || '').toLowerCase());

function params(req) {
  const body = req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body : {};
  return { ...req.query, ...body };
}

function fail(res, id, e) {
  const status = Number(e.status) || 502;
  if (status >= 500) console.warn(`[herramientas/${id}]`, e.message, e.details ? `→ ${e.details.slice(-2).join(' | ')}` : '');
  else console.warn(`[herramientas/${id}]`, e.message);
  const friendly = status >= 500 ? networkMessage(e) : '';
  return sendError(res, friendly ? 502 : status, friendly || e.message,
    e.hint || (friendly ? 'La fuente no respondió desde el servidor; reintentá en unos segundos' : undefined));
}

/** Emojimix: dos emojis, o `?emoji=😂🥰` / `?emoji=😂+🥰` como atajo. */
async function emojimix(req, res, q) {
  let first = q.emoji1 || q.emoji_1 || q.first;
  let second = q.emoji2 || q.emoji_2 || q.second;
  const pair = String(q.emoji || q.emojis || '').trim();
  if ((!first || !second) && pair) {
    const parts = Array.from(pair).filter(ch => !/[\s+,\-]/.test(ch));
    const grouped = [];
    for (const ch of parts) {
      const code = ch.codePointAt(0);
      // Los pares de banderas / ZWJ se agrupan solos: acá se pide un emoji por lado.
      if (code >= 0x1f3fb && code <= 0x1f3ff && grouped.length) grouped[grouped.length - 1] += ch;
      else grouped.push(ch);
    }
    if (grouped.length >= 2) { first = first || grouped[0]; second = second || grouped[1]; }
  }
  const data = await H.emojimix(first, second);
  if (truthy(q.direct) || String(q.format || '').toLowerCase() === 'image') {
    if (data.buffer) return sendMedia(res, data.buffer, 'image/png', 'pulse-emojimix.png');
    return proxyStream(req, res, data.image, { filename: 'pulse-emojimix.png' });
  }
  const payload = {
    endpoint: 'emojimix',
    emojis: [String(first).trim(), String(second).trim()],
    image: data.image || '',
    source: data.source,
    date: data.date || ''
  };
  if (data.buffer) {
    // La mezcla local se devuelve embebida (no hay URL pública del PNG).
    payload.image = `data:image/png;base64,${data.buffer.toString('base64')}`;
    payload.note = 'Emoji Kitchen no tiene esa combinación: se compuso localmente con el set de emojis del repo.';
  }
  const query = new URLSearchParams({ emoji1: String(first).trim(), emoji2: String(second).trim(), direct: 'true' });
  payload.playback = `${req.baseUrl}/emojimix?${query}`;
  payload.downloadUrl = `${payload.playback}&download=true`;
  return sendSuccess(res, payload);
}

async function country(req, res, q) {
  return sendSuccess(res, await H.country(q.q || q.name || q.country, { code: q.code || q.iso }));
}

async function weather(req, res, q) {
  return sendSuccess(res, await H.weather({ city: q.city || q.q || q.place, lat: q.lat, lon: q.lon || q.lng }));
}

/** morse: sin `mode` se detecta (morse pegado → decode; texto → encode). */
async function morse(req, res, q) {
  const text = q.text ?? q.q ?? '';
  const mode = String(q.mode || 'auto').trim().toLowerCase();
  if (!['encode', 'decode', 'auto'].includes(mode)) {
    return sendError(res, 400, 'El modo no es válido', 'Usá ?mode=encode o ?mode=decode');
  }
  const value = String(text || '');
  if (!value.trim()) return sendError(res, 400, 'Falta el texto', 'Ejemplo: ?text=SOS&mode=encode o ?text=... --- ...&mode=decode');
  if (value.length > 2000) return sendError(res, 400, 'El texto es demasiado largo (máx. 2000 caracteres)');
  const finalMode = mode === 'auto' ? (H.looksLikeMorse(value) ? 'decode' : 'encode') : mode;
  if (finalMode === 'decode') return sendSuccess(res, { endpoint: 'morse', mode: 'decode', ...H.morseDecode(value) });
  return sendSuccess(res, { endpoint: 'morse', mode: 'encode', ...H.morseEncode(value) });
}

const translator = defaultTo => async (req, res, q) => {
  const data = await H.translate(q.text ?? q.q ?? q.q2, { to: q.to || q.lang || defaultTo, from: q.from || q.source || 'auto' });
  return sendSuccess(res, { endpoint: defaultTo === 'en' ? 'translate' : 'traductor', ...data });
};

async function minecraft(req, res, q) {
  return sendSuccess(res, await H.minecraft({ edition: q.edition || q.type || 'bedrock', limit: q.limit }));
}

const HANDLERS = {
  emojimix,
  country,
  weather,
  morse,
  translate: translator('en'),
  traductor: translator('es'),
  minecraft
};

async function handle(req, res) {
  const id = String(req.params.id || '').toLowerCase();
  if (!ALLOWED.has(id) || !findEndpoint('herramientas', id)) {
    return sendError(res, 404, `Herramienta "${id}" no existe`,
      `Disponibles: ${[...ALLOWED].join(', ')} — mirá /herramientas`);
  }
  try {
    return await HANDLERS[id](req, res, params(req));
  } catch (e) {
    return fail(res, id, e);
  }
}

router.get('/:id', handle);
router.post('/:id', jsonBody, handle);

module.exports = router;
module.exports.TOOLS = [...ALLOWED];
