// src/routes/upload.js — Subidas desde la web (Galería del probador TEST).
//
//   POST /upload   { "image": "data:image/jpeg;base64,..." }
//        → { creator, status: true, result: { id, url, mime, bytes } }
//   GET  /upload/:id  → la imagen (se puede usar como `?url=`)
//
// Existe para que la foto que elegís de la galería llegue de verdad al canvas:
// los `data:` largos no entran en una URL GET, así que la web los sube acá y
// después usa la URL corta como cualquier otro link.
const express = require('express');
const { save, get } = require('../utils/uploadStore');
const { absoluteUrl } = require('../utils/http');
const { sendError, disposicion } = require('../utils/response');
const { validateImageBuffer } = require('../utils/image');

const router = express.Router();
const jsonBody = express.json({ limit: '21mb' });

// Formatos que aceptamos (lo mismo que entiende sharp).
const ACCEPTED = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif']);

function decodeDataUrl(raw) {
  const value = String(raw || '').trim();
  const m = /^data:([\w/+.-]+);base64,(.*)$/is.exec(value);
  if (!m) return null;
  const mime = m[1].toLowerCase() === 'image/jpg' ? 'image/jpeg' : m[1].toLowerCase();
  if (!ACCEPTED.has(mime)) return null;
  const encoded = m[2].replace(/\s+/g, '');
  if (!/^[a-z0-9+/]*={0,2}$/i.test(encoded) || encoded.length % 4 === 1) return null;
  const buffer = Buffer.from(encoded, 'base64');
  if (!buffer.length) return null;
  return { buffer, mime };
}

router.post('/', jsonBody, async (req, res) => {
  const body = req.body || {};
  const decoded = decodeDataUrl(body.image || body.url || body.data || body.file);
  if (!decoded) {
    return sendError(
      res,
      400,
      'No se recibió ninguna imagen',
      'Manda JSON: { "image": "data:image/jpeg;base64,..." }'
    );
  }
  try {
    const meta = await validateImageBuffer(decoded.buffer);
    const actual = { jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif', heif: 'image/avif' }[meta.format];
    if (actual !== decoded.mime) return sendError(res, 400, 'El tipo de imagen no coincide con el archivo');
  } catch (e) {
    return sendError(res, e.status || 400, e.message, e.hint);
  }
  const { id, mime } = save(decoded.buffer, decoded.mime);
  return res.status(201).json({
    creator: require('../config').creator,
    status: true,
    result: { id, url: absoluteUrl(req, `/upload/${id}`), mime, bytes: decoded.buffer.length }
  });
});

router.get('/:id', (req, res) => {
  const file = get(req.params.id);
  if (!file) {
    return sendError(res, 404, 'Esa imagen ya no está disponible', 'Las subidas duran 30 minutos: vuelve a subirla');
  }
  res.setHeader('Content-Type', file.mime);
  res.setHeader('Content-Length', String(file.buffer.length));
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Content-Disposition', disposicion(req, `velirius-${req.params.id}.${(file.mime.split('/')[1] || 'jpg').replace('jpeg', 'jpg')}`, 'velirius.jpg'));
  return res.status(200).send(file.buffer);
});

module.exports = router;
