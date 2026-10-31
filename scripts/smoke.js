// scripts/smoke.js — npm test: levanta la app y verifica la web, el catálogo y
// los únicos endpoints publicados hoy (canvas brat y bratvideo).
//
//   node scripts/smoke.js
process.env.PORT = '0';
const http = require('http');
const app = require('../src/server');
const { CATEGORIES, totals } = require('../src/catalog');
const { GENERATORS, CANVAS_IDS } = require('../src/utils/canvasEngine');
const { VIDEO_IDS } = require('../src/utils/video');
const { sharp } = require('../src/utils/image');

function get(port, p) {
  return new Promise((resolve, reject) => {
    http.get(`http://127.0.0.1:${port}${p}`, res => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode, type: res.headers['content-type'] || '', body: Buffer.concat(chunks), headers: res.headers }));
    }).on('error', reject);
  });
}

const isPng = buf => buf.length > 100 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47;
const isMp4 = buf => buf.length > 100 && buf.subarray(4, 8).toString() === 'ftyp';

async function main() {
  const server = app.listen(0, '127.0.0.1');
  await new Promise(r => server.once('listening', r));
  const port = server.address().port;
  let failures = 0;
  const ok = (name, cond, extra = '') => {
    console.log(`${cond ? '✓' : '✗'} ${name}${extra ? ' — ' + extra : ''}`);
    if (!cond) failures++;
  };

  try {
    // ---------- Web ----------
    const home = await get(port, '/home');
    const homeHtml = home.body.toString();
    ok('GET /home', home.status === 200 && homeHtml.includes('Pulse API') && homeHtml.includes('api-container'));
    ok('Home con la fila de iconos', homeHtml.includes('left-controls') && homeHtml.includes('href="/information"')
      && homeHtml.includes('search-trigger') && homeHtml.includes('Follow my github account'));
    ok('Home con barra de estado', /STATUS: ONLINE/i.test(homeHtml) && /stat-routers/i.test(homeHtml) && /stat-endpoints/i.test(homeHtml));
    ok('Home carga las categorías desde /docs', homeHtml.includes('loadDynamicMenu') && homeHtml.includes('/docs'));
    ok('Home contenedor de lista de categorías', homeHtml.includes('id="category-list"') && homeHtml.includes('PULSE STORE'));

    const welcome = await get(port, '/welcome');
    ok('GET /welcome', welcome.status === 200 && /<html/i.test(welcome.body.toString()));

    const info = await get(port, '/information');
    ok('GET /information', info.status === 200 && info.body.toString().includes('Routers'));

    const css = await get(port, '/css/style.css');
    const catJs = await get(port, '/js/category.js');
    const homeJs = await get(port, '/js/home.js');
    ok('GET /css/style.css', css.status === 200 && css.type.includes('text/css') && css.body.length > 1000);
    ok('GET /js/category.js', catJs.status === 200 && catJs.body.toString().includes('window.PULSE'));
    ok('GET /js/home.js', homeJs.status === 200 && homeJs.body.length > 100);

    // ---------- Categorías ----------
    const ids = CATEGORIES.map(c => c.id);
    ok('Nueve routers: anime, canvas, ia, descargas, busquedas, imagenes, herramientas, juegos, audios',
      JSON.stringify(ids) === JSON.stringify(['anime', 'canvas', 'ia', 'descargas', 'busquedas', 'imagenes', 'herramientas', 'juegos', 'audios']),
      ids.join(', '));
    ok('Sólo canvas publica endpoints', CATEGORIES.filter(c => c.endpoints.length).map(c => c.id).join(',') === 'canvas');

    for (const cat of CATEGORIES) {
      const page = await get(port, `/${cat.id}`);
      const html = page.body.toString();
      const buttons = (html.match(/data-test-btn=/g) || []).length;
      const emptyNote = cat.endpoints.length === 0 ? html.includes('SIN ENDPOINTS TODAVÍA') : true;
      ok(`GET /${cat.id} (${cat.endpoints.length})`, page.status === 200 && buttons === cat.endpoints.length && emptyNote);
    }

    const t = totals();
    ok('Contadores del catálogo', t.routers === 9 && t.endpoints === 2, `routers=${t.routers} endpoints=${t.endpoints}`);

    // ---------- Catálogo JSON ----------
    const docs = await get(port, '/docs');
    const json = JSON.parse(docs.body.toString());
    ok('GET /docs', docs.status === 200 && json.status === true && json.routers === 9 && json.endpoints === 2);
    ok('/docs trae las nueve categorías', json.categories.length === 9);
    ok('/docs: canvas con brat y bratvideo',
      json.categories.find(c => c.id === 'canvas').endpoints.map(e => e.id).join(',') === 'brat,bratvideo');

    const ping = await get(port, '/ping');
    const pong = JSON.parse(ping.body.toString());
    ok('GET /ping', ping.status === 200 && pong.result.pong === true && pong.result.routers === 9);

    // ---------- Endpoints publicados ----------
    const png = await get(port, '/canvas/brat?text=hola%20pulse');
    ok('GET /canvas/brat → PNG 736×736', png.status === 200 && png.type.includes('image/png') && isPng(png.body)
      && (await sharp(png.body).metadata()).width === 736);

    const video = await get(port, '/canvas/bratvideo?text=hola%20pulse');
    ok('GET /canvas/bratvideo → MP4', video.status === 200 && video.type.includes('video/mp4') && isMp4(video.body));

    const missingCanvas = await get(port, '/canvas/quotly');
    ok('GET /canvas/quotly → 404 (retirado)', missingCanvas.status === 404);

    for (const r of ['/tools/emoji', '/anime/neko', '/reactions/hug', '/downloader/ytmp4', '/searcher/yt']) {
      const res = await get(port, r);
      ok(`GET ${r} → 404 (router eliminado)`, res.status === 404);
    }

    const notFound = await get(port, '/nada');
    ok('GET /nada → 404 JSON', notFound.status === 404 && JSON.parse(notFound.body.toString()).status === false);

    const alias = await get(port, '/downloader');
    ok('GET /downloader → redirect /descargas', alias.status === 302 && alias.headers.location === '/descargas');

    // ---------- Motor ----------
    ok('Generadores disponibles: brat', CANVAS_IDS.join(',') === 'brat', CANVAS_IDS.join(','));
    ok('Video disponible: bratvideo', VIDEO_IDS.join(',') === 'bratvideo');
    ok('GENERATORS sin claves de más', Object.keys(GENERATORS).every(id => CANVAS_IDS.includes(id)));
  } finally {
    await new Promise(r => server.close(r));
  }

  console.log(`\n${failures ? `✗ ${failures} fallo(s)` : '✓ Todo en orden'}`);
  if (failures) process.exitCode = 1;
}

main().catch(err => {
  console.error(err);
  process.exitCode = 1;
});
