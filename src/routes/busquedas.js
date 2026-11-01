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
const crypto = require('crypto');
const S = require('../utils/search');
const { networkMessage } = require('../utils/http');
const { sendSuccess, sendError, proxyStream } = require('../utils/response');
const E = require('../utils/extract');

const router = express.Router();
const jsonBody = express.json({ limit: '256kb' });
const itemRef = item => crypto.createHash('sha256').update(String(item.id || item.link || item.page || item.video || item.image || item.preview || item.thumbnail || '')).digest('hex').slice(0, 24);

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
    const items = data.items || [];
    if (['true', '1'].includes(String(q.direct || '').toLowerCase())) {
      const index = Number(q.index);
      if (!Number.isInteger(index) || index < 0 || (!q.ref && index >= items.length)) {
        return sendError(res, 400, 'Índice de resultado inválido', 'Usá index desde 0 hasta el último resultado');
      }
      const item = q.ref ? items.find(candidate => itemRef(candidate) === q.ref) : items[index];
      if (!item) return sendError(res, 404, 'El resultado ya no está disponible', 'Volvé a buscar para obtener enlaces actualizados');
      const url = id === 'youtube' ? (await E.youtube(item.link, 'video')).download :
        (item.video || item.image || item.preview || item.thumbnail || '');
      if (!url) return sendError(res, 404, 'Este resultado no tiene un archivo disponible');
      return await proxyStream(req, res, url, { filename: `pulse-${id}-${index}` });
    }
    // Sólo se exponen enlaces a medios asociados al resultado, no un proxy de URLs arbitrarias.
    const enriched = items.map((item, index) => {
      if (!(id === 'youtube' ? item.link : item.video || item.image || item.preview || item.thumbnail)) return item;
      const queryString = new URLSearchParams({ q: query, limit: String(limit), index: String(index), ref: itemRef(item), direct: 'true' });
      const playback = `${req.baseUrl}/${id}?${queryString}`;
      return { ...item, playback, downloadUrl: `${playback}&download=true` };
    });
    return sendSuccess(res, { endpoint: id, ...data, items: enriched });
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
