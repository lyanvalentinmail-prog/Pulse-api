// src/routes/pages.js — Dashboard, categorías, información y catálogo JSON de Pulse
const express = require('express');
const fs = require('fs');
const path = require('path');
const config = require('../config');
const { CATEGORIES, totals, findCategory, exampleQuery } = require('../catalog');
const { absoluteUrl } = require('../utils/http');

const router = express.Router();
const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// Iconos SVG (trazo negro, como en las capturas del diseño).
const I = {
  activity: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>',
  docs: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6zm1 9h-4v2h4v2h-4v2H9v-8h6v2zm-2-4V3.5L18.5 9H13z"/></svg>',
  github: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 .5C5.65.5.5 5.65.5 12c0 5.08 3.29 9.39 7.86 10.91.58.11.79-.25.79-.56 0-.27-.01-1.17-.02-2.12-3.2.7-3.88-1.36-3.88-1.36-.52-1.33-1.28-1.68-1.28-1.68-1.04-.71.08-.7.08-.7 1.15.08 1.76 1.19 1.76 1.19 1.03 1.76 2.69 1.25 3.35.96.1-.75.4-1.25.72-1.54-2.55-.29-5.24-1.28-5.24-5.69 0-1.26.45-2.28 1.19-3.09-.12-.29-.52-1.46.11-3.05 0 0 .97-.31 3.17 1.18a11.1 11.1 0 0 1 5.78 0c2.2-1.49 3.17-1.18 3.17-1.18.63 1.59.23 2.76.11 3.05.74.81 1.19 1.83 1.19 3.09 0 4.42-2.7 5.39-5.26 5.68.41.36.78 1.06.78 2.14 0 1.54-.01 2.79-.01 3.17 0 .31.21.68.8.56A10.52 10.52 0 0 0 23.5 12C23.5 5.65 18.35.5 12 .5z"/></svg>',
  external: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>',
  home: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 10.2 12 3l9 7.2V20a1.8 1.8 0 0 1-1.8 1.8H4.8A1.8 1.8 0 0 1 3 20z"/><path d="M9.5 21.8v-7h5v7"/></svg>',
  search: '<svg class="search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg><svg class="close-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>',
  stack: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round"><rect x="2.5" y="3" width="19" height="7.5" rx="2"/><rect x="2.5" y="13.5" width="19" height="7.5" rx="2"/><path d="M6.5 6.75h.01M6.5 17.25h.01"/></svg>',
  refresh: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-2.64-6.36"/><polyline points="21 3 21 9 15 9"/></svg>',
  terminal: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2.5" y="3.5" width="19" height="17" rx="2"/><polyline points="7 9 10 12 7 15"/><line x1="12.5" y1="15" x2="17" y2="15"/></svg>'
};

