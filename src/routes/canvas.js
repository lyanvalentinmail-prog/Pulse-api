// src/routes/canvas.js — GET /canvas/:id → PNG o MP4.
//
// Tras la limpieza sólo quedan dos canvas publicados:
//
//   GET /canvas/brat       → PNG   (sticker brat)
//   GET /canvas/bratvideo  → MP4   (palabras que aparecen una por una)
//
// El resto de los generadores se retiró junto con sus endpoints. Para volver a
// publicar uno: agregá su id a `ALLOWED`, su generador en src/canvas/generators
// y su ficha en src/catalog/canvas.js.
const express = require('express');
const { generateCanvas, txt } = require('../utils/canvasEngine');
const { bratVideo } = require('../utils/video');
const { sendPng, sendMedia, sendError } = require('../utils/response');
const { findEndpoint } = require('../catalog');

const router = express.Router();

// Únicos canvas habilitados.
const ALLOWED = new Set(['brat', 'bratvideo']);

// Las imágenes de la galería llegan en el cuerpo (JSON) para no meter un
// `data:` enorme en la URL: POST /canvas/brat  { "text": "..." }
const jsonBody = express.json({ limit: '24mb' });

async function handleCanvas(req, res) {
  const id = String(req.params.id || '').toLowerCase();
  if (!ALLOWED.has(id) || !findEndpoint('canvas', id)) {
    return sendError(res, 404, `Canvas "${id}" no existe`, 'Revisa la lista en /canvas');
  }
  // Parámetros del POST + query string (el body manda).
  const q = { ...req.query, ...(req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body : {}) };
  try {
    if (id === 'bratvideo') {
      // Mismas opciones que /canvas/brat (tipografía y colores) + `words`
      // (cuántas palabras entran por pantalla, 5 por defecto).
      const buf = await bratVideo(txt(q, 'Welcome to Pulse API'), q);
      return sendMedia(res, buf, 'video/mp4', 'pulse-bratvideo.mp4');
    }
    const buf = await generateCanvas(id, q);
    if (!buf) return sendError(res, 404, `Canvas "${id}" no existe`, 'Revisa la lista en /canvas');
    return sendPng(res, buf, `pulse-${id}.png`);
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
