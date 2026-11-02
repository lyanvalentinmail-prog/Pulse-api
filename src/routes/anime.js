// src/routes/anime.js — Router de la categoría **ANIME**.
//
//   GET|POST /anime/animeinfo ?q=naruto        ficha de anime (Jikan)
//   GET|POST /anime/mangainfo ?q=berserk       ficha de manga (Jikan)
//   GET|POST /anime/gacha                     tirada con rareza + imagen SFW
//   GET|POST /anime/pokemon   ?name=pikachu    datos y descripción (PokéAPI)
//   GET|POST /anime/waifu     ?count=1         imagen SFW
//   GET|POST /anime/maid      ?count=1         imagen SFW
//   GET|POST /anime/neko      ?count=1         imagen SFW
//
// **Filtro NSFW siempre activo**: las búsquedas van con `sfw=true` y se descartan
// las fichas con rating «Rx» o géneros Hentai/Erotica; las imágenes salen sólo de
// categorías SFW de sus APIs.
const express = require('express');
const A = require('../utils/anime');
const { networkMessage } = require('../utils/http');
const { sendSuccess, sendError } = require('../utils/response');
const { findEndpoint } = require('../catalog');

const router = express.Router();
const jsonBody = express.json({ limit: '1mb' });

const ALLOWED = new Set(['animeinfo', 'mangainfo', 'gacha', 'pokemon', 'waifu', 'maid', 'neko']);

function params(req) {
  const body = req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body : {};
  return { ...req.query, ...body };
}

function fail(res, id, e) {
  const status = Number(e.status) || 502;
  if (status >= 500) console.warn(`[anime/${id}]`, e.message, e.details ? `→ ${e.details.slice(-2).join(' | ')}` : '');
  else console.warn(`[anime/${id}]`, e.message);
  const friendly = status >= 500 ? networkMessage(e) : '';
  return sendError(res, friendly ? 502 : status, friendly || e.message,
    e.hint || (friendly ? 'La fuente no respondió desde el servidor; reintentá en unos segundos' : undefined));
}

async function animeinfo(req, res, q) {
  const query = A.readQuery(q.q || q.query || q.anime || q.title, { example: '?q=naruto' });
  const limit = A.readLimit(q.limit, 5, 20);
  return sendSuccess(res, await A.animeInfo(query, limit));
}

async function mangainfo(req, res, q) {
  const query = A.readQuery(q.q || q.query || q.manga || q.title, { example: '?q=berserk' });
  const limit = A.readLimit(q.limit, 5, 20);
  return sendSuccess(res, await A.mangaInfo(query, limit));
}

async function pokemon(req, res, q) {
  return sendSuccess(res, await A.pokemon(q.name || q.pokemon || q.id));
}

async function gacha(req, res, q) {
  return sendSuccess(res, { endpoint: 'gacha', ...(await A.gacha({ kind: q.kind || q.category || q.type })) });
}

/** waifu / maid / neko comparten el mismo manejador. */
const imageHandler = id => async (req, res, q) => {
  const count = A.readLimit(q.count, 1, 10);
  const data = await A.images(id, count);
  if (count === 1) return sendSuccess(res, { endpoint: id, ...data });
  return sendSuccess(res, { endpoint: id, ...data });
};

const HANDLERS = {
  animeinfo,
  mangainfo,
  gacha,
  pokemon,
  waifu: imageHandler('waifu'),
  maid: imageHandler('maid'),
  neko: imageHandler('neko')
};

async function handle(req, res) {
  const id = String(req.params.id || '').toLowerCase();
  if (!ALLOWED.has(id) || !findEndpoint('anime', id)) {
    return sendError(res, 404, `Endpoint de anime "${id}" no existe`,
      `Disponibles: ${[...ALLOWED].join(', ')} — mirá /anime`);
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
module.exports.ANIME = [...ALLOWED];
