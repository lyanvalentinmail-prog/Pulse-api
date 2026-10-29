// Pruebas deterministas de proveedores reales y sus respaldos. Se simulan las
// respuestas HTTP, pero se ejecutan los normalizadores y la lógica de selección.
const assert = require('assert/strict');
const P = require('../src/utils/providers');
const YT = require('../src/utils/youtube');
const COBALT = require('../src/utils/cobalt');
const { fetchBuffer, fetchJson } = require('../src/utils/http');
const { fetchPublic, isPublicAddress, validatePublicUrl, publicLookup } = require('../src/utils/publicFetch');
const { partirTexto } = require('../src/utils/audio');
const { bratFromLyrics } = require('../src/utils/lyricArt');
const { sharp } = require('../src/utils/image');
const uploadStore = require('../src/utils/uploadStore');

const previousFetch = global.fetch;
const originalAvailable = YT.disponible;
const originalMux = YT.pegar;
const previousEnv = { ...process.env };
let handler = async url => { throw new Error(`Petición no simulada: ${url}`); };
let requests = [];
global.fetch = async (input, options = {}) => {
  const url = String(input);
  requests.push({ url, options });
  return handler(url, options);
};
const json = value => Response.json(value);
const text = value => new Response(value, { status: 200, headers: { 'content-type': 'text/html' } });
const down = () => new Response('unavailable', { status: 503 });
const img = 'https://cdn.fixture.test/a.png';
let failures = 0;
async function test(name, fn) {
  requests = [];
  try { await fn(); console.log(`✓ ${name}`); }
  catch (err) { failures++; console.error(`✗ ${name}: ${err.stack || err}`); }
}

