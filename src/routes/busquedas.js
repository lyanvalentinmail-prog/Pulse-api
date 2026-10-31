// src/routes/busquedas.js — Router de la categoría **BUSQUEDAS**.
//
//   GET /busquedas/pinterest    ?q=…
//   GET /busquedas/tiktok       ?q=…
//   GET /busquedas/youtube      ?q=…
//   GET /busquedas/wallpapers   ?q=…   (besthdwallpapers.org)
//   GET /busquedas/wallpapersv2 ?q=…   (motionbgs.com, fondos en movimiento)
//   GET /busquedas/stickerly    ?q=…   (stickers de WhatsApp)
//
// Todas aceptan `&limit=` (máx. 30) y responden el sobre de siempre.
const express = require('express');
const S = require('../utils/search');
const { networkMessage } = require('../utils/http');
const { sendSuccess, sendError } = require('../utils/response');

const router = express.Router();
const jsonBody = express.json({ limit: '256kb' });

function params(req) {
  const body = req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body : {};
  return { ...req.query, ...body };
}

const SOURCES = {
  pinterest: { label: 'Pinterest', run: (q, limit) => S.pinterest(q, limit), hint: 'Probá con una palabra (por ejemplo ?q=anime)' },
  tiktok: { label: 'TikTok', run: (q, limit) => S.tiktok(q, limit), hint: 'Funciona mejor con frases cortas' },
  youtube: { label: 'YouTube', run: (q, limit) => S.youtube(q, limit), hint: 'Si no responde, reintentá: las instancias públicas se caen seguido' },
  wallpapers: { label: 'Wallpapers', run: (q, limit) => S.wallpapers(q, limit), hint: 'BestHDWallpapers indexa en inglés: ?q=naruto' },
  wallpapersv2: { label: 'WallpapersV2', run: (q, limit) => S.wallpapersV2(q, limit), hint: 'MotionBGs indexa en inglés: ?q=rain' },
  stickerly: { label: 'Stickerly', run: (q, limit) => S.stickerly(q, limit), hint: 'Buscá packs por nombre: ?q=gatitos' }
};

async function handle(req, res) {
  const id = String(req.params.id || '').toLowerCase();
  const source = SOURCES[id];
  if (!source) {
    return sendError(res, 404, `Búsqueda "${id}" no existe`,
      `Disponibles: ${Object.keys(SOURCES).join(', ')} — mirá /busquedas`);
  }
  const q = params(req);
  try {
    const query = S.readQuery(q.q || q.query || q.text);
    const limit = S.readLimit(q.limit, 10, 30);
    const data = await source.run(query, limit);
    return sendSuccess(res, { endpoint: id, ...data });
  } catch (e) {
    const status = Number(e.status) || 502;
    if (e.details) console.warn(`[busquedas/${id}]`, e.message, '→', e.details.slice(-2).join(' | '));
    else console.warn(`[busquedas/${id}]`, e.message);
    const friendly = networkMessage(e);
    return sendError(res, friendly ? 502 : status, friendly || e.message,
      e.hint || (friendly ? 'Reintentá en unos segundos; si sigue igual, la fuente está caída' : source.hint));
  }
}

router.get('/:id', handle);
router.post('/:id', jsonBody, handle);

module.exports = router;
module.exports.SOURCES = Object.keys(SOURCES);
