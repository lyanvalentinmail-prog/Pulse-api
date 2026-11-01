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

function post(port, p, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const payload = Buffer.isBuffer(body) ? body : Buffer.from(typeof body === 'string' ? body : JSON.stringify(body));
    const req = http.request(`http://127.0.0.1:${port}${p}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': payload.length, ...headers }
    }, res => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode, type: res.headers['content-type'] || '', body: Buffer.concat(chunks), headers: res.headers }));
    });
    req.on('error', reject);
    req.end(payload);
  });
}

function getRange(port, p, range) {
  return new Promise((resolve, reject) => {
    http.get(`http://127.0.0.1:${port}${p}`, { headers: { Range: range } }, res => {
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
    const welcomeHtml = welcome.body.toString();
    ok('GET /welcome', welcome.status === 200 && /<html/i.test(welcomeHtml));
    ok('Portada con hero de video', welcomeHtml.includes('id="hero-video"') && welcomeHtml.includes('autoplay')
      && welcomeHtml.includes('muted') && welcomeHtml.includes('loop'));
    ok('Portada con sello de versión y aviso', welcomeHtml.includes('Status: online') && welcomeHtml.includes('alert-tag'));

    const welcomeVideo = await get(port, '/media/welcome.mp4');
    ok('GET /media/welcome.mp4', welcomeVideo.status === 200 && welcomeVideo.type.includes('video/mp4') && welcomeVideo.body.length > 1000);
    const welcomeRange = await getRange(port, '/media/welcome.mp4', 'bytes=0-99');
    ok('Video con soporte de Range (206)', welcomeRange.status === 206 && welcomeRange.body.length === 100);

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
    ok('Publican endpoints: canvas, ia, descargas y busquedas',
      CATEGORIES.filter(c => c.endpoints.length).map(c => c.id).join(',') === 'canvas,ia,descargas,busquedas',
      CATEGORIES.filter(c => c.endpoints.length).map(c => c.id).join(','));

    for (const cat of CATEGORIES) {
      const page = await get(port, `/${cat.id}`);
      const html = page.body.toString();
      const buttons = (html.match(/data-test-btn=/g) || []).length;
      const emptyNote = cat.endpoints.length === 0 ? html.includes('SIN ENDPOINTS TODAVÍA') : true;
      ok(`GET /${cat.id} (${cat.endpoints.length})`, page.status === 200 && buttons === cat.endpoints.length && emptyNote);
    }

    const t = totals();
    ok('Contadores del catálogo', t.routers === 9 && t.endpoints === 21, `routers=${t.routers} endpoints=${t.endpoints}`);

    // ---------- Catálogo JSON ----------
    const docs = await get(port, '/docs');
    const json = JSON.parse(docs.body.toString());
    ok('GET /docs', docs.status === 200 && json.status === true && json.routers === 9 && json.endpoints === 21);
    ok('/docs trae las nueve categorías', json.categories.length === 9);
    ok('/docs: canvas con brat, bratvideo y el editor de video',
      json.categories.find(c => c.id === 'canvas').endpoints.map(e => e.id).join(',') === 'brat,bratvideo,videoeditor,videotext,videotextrender',
      json.categories.find(c => c.id === 'canvas').endpoints.map(e => e.id).join(','));

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

    // ---------- Editor de textos de video ----------
    const editorJson = await get(port, '/canvas/videoeditor');
    const editorData = JSON.parse(editorJson.body.toString());
    ok('GET /canvas/videoeditor (fetch) → JSON con la API del editor',
      editorJson.status === 200 && editorData.result.editor === '/canvas/videoeditor'
        && editorData.result.analyze.path === '/canvas/videotext');

    const editorHtml = await new Promise((resolve, reject) => {
      http.get(`http://127.0.0.1:${port}/canvas/videoeditor`, { headers: { Accept: 'text/html,*/*' } }, res => {
        const chunks = [];
        res.on('data', c => chunks.push(c));
        res.on('end', () => resolve({ status: res.statusCode, body: Buffer.concat(chunks).toString() }));
      }).on('error', reject);
    });
    ok('GET /canvas/videoeditor (navegador) → HTML del editor',
      editorHtml.status === 200 && editorHtml.body.includes('Video Text Editor')
        && editorHtml.body.includes('/js/videoeditor.js') && editorHtml.body.includes('id="timeline"'));

    const veJs = await get(port, '/js/videoeditor.js');
    const veCss = await get(port, '/css/videoeditor.css');
    ok('GET /js/videoeditor.js y /css/videoeditor.css', veJs.status === 200 && veCss.status === 200
      && veJs.body.toString().includes('videotextrender') && veCss.body.toString().includes('.ve-timeline'));

    const sinVideo = await get(port, '/canvas/videotext');
    ok('GET /canvas/videotext sin video → 400', sinVideo.status === 400 && JSON.parse(sinVideo.body.toString()).status === false);

    const noEsVideo = await post(port, '/canvas/videotext', Buffer.from('esto no es un video, es texto plano'), { 'Content-Type': 'video/mp4' });
    ok('POST /canvas/videotext con algo que no es video → 400', noEsVideo.status === 400);

    const sinTextos = await post(port, '/canvas/videotextrender', { id: 'x' });
    ok('POST /canvas/videotextrender sin texts → 400', sinTextos.status === 400 && JSON.parse(sinTextos.body.toString()).status === false);

    const videoVencido = await post(port, '/canvas/videotextrender', { id: 'no-existe', texts: [{ text: 'hola', start: 0, end: 1, x: 0.1, y: 0.1, w: 0.3, h: 0.1 }] });
    ok('POST /canvas/videotextrender con video vencido → 404', videoVencido.status === 404);

    const frameVencido = await get(port, '/canvas/videotext/frame/no-existe');
    ok('GET /canvas/videotext/frame/:id desconocido → 404', frameVencido.status === 404);

    // Flujo real (ffmpeg + OCR): un video de 2 s con una palabra bien grande.
    const { execFileSync } = require('child_process');
    const os = require('os');
    const fs = require('fs');
    const pathMod = require('path');
    let ffmpeg = null;
    try { ffmpeg = require('@ffmpeg-installer/ffmpeg').path; } catch (_) { /* sin ffmpeg */ }
    let tess = false;
    try { require('@tesseract.js-data/eng'); tess = true; } catch (_) { /* sin datos */ }
    if (ffmpeg && tess) {
      const tmp = fs.mkdtempSync(pathMod.join(os.tmpdir(), 'pulse-smoke-'));
      const file = pathMod.join(tmp, 'ok.mp4');
      execFileSync(ffmpeg, ['-hide_banner', '-y', '-loglevel', 'error', '-f', 'lavfi',
        '-i', 'color=c=black:s=640x360:d=2:r=15',
        '-vf', `drawtext=fontfile=${pathMod.join(__dirname, '..', 'assets', 'fonts', 'Inter-Bold.ttf')}:text='PULSE OCR':fontcolor=white:fontsize=56:x=60:y=120`,
        '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', file], { timeout: 60000 });
      const subida = await post(port, '/canvas/videotext', fs.readFileSync(file), { 'Content-Type': 'video/mp4' });
      const analisis = JSON.parse(subida.body.toString());
      ok('POST /canvas/videotext (video real) → textos detectados',
        subida.status === 200 && analisis.result.texts.length >= 1
          && /PULSE/i.test(analisis.result.texts[0].text),
        analisis.result ? JSON.stringify(analisis.result.texts.map(t => t.text)) : analisis.error);

      if (analisis.result) {
        const id = analisis.result.id;
        const t = analisis.result.texts[0];
        const frame = await get(port, `/canvas/videotext/frame/${id}?t=0.5`);
        ok('GET /canvas/videotext/frame/:id → JPEG', frame.status === 200 && frame.type.includes('image/jpeg') && frame.body.length > 1000);
        const videoSubido = await get(port, `/canvas/videotext/video/${id}`);
        ok('GET /canvas/videotext/video/:id → MP4', videoSubido.status === 200 && videoSubido.type.includes('video/mp4'));

        const render = await post(port, '/canvas/videotextrender', {
          id,
          texts: [{ text: 'EDITADO', start: t.start, end: t.end, box: t.box, color: 'ffd166' }]
        });
        ok('POST /canvas/videotextrender (video real) → MP4 editado',
          render.status === 200 && render.type.includes('video/mp4') && isMp4(render.body),
          `HTTP ${render.status} · ${render.body.length} bytes`);
      }
      fs.rmSync(tmp, { recursive: true, force: true });
    } else {
      console.log('⚠️  Salto el flujo real del editor: falta ffmpeg o los datos de Tesseract');
    }

    for (const r of ['/tools/emoji', '/anime/neko', '/reactions/hug', '/downloader/ytmp4', '/searcher/yt']) {
      const res = await get(port, r);
      ok(`GET ${r} → 404 (router eliminado)`, res.status === 404);
    }

    // ---------- Descargas ----------
    const descargas = json.categories.find(c => c.id === 'descargas').endpoints.map(e => e.id);
    ok('/docs: descargas con 8 endpoints',
      descargas.join(',') === 'tiktok,pinterest,instagram,facebook,spotify,youtubemp4,youtubemp3,audio', descargas.join(','));
    const sinUrl = await get(port, '/descargas/tiktok');
    ok('GET /descargas/tiktok sin url → 400', sinUrl.status === 400 && JSON.parse(sinUrl.body.toString()).status === false);
    const urlMala = await get(port, '/descargas/tiktok?url=https://example.com/x');
    ok('GET /descargas/tiktok con host ajeno → 400', urlMala.status === 400);
    const descargaFalsa = await get(port, '/descargas/nada');
    ok('GET /descargas/nada → 404', descargaFalsa.status === 404);

    // ---------- Busquedas ----------
    const busquedas = json.categories.find(c => c.id === 'busquedas').endpoints.map(e => e.id);
    ok('/docs: busquedas con 6 buscadores',
      busquedas.join(',') === 'pinterest,tiktok,youtube,wallpapers,wallpapersv2,stickerly', busquedas.join(','));
    const sinQ = await get(port, '/busquedas/youtube');
    ok('GET /busquedas/youtube sin q → 400', sinQ.status === 400 && JSON.parse(sinQ.body.toString()).status === false);
    const qLarga = await get(port, `/busquedas/tiktok?q=${'x'.repeat(200)}`);
    ok('GET /busquedas/tiktok con q enorme → 400', qLarga.status === 400);
    const busquedaFalsa = await get(port, '/busquedas/nada');
    ok('GET /busquedas/nada → 404', busquedaFalsa.status === 404);

    // ---------- IA ----------
    const ia = json.categories.find(c => c.id === 'ia').endpoints.map(e => e.id);
    ok('/docs: IA con gemini e image', ia.join(',') === 'gemini,image', ia.join(','));
    const imageEp = json.categories.find(c => c.id === 'ia').endpoints.find(e => e.id === 'image');
    ok('IA/image devuelve media image y prompt requerido',
      imageEp.media === 'image' && imageEp.params[0].name === 'prompt' && imageEp.params[0].required === true);
    const sinPromptImagen = await get(port, '/ia/image');
    ok('GET /ia/image sin prompt → 400', sinPromptImagen.status === 400 && JSON.parse(sinPromptImagen.body.toString()).status === false);
    const promptLargo = await get(port, `/ia/image?prompt=${'x'.repeat(1200)}`);
    ok('GET /ia/image con prompt enorme → 400', promptLargo.status === 400);
    const sinPrompt = await get(port, '/ia/gemini');
    ok('GET /ia/gemini sin prompt → 400 o 503 sin clave', sinPrompt.status === 400 || sinPrompt.status === 503,
      `status ${sinPrompt.status}`);
    const iaFalsa = await get(port, '/ia/nada');
    ok('GET /ia/nada → 404', iaFalsa.status === 404);
    ok('La clave de Gemini nunca sale en /docs ni en /ia',
      !docs.body.toString().includes('AIza') && !String(process.env.GEMINI_API_KEY || '').length
        ? true : !docs.body.toString().includes(process.env.GEMINI_API_KEY || '\u0000'));

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
    // El OCR deja un worker de WASM vivo: se cierra para que el proceso salga.
    await require('../src/utils/videoText').closeOcr();
  }

  console.log(`\n${failures ? `✗ ${failures} fallo(s)` : '✓ Todo en orden'}`);
  process.exit(failures ? 1 : 0);
}

main().catch(err => {
  console.error(err);
  process.exitCode = 1;
});
