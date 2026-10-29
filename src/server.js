// src/server.js — Pulse API (Express). Web estilo retro + 6 routers sin token.
const path = require('path');
const express = require('express');
const config = require('./config');
const { sendError } = require('./utils/response');

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', true);

// Estáticos (CSS/JS/imágenes de ejemplo)
app.use(express.static(path.join(__dirname, '..', 'public'), { maxAge: '1h' }));

// CORS abierto: la API es pública y sin token 
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-pulse-client, Range');
  res.setHeader('Access-Control-Expose-Headers', 'Content-Range, Content-Length, Accept-Ranges');
  if (req.method === 'OPTIONS') return res.status(204).end();
  next();
});

// Páginas (/, /home, /anime, /canvas, /tools, /downloader, /searcher, /reactions,
// /information, /docs)
// Deben ir ANTES de los routers API para que GET /canvas sirva la web y /canvas/:id el PNG.
app.use(require('./routes/pages'));

// API
app.use(require('./utils/requestContext').requestContext);
app.use('/canvas', require('./routes/canvas'));
app.use('/anime', require('./routes/anime'));
app.use('/reactions', require('./routes/reactions'));
app.use('/tools', require('./routes/tools'));
app.use(['/downloader', '/download'], require('./routes/download'));
app.use(['/searcher', '/search'], require('./routes/searcher'));

// Subidas desde la web (Galería del probador): POST /upload → URL corta
app.use('/upload', require('./routes/upload'));

// Salud
app.get('/ping', (req, res) => {
  const { totals } = require('./catalog');
  res.json({ creator: config.creator, status: true, result: { pong: true, uptime: Math.round(process.uptime()), ...totals() } });
});

// 404
app.use((req, res) => {
  const accept = String(req.headers.accept || '');
  if (accept.includes('text/html') && req.method === 'GET') {
    return res.status(404).send(`<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>404 — Pulse API</title><link rel="stylesheet" href="/css/style.css"></head><body><div class="wrap"><main class="card"><h1 class="title">404</h1><div class="sync">Not Found</div><p class="intro">Esta ruta no existe. Revisa las carpetas en el <strong>home</strong>.</p><div class="follow"><a href="/home">← Go Home</a></div><div class="footer">© 2026 | ${config.brand}</div></main></div></body></html>`);
  }
  return sendError(res, 404, 'Endpoint no encontrado', 'Revisa el catálogo en /docs');
});

// Errores
app.use((err, req, res, next) => {
  if (res.headersSent) return next(err);
  const status = Number(err.status || err.statusCode);
  if (status >= 400 && status < 500) {
    const message = status === 413 ? 'El cuerpo de la petición es demasiado grande'
      : status === 400 ? 'El cuerpo de la petición no es válido' : 'Petición inválida';
    return sendError(res, status, message);
  }
  console.error('[server]', err);
  return sendError(res, 500, 'Error interno del servidor');
});

if (require.main === module) {
  const port = config.port;
  app.listen(port, '0.0.0.0', () => {
    console.log(`✦ Pulse API online → http://0.0.0.0:${port}/home`);
  });
}

module.exports = app;
