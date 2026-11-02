// src/routes/random.js — Router de la categoría **RANDOM**.
//
//   GET|POST /random/duck        ?count=1   pato
//   GET|POST /random/dog                    perro
//   GET|POST /random/cat                    gato
//   GET|POST /random/rabbit                 conejo
//   GET|POST /random/squirrel               ardilla
//   GET|POST /random/panda                  panda
//   GET|POST /random/koala                  koala
//   GET|POST /random/babyowl                bebé búho
//   GET|POST /random/capybara               carpincho
//   GET|POST /random/babybear               osito
//   GET|POST /random/baby                   una cría al azar
//
// Devuelve el JSON con la imagen original; `?direct=true` sirve el archivo con
// `Range` (como las descargas) y `?download=true` lo entrega como adjunto.
const express = require('express');
const R = require('../utils/random');
const { networkMessage } = require('../utils/http');
const { sendSuccess, sendError, proxyStream } = require('../utils/response');
const { findEndpoint } = require('../catalog');

const router = express.Router();
const jsonBody = express.json({ limit: '256kb' });
const truthy = v => ['true', '1', 'yes', 'si', 'sí'].includes(String(v || '').toLowerCase());

function params(req) {
  const body = req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body : {};
  return { ...req.query, ...body };
}

async function handle(req, res) {
  const id = String(req.params.id || '').toLowerCase();
  if (!Object.hasOwn(R.ANIMALS, id) || !findEndpoint('random', id)) {
    return sendError(res, 404, `Animal "${id}" no existe`,
      `Disponibles: ${Object.keys(R.ANIMALS).join(', ')} — mirá /random`);
  }
  const q = params(req);
  const count = Math.max(1, Math.min(10, Math.round(Number(q.count)) || 1));
  try {
    const data = await R.randomAnimal(id, count);
    if (truthy(q.direct)) {
      const url = count > 1 ? data.items[0].image : data.image;
      return proxyStream(req, res, url, { filename: `pulse-${id}` });
    }
    if (count === 1) {
      const query = new URLSearchParams({ direct: 'true' });
      return sendSuccess(res, {
        endpoint: id,
        ...data,
        playback: `${req.baseUrl}/${id}?${query}`,
        downloadUrl: `${req.baseUrl}/${id}?${query}&download=true`
      });
    }
    return sendSuccess(res, { endpoint: id, ...data });
  } catch (e) {
    const status = Number(e.status) || 502;
    if (status >= 500) console.warn(`[random/${id}]`, e.message, e.details ? `→ ${e.details.slice(-2).join(' | ')}` : '');
    else console.warn(`[random/${id}]`, e.message);
    const friendly = status >= 500 ? networkMessage(e) : '';
    return sendError(res, friendly ? 502 : status, friendly || e.message,
      e.hint || (friendly ? 'La fuente no respondió desde el servidor; reintentá en unos segundos' : undefined));
  }
}

router.get('/:id', handle);
router.post('/:id', jsonBody, handle);

module.exports = router;
module.exports.ANIMALS = Object.keys(R.ANIMALS);
