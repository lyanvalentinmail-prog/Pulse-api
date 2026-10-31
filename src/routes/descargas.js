// src/routes/descargas.js — Router de la categoría **DESCARGAS**.
//
//   GET /descargas/tiktok      ?url=…
//   GET /descargas/pinterest   ?url=…
//   GET /descargas/instagram   ?url=…
//   GET /descargas/facebook    ?url=…
//   GET /descargas/spotify     ?url=…
//   GET /descargas/youtubemp4  ?url=…
//   GET /descargas/youtubemp3  ?url=…
//   GET /descargas/audio       ?url=…        (cualquier archivo → MP3)
//
// Todos aceptan `?direct=true` para recibir el archivo (con Range) en vez del JSON.
const express = require('express');
const E = require('../utils/extract');
const { networkMessage } = require('../utils/http');
const { sendSuccess, sendError, sendMedia, proxyStream } = require('../utils/response');

const router = express.Router();
const jsonBody = express.json({ limit: '1mb' });

const truthy = v => ['true', '1', 'yes', 'si', 'sí'].includes(String(v || '').toLowerCase());

/** Parámetros de la petición: query string + cuerpo JSON. */
function params(req) {
  const body = req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body : {};
  return { ...req.query, ...body };
}

function fail(res, e) {
  const status = Number(e.status) || 502;
  if (e.details) console.warn('[descargas]', e.message, '→', e.details.slice(-3).join(' | '));
  else console.warn('[descargas]', e.message);
  const friendly = networkMessage(e);
  return sendError(res, friendly ? 502 : status, friendly || e.message,
    e.hint || (friendly ? 'La red del servidor no puede llegar a esa fuente; reintentá en unos segundos' : undefined));
}

/** Respuesta común de un resolvedor: JSON o el archivo directo. */
async function respond(req, res, data, { filename, directUrl }) {
  const q = params(req);
  if (truthy(q.direct) || truthy(q.dl)) {
    if (!directUrl) return sendError(res, 404, 'Esta fuente no tiene un archivo directo', 'Quitá ?direct=true para ver los datos');
    return proxyStream(req, res, directUrl, { filename: filename || 'pulse-media' });
  }
  return sendSuccess(res, data);
}

// --------------------------------------------------------------- TikTok
async function tiktok(req, res, q) {
  const data = await E.tiktok(q.url);
  return respond(req, res, { ...data, endpoint: 'tiktok' }, {
    directUrl: data.video,
    filename: `pulse-tiktok-${data.id || 'video'}.mp4`
  });
}

// ------------------------------------------------------------ Pinterest
async function pinterest(req, res, q) {
  const data = await E.pinterest(q.url);
  const direct = data.type === 'video' ? data.video : data.image;
  return respond(req, res, { ...data, endpoint: 'pinterest' }, {
    directUrl: direct,
    filename: `pulse-pinterest.${data.type === 'video' ? 'mp4' : 'jpg'}`
  });
}

// ------------------------------------------------------------ Instagram
async function instagram(req, res, q) {
  const data = await E.instagram(q.url);
  return respond(req, res, { ...data, endpoint: 'instagram' }, {
    directUrl: data.video || data.image,
    filename: `pulse-instagram-${data.shortcode || 'post'}.${data.type === 'video' ? 'mp4' : 'jpg'}`
  });
}

// ------------------------------------------------------------- Facebook
async function facebook(req, res, q) {
  const data = await E.facebook(q.url);
  return respond(req, res, { ...data, endpoint: 'facebook' }, {
    directUrl: data.videoHd || data.video,
    filename: 'pulse-facebook.mp4'
  });
}

// -------------------------------------------------------------- Spotify
async function spotify(req, res, q) {
  const data = await E.spotify(q.url);
  return respond(req, res, {
    ...data,
    endpoint: 'spotify',
    note: data.preview ? 'Spotify sólo entrega 30 s de preview sin cuenta premium' : 'Sin preview disponible para este enlace'
  }, {
    directUrl: data.preview,
    filename: 'pulse-spotify-preview.mp3'
  });
}

// -------------------------------------------------------------- YouTube
async function youtube(req, res, q, mode) {
  const data = await E.youtube(q.url, mode);
  const direct = data.download || (mode === 'audio' ? data.audio : data.video);
  return respond(req, res, {
    id: data.id,
    mode,
    title: data.title,
    author: data.author,
    duration: data.duration,
    thumbnail: data.thumbnail,
    source: data.source,
    download: direct,
    endpoint: mode === 'audio' ? 'youtubemp3' : 'youtubemp4'
  }, {
    directUrl: direct,
    filename: `pulse-youtube-${data.id}.${mode === 'audio' ? 'mp3' : 'mp4'}`
  });
}

// ----------------------------------------------------------------- Audio
async function audio(req, res, q) {
  const url = E.normalizeUrl(q.url, { label: 'url' });
  if (!(truthy(q.direct) || truthy(q.dl))) {
    return sendSuccess(res, {
      endpoint: 'audio',
      url,
      note: 'Agregá ?direct=true para bajar el MP3 convertido (ffmpeg)',
      download: `${req.baseUrl}/audio?url=${encodeURIComponent(url)}&direct=true`
    });
  }
  const mp3 = await E.toMp3(url);
  return sendMedia(res, mp3, 'audio/mpeg', 'pulse-audio.mp3');
}

// ---------------------------------------------------------------- router
const HANDLERS = {
  tiktok,
  pinterest,
  instagram,
  facebook,
  spotify,
  youtubemp3: (req, res, q) => youtube(req, res, q, 'audio'),
  youtubemp4: (req, res, q) => youtube(req, res, q, 'video'),
  audio
};

async function handle(req, res) {
  const id = String(req.params.id || '').toLowerCase();
  const fn = HANDLERS[id];
  if (!fn) {
    return sendError(res, 404, `Descarga "${id}" no existe`,
      `Disponibles: ${Object.keys(HANDLERS).join(', ')} — mirá /descargas`);
  }
  const q = params(req);
  if (!String(q.url || '').trim()) {
    return sendError(res, 400, 'Falta el parámetro url', 'Ejemplo: /descargas/tiktok?url=https://www.tiktok.com/@user/video/123');
  }
  try {
    return await fn(req, res, q);
  } catch (e) {
    return fail(res, e);
  }
}

router.get('/:id', handle);
router.post('/:id', jsonBody, handle);

module.exports = router;
module.exports.HANDLERS = Object.keys(HANDLERS);
