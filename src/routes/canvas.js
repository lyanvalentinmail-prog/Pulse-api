// src/routes/canvas.js — Canvas de Pulse API.
//
//   GET  /canvas/brat              → PNG   (sticker brat)
//   GET  /canvas/bratvideo         → MP4   (palabras que aparecen una por una)
//   GET  /canvas/videoeditor       → el editor de textos de video (HTML)
//   POST /canvas/videotext         → analiza un video y devuelve sus textos
//   POST /canvas/videotextrender   → dibuja los textos nuevos y devuelve el MP4
//
// Los canvas dibujados viven en src/canvas/generators (ids en `ALLOWED`). El
// editor de video es otra cosa: no dibuja desde cero, analiza un video que sube
// el usuario con OCR local (src/utils/videoText.js) y lo vuelve a exportar con
// ffmpeg. Sus rutas van antes que `/:id` para no chocar con el 404 genérico.
const fs = require('fs');
const path = require('path');
const express = require('express');
const { generateCanvas, txt } = require('../utils/canvasEngine');
const { bratVideo } = require('../utils/video');
const { sendPng, sendMedia, sendFile, sendError, safeHeaderFilename } = require('../utils/response');
const { findEndpoint } = require('../catalog');
const { absoluteUrl } = require('../utils/http');
const videoStore = require('../utils/videoStore');
const { fetchPublic } = require('../utils/publicFetch');
const {
  scanVideo, renderVideo, grabFrame, looksLikeVideo, VideoTextError, LIMITS
} = require('../utils/videoText');

const router = express.Router();

// Únicos canvas habilitados (los que tienen generador propio).
const ALLOWED = new Set(['brat', 'bratvideo']);

// Las imágenes de la galería llegan en el cuerpo (JSON) para no meter un
// `data:` enorme en la URL: POST /canvas/brat  { "text": "..." }
const jsonBody = express.json({ limit: '24mb' });
// El video viaja crudo (Content-Type: video/*): la web manda el File tal cual,
// sin base64 ni multipart.
const rawVideo = express.raw({ type: ['video/*', 'application/octet-stream'], limit: LIMITS.MAX_BYTES });
const smallJson = express.json({ limit: '2mb' });

const VIDEOEDITOR_HTML = path.join(__dirname, '..', '..', 'public', 'videoeditor.html');

function q(req) {
  const body = req.body && typeof req.body === 'object' && !Array.isArray(req.body) && !Buffer.isBuffer(req.body) ? req.body : {};
  return { ...req.query, ...body };
}

// =================================================================== editor
/**
 * GET /canvas/videoeditor
 * En el navegador devuelve la página del editor. Pedido por fetch() (el probador
 * de la web manda Accept: * / *), devuelve un JSON con la info para la API.
 */
router.get('/videoeditor', (req, res) => {
  const accept = String(req.headers.accept || '');
  if (accept.includes('text/html')) {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.send(fs.readFileSync(VIDEOEDITOR_HTML, 'utf-8'));
  }
  return res.json({
    creator: require('../config').creator,
    status: true,
    result: {
      editor: absoluteUrl(req, '/canvas/videoeditor'),
      analyze: { method: 'POST', path: '/canvas/videotext', body: 'video/* crudo, o JSON { "url": "…" }' },
      render: { method: 'POST', path: '/canvas/videotextrender', body: '{ "id" | "url", "texts": [ … ] }' },
      limits: {
        maxBytes: LIMITS.MAX_BYTES,
        maxDuration: LIMITS.MAX_DURATION,
        maxFrames: LIMITS.MAX_FRAMES,
        maxLines: LIMITS.MAX_LINES,
        languages: ['eng']
      },
      how: 'Abrí el editor en el navegador, soltá un video, tocá "Detectar textos" y editá cada bloque antes de exportar.'
    }
  });
});

/** Trae el video de `?url=` o del JSON, validando que sea público (anti-SSRF). */
async function downloadVideo(url) {
  const res = await fetchPublic(url, { headers: { Accept: 'video/*,*/*' } });
  if (!res.ok) {
    res.body?.cancel().catch(() => {});
    throw new VideoTextError(`No se pudo descargar el video (HTTP ${res.status})`, {
      status: 400, code: 'fetch', hint: 'Revisá que el enlace sea público y directo al archivo.'
    });
  }
  const length = Number(res.headers.get('content-length'));
  if (Number.isFinite(length) && length > LIMITS.MAX_BYTES) {
    res.body?.cancel().catch(() => {});
    throw new VideoTextError(`El video supera el máximo (${Math.round(LIMITS.MAX_BYTES / 1024 / 1024)} MB)`, { status: 413, code: 'size' });
  }
  const buffer = Buffer.from(await res.arrayBuffer());
  if (buffer.length > LIMITS.MAX_BYTES) {
    throw new VideoTextError(`El video supera el máximo (${Math.round(LIMITS.MAX_BYTES / 1024 / 1024)} MB)`, { status: 413, code: 'size' });
  }
  return buffer;
}

