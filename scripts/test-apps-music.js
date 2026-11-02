// scripts/test-apps-music.js — Buscadores nuevos (Wikipedia, Play Store,
// Aptoide, App Store, Play) y descargas nuevas (MediaFire, Play Store, CapCut).
//
// Todo se prueba con un `fetch` de mentira: no se toca la red.
//
//   node scripts/test-apps-music.js
process.env.PORT = '0';
const assert = require('assert/strict');
const http = require('http');
const app = require('../src/server');
const S = require('../src/utils/search');
const E = require('../src/utils/extract');

function request(port, path, opts = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port, path, method: opts.method || 'GET', headers: opts.headers || {} }, res => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks) }));
    });
    req.on('error', reject);
    req.end(opts.body);
  });
}
const jsonResponse = value => new Response(JSON.stringify(value), { headers: { 'content-type': 'application/json' } });
const htmlResponse = value => new Response(value, { headers: { 'content-type': 'text/html; charset=utf-8' } });
const body = result => JSON.parse(result.body.toString());

// --- Fixtures de HTML (recortes reales de cada sitio) -----------------------
const PLAY_STORE_HTML = `<!DOCTYPE html><html><body>
<div class="card"><a class="Si6A0c nQcBw" aria-label="WhatsApp Messenger" href="./store/apps/details?id=com.whatsapp&hl=en">
  <img src="https://play-lh.googleusercontent.com/abc123=w240-h480" alt="Icono">
  <span class="DdYX5">WhatsApp Messenger</span><span class="wMUdtb">WhatsApp LLC</span>
  <div aria-label="Rated 4.2 stars out of five stars"></div></a></div>
<div class="card"><a class="Si6A0c nQcBw" aria-label="Telegram" href="./store/apps/details?id=org.telegram.messenger">
  <img src="https://play-lh.googleusercontent.com/tg=w240-h480" alt="Icono">
  <span class="DdYX5">Telegram</span><span class="wMUdtb">Telegram FZ-LLC</span></a></div>
</body></html>`;

const MEDIAFIRE_HTML = `<!DOCTYPE html><html><head>
<meta property="og:image" content="https://static.mediafire.com/images/filetype/download/zip.jpg">
</head><body>
<div class="filename">archivo.zip</div><span class="details">1.5 MB</span>
<a class="input popsok" id="downloadButton" href="https://download123.mediafire.com/file/abc/archivo.zip/file">Descargar</a>
</body></html>`;

const CAPCUT_HTML = `<!DOCTYPE html><html><head>
<meta property="og:title" content="Neon Edit | CapCut">
<meta property="og:image" content="https://p16.capcutcdn.com/cover.jpg">
</head><body><script>window.__DATA__={"templateTitle":"Neon Edit","authorName":"pulse_user",
"videoUrl":"https://v16.capcutcdn.com/template/video.mp4","coverUrl":"https://p16.capcutcdn.com/cover.jpg"};</script></body></html>`;

