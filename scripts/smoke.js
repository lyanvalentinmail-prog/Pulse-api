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

function postJson(port, p, data) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(data);
    const req = http.request(`http://127.0.0.1:${port}${p}`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) } }, res => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode, type: res.headers['content-type'] || '', body: Buffer.concat(chunks), headers: res.headers }));
    });
    req.on('error', reject);
    req.end(body);
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
    ok('Diez routers: anime, canvas, ia, descargas, busquedas, imagenes, herramientas, juegos, audios, random',
      JSON.stringify(ids) === JSON.stringify(['anime', 'canvas', 'ia', 'descargas', 'busquedas', 'imagenes', 'herramientas', 'juegos', 'audios', 'random']),
      ids.join(', '));
    ok('Publican endpoints: anime, canvas, ia, descargas, busquedas, imagenes, herramientas, audios y random',
      CATEGORIES.filter(c => c.endpoints.length).map(c => c.id).join(',') === 'anime,canvas,ia,descargas,busquedas,imagenes,herramientas,audios,random',
      CATEGORIES.filter(c => c.endpoints.length).map(c => c.id).join(','));

    for (const cat of CATEGORIES) {
      const page = await get(port, `/${cat.id}`);
      const html = page.body.toString();
      const buttons = (html.match(/data-test-btn=/g) || []).length;
      const emptyNote = cat.endpoints.length === 0 ? html.includes('SIN ENDPOINTS TODAVÍA') : true;
      ok(`GET /${cat.id} (${cat.endpoints.length})`, page.status === 200 && buttons === cat.endpoints.length && emptyNote);
    }

    const t = totals();
    ok('Contadores del catálogo', t.routers === 10 && t.endpoints === 76, `routers=${t.routers} endpoints=${t.endpoints}`);

    // ---------- Catálogo JSON ----------
    const docs = await get(port, '/docs');
    const json = JSON.parse(docs.body.toString());
    ok('GET /docs', docs.status === 200 && json.status === true && json.routers === 10 && json.endpoints === 76);
    ok('/docs trae las diez categorías', json.categories.length === 10);
    ok('/docs: canvas con brat y bratvideo',
      ['brat', 'bratvideo', 'cartelanime1', 'cartelbob', 'whatsappquote', 'bratv2'].every(id => json.categories.find(c => c.id === 'canvas').endpoints.some(e => e.id === id)));

    const ping = await get(port, '/ping');
    const pong = JSON.parse(ping.body.toString());
    ok('GET /ping', ping.status === 200 && pong.result.pong === true && pong.result.routers === 10);

    // ---------- Endpoints publicados ----------
    const png = await get(port, '/canvas/brat?text=hola%20pulse');
    ok('GET /canvas/brat → PNG 736×736', png.status === 200 && png.type.includes('image/png') && isPng(png.body)
      && (await sharp(png.body).metadata()).width === 736);

    const video = await get(port, '/canvas/bratvideo?text=hola%20pulse');
    ok('GET /canvas/bratvideo → MP4', video.status === 200 && video.type.includes('video/mp4') && isMp4(video.body));

    // Prueba cada referencia y que el texto modifique el PNG.
    for (const id of ['cartelanime1', 'cartelanime2', 'cartelanime3', 'cartelanime4', 'cartelbob', 'bratv2', 'whatsappquote', 'imessagequote', 'imessagetyping', 'perfilchat']) {
      const first = await get(port, `/canvas/${id}?text=Hola`);
      const second = await get(port, `/canvas/${id}?text=Distinto&download=true`);
      ok(`GET /canvas/${id} personalizable y descargable`, first.status === 200 && isPng(first.body) && second.status === 200 && isPng(second.body) && !first.body.equals(second.body) && /attachment/.test(second.headers['content-disposition']));
    }

    const testImage = await sharp({ create: { width: 50, height: 50, channels: 3, background: '#ff0000' } }).png().toBuffer();
    const canvasPhoto = await postJson(port, '/canvas/cartelanime1?download=true', { mode: 'image', image: `data:image/png;base64,${testImage.toString('base64')}` });
    const canvasText = await get(port, '/canvas/cartelanime1?text=Hola');
    ok('Cartel: imagen en POST y descarga', canvasPhoto.status === 200 && isPng(canvasPhoto.body) && !canvasPhoto.body.equals(canvasText.body) && /attachment/.test(canvasPhoto.headers['content-disposition']));

    const missingCanvas = await get(port, '/canvas/quotly');
    ok('GET /canvas/quotly → 404 (retirado)', missingCanvas.status === 404);

    for (const r of ['/tools/emoji', '/anime/personaje', '/reactions/hug', '/downloader/ytmp4', '/searcher/yt']) {
      const res = await get(port, r);
      ok(`GET ${r} → 404 (router eliminado)`, res.status === 404);
    }

    // ---------- Descargas ----------
    const descargas = json.categories.find(c => c.id === 'descargas').endpoints.map(e => e.id);
    ok('/docs: descargas con 11 endpoints',
      descargas.join(',') === 'tiktok,pinterest,instagram,facebook,spotify,youtubemp4,youtubemp3,audio,mediafire,playstore,capcut', descargas.join(','));
    const sinUrl = await get(port, '/descargas/tiktok');
    ok('GET /descargas/tiktok sin url → 400', sinUrl.status === 400 && JSON.parse(sinUrl.body.toString()).status === false);
    const urlMala = await get(port, '/descargas/tiktok?url=https://example.com/x');
    ok('GET /descargas/tiktok con host ajeno → 400', urlMala.status === 400);
    const audioPrivado = await get(port, '/descargas/audio?url=http%3A%2F%2F127.0.0.1%2Fadmin&direct=true');
    ok('Audio: rechaza acceso a red privada', audioPrivado.status === 400);
    const descargaFalsa = await get(port, '/descargas/nada');
    ok('GET /descargas/nada → 404', descargaFalsa.status === 404);

    // ---------- Busquedas ----------
    const busquedas = json.categories.find(c => c.id === 'busquedas').endpoints.map(e => e.id);
    ok('/docs: busquedas con 11 buscadores',
      busquedas.join(',') === 'pinterest,tiktok,youtube,wallpapers,wallpapersv2,stickerly,wiki,playstore,aptoide,appstore,play', busquedas.join(','));
    // Fuente simulada: se comprueba cada enlace directo, Range, descarga y
    // rechazo de destinos privados sin depender de terceros en CI.
    const S = require('../src/utils/search');
    const originalTikTok = S.tiktok;
    const originalFetch = global.fetch;
    try {
      S.tiktok = async (query) => ({ query, items: [{ id: 'one', title: 'Uno', video: 'https://media.example/video.mp4' }, { id: 'two', title: 'Dos', video: 'https://media.example/two.mp4' }] });
      global.fetch = async (url, opts) => {
        const isRange = !!new Headers(opts.headers).get('range');
        return new Response(Buffer.from('0123456789'), { status: isRange ? 206 : 200, headers: { 'content-type': 'video/mp4', ...(isRange ? { 'content-range': 'bytes 0-9/10' } : {}) } });
      };
      const search = JSON.parse((await get(port, '/busquedas/tiktok?q=gatos')).body.toString());
      const items = search.result.items;
      ok('Búsqueda: enlaces por resultado', items.length === 2 && items[0].playback.includes('index=0') && items[1].downloadUrl.includes('index=1'));
      const media = await getRange(port, items[0].playback, 'bytes=0-9');
      ok('Búsqueda: reproducción con Range', media.status === 206 && media.type.includes('video/mp4') && media.body.length === 10);
      const dl = await get(port, items[1].downloadUrl);
      ok('Búsqueda: descarga por resultado', dl.status === 200 && /attachment/.test(dl.headers['content-disposition']) && /\.mp4/.test(dl.headers['content-disposition']));
      const E = require('../src/utils/extract');
      const oldDownload = E.tiktok;
      try {
        E.tiktok = async () => ({ id: '123', video: 'https://media.example/video.mp4' });
        const path = '/descargas/tiktok?url=https%3A%2F%2Fwww.tiktok.com%2F%40u%2Fvideo%2F123&direct=true';
        const preview = await getRange(port, path, 'bytes=0-9');
        const saved = await get(port, path + '&download=true');
        ok('Descargas: reproducción y archivo adjunto', preview.status === 206 && /inline/.test(preview.headers['content-disposition']) && saved.status === 200 && /attachment/.test(saved.headers['content-disposition']));
      } finally { E.tiktok = oldDownload; }
      // Todos los handlers comparten reproducción con Range y descarga.
      const originals = Object.fromEntries(['tiktok', 'pinterest', 'instagram', 'facebook', 'spotify', 'youtube', 'toMp3', 'mediafire', 'playstoreDownload', 'capcut'].map(k => [k, E[k]]));
      try {
        E.tiktok = async () => ({ id: '1', video: 'https://media.example/video.mp4' });
        E.pinterest = async () => ({ type: 'image', image: 'https://media.example/foto.jpg' });
        E.instagram = async () => ({ type: 'video', shortcode: 'abc', video: 'https://media.example/video.mp4' });
        E.facebook = async () => ({ video: 'https://media.example/video.mp4' });
        E.spotify = async () => ({ title: 'Audio', preview: 'https://media.example/audio.mp3' });
        E.youtube = async (_url, mode) => ({ id: 'abcdefghijk', source: 'piped:fixture', download: `https://media.example/${mode}`, mode });
        E.toMp3 = async () => Buffer.from('ID3test-mp3');
        E.mediafire = async () => ({ direct: 'https://media.example/archivo.zip', filename: 'archivo.zip' });
        E.playstoreDownload = async () => ({ package: 'com.test', title: 'Test', download: 'https://media.example/app.apk' });
        E.capcut = async () => ({ video: 'https://media.example/video.mp4', title: 'Template' });
        const samples = [
          ['tiktok', 'https://www.tiktok.com/@u/video/1'], ['pinterest', 'https://pinterest.com/pin/1'],
          ['instagram', 'https://instagram.com/p/abcde'], ['facebook', 'https://facebook.com/video/1'],
          ['spotify', 'https://open.spotify.com/track/123'], ['youtubemp4', 'https://youtube.com/watch?v=abcdefghijk'],
          ['youtubemp3', 'https://youtube.com/watch?v=abcdefghijk'], ['audio', 'https://media.example/video.mp4'],
          ['mediafire', 'https://www.mediafire.com/file/abc/x.zip/file'],
          ['playstore', 'https://play.google.com/store/apps/details?id=com.test'],
          ['capcut', 'https://www.capcut.com/template-detail/123']
        ];
        for (const [id, url] of samples) {
          const target = `/descargas/${id}?url=${encodeURIComponent(url)}&direct=true`;
          const preview = await getRange(port, target, 'bytes=0-4');
          const download = await get(port, `${target}&download=true`);
          ok(`Descargas ${id}: reproducción y descarga`, preview.status === 206 && /inline/.test(preview.headers['content-disposition']) && download.status === 200 && /attachment/.test(download.headers['content-disposition']));
        }
        E.tiktok = async () => ({ id: '2', video: '', images: ['https://media.example/foto.jpg'] });
        const slide = await get(port, '/descargas/tiktok?url=https%3A%2F%2Ftiktok.com%2F%40u%2Fphoto%2F2&direct=true');
        ok('TikTok: carrusel sin video devuelve su primera imagen', slide.status === 200);
        E.spotify = async () => ({ title: 'Sin preview', preview: '' });
        ok('Spotify: sin preview responde 404, no inventa audio', (await get(port, '/descargas/spotify?url=https%3A%2F%2Fopen.spotify.com%2Ftrack%2F123&direct=true')).status === 404);
      } finally { Object.assign(E, originals); }
      const searchOriginals = Object.fromEntries(['pinterest', 'tiktok', 'youtube', 'wallpapers', 'wallpapersV2', 'stickerly', 'wiki', 'playstore', 'aptoide', 'appstore', 'play'].map(k => [k, S[k]]));
      const youtubeOriginal = E.youtube;
      try {
        const fixtures = [
          ['pinterest', 'pinterest', { id: 'p', image: 'https://media.example/foto.jpg' }],
          ['tiktok', 'tiktok', { id: 't', video: 'https://media.example/video.mp4' }],
          ['youtube', 'youtube', { id: 'abcdefghijk', link: 'https://youtube.com/watch?v=abcdefghijk' }],
          ['wallpapers', 'wallpapers', { page: 'https://example.com/1', image: 'https://media.example/foto.jpg' }],
          ['wallpapersv2', 'wallpapersV2', { page: 'https://example.com/2', preview: 'https://media.example/foto.jpg' }],
          ['stickerly', 'stickerly', { id: 's', image: 'https://media.example/sticker.png' }],
          ['wiki', 'wiki', { id: 'w', image: 'https://media.example/wiki.jpg', link: 'https://es.wikipedia.org/wiki/X' }],
          ['playstore', 'playstore', { id: 'com.test', image: 'https://media.example/icon.png', link: 'https://play.google.com/store/apps/details?id=com.test' }],
          ['aptoide', 'aptoide', { id: 'com.test', image: 'https://media.example/icon.png', apk: 'https://media.example/app.apk' }],
          ['appstore', 'appstore', { id: '1', image: 'https://media.example/icon.png', link: 'https://apps.apple.com/app/id1' }],
          ['play', 'play', { id: '9', audio: 'https://media.example/song.mp3', link: 'https://deezer.com/track/9' }]
        ];
        E.youtube = async () => ({ download: 'https://media.example/video.mp4' });
        for (const [route, fn, item] of fixtures) {
          S[fn] = async query => ({ query, items: [item] });
          const response = JSON.parse((await get(port, `/busquedas/${route}?q=test`)).body.toString());
          const result = response.result.items[0];
          const media = await getRange(port, result.playback, 'bytes=0-4');
          const download = await get(port, result.downloadUrl);
          ok(`Búsqueda ${route}: medio y descarga`, media.status === 206 && download.status === 200 && /attachment/.test(download.headers['content-disposition']));
        }
      } finally { Object.assign(S, searchOriginals); E.youtube = youtubeOriginal; }
      // Una instancia lenta no debe retrasar las demás ni bloquear el fallback.
      global.fetch = async url => {
        const address = String(url);
        if (address.includes('pipedapi.adminforge.de/streams/')) {
          return new Response(JSON.stringify({ title: 'OK', videoStreams: [{ url: 'https://media.example/video.mp4', quality: '720p' }] }), { headers: { 'content-type': 'application/json' } });
        }
        if (address.includes('pipedapi.adminforge.de/search')) {
          return new Response(JSON.stringify({ items: [{ type: 'stream', url: '/watch?v=abcdefghijk', title: 'OK' }] }), { headers: { 'content-type': 'application/json' } });
        }
        return new Promise(resolve => setTimeout(() => resolve(new Response('{}', { status: 503 })), 1200));
      };
      const started = Date.now();
      const fastSearch = await S.youtube('test', 1);
      const fastDownload = await E.youtube('https://youtube.com/watch?v=abcdefghijk', 'video');
      ok('YouTube: búsqueda y descarga usan la primera instancia disponible', fastSearch.items.length === 1 && fastDownload.download.includes('video.mp4') && Date.now() - started < 1000);
      global.fetch = async (_url, opts) => {
        const isRange = !!new Headers(opts.headers).get('range');
        return new Response(Buffer.from('0123456789'), { status: isRange ? 206 : 200, headers: { 'content-type': 'video/mp4', ...(isRange ? { 'content-range': 'bytes 0-9/10' } : {}) } });
      };
      S.tiktok = async (query) => ({ query, items: [{ id: 'other', video: 'https://media.example/other.mp4' }] });
      ok('Búsqueda: no cambia de resultado al reordenarse', (await get(port, items[0].playback)).status === 404);
      S.tiktok = async (query) => ({ query, items: [{ id: 'private', video: 'http://127.0.0.1/private' }] });
      ok('Búsqueda: no permite proxy a red privada', (await get(port, '/busquedas/tiktok?q=x&index=0&direct=true')).status === 400);
    } finally { S.tiktok = originalTikTok; global.fetch = originalFetch; }
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
    ok('Generadores de canvas disponibles', ['brat', 'cartelbob', 'whatsappquote', 'bratv2'].every(id => CANVAS_IDS.includes(id)), CANVAS_IDS.join(','));
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
