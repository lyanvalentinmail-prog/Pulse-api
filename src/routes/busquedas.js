// src/routes/busquedas.js — Router de la categoría **BUSQUEDAS**.
//
//   GET /busquedas/pinterest    ?q=…
//   GET /busquedas/tiktok       ?q=…
//   GET /busquedas/youtube      ?q=…
//   GET /busquedas/wallpapers   ?q=…   (besthdwallpapers.org)
//   GET /busquedas/wallpapersv2 ?q=…   (motionbgs.com, fondos en movimiento)
//   GET /busquedas/stickerly    ?q=…   (stickers de WhatsApp)
//   GET /busquedas/wiki        ?q=…&lang=es          (Wikipedia)
//   GET /busquedas/playstore   ?q=…&country=us       (apps de Google Play)
//   GET /busquedas/aptoide     ?q=…                  (apps de Aptoide)
//   GET /busquedas/appstore    ?q=…&country=us       (apps de la App Store)
//   GET /busquedas/play        ?name=…&author=…      (canción + audio reproducible)
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
const itemRef = item => crypto.createHash('sha256').update(String(item.id || item.link || item.page || item.video || item.audio || item.image || item.preview || item.thumbnail || item.cover || '')).digest('hex').slice(0, 24);
// Claves donde puede venir el archivo de un resultado (video, audio o imagen).
const mediaKey = item => item.video || item.audio || item.image || item.preview || item.thumbnail || item.cover || '';

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
  stickerly: { label: 'Stickerly', run: (q, limit) => S.stickerly(q, limit), hint: 'Buscá packs por nombre: ?q=gatitos' },
  wiki: { label: 'Wikipedia', run: (q, limit, ctx) => S.wiki(q, limit, ctx), hint: 'Cambiá de idioma con &lang=en (o es, pt…)', query: { label: 'q', example: '?q=Eniac' }, keep: ['lang'] },
  playstore: { label: 'Google Play', run: (q, limit, ctx) => S.playstore(q, limit, ctx), hint: 'Probá con el nombre de la app; la tienda acepta &country=US', query: { label: 'q', example: '?q=whatsapp' }, keep: ['country', 'lang'] },
  aptoide: { label: 'Aptoide', run: (q, limit) => S.aptoide(q, limit), hint: 'Buscá por nombre o package: ?q=whatsapp' },
  appstore: { label: 'App Store', run: (q, limit, ctx) => S.appstore(q, limit, ctx), hint: 'Probá en inglés o cambiá de tienda con &country=es', keep: ['country'] },
  play: {
    label: 'Play',
    run: (q, limit, ctx) => S.play(q, limit, ctx),
    hint: 'Se reproduce un preview de 30 s; agregá &author=Artista para afinar la búsqueda',
    query: { label: 'name', example: '?name=Bohemian%20Rhapsody&author=Queen' },
    keep: ['author']
  }
};

async function handle(req, res) {
  const id = String(req.params.id || '').toLowerCase();
  const source = Object.hasOwn(SOURCES, id) ? SOURCES[id] : null;
  if (!source) {
    return sendError(res, 404, `Búsqueda "${id}" no existe`,
      `Disponibles: ${Object.keys(SOURCES).join(', ')} — mirá /busquedas`);
  }
  const q = params(req);
  try {
    const query = source.query
      ? S.readQuery(id === 'play' ? (q.name || q.q || q.query || q.title) : (q.q || q.query || q.text), source.query)
      : S.readQuery(q.q || q.query || q.text);
    const limit = S.readLimit(q.limit, 10, 30);
    const data = await source.run(query, limit, q);
    const items = data.items || [];
    if (['true', '1'].includes(String(q.direct || '').toLowerCase())) {
      const index = Number(q.index);
      if (!Number.isInteger(index) || index < 0 || (!q.ref && index >= items.length)) {
        return sendError(res, 400, 'Índice de resultado inválido', 'Usá index desde 0 hasta el último resultado');
      }
      const item = q.ref ? items.find(candidate => itemRef(candidate) === q.ref) : items[index];
      if (!item) return sendError(res, 404, 'El resultado ya no está disponible', 'Volvé a buscar para obtener enlaces actualizados');
      const url = id === 'youtube' ? (await E.youtube(item.link, 'video')).download : mediaKey(item);
      if (!url) return sendError(res, 404, 'Este resultado no tiene un archivo disponible');
      const headers = id === 'pinterest' ? { Referer: 'https://www.pinterest.com/' }
        : id === 'tiktok' ? { Referer: /(^|\.)tikwm\.com$/i.test(new URL(url).hostname) ? 'https://www.tikwm.com/' : 'https://www.tiktok.com/' } : {};
      return await proxyStream(req, res, url, { filename: `pulse-${id}-${index}`, headers });
    }
    // Sólo se exponen enlaces a medios asociados al resultado, no un proxy de URLs arbitrarias.
    const enriched = items.map((item, index) => {
      if (!(id === 'youtube' ? item.link : mediaKey(item))) return item;
      const queryString = new URLSearchParams({ q: query, limit: String(limit), index: String(index), ref: itemRef(item), direct: 'true' });
      // Los parámetros que cambian los resultados (idioma, país, autor) viajan en
      // el enlace de reproducción: si no, la búsqueda devolvería otros resultados.
      for (const key of source.keep || []) {
        if (q[key] !== undefined && q[key] !== '') queryString.set(key, String(q[key]));
      }
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
