// src/utils/response.js — Formato de respuesta Velirius (JSON estilo Delirius + media con Range 206)
const fs = require('fs');
const config = require('../config');

function formatValueClean(val, indent = '') {
  if (val === null || val === undefined) return '';
  if (typeof val === 'string') return val.startsWith('data:') ? '[Archivo multimedia embebido]' : val;
  if (typeof val === 'number' || typeof val === 'boolean') return String(val);
  if (Array.isArray(val)) {
    if (!val.length) return '';
    return val.slice(0, 20).map((item, idx) => {
      if (typeof item === 'object' && item !== null) {
        const title = item.title || item.name || item.trackName || item.packName || `#${idx + 1}`;
        const sub = item.image || item.gif || item.cover || item.thumbnail || item.url || item.playUrl || item.video || item.description || '';
        return `${indent}${idx + 1}. ${title}${sub ? ` — ${sub}` : ''}`;
      }
      return `${indent}• ${item}`;
    }).join('\n');
  }
  if (typeof val === 'object') {
    if (typeof val.translatedText === 'string') {
      return `${val.translatedText}\n\n(${val.from || 'auto'} → ${val.to || 'es'}: "${val.originalText || ''}")`;
    }
    const lines = [];
    for (const [k, v] of Object.entries(val)) {
      if (v === null || v === undefined || v === '') continue;
      if (typeof v === 'string' && v.startsWith('data:')) continue;
      const formatted = formatValueClean(v, indent + '  ');
      if (!formatted) continue;
      lines.push(formatted.includes('\n') ? `${indent}${k.toUpperCase()}:\n${formatted}` : `${indent}${k}: ${formatted}`);
    }
    return lines.join('\n');
  }
  return String(val);
}

function sendSuccess(res, result, extra = {}) {
  const req = res.req;
  // ?format=text → texto limpio (útil para bots). Por defecto: JSON como Delirius.
  if (req && (req.query?.format === 'text' || req.query?.format === 'txt')) {
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).send(`${formatValueClean(result)}\n`);
  }
  return res.status(200).json({ creator: config.creator, status: true, ...extra, result });
}

function sendError(res, statusCode, message, hint = undefined) {
  const payload = { creator: config.creator, status: false, error: message };
  if (hint) payload.hint = hint;
  return res.status(statusCode).json(payload);
}

/**
 * ¿Se pidió descargar? `?download=true` (o `?dl=1`) convierte cualquier archivo
 * en descarga: mismo endpoint, pero con `Content-Disposition: attachment`.
 */
function wantsDownload(req) {
  const q = (req && req.query) || {};
  return ['true', '1', 'yes', 'si', 'sí'].includes(String(q.download || q.dl || '').toLowerCase());
}

/** `inline` para ver en el navegador, `attachment` con ?download=true. */
const disposicion = (req, filename, fallback) =>
  `${wantsDownload(req) ? 'attachment' : 'inline'}; filename="${safeHeaderFilename(filename, fallback)}"`;

