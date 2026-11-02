// src/routes/imagenes.js — Router de la categoría **IMAGENES**.
//
//   GET|POST /imagenes/grayscale ?url=…   blanco y negro
//   GET|POST /imagenes/pixel     ?url=…   pixelado (&size=12)
//   GET|POST /imagenes/sepia     ?url=…   tono sepia
//   GET|POST /imagenes/blur      ?url=…   desenfoque (&blur=8)
//   GET|POST /imagenes/invert    ?url=…   negativo
//   GET|POST /imagenes/darkness  ?url=…   oscurece (&level=40)
//   GET|POST /imagenes/gay       ?url=…   overlay de la bandera arcoíris
//
// La imagen llega por `url` (link directo, `/upload/…` o `data:`) o por el cuerpo
// del POST —la web manda ahí las fotos de la Galería—. Devuelve la imagen
// procesada (`image/jpeg` por defecto; `&format=png|webp`), con `download=true`
// como adjunto y soporte de `Range` como el resto de los medios.
const express = require('express');
const { applyEffect, readFormat } = require('../utils/effects');
const { loadImageBuffer } = require('../utils/image');
const { sendMedia, sendError } = require('../utils/response');
const { findEndpoint } = require('../catalog');

const router = express.Router();

// Efectos publicados; cada uno debe estar además en el catálogo.
const ALLOWED = new Set(['grayscale', 'pixel', 'sepia', 'blur', 'invert', 'darkness', 'gay']);

// Las fotos de la Galería llegan en el cuerpo (JSON) para no meter un `data:`
// enorme en la URL.
const jsonBody = express.json({ limit: '24mb' });

const firstValue = (...values) => values.find(v => v !== undefined && v !== null && String(v).trim() !== '');

async function handleEffect(req, res) {
  const id = String(req.params.id || '').toLowerCase();
  if (!ALLOWED.has(id) || !findEndpoint('imagenes', id)) {
    return sendError(res, 404, `Efecto "${id}" no existe`, 'Revisá la lista en /imagenes');
  }
  const body = req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body : {};
  const q = { ...req.query, ...body };
  const image = firstValue(q.url, q.image, q.img, q.images);
  if (!image) {
    return sendError(res, 400, 'Falta la imagen',
      'Pasá ?url=https://…/foto.jpg o subí la foto con el botón Galería (POST con "image")');
  }
  try {
    readFormat(q.format);
    const source = await loadImageBuffer(image);
    const out = await applyEffect(id, source, q);
    return sendMedia(res, out.buffer, out.mime, `pulse-${id}.${out.ext}`);
  } catch (e) {
    // Imagen inválida, parámetro fuera de rango o descarga fallida → 400/404 con pista.
    const status = Number(e.status) || 500;
    if (status < 500) {
      console.warn(`[imagenes/${id}]`, e.message);
      return sendError(res, status, e.message, e.hint);
    }
    console.error(`[imagenes/${id}]`, e.message);
    return sendError(res, 500, 'No se pudo aplicar el efecto', e.message);
  }
}

router.get('/:id', handleEffect);
router.post('/:id', jsonBody, handleEffect);

module.exports = router;
module.exports.EFFECTS = [...ALLOWED];