function layout({ title, body, script = '', bare = false }) {
  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="theme-color" content="#efefef">
<title>${esc(title)}</title>
<meta name="description" content="Pulse API — Anime, Canvas, IA, Descargas, Busquedas, Imagenes, Herramientas, Juegos y Audios. Sin token.">
<link rel="icon" href="/img/banner.jpg">
<link rel="stylesheet" href="/css/style.css">
</head>
<body>
${bare ? `<main class="page">${body}</main>` : `<div class="wrap"><main class="card">${body}</main></div>`}
${script}
</body>
</html>`;
}

function avatars(req) {
  return {
    a1: absoluteUrl(req, config.defaultAvatarPath),
    a2: absoluteUrl(req, '/img/default-avatar2.jpg')
  };
}

const WELCOME_HTML = fs.readFileSync(path.join(__dirname, '../../public/welcome.html'), 'utf-8');
const HOME_HTML = fs.readFileSync(path.join(__dirname, '../../public/home.html'), 'utf-8');

// Portada de presentación (estilo papel + puntos): hoja, sello de versión,
// video del hero, aviso de seguridad y chips de categorías.
router.get('/welcome', (req, res) => {
  const poster = config.welcomePoster || (
    fs.existsSync(path.join(__dirname, '../../public/img/welcome-poster.jpg')) ? '/img/welcome-poster.jpg' : ''
  );
  const html = WELCOME_HTML
    .replace('__WELCOME_VIDEO__', esc(config.welcomeVideo))
    .replace('__WELCOME_POSTER_ATTR__', poster ? ` poster="${esc(poster)}"` : '');
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  return res.send(html);
});

// Alias antiguos → rutas nuevas
router.get('/download', (req, res) => res.redirect('/descargas'));
router.get('/downloader', (req, res) => res.redirect('/descargas'));
router.get('/search', (req, res) => res.redirect('/busquedas'));
router.get('/searcher', (req, res) => res.redirect('/busquedas'));
router.get('/tools', (req, res) => res.redirect('/herramientas'));
router.get('/reactions', (req, res) => res.redirect('/imagenes'));

// ---------- / y /home (dashboard de carpetas) ----------
router.get(['/', '/home'], (req, res) => {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  return res.send(HOME_HTML);
});

// ---------- /information ----------
router.get('/information', (req, res) => {
  const t = totals();
  const base = absoluteUrl(req, '');
  const body = `
    <header>
      <h1 class="title"><a href="/home">Información</a></h1>
      <div class="sync">Monitor del sistema</div>
      <p class="intro">Todo lo que hay que saber de la API: <b>routers</b>, formatos y atajos.</p>
    </header>

    <div class="icons">
      <div class="left left-controls">
        <a href="/home" title="Inicio" aria-label="Inicio">${I.home}</a>
        <a href="/docs" title="Catálogo JSON (/docs)" aria-label="Catálogo JSON">${I.stack}</a>
        <a href="${esc(config.repoUrl || config.githubUrl)}" target="_blank" rel="noopener" title="Repositorio GitHub" aria-label="Repositorio GitHub">${I.external}</a>
      </div>
    </div>

    <div class="status">
      <span>Status: online</span>
      <span class="right"><span class="stat">Endpoints: ${t.endpoints}</span></span>
    </div>

    <div class="list info-block">
      <div><b>API</b><br>Pulse API (sin token)</div>
      <div><b>Base URL</b><br>${esc(base)}/</div>
      <div><b>Routers</b><br>${CATEGORIES.map(c => `<a href="/${c.id}">${esc(c.id)}</a>`).join(' · ')}</div>
      <div><b>Formato</b><br>JSON <code>{ creator, status, result }</code> · Canvas devuelve imagen/video directo</div>
      <div><b>Sin NSFW</b><br>contenido apto para todo público</div>
      <div><b>Texto limpio</b><br>agrega <code>?format=text</code> a cualquier endpoint JSON</div>
      <div><b>Descargar</b><br>agregá <code>?download=true</code> a cualquier endpoint y el archivo baja como adjunto</div>
      <div><b>Catálogo JSON</b><br><a href="/docs">/docs</a></div>
      <div><b>GitHub</b><br><a href="${esc(config.githubUrl)}" target="_blank" rel="noopener">${esc(config.githubUrl.replace('https://', ''))}</a></div>
    </div>
    <footer class="footer">© ${new Date().getFullYear()} | ${esc(config.brand)}</footer>`;
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  return res.send(layout({ title: 'Pulse API - Información del Sistema', body }));
});

// ---------- /docs (JSON) ----------
router.get('/docs', (req, res) => {
  const { a1, a2 } = avatars(req);
  const t = totals();
  const tags = {};
  for (const c of CATEGORIES) {
    tags[c.id] = c.endpoints.map(e => ({
      id: e.id,
      method: 'GET',
      path: `/${c.id}/${e.id}`,
      description: e.desc,
      media: e.media || 'json',
      group: e.group || null,
      params: e.params.map(p => ({
        name: p.name,
        required: !!p.required,
        advanced: !!p.advanced,
        description: p.desc || '',
        ...(p.options ? { options: p.options.filter(Boolean) } : {})
      })),
      example: absoluteUrl(req, `/${c.id}/${e.id}${exampleQuery(e, a1, a2)}`)
    }));
  }

  return res.json({
    creator: config.creator,
    status: true,
    api: config.name,
    baseUrl: absoluteUrl(req, ''),
    links: {
      github: config.githubUrl,
      patreon: config.supportUrl,
      web: config.mainWebsite
    },
    tags,
    routers: t.routers,
    endpoints: t.endpoints,
    categories: CATEGORIES.map(c => ({
      id: c.id,
      name: c.name,
      desc: c.desc || '',
      count: c.endpoints.length,
      ...(Array.isArray(c.groups) ? { groups: c.groups.map(g => ({ id: g.id, name: g.name, desc: g.desc || '' })) } : {}),
      endpoints: tags[c.id]
    }))
  });
});

// ---------- /<categoria> ----------
// Una ruta por categoría (así /ia y /descargas existen desde el primer endpoint).
const CATEGORY_PAGES = CATEGORIES.map(c => `/${c.id}`);
router.get(CATEGORY_PAGES, (req, res) => {
  const cat = findCategory(req.path.replace(/^\//, ''));
  if (!cat) return res.status(404).send('Not found');
  const { a1, a2 } = avatars(req);

  const rowOf = e => {
    // El resumen de la referencia muestra hasta los cuatro primeros parámetros.
    const nombres = e.params.slice(0, 4).map(p => p.name);
    const paramsLine = nombres.length ? nombres.join(', ') : 'sin parámetros';
    return `
    <div class="row" data-endpoint="${esc(e.id)}" id="row-${esc(e.id)}">
      <span class="row-icon">${I.terminal}</span>
      <div class="info">
        <h3>${esc(e.id.toUpperCase())}</h3>
        <div class="meta"><span class="get">GET</span><span class="sep">·</span>${e.params.length} params<span class="sep">·</span>${esc(paramsLine)}</div>
      </div>
      <button type="button" class="btn" data-test-btn="${esc(e.id)}" aria-expanded="false" aria-controls="tester-${esc(e.id)}">Test</button>
    </div>`;
  };

  // La lista sigue el orden del catálogo; los grupos siguen disponibles en /docs.
  // Una categoría recién creada no tiene endpoints: se avisa en vez de dejar el hueco.
  const rows = cat.endpoints.length
    ? cat.endpoints.map(rowOf).join('')
    : `<div class="row"><div class="info">
        <h3>SIN ENDPOINTS TODAVÍA</h3>
        <div class="meta">Esta carpeta está lista. El primero se agrega en <code>src/routes/${esc(cat.id)}.js</code> y su ficha en <code>src/catalog/${esc(cat.id)}.js</code>.</div>
      </div></div>`;
  const totalParams = cat.endpoints.reduce((n, e) => n + e.params.length, 0);

  const testerData = {
    category: cat.id,
    endpoints: cat.endpoints.map(e => ({
      id: e.id,
      desc: e.desc || '',
      media: e.media || null,
      params: e.params.map(p => ({
        name: p.name,
        desc: p.desc || '',
        required: !!p.required,
        options: p.options || null,
        advanced: !!p.advanced,
        value: p.example === '__AVATAR__' ? a1 : p.example === '__AVATAR2__' ? a2 : (p.example ?? '')
      }))
    }))
  };

  const body = `
    <header>
      <h1 class="title"><a href="/${esc(cat.id)}">${esc(cat.id)}</a></h1>
      <div class="sync">Sync complete · ${cat.endpoints.length} endpoint${cat.endpoints.length === 1 ? '' : 's'}</div>
      <p class="intro">${esc(cat.desc || 'Base de datos sincronizada')}.<br>Puedes hacer <b>peticiones</b> simplemente pulsando en <b>test</b>.</p>
    </header>

    <div class="icons">
      <div class="left left-controls">
        <a href="/home" title="Inicio" aria-label="Inicio">${I.home}</a>
        <a href="/information" title="Monitor del Sistema" aria-label="Monitor del Sistema">${I.activity}</a>
        <a href="/docs" title="Catálogo JSON" aria-label="Catálogo JSON">${I.stack}</a>
        <a href="/${esc(cat.id)}" title="Recargar" aria-label="Recargar">${I.refresh}</a>
      </div>
      <button type="button" data-search-btn aria-label="Buscar" aria-expanded="false" aria-controls="searchbox">${I.search}</button>
    </div>
    <div class="searchbox" id="searchbox"><input type="search" placeholder="Buscar en ${esc(cat.id)}…" aria-label="Buscar en ${esc(cat.id)}"></div>

    <div class="status">
      <span>Status: online</span>
      <span class="right"><span class="stat">Endpoints: ${cat.endpoints.length}</span><span class="stat">Params: ${totalParams}</span></span>
    </div>
    <div class="list">${rows}</div>
    <footer class="footer">© ${new Date().getFullYear()} | ${esc(config.brand)}</footer>`;

  // JSON insertado en HTML: escapar '<' impide cerrar el script desde los datos.
  const safeData = JSON.stringify(testerData).replace(/</g, '\\u003c');
  const script = `<script>window.PULSE=${safeData};</script><script src="/js/category.js"></script>`;
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  return res.send(layout({ title: `${config.name} - ${cat.name}`, body, script }));
});

module.exports = router;