/** De dónde sale el video de esta petición: subida cruda, ?upload= o ?url=. */
async function sourceVideo(req) {
  if (Buffer.isBuffer(req.body) && req.body.length) {
    if (!looksLikeVideo(req.body)) {
      throw new VideoTextError('El archivo no parece un video', {
        status: 400, code: 'type', hint: 'Formatos: MP4 (H.264), WebM, MOV o AVI.'
      });
    }
    const mime = String(req.headers['content-type'] || 'video/mp4').split(';')[0].trim();
    const saved = videoStore.save(req.body, { mime });
    return { ...saved, stored: true, buffer: req.body };
  }

  const params = q(req);
  const uploadId = params.upload || params.id;
  if (uploadId) {
    const item = videoStore.get(uploadId);
    if (!item) {
      throw new VideoTextError('Ese video ya no está en memoria', {
        status: 404, code: 'expired', hint: 'Volvé a subirlo: los videos se guardan 45 minutos.'
      });
    }
    return item;
  }

  if (params.url) {
    const buffer = await downloadVideo(String(params.url));
    const saved = videoStore.save(buffer, { mime: 'video/mp4' });
    return { ...saved, stored: true, buffer };
  }

  throw new VideoTextError('Falta el video', {
    status: 400,
    code: 'missing',
    hint: 'Mandá el archivo en el cuerpo (Content-Type: video/mp4) o un JSON { "url": "https://…/video.mp4" }.'
  });
}

function sendVideoError(res, id, e) {
  const status = Number(e.status) || 502;
  const body = { creator: require('../config').creator, status: false, error: e.message || 'No se pudo procesar el video' };
  if (e.hint) body.hint = e.hint;
  body.endpoint = id;
  console.warn(`[canvas/${id}]`, e.message);
  return res.status(status).json(body);
}

/** Analiza el video (subido, `?upload=` o `?url=`) y devuelve los bloques. */
async function analyzeHandler(req, res) {
  try {
    const params = q(req);
    const source = await sourceVideo(req);
    const scan = await scanVideo(source.file, {
      fps: params.fps,
      minConfidence: params.minConfidence || params.confidence,
      maxFrames: params.maxFrames
    });
    videoStore.setMeta(source.id, { video: scan.video, texts: scan.texts.length });

    res.setHeader('Cache-Control', 'no-store');
    return res.json({
      creator: require('../config').creator,
      status: true,
      result: {
        id: source.id,
        video: scan.video,
        texts: scan.texts,
        scan: scan.scan,
        preview: {
          video: `/canvas/videotext/video/${source.id}`,
          frame: `/canvas/videotext/frame/${source.id}?t=`
        },
        next: `Editá los textos y mandalos a POST /canvas/videotextrender con {"id":"${source.id}","texts":[…]}.`
      }
    });
  } catch (e) {
    return sendVideoError(res, 'videotext', e);
  }
}

// POST con el video en el cuerpo; GET con ?url= o ?upload= (para el navegador).
router.post('/videotext', rawVideo, smallJson, analyzeHandler);
router.get('/videotext', analyzeHandler);

/** GET /canvas/videotext/video/:id — el video subido (con Range para el player). */
router.get('/videotext/video/:id', (req, res) => {
  const item = videoStore.get(req.params.id);
  if (!item) return sendError(res, 404, 'Ese video ya no está en memoria', 'Volvé a subirlo desde /canvas/videoeditor');
  return sendFile(res, item.file, {
    mime: item.mime || 'video/mp4',
    filename: safeHeaderFilename(`pulse-${item.id}.mp4`),
    cache: 'no-store'
  });
});

/** GET /canvas/videotext/frame/:id?t=1.5 — un fotograma en JPEG (vista previa). */
router.get('/videotext/frame/:id', async (req, res) => {
  const item = videoStore.get(req.params.id);
  if (!item) return sendError(res, 404, 'Ese video ya no está en memoria');
  try {
    const t = Math.max(0, Number(req.query.t) || 0);
    const png = await grabFrame(item.file, t);
    const sharp = require('sharp');
    const jpg = await sharp(png).resize({ width: Math.min(1280, LIMITS.FRAME_WIDTH * 1.5), withoutEnlargement: true })
      .jpeg({ quality: 82 }).toBuffer();
    res.setHeader('Cache-Control', 'public, max-age=60');
    res.setHeader('Content-Type', 'image/jpeg');
    return res.status(200).send(jpg);
  } catch (e) {
    return sendError(res, 500, 'No se pudo sacar el fotograma', e.message);
  }
});