async function main() {
  const originalFetch = global.fetch;
  const seen = { playStore: 0, aptoide: 0, deezer: 0, wiki: 0, itunes: [] };

  global.fetch = async (input, opts = {}) => {
    const url = String(input);
    const headers = new Headers(opts.headers);
    // Archivos servidos por el proxy (miniaturas, MP4, MP3, APK…).
    if (url.startsWith('https://media.example/') || url.startsWith('https://download123.mediafire.com/')) {
      const range = headers.has('range');
      const type = url.endsWith('.mp4') ? 'video/mp4'
        : url.endsWith('.mp3') ? 'audio/mpeg'
          : url.endsWith('.m4a') ? 'audio/mp4'
            : url.endsWith('.apk') ? 'application/vnd.android.package-archive'
              : /^https:\/\/download123/.test(url) ? 'application/octet-stream' : 'image/jpeg';
      return new Response('0123456789', {
        status: range ? 206 : 200,
        headers: { 'content-type': type, ...(range ? { 'content-range': 'bytes 0-9/10' } : {}) }
      });
    }
    if (url.includes('wikipedia.org/w/api.php')) {
      const params = new URL(url).searchParams;
      if (params.get('action') === 'opensearch') return jsonResponse(['Eniac', ['ENIAC'], [''], ['https://es.wikipedia.org/wiki/ENIAC']]);
      seen.wiki++;
      assert.equal(params.get('gsrsearch'), 'Eniac');
      assert.equal(params.get('formatversion'), '2');
      return jsonResponse({ query: { pages: [
        { pageid: 12, title: 'ENIAC', index: 1, extract: 'ENIAC fue una de las primeras computadoras.', thumbnail: { source: 'https://media.example/wiki.jpg' }, fullurl: 'https://es.wikipedia.org/wiki/ENIAC' }
      ] } });
    }
    if (url.includes('play.google.com/store/search')) {
      seen.playStore++;
      assert.equal(new URL(url).searchParams.get('q'), 'whatsapp');
      return htmlResponse(PLAY_STORE_HTML);
    }
    if (url.includes('aptoide.com/api/7/apps/search')) {
      seen.aptoide++;
      const query = new URL(url).searchParams.get('query');
      if (query === 'com.example.onlymirror') return jsonResponse({ list: [] });
      return jsonResponse({ list: [{
        name: 'WhatsApp', package: 'com.whatsapp', icon: 'https://media.example/icon.png',
        file: { path: 'https://media.example/whatsapp.apk', vername: '2.24.1', filesize: 2048 },
        stats: { pdownloads: 1000, rating: { avg: 4.5 } }, store: { name: 'Aptoide' }
      }] });
    }
    if (url.includes('itunes.apple.com/search')) {
      const params = new URL(url).searchParams;
      seen.itunes.push(params.get('entity'));
      if (params.get('entity') === 'software') {
        return jsonResponse({ results: [{
          trackId: 1, trackName: 'WhatsApp Messenger', artistName: 'WhatsApp Inc.', bundleId: 'net.whatsapp.WhatsApp',
          artworkUrl100: 'https://media.example/icon/100x100bb.jpg', trackViewUrl: 'https://apps.apple.com/app/id1',
          primaryGenreName: 'Redes sociales', formattedPrice: 'Gratis', averageUserRating: 4.6
        }] });
      }
      return jsonResponse({ results: [{
        trackId: 2, trackName: 'Bohemian Rhapsody', artistName: 'Queen', collectionName: 'A Night at the Opera',
        trackTimeMillis: 354000, previewUrl: 'https://media.example/song.m4a',
        artworkUrl100: 'https://media.example/art/100x100bb.jpg', trackViewUrl: 'https://music.apple.com/x'
      }] });
    }
    if (url.includes('api.deezer.com/search')) {
      seen.deezer++;
      assert.match(new URL(url).searchParams.get('q'), /artist:"Queen"/);
      return jsonResponse({ data: [{
        id: 9, title: 'Bohemian Rhapsody', duration: 354, preview: 'https://media.example/preview.mp3',
        link: 'https://www.deezer.com/track/9', artist: { name: 'Queen' },
        album: { title: 'A Night at the Opera', cover_big: 'https://media.example/cover.jpg' }
      }] });
    }
    if (url.includes('mediafire.com/file/')) {
      if (url.includes('/file/deleted/')) return htmlResponse('<html><body>File deleted</body></html>');
      return htmlResponse(MEDIAFIRE_HTML);
    }
    if (url.includes('capcut.com/template-detail/')) return htmlResponse(CAPCUT_HTML);
    if (url.includes('capcut.com/api/template/detail')) throw new Error('fetch failed');
    if (/googleusercontent\.com|capcutcdn\.com|static\.mediafire\.com/.test(url)) {
      const range = headers.has('range');
      return new Response('0123456789', {
        status: range ? 206 : 200,
        headers: { 'content-type': /\.mp4$/.test(url) ? 'video/mp4' : 'image/jpeg', ...(range ? { 'content-range': 'bytes 0-9/10' } : {}) }
      });
    }
    if (url.includes('d.apkpure.com')) {
      return new Response('APKDATA', { headers: { 'content-type': 'application/vnd.android.package-archive' } });
    }
    throw new Error(`Fuente inesperada: ${url}`);
  };

  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const port = server.address().port;
  try {
    // ---------------------------------------------------------- Wikipedia
    const wiki = await request(port, '/busquedas/wiki?q=Eniac&limit=1');
    assert.equal(wiki.status, 200, wiki.body.toString());
    const wikiItem = body(wiki).result.items[0];
    assert.equal(wikiItem.title, 'ENIAC');
    assert.match(wikiItem.description, /computadoras/);
    assert.equal(wikiItem.link, 'https://es.wikipedia.org/wiki/ENIAC');
    const wikiMedia = await request(port, wikiItem.playback, { headers: { range: 'bytes=0-9' } });
    assert.equal(wikiMedia.status, 206);
    assert.match(wikiMedia.headers['content-type'], /image\/jpeg/);
    assert.equal((await request(port, '/busquedas/wiki?q=Eniac&lang=espanol')).status, 400);
    console.log('✓ Wikipedia: resumen, miniatura, enlace e idioma validado');

    // -------------------------------------------------------- Play Store
    const play = await request(port, '/busquedas/playstore?q=whatsapp&limit=2');
    assert.equal(play.status, 200, play.body.toString());
    const playItems = body(play).result.items;
    assert.equal(playItems.length, 2);
    assert.equal(playItems[0].package, 'com.whatsapp');
    assert.equal(playItems[0].title, 'WhatsApp Messenger');
    assert.equal(playItems[0].author, 'WhatsApp LLC');
    assert.equal(playItems[0].link, 'https://play.google.com/store/apps/details?id=com.whatsapp');
    assert.equal(playItems[0].rating, 4.2);
    assert.equal((await request(port, playItems[0].playback, { headers: { range: 'bytes=0-9' } })).status, 206);
    console.log('✓ Play Store: apps con icono, desarrollador, nota y enlace');

    // ------------------------------------------------------------ Aptoide
    const aptoide = await request(port, '/busquedas/aptoide?q=whatsapp&limit=1');
    assert.equal(aptoide.status, 200, aptoide.body.toString());
    const aptoideItem = body(aptoide).result.items[0];
    assert.equal(aptoideItem.package, 'com.whatsapp');
    assert.equal(aptoideItem.version, '2.24.1');
    assert.equal(aptoideItem.apk, 'https://media.example/whatsapp.apk');
    assert.equal(aptoideItem.size, 2048);
    assert.equal((await request(port, aptoideItem.playback, { headers: { range: 'bytes=0-9' } })).status, 206);
    console.log('✓ Aptoide: versión, tamaño, APK y miniaturas');

    // ----------------------------------------------------------- App Store
    const store = await request(port, '/busquedas/appstore?q=whatsapp&limit=1&country=es');
    assert.equal(store.status, 200, store.body.toString());
    const storeItem = body(store).result.items[0];
    assert.equal(storeItem.title, 'WhatsApp Messenger');
    assert.equal(storeItem.image, 'https://media.example/icon/512x512bb.jpg');
    assert.equal(storeItem.author, 'WhatsApp Inc.');
    assert.ok(seen.itunes.includes('software'));
    assert.equal((await request(port, '/busquedas/appstore?q=whatsapp&country=zzz')).status, 400);
    console.log('✓ App Store: iTunes Search con país y arte 512×512');

    // ------------------------------------------------------ Play (música)
    const song = await request(port, '/busquedas/play?name=Bohemian%20Rhapsody&author=Queen&limit=1');
    assert.equal(song.status, 200, song.body.toString());
    const songItem = body(song).result.items[0];
    assert.equal(songItem.title, 'Bohemian Rhapsody');
    assert.equal(songItem.author, 'Queen');
    assert.equal(songItem.audio, 'https://media.example/preview.mp3');
    assert.equal(songItem.previewSeconds, 30);
    const playMedia = await request(port, songItem.playback, { headers: { range: 'bytes=0-9' } });
    assert.equal(playMedia.status, 206);
    assert.match(playMedia.headers['content-type'], /audio\/mpeg/);
    assert.match((await request(port, songItem.downloadUrl)).headers['content-disposition'], /attachment/);
    const noName = await request(port, '/busquedas/play');
    assert.equal(noName.status, 400);
    assert.match(body(noName).error, /name/);
    console.log('✓ Play: canción por nombre y autor, audio reproducible y descarga');

    // ---------------------------------------------------------- MediaFire
    const mfUrl = encodeURIComponent('https://www.mediafire.com/file/abc/archivo.zip/file');
    const mf = await request(port, `/descargas/mediafire?url=${mfUrl}`);
    assert.equal(mf.status, 200, mf.body.toString());
    const mfData = body(mf).result;
    assert.equal(mfData.direct, 'https://download123.mediafire.com/file/abc/archivo.zip/file');
    assert.equal(mfData.filename, 'archivo.zip');
    assert.equal(mfData.size, '1.5 MB');
    const mfFile = await request(port, `${mfData.playback}&download=true`);
    assert.equal(mfFile.status, 200, mfFile.body.toString());
    assert.match(mfFile.headers['content-type'], /application\/octet-stream/);
    assert.match(mfFile.headers['content-disposition'], /attachment; filename="archivo.zip"/);
    const mfGone = await request(port, `/descargas/mediafire?url=${encodeURIComponent('https://www.mediafire.com/file/deleted/x.zip/file')}&direct=true`);
    assert.equal(mfGone.status, 404);
    assert.equal((await request(port, `/descargas/mediafire?url=${encodeURIComponent('https://example.com/x.zip')}`)).status, 400);
    console.log('✓ MediaFire: enlace directo, nombre, tamaño, descarga y archivo eliminado');

    // --------------------------------------------------- Play Store (APK)
    const apk = await request(port, `/descargas/playstore?url=${encodeURIComponent('https://play.google.com/store/apps/details?id=com.whatsapp&hl=es')}`);
    assert.equal(apk.status, 200, apk.body.toString());
    const apkData = body(apk).result;
    assert.equal(apkData.package, 'com.whatsapp');
    assert.equal(apkData.download, 'https://media.example/whatsapp.apk');
    assert.equal(apkData.version, '2.24.1');
    const apkFile = await request(port, `${apkData.playback}&download=true`);
    assert.equal(apkFile.status, 200, apkFile.body.toString());
    assert.match(apkFile.headers['content-type'], /android\.package-archive/);
    assert.match(apkFile.headers['content-disposition'], /WhatsApp\.apk/);
    const apkBare = await request(port, '/descargas/playstore?package=com.whatsapp');
    assert.equal(apkBare.status, 200);
    assert.match(body(apkBare).result.playback, /url=com\.whatsapp/);
    // Sin coincidencia en Aptoide: se usa el mirror público y se comprueba antes.
    const apkMirror = await request(port, '/descargas/playstore?package=com.example.onlymirror');
    assert.equal(apkMirror.status, 200, apkMirror.body.toString());
    assert.equal(body(apkMirror).result.source, 'apkpure');
    assert.match(body(apkMirror).result.download, /d\.apkpure\.com/);
    assert.equal((await request(port, '/descargas/playstore')).status, 400);
    assert.equal((await request(port, `/descargas/playstore?url=${encodeURIComponent('https://example.com/store/apps/details?id=com.x')}`)).status, 400);
    assert.equal((await request(port, `/descargas/playstore?url=${encodeURIComponent('https://play.google.com/store/search?q=x')}`)).status, 400);
    console.log('✓ Play Store: APK por enlace o package, mirror verificado y errores claros');

    // ------------------------------------------------------------- CapCut
    const capUrl = encodeURIComponent('https://www.capcut.com/template-detail/7123456789012345678?template_id=7123456789012345678');
    const cap = await request(port, `/descargas/capcut?url=${capUrl}`);
    assert.equal(cap.status, 200, cap.body.toString());
    const capData = body(cap).result;
    assert.equal(capData.video, 'https://v16.capcutcdn.com/template/video.mp4');
    assert.equal(capData.author, 'pulse_user');
    assert.equal(capData.cover, 'https://p16.capcutcdn.com/cover.jpg');
    const capFile = await request(port, capData.playback);
    assert.equal(capFile.status, 200, capFile.body.toString());
    assert.match(capFile.headers['content-type'], /video\/mp4/);
    assert.equal((await request(port, `/descargas/capcut?url=${encodeURIComponent('https://example.com/x')}`)).status, 400);
    assert.equal((await request(port, `/descargas/capcut?url=${encodeURIComponent('https://www.capcut.com/pricing')}`)).status, 400);
    console.log('✓ CapCut: MP4 del template, portada, autor y enlaces inválidos');

    // ------------------------------------------------------- Parsers puros
    assert.equal(E.parsePlayStorePackage('https://play.google.com/store/apps/details?id=com.a.b&hl=en'), 'com.a.b');
    assert.equal(E.parsePlayStorePackage('com.a.b'), 'com.a.b');
    assert.equal(E.parsePlayStorePackage('nada'), '');
    assert.equal(E.parseCapCutId('https://www.capcut.com/template-detail/7123?x=1'), '7123');
    assert.equal(E.parseCapCutId('https://www.capcut.com/t/ZsAbCdEf/'), 'ZsAbCdEf');
    assert.equal(E.parseCapCut('{"videoUrl":"https:\\/\\/cdn.example\\/v.mp4"}').video, 'https://cdn.example/v.mp4');
    assert.equal(E.parseCapCut('<html>sin datos</html>').video, '');
    assert.equal(E.parseMediaFire('<a id="downloadButton" href="https://download1.mediafire.com/a">x</a>').direct, 'https://download1.mediafire.com/a');
    assert.equal(E.parseMediaFire('<html>sin botón</html>').direct, '');
    assert.deepEqual(S.parsePlayStoreSearch('<html></html>', 5), []);
    assert.deepEqual(S.parseAptoide({}, 5), []);
    assert.deepEqual(S.parseAppStore({}, 5), []);
    assert.deepEqual(S.parseDeezer({ data: {} }, 5), []);
    assert.deepEqual(S.parseItunesSongs({ results: {} }, 5), []);
    assert.deepEqual(S.parseWiki({}, 5), []);
    assert.equal(S.parseWikiOpenSearch(['e', ['Uno'], ['desc'], ['https://es.wikipedia.org/wiki/Uno']], 5, 'es')[0].title, 'Uno');
    console.log('✓ Parsers: entradas vacías o rotas devuelven listas vacías, no inventan datos');

    // ------------------------------------------- La caché no mezcla idiomas
    seen.wiki = 0;
    const es = await request(port, '/busquedas/wiki?q=Eniac&limit=1&lang=en');
    const esAgain = await request(port, '/busquedas/wiki?q=Eniac&limit=1&lang=en');
    assert.equal(es.status, 200);
    assert.equal(esAgain.status, 200);
    assert.equal(seen.wiki, 1, 'la segunda consulta igual sale de la caché');
    console.log('✓ Caché: resultados por minuto y clave con idioma/país/autor');
  } finally {
    global.fetch = originalFetch;
    await new Promise(resolve => server.close(resolve));
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