async function main() {
  process.env.COBALT_DISABLE = 'true';
  delete process.env.COBALT_API_URL;
  delete process.env.COBALT_API_URLS;
  delete process.env.COBALT_API_KEY;
  YT.disponible = () => false;
  try {
    await test('Anime: cada fuente normaliza su respuesta SFW', async () => {
      handler = async url => {
        if (url.includes('nekos.best')) return json({ results: [{ url: img, artist_name: 'Artista' }] });
        if (url.includes('purrbot')) return json({ link: img });
        if (url.includes('danbooru')) return json({ rating: 'g', file_url: img, large_file_url: img });
        if (url.includes('safebooru')) return json([{ rating: 'general', file_url: img }]);
        if (url.includes('konachan') || url.includes('yande.re')) return json([{ rating: 's', file_url: img }]);
        if (url.includes('pic.re')) return json({ rating: 'g', file_url: img, tags: ['sfw'] });
        throw new Error(url);
      };
      for (const [kind, sources] of Object.entries(P.ANIME_SOURCES)) {
        for (const provider of Object.keys(sources)) {
          const out = await P.animeImage(kind, { provider, amount: 1 });
          assert.equal(out.provider, provider); assert.equal(out.images[0].image, img);
        }
      }
    });
    await test('Anime: pic.re rechaza clasificación explícita o desconocida', async () => {
      for (const payload of [
        { rating: 'e', file_url: img, tags: ['nsfw'] },
        { file_url: img },
        { rating: 'safe', file_url: img, tags: ['explicit'] }
      ]) {
        handler = async () => json(payload);
        await assert.rejects(() => P.animeImage('waifu', { provider: 'pic.re' }));
      }
      handler = async () => json({ is_nsfw: false, file_url: img });
      assert.equal((await P.animeImage('waifu', { provider: 'pic.re' })).images[0].image, img);
    });
    await test('Pokémon: arte normal, shiny, tipos y descripción', async () => {
      handler = async url => url.includes('pokemon-species') ? json({
        flavor_text_entries: [{ language: { name: 'es' }, flavor_text: 'ratón\neléctrico' }], genera: [{ language: { name: 'es' }, genus: 'Ratón' }]
      }) : json({ id: 25, name: 'pikachu', height: 4, weight: 60,
        types: [{ type: { name: 'electric' } }], abilities: [], stats: [],
        sprites: { other: { 'official-artwork': { front_default: img, front_shiny: 'https://cdn.fixture.test/shiny.png' } } }
      });
      const r = await P.pokemon('pikachu', true);
      assert.equal(r.name, 'pikachu'); assert.match(r.image, /shiny/); assert.deepEqual(r.types, ['electric']); assert.equal(r.description, 'ratón eléctrico');
    });
    await test('Reactions: 26 rutas funcionan con cada proveedor simulado', async () => {
      handler = async url => url.includes('nekos.best') ? json({ results: [{ url: img }] })
        : url.includes('purrbot') ? json({ link: img }) : json({ url: img });
      for (const name of P.REACTION_LIST) {
        for (const provider of Object.keys(P.REACTION_PROVIDERS)) {
          const r = await P.reaction(name, { provider });
          assert.equal(r.reaction, name); assert.equal(r.gif, img);
        }
      }
    });
    await test('Traductor: Google y respaldo MyMemory', async () => {
      handler = async url => url.includes('googleapis') ? json([[['Hello', 'Hola']], null, 'es']) : json({ responseData: { translatedText: 'Hello' } });
      assert.equal((await P.translate('Hola', 'en', 'es')).engine, 'google-gtx');
      handler = async url => url.includes('googleapis') ? down() : json({ responseData: { translatedText: 'Hello' } });
      assert.equal((await P.translate('Hola', 'en', 'es')).engine, 'mymemory');
    });
    await test('TikTok: descarga y búsqueda normalizan medios y autor', async () => {
      const video = { id: '123', title: 'Video', hdplay: 'https://cdn.fixture.test/v.mp4', music: 'https://cdn.fixture.test/a.mp3', author: { unique_id: 'user' } };
      handler = async url => url.includes('/feed/search') ? json({ code: 0, data: { videos: [video] } }) : json({ code: 0, data: video });
      const d = await P.tiktokDownload('https://www.tiktok.com/@user/video/123');
      assert.match(d.video_nowatermark, /\.mp4$/); assert.equal(d.author.username, 'user');
      assert.equal((await P.tiktokSearch('algo', 3))[0].id, '123');
    });
    await test('YouTube: búsqueda, formatos, calidad 1080 y audio', async () => {
      const vid = 'abc12345678';
      handler = async url => {
        if (url.includes('api.invidious.io')) return json([]);
        if (url.includes('/youtubei/v1/search')) return json({ contents: { twoColumnSearchResultsRenderer: { primaryContents: { sectionListRenderer: { contents: [
          { itemSectionRenderer: { contents: [{ videoRenderer: { videoId: vid, title: { runs: [{ text: 'Video' }] }, ownerText: { runs: [{ text: 'Canal' }] } } }] } }
        ] } } } } });
        if (url.includes('/api/v1/videos/')) return json({ title: 'Video', author: 'Canal', lengthSeconds: 60,
          formatStreams: [{ qualityLabel: '360p', type: 'video/mp4', url: 'https://cdn.fixture.test/360.mp4' }],
          adaptiveFormats: [
            { qualityLabel: '1080p', type: 'video/mp4', url: 'https://cdn.fixture.test/1080.mp4' },
            { type: 'audio/mp4', url: 'https://cdn.fixture.test/audio.m4a', bitrate: 128000 }
          ] });
        throw new Error(url);
      };
      let muxCalls = [];
      YT.pegar = async (v, a, videoId) => { muxCalls.push({ v, a, videoId }); return '/tmp/mux-fixture.mp4'; };
      const s = await P.youtubeSearch('tema', 1);
      assert.equal(s.results[0].id, vid);
      const info = await P.resolveYoutubeTarget({ url: `https://www.youtube.com/watch?feature=share&v=${vid}` });
      assert.equal(info.id, vid); assert(info.formats.some(f => f.height === 1080 && !f.hasAudio));
      const high = await P.youtubePlayable(vid, 1080);
      assert.equal(high.height, 1080); assert.equal(high.hasAudio, true); assert.equal(high.muxed, true);
      assert.equal(muxCalls[0].v, 'https://cdn.fixture.test/1080.mp4');
      assert.equal(muxCalls[0].a, 'https://cdn.fixture.test/audio.m4a');
      const low = await P.youtubePlayable(vid, 360);
      assert.equal(low.height, 360); assert.equal(low.muxed, false); assert.equal(muxCalls.length, 1);
      YT.pegar = async () => { throw new Error('ffmpeg falló'); };
      const fallback = await P.youtubePlayable(vid, 1080);
      assert.equal(fallback.height, 360); assert.equal(fallback.hasAudio, true);
    });
    await test('YouTube: validar hostname y formatos de URL habituales', async () => {
      assert.equal(P.youtubeId('https://www.youtube.com/watch?feature=share&v=abc12345678'), 'abc12345678');
      assert.equal(P.youtubeId('https://youtu.be/abc12345678?t=5'), 'abc12345678');
      assert.equal(P.youtubeId('https://www.youtube.com/shorts/abc12345678'), 'abc12345678');
      assert.equal(P.youtubeId('https://youtube.com.evil.test/watch?v=abc12345678'), null);
      await assert.rejects(() => P.resolveYoutubeTarget({ url: 'https://evil.test/youtube.com/watch?v=abc12345678' }), e => e.status === 400);
    });
    await test('Facebook: HTML público y rechazo de hosts falsos', async () => {
      handler = async () => text('<meta property="og:title" content="Mi video">{"playable_url_quality_hd":"https:\\/\\/cdn.fixture.test\\/v.mp4"}');
      const r = await P.facebookDownload('https://www.facebook.com/watch/?v=1234567');
      assert.equal(r.hd, 'https://cdn.fixture.test/v.mp4');
      await assert.rejects(() => P.facebookDownload('http://127.0.0.1/private/facebook.com'), e => e.status === 400);
      await assert.rejects(() => P.facebookDownload('https://facebook.com.evil.test/video'), e => e.status === 400);
    });
    await test('Instagram: video, carrusel y hostname', async () => {
      handler = async () => text('<meta property="og:image" content="https://cdn.fixture.test/1.jpg"><script>{"display_url":"https://cdn.fixture.test/2.jpg"}</script>');
      const r = await P.instagramDownload('https://www.instagram.com/p/ABC123/');
      assert.equal(r.media.length, 2); assert.match(r.media[0].url, /1\.jpg/); assert.match(r.media[1].url, /2\.jpg/);
      await assert.rejects(() => P.instagramDownload('https://evil.test/instagram.com/p/ABC123/'), e => e.status === 400);
    });
    await test('Instagram respeta COBALT_DISABLE incluso en el último respaldo', async () => {
      handler = async () => down();
      process.env.COBALT_API_URL = 'https://private-cobalt.test';
      process.env.COBALT_API_KEY = 'synthetic-key';
      process.env.COBALT_DISABLE = 'true';
      await assert.rejects(() => P.instagramDownload('https://www.instagram.com/p/ABC123/'));
      assert(!requests.some(r => r.url.includes('cobalt')));
      delete process.env.COBALT_API_URL; delete process.env.COBALT_API_KEY;
    });
    await test('Pinterest: búsqueda, ID numérico y URL corta pin.it', async () => {
      handler = async url => {
        if (url.includes('BaseSearchResource')) return json({ resource_response: { data: { results: [{ id: '1234567', images: { orig: { url: img } } }] } } });
        if (url.includes('PinResource')) return json({ resource_response: { data: { id: '1234567', images: { orig: { url: img } } } } });
        if (url.includes('pin.it')) return text(`<meta property="og:image" content="${img}">`);
        return down();
      };
      const search = await P.pinterestSearch('gato', 2, 1);
      assert.equal(search.results[0].id, '1234567');
      assert.equal((await P.pinterestDownload('1234567')).image, img);
      assert.equal((await P.pinterestDownload('https://pin.it/abc')).image, img);
      await assert.rejects(() => P.pinterestDownload('http://127.0.0.1/private/pinterest.com'), e => e.status === 400);
      await assert.rejects(() => P.pinterestDownload('https://pinterest.com.evil.test/pin/1234567'), e => e.status === 400);
    });
    await test('Google: fallback DuckDuckGo HTML decodifica enlaces y extractos', async () => {
      handler = async url => url.includes('html.duckduckgo.com')
        ? text('<div class="result"><h2><a rel="nofollow" class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fexample.org%2Farticle&amp;rut=abc">Título &amp; tema</a></h2><a class="result__snippet" href="https://example.org/article">Texto <b>útil</b>.</a></div>')
        : down();
      const result = await P.googleSearch('tema', 3, 'es');
      assert.equal(result.engine, 'duckduckgo'); assert.equal(result.results[0].url, 'https://example.org/article');
      assert.equal(result.results[0].title, 'Título & tema'); assert.match(result.results[0].snippet, /Texto útil/);
    });
    await test('Wikipedia: devuelve artículos ordenados', async () => {
      handler = async () => json({ query: { pages: { 1: { pageid: 1, index: 2, title: 'Segundo' }, 2: { pageid: 2, index: 1, title: 'Primero', extract: ' Resumen ', fullurl: 'https://es.wikipedia.org/wiki/Primero' } } } });
      const r = await P.wikipediaSearch('tema', 2, 'es');
      assert.equal(r.results[0].title, 'Primero'); assert.equal(r.results[0].extract, 'Resumen');
    });
    await test('Lyric: LRCLIB y respaldo lyrics.ovh', async () => {
      handler = async url => url.includes('lrclib') ? json([{ trackName: 'Tema', artistName: 'Artista', plainLyrics: 'hola mundo' }]) : down();
      assert.equal((await P.lyricFor('tema')).source, 'lrclib');
      handler = async url => url.includes('lrclib') ? down() : url.includes('/suggest/')
        ? json({ data: [{ title: 'Tema', artist: { name: 'Artista' } }] }) : json({ lyrics: 'hola mundo' });
      const result = await P.lyricFor('tema');
      assert.equal(result.source, 'lyrics.ovh'); assert.equal(result.plainLyrics, 'hola mundo');
    });
    await test('Cobalt: clave sólo en instancias propias y opción de desactivar', async () => {
      process.env.COBALT_API_URL = 'https://private-cobalt.test';
      process.env.COBALT_API_KEY = 'synthetic-key';
      delete process.env.COBALT_DISABLE;
      handler = async url => url.includes('private-cobalt.test') ? down()
        : json({ status: 'redirect', url: 'https://cdn.fixture.test/v.mp4' });
      const r = await COBALT.pedir('https://www.youtube.com/watch?v=abc12345678');
      assert.match(r.instance, /cobalt-api\.meowing\.de/);
      const own = requests.find(v => v.url.includes('private-cobalt.test'));
      const publicRequest = requests.find(v => v.url.includes('cobalt-api.meowing.de'));
      assert.equal(new Headers(own.options.headers).get('api-key'), 'synthetic-key');
      assert.equal(new Headers(publicRequest.options.headers).get('api-key'), null);
      assert.equal(own.options.redirect, 'error');
      process.env.COBALT_DISABLE = 'true';
      requests = [];
      await assert.rejects(() => COBALT.pedir('https://www.youtube.com/watch?v=abc12345678'));
      assert.equal(requests.length, 0);
      delete process.env.COBALT_API_URL; delete process.env.COBALT_API_KEY;
    });
    await test('Cobalt v7: reintenta /api/json después de HTTP 404', async () => {
      process.env.COBALT_API_URL = 'https://private-cobalt.test';
      delete process.env.COBALT_DISABLE;
      handler = async url => url.endsWith('/api/json') ? json({ status: 'stream', url: 'https://cdn.fixture.test/v.mp4' }) : new Response('no', { status: 404 });
      const result = await COBALT.pedir('https://www.youtube.com/watch?v=abc12345678');
      assert.equal(result.instance, 'https://private-cobalt.test');
      assert(requests.some(r => r.url.endsWith('/api/json')));
      process.env.COBALT_DISABLE = 'true'; delete process.env.COBALT_API_URL;
    });
    await test('URLs públicas: bloquea redes internas, IPs especiales y redirecciones', async () => {
      for (const url of ['http://127.0.0.1', 'http://2130706433', 'http://169.254.169.254', 'http://[::1]', 'http://[::ffff:127.0.0.1]', 'http://localhost', 'http://host.internal']) {
        assert.throws(() => validatePublicUrl(url), e => e.status === 400, url);
      }
      for (const ip of ['10.1.2.3', '100.64.0.1', '192.168.1.1', '::ffff:127.0.0.1', 'fd00::1']) assert.equal(isPublicAddress(ip), false, ip);
      assert.equal(isPublicAddress('1.1.1.1'), true);
      handler = async () => new Response(null, { status: 302, headers: { location: 'http://127.0.0.1/private' } });
      await assert.rejects(() => fetchPublic('https://public.fixture.test/a'), e => e.status === 400);
      assert.equal(requests.length, 1, 'no debe acceder a la red interna tras la redirección');
    });
    await test('DNS: rechaza respuestas mixtas o privadas al conectar', async () => {
      const dns = require('dns');
      const originalLookup = dns.lookup;
      const lookup = () => new Promise((resolve, reject) => publicLookup('fixture.test', { all: true }, (err, value) => err ? reject(err) : resolve(value)));
      try {
        dns.lookup = (_host, _opts, cb) => cb(null, [{ address: '1.1.1.1', family: 4 }, { address: '127.0.0.1', family: 4 }]);
        await assert.rejects(lookup, e => e.status === 400);
        dns.lookup = (_host, _opts, cb) => cb(null, [{ address: '1.1.1.1', family: 4 }]);
        assert.equal((await lookup())[0].address, '1.1.1.1');
        dns.lookup = (_host, _opts, cb) => cb(null, [{ address: '127.0.0.1', family: 4 }]);
        const mockedFetch = global.fetch;
        try {
          global.fetch = previousFetch;
          await assert.rejects(() => fetchPublic('http://rebinding.fixture.test/', { signal: AbortSignal.timeout(2000) }), e => e.status === 400);
        } finally { global.fetch = mockedFetch; }
      } finally { dns.lookup = originalLookup; }
    });
    await test('URLs públicas: no reenvía credenciales a otro origen', async () => {
      handler = async url => url.includes('first.fixture.test')
        ? new Response(null, { status: 302, headers: { location: 'https://second.fixture.test/file' } })
        : new Response('ok');
      await fetchPublic('https://first.fixture.test/a', { headers: { 'Api-Key': 'secret', Authorization: 'Bearer secret', Cookie: 's=secret' } });
      const redirected = new Headers(requests[1].options.headers);
      assert.equal(redirected.get('api-key'), null); assert.equal(redirected.get('authorization'), null); assert.equal(redirected.get('cookie'), null);
    });
    await test('HTTP: límite de bytes incremental y timeout del cuerpo', async () => {
      let cancelled = false;
      handler = async () => new Response(new ReadableStream({
        start(controller) { controller.enqueue(new Uint8Array(8)); controller.enqueue(new Uint8Array(8)); },
        cancel() { cancelled = true; }
      }));
      await assert.rejects(() => fetchBuffer('https://fixture.test/file', { maxBytes: 10, timeoutMs: 200 }), /tamaño máximo/);
      assert.equal(cancelled, true);
      handler = async () => new Response(new ReadableStream({ start() {}, cancel() {} }));
      const start = Date.now();
      await assert.rejects(() => fetchBuffer('https://fixture.test/slow', { timeoutMs: 40 }), /espera|abort/i);
      assert(Date.now() - start < 500, 'el timeout debe incluir la lectura del cuerpo');
      await assert.rejects(() => fetchJson('https://fixture.test/slow', { timeoutMs: 40 }), /espera|abort/i);
    });
    await test('TTS: parte palabras largas sin superar el límite ni romper emojis', () => {
      const input = 'x'.repeat(500) + '🐱'.repeat(15);
      const chunks = partirTexto(input, 190);
      assert(chunks.every(c => c.length <= 190));
      assert.equal(chunks.join(''), input);
      assert(chunks.every(c => !/[\uD800-\uDBFF]$/.test(c) && !/^[\uDC00-\uDFFF]/.test(c)));
    });
    await test('Lyric brat respeta maxHeight o devuelve error claro', async () => {
      const art = await bratFromLyrics({ plainLyrics: 'hola' }, { width: 220, maxHeight: 220, includeHeader: false });
      assert((await sharp(art.buffer).metadata()).height <= 220);
      await assert.rejects(() => bratFromLyrics({ plainLyrics: 'línea de canción\n'.repeat(100) }, { width: 220, maxHeight: 220 }), e => e.status === 400);
    });
    await test('UploadStore elimina imágenes caducadas aunque no haya visitas', () => {
      uploadStore.clear();
      const oldSetTimeout = global.setTimeout, oldClearTimeout = global.clearTimeout, oldNow = Date.now;
      let scheduled;
      try {
        global.setTimeout = fn => { scheduled = fn; return { unref() {} }; };
        global.clearTimeout = () => {};
        uploadStore.save(Buffer.from('x'), 'image/png');
        assert.equal(typeof scheduled, 'function');
        Date.now = () => oldNow() + uploadStore.TTL_MS;
        scheduled();
        assert.equal(uploadStore.count(), 0);
      } finally {
        uploadStore.clear();
        global.setTimeout = oldSetTimeout; global.clearTimeout = oldClearTimeout; Date.now = oldNow;
      }
    });
    await test('UploadStore no supera el máximo publicado', () => {
      uploadStore.clear();
      for (let i = 0; i < uploadStore.MAX_ITEMS + 3; i++) uploadStore.save(Buffer.from('x'), 'image/png');
      assert.equal(uploadStore.count(), uploadStore.MAX_ITEMS);
      uploadStore.clear();
    });
  } finally {
    global.fetch = previousFetch;
    YT.disponible = originalAvailable;
    YT.pegar = originalMux;
    for (const key of Object.keys(process.env)) if (!(key in previousEnv)) delete process.env[key];
    Object.assign(process.env, previousEnv);
  }
  console.log(`\n${failures ? '✗' : '✓'} Proveedores y regresiones: ${failures} fallo(s)`);
  if (failures) process.exitCode = 1;
}
main().catch(err => { console.error(err); process.exitCode = 1; });