/** Normaliza el cuerpo de /videotextrender a una lista de bloques. */
function readTexts(params) {
  let list = params.texts;
  if (typeof list === 'string') {
    try { list = JSON.parse(list); } catch (_) { list = null; }
  }
  // Atajo para GET / curl: un solo bloque por query string.
  if (!Array.isArray(list) && params.text !== undefined) {
    list = [{
      text: params.text,
      start: params.start, end: params.end,
      x: params.x, y: params.y, w: params.w, h: params.h,
      color: params.color, bgColor: params.bgColor, fontSizePct: params.fontSizePct
    }];
  }
  if (!Array.isArray(list) || !list.length) {
    throw new VideoTextError('Falta la lista de textos', {
      status: 400, code: 'texts',
      hint: 'Mandá {"id":"…","texts":[{"text":"nuevo","start":0,"end":3,"box":{"x":0.1,"y":0.2,"w":0.4,"h":0.08}}]}.'
    });
  }
  // Se aceptan las cajas "planas" (x, y, w, h en la raíz) que devuelve la web.
  return list.slice(0, LIMITS.MAX_LINES).map(item => {
    const box = item.box && typeof item.box === 'object'
      ? item.box
      : { x: item.x, y: item.y, w: item.w, h: item.h };
    return { ...item, box };
  }).filter(item => item.box && ['x', 'y', 'w', 'h'].every(key => Number.isFinite(Number(item.box[key]))));
}

/** POST /canvas/videotextrender — dibuja los textos nuevos y devuelve el MP4. */
async function renderHandler(req, res) {
  const dirs = [];
  try {
    const params = q(req);
    const texts = readTexts(params);
    if (!texts.length) {
      return sendError(res, 400, 'Los bloques no tienen posición válida', 'Cada bloque necesita box { x, y, w, h } entre 0 y 1.');
    }

    let file = null;
    if (params.upload || params.id) {
      const item = videoStore.get(params.upload || params.id);
      if (!item) {
        return sendError(res, 404, 'Ese video ya no está en memoria', 'Volvé a subirlo desde /canvas/videoeditor (los videos duran 45 min).');
      }
      file = item.file;
    } else if (params.url) {
      const buffer = await downloadVideo(String(params.url));
      const saved = videoStore.save(buffer, { mime: 'video/mp4' });
      file = saved.file;
    } else {
      return sendError(res, 400, 'Falta el video', 'Mandá "id" (el que devolvió /canvas/videotext) o "url".');
    }

    const out = await renderVideo(file, {
      texts,
      font: params.font,
      hideOriginal: params.hideOriginal === undefined ? true : String(params.hideOriginal) !== 'false'
    });
    dirs.push(out.dir);

    const buffer = fs.readFileSync(out.file);
    const name = `pulse-videotext-${Date.now()}.mp4`;
    res.setHeader('X-Texts-Rendered', String(texts.length));
    return sendMedia(res, buffer, 'video/mp4', name);
  } catch (e) {
    return sendVideoError(res, 'videotextrender', e);
  } finally {
    for (const dir of dirs) fs.rm(dir, { recursive: true, force: true }, () => {});
  }
}

router.post('/videotextrender', smallJson, renderHandler);
// GET con un solo bloque: sirve para probar desde el navegador o curl.
router.get('/videotextrender', renderHandler);

// ================================================================= canvas
async function handleCanvas(req, res) {
  const id = String(req.params.id || '').toLowerCase();
  if (!ALLOWED.has(id) || !findEndpoint('canvas', id)) {
    return sendError(res, 404, `Canvas "${id}" no existe`, 'Revisa la lista en /canvas');
  }
  // Parámetros del POST + query string (el body manda).
  const params = { ...req.query, ...(req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body : {}) };
  try {
    if (id === 'bratvideo') {
      // Mismas opciones que /canvas/brat (tipografía y colores) + `words`
      // (cuántas palabras entran por pantalla, 5 por defecto).
      const buf = await bratVideo(txt(params, 'Welcome to Pulse API'), params);
      return sendMedia(res, buf, 'video/mp4', 'pulse-bratvideo.mp4');
    }
    const buf = await generateCanvas(id, params);
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