function safeHeaderFilename(filename, fallback = 'Velirius-media') {
  return String(filename || fallback).replace(/[^\x20-\x7E]/g, '').replace(/["\\]/g, '').trim() || fallback;
}

function sendPng(res, buffer, filename = 'Velirius.png') {
  res.setHeader('Content-Type', 'image/png');
  res.setHeader('Content-Length', String(buffer.length));
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Disposition', disposicion(res.req, filename, 'Velirius.png'));
  return res.status(200).send(buffer);
}

function sendMedia(res, buffer, mimeType, filename) {
  const safeName = safeHeaderFilename(filename, 'media.bin');
  const total = buffer.length;
  const rangeHeader = res.req?.headers?.range || null;
  res.setHeader('Content-Type', mimeType);
  res.setHeader('Accept-Ranges', 'bytes');
  res.setHeader('Cache-Control', 'public, max-age=300');
  res.setHeader('Content-Disposition', disposicion(res.req, safeName, 'media.bin'));
  if (rangeHeader && /^bytes=/i.test(rangeHeader) && total > 0) {
    const parts = rangeHeader.replace(/^bytes=/i, '').split('-');
    let start = parseInt(parts[0], 10);
    let end = parts[1] ? parseInt(parts[1], 10) : total - 1;
    if (Number.isNaN(start)) { const s = parseInt(parts[1], 10) || total; start = Math.max(0, total - s); end = total - 1; }
    if (Number.isNaN(end) || end >= total) end = total - 1;
    if (start >= total || start < 0 || start > end) {
      res.setHeader('Content-Range', `bytes */${total}`);
      return res.status(416).end();
    }
    const chunk = buffer.subarray(start, end + 1);
    res.setHeader('Content-Range', `bytes ${start}-${end}/${total}`);
    res.setHeader('Content-Length', String(chunk.length));
    return res.status(206).send(chunk);
  }
  res.setHeader('Content-Length', String(total));
  return res.status(200).send(buffer);
}

/** Proxy en streaming (sin cargar todo en memoria) con soporte Range para reproductores. */
async function proxyStream(req, res, upstreamUrl, { filename = 'media', headers = {} } = {}) {
  const { fetchWithTimeout, UA_DESKTOP } = require('./http');
  const upstreamHeaders = { 'User-Agent': UA_DESKTOP, ...headers };
  if (req.headers.range) upstreamHeaders.Range = req.headers.range;
  const up = await fetchWithTimeout(upstreamUrl, { headers: upstreamHeaders, publicOnly: true }, 30000);
  if (up.status === 416) {
    const range = up.headers.get('content-range');
    if (range) res.setHeader('Content-Range', range);
    up.body?.cancel().catch(() => {});
    return res.status(416).end();
  }
  if (!up.ok && up.status !== 206) {
    up.body?.cancel().catch(() => {});
    throw new Error(`La fuente respondió HTTP ${up.status}`);
  }
  const type = (up.headers.get('content-type') || 'application/octet-stream').split(';')[0].trim().toLowerCase();
  if (!/^(?:image\/(?!svg\+xml)|video\/|audio\/|application\/octet-stream$)/i.test(type)) {
    up.body?.cancel().catch(() => {});
    throw new Error('La fuente no devolvió un archivo multimedia válido');
  }
  res.status(up.status === 206 ? 206 : 200);
  res.setHeader('Content-Type', type);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Accept-Ranges', 'bytes');
  res.setHeader('Cache-Control', 'public, max-age=300');
  res.setHeader('Content-Disposition', disposicion(req, filename, 'media'));
  for (const h of ['content-length', 'content-range']) {
    const v = up.headers.get(h); if (v) res.setHeader(h, v);
  }
  if (!up.body) return res.end();
  const reader = up.body.getReader();
  res.on('close', () => { if (!res.writableFinished) reader.cancel().catch(() => {}); });
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done || res.destroyed) break;
      if (!res.write(Buffer.from(value))) {
        await new Promise(resolve => {
          const finish = () => { res.off('drain', finish); res.off('close', finish); resolve(); };
          res.once('drain', finish);
          res.once('close', finish);
        });
      }
    }
    if (!res.destroyed) return res.end();
  } catch (e) {
    if (res.headersSent) res.destroy(e);
    else throw e;
  }
}

/**
 * Envía un archivo LOCAL (por ejemplo un MP4 pegado con ffmpeg) con soporte de
 * Range para que el reproductor pueda buscar dentro del video.
 */
function sendFile(res, filePath, { mime = 'video/mp4', filename = 'Velirius-video.mp4', cache = 'no-store' } = {}) {
  const total = fs.statSync(filePath).size;
  const rangeHeader = res.req?.headers?.range || null;
  res.setHeader('Content-Type', mime);
  res.setHeader('Accept-Ranges', 'bytes');
  res.setHeader('Cache-Control', cache);
  res.setHeader('Content-Disposition', disposicion(res.req, filename, 'Velirius-video.mp4'));
  let start = 0;
  let end = total - 1;
  let status = 200;
  if (rangeHeader && /^bytes=/i.test(rangeHeader) && total > 0) {
    const parts = rangeHeader.replace(/^bytes=/i, '').split('-');
    start = parseInt(parts[0], 10);
    if (Number.isNaN(start)) {
      const ultimos = parseInt(parts[1], 10) || total;
      start = Math.max(0, total - ultimos);
      end = total - 1;
    } else if (parts[1]) {
      end = parseInt(parts[1], 10);
    }
    if (Number.isNaN(end) || end >= total) end = total - 1;
    if (start >= total || start < 0 || start > end) {
      res.setHeader('Content-Range', `bytes */${total}`);
      return res.status(416).end();
    }
    status = 206;
    res.setHeader('Content-Range', `bytes ${start}-${end}/${total}`);
  }
  res.setHeader('Content-Length', String(end - start + 1));
  if (res.req?.method === 'HEAD') return res.status(status).end();
  const stream = fs.createReadStream(filePath, { start, end });
  stream.on('error', () => { if (!res.headersSent) res.status(500); res.end(); });
  res.status(status);
  return stream.pipe(res);
}

function sendText(res, text, filename = null, asAttachment = false) {
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  if (filename) {
    const baja = asAttachment || wantsDownload(res.req);
    res.setHeader('Content-Disposition', `${baja ? 'attachment' : 'inline'}; filename="${safeHeaderFilename(filename, 'archivo.txt')}"`);
  }
  return res.status(200).send(String(text ?? ''));
}

module.exports = {
  sendSuccess, sendError, sendPng, sendMedia, sendFile, sendText, proxyStream,
  safeHeaderFilename, formatValueClean, wantsDownload, disposicion
};
