// src/routes/audios.js — Router de la categoría **AUDIOS**.
//
// Montado en src/server.js como /audios. Está vacío a propósito: todavía no
// publica ningún endpoint, así que cualquier /audios/... cae en el 404 general.
//
// ➕ AGREGAR un endpoint (3 pasos):
//   1) escribí el handler acá abajo          → router.get('/<id>', ...)
//   2) agregá la ficha en src/catalog/audios.js
//   3) corré `npm run check`
//
// Forma de un handler JSON (todos los endpoints usan el mismo sobre de respuesta):
//
//   const config = require('../config');
//   const { sendError } = require('../utils/response');
//
//   router.get('/hola', (req, res) => {
//     const { text } = req.query;
//     if (!text) return sendError(res, 400, 'Falta el parámetro text');
//     return res.json({ creator: config.creator, status: true, result: { text } });
//   });
const express = require('express');

const router = express.Router();
const config = require('../config');
const { sendError } = require('../utils/response');

// Helper para simular el procesamiento (en producción iría a los servicios reales)
const processAudio = (type, params) => {
  // Simulación de respuesta JSON genérica para efectos de audio
  return {
    creator: config.creator,
    status: true,
    result: {
      type,
      params,
      message: `Efecto ${type} aplicado con éxito`,
      audioUrl: `https://example.com/audio/${type}.mp3` // Placeholder
    }
  };
};

router.get('/robot', (req, res) => {
  const { text, pitch = '1.0' } = req.query;
  if (!text) return sendError(res, 400, 'Falta el parámetro text');
  return res.json(processAudio('robot', { text, pitch }));
});

router.get('/reverse', (req, res) => {
  const { text, speed = '1.0' } = req.query;
  if (!text) return sendError(res, 400, 'Falta el parámetro text');
  return res.json(processAudio('reverse', { text, speed }));
});

router.get('/demon', (req, res) => {
  const { text, intensity = '1.0' } = req.query;
  if (!text) return sendError(res, 400, 'Falta el parámetro text');
  return res.json(processAudio('demon', { text, intensity }));
});

router.get('/bass', (req, res) => {
  const { text, gain = '1.0' } = req.query;
  if (!text) return sendError(res, 400, 'Falta el parámetro text');
  return res.json(processAudio('bass', { text, gain }));
});

router.get('/underwater', (req, res) => {
  const { text, depth = '1.0' } = req.query;
  if (!text) return sendError(res, 400, 'Falta el parámetro text');
  return res.json(processAudio('underwater', { text, depth }));
});

router.get('/echo', (req, res) => {
  const { text, delay = '0.5', decay = '0.5' } = req.query;
  if (!text) return sendError(res, 400, 'Falta el parámetro text');
  return res.json(processAudio('echo', { text, delay, decay }));
});

router.get('/chipmunk', (req, res) => {
  const { text, pitch = '2.0' } = req.query;
  if (!text) return sendError(res, 400, 'Falta el parámetro text');
  return res.json(processAudio('chipmunk', { text, pitch }));
});

router.get('/distortion', (req, res) => {
  const { text, level = '0.5' } = req.query;
  if (!text) return sendError(res, 400, 'Falta el parámetro text');
  return res.json(processAudio('distortion', { text, level }));
});

module.exports = router;
