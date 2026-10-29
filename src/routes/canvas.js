// src/routes/canvas.js — GET /canvas/:id → PNG (o MP4/WebM en bratvideo/attp).
// Todos los canvas aceptan parámetros modificables (ver /docs o la web).
const express = require('express');
const { generateCanvas, txt, styleOf } = require('../utils/canvasEngine');
const { bratVideo, attpVideo } = require('../utils/video');
const { sendPng, sendMedia, sendError } = require('../utils/response');
const { findEndpoint } = require('../catalog');

const router = express.Router();

// Nombres viejos → nombre actual (igual al archivo de Drive).
// Se mantienen para que las URLs que ya circulan no se rompan.
const ALIASES = {
  canvatextoxd: 'cartelboy',
  fotopc: 'laptop',
  sebusca: 'searched',
  imagencanba: 'pcquote'
};
const resolveId = id => ALIASES[id] || id;
// Las imágenes de la galería llegan en el cuerpo (JSON) para no meter un
// `data:` enorme en la URL: POST /canvas/quotly  { "text": "...", "image": "data:..." }
const jsonBody = express.json({ limit: '24mb' });

async function handleCanvas(req, res) {
  const pedido = String(req.params.id || '').toLowerCase();
  const id = resolveId(pedido);
  // Parámetros del POST + query string (el body manda).
  const q = { ...req.query, ...(req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body : {}) };
  if (!findEndpoint('canvas', id)) {
    return sendError(res, 404, `Canvas "${id}" no existe`, 'Revisa la lista en /canvas');
  }
  try {
    if (id === 'bratvideo') {
      // Mismas opciones que /canvas/brat (tipografía y colores) + `words`
      // (cuántas palabras entran por pantalla, 5 por defecto).
      const buf = await bratVideo(txt(q, 'Welcome to Velirius API'), q);
      return sendMedia(res, buf, 'video/mp4', 'velirius-bratvideo.mp4');
    }
    if (id === 'attp') {
      const buf = await attpVideo(txt(q, 'Welcome to Velirius'), { size: styleOf(q).scale });
      return sendMedia(res, buf, 'video/webm', 'velirius-attp.webm');
    }
    const buf = await generateCanvas(id, q);
    if (!buf) return sendError(res, 404, `Canvas "${id}" no existe`, 'Revisa la lista en /canvas');
    return sendPng(res, buf, `velirius-${id}.png`);
  } catch (e) {
    // Errores de la imagen que mandó el usuario → 400 con pista, no un 500.
    if (e.status && Number(e.status) < 500) {
      console.warn(`[canvas/${id}]`, e.message);
      return sendError(res, Number(e.status), e.message, e.hint);
    }
    console.error(`[canvas/${id}]`, e.message);
    return sendError(res, 500, 'No se pudo generar el canvas', e.message);
  }
}

router.get('/:id', handleCanvas);
router.post('/:id', jsonBody, handleCanvas);

module.exports = router;
