// Efectos de audio: el resultado es un MP3 reproducible y descargable.
const express = require('express');
const { effects, processAudio } = require('../utils/audioEffects');
const { sendError, sendMedia } = require('../utils/response');
const { networkMessage } = require('../utils/http');

const router = express.Router();
const jsonBody = express.json({ limit: '1mb' });

async function handle(req, res) {
  const id = String(req.params.id || '').toLowerCase();
  if (!Object.hasOwn(effects, id)) return sendError(res, 404, 'Efecto de audio no encontrado');
  const body = req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body : {};
  const params = { ...req.query, ...body };
  try {
    const audio = await processAudio(id, params);
    return sendMedia(res, audio, 'audio/mpeg', `pulse-${id}.mp3`);
  } catch (e) {
    const status = Number(e.status) || 502;
    return sendError(res, status, networkMessage(e) || e.message || 'No se pudo procesar el audio');
  }
}
router.get('/:id', handle);
router.post('/:id', jsonBody, handle);
module.exports = router;
