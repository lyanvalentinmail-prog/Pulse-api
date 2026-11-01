// src/routes/canvas.js — GET /canvas/:id → PNG o MP4.
//
// Los generadores publicados y sus grupos se documentan en el catálogo.
const express = require('express');
const { generateCanvas, txt } = require('../utils/canvasEngine');
const { bratVideo } = require('../utils/video');
const { sendPng, sendMedia, sendError } = require('../utils/response');
const { findEndpoint } = require('../catalog');
const { love: legacyLove } = require('../canvas/generators/_referencias');

const router = express.Router();

// Canvas habilitados; también deben figurar en el catálogo.
const ALLOWED = new Set(['brat', 'bratvideo', 'cartelanime1', 'cartelanime2', 'cartelanime3', 'cartelanime4', 'cartelbob', 'whatsappquote', 'imessagequote', 'imessagetyping', 'perfilchat', 'bratv2']);

// Las imágenes de la galería llegan en el cuerpo (JSON) para no meter un
// `data:` enorme en la URL: POST /canvas/brat  { "text": "..." }
const jsonBody = express.json({ limit: '24mb' });

async function handleCanvas(req, res) {
  const id = String(req.params.id || '').toLowerCase();
  // Se conserva el endpoint anterior para enlaces existentes, sin publicarlo en el catálogo.
  const legacy = id === 'ilove';
  if (!legacy && (!ALLOWED.has(id) || !findEndpoint('canvas', id))) {
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
    const buf = legacy ? await legacyLove(q) : await generateCanvas(id, q);
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
