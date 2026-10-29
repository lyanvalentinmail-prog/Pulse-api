// Pruebas HTTP de TODOS los endpoints del catálogo, sin depender de servicios
// externos: los proveedores se simulan; los 54 canvas/FFmpeg se ejecutan de verdad.
const assert = require('assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const { JSDOM } = require('jsdom');
const { sharp } = require('../src/utils/image');
const P = require('../src/utils/providers');
const COBALT = require('../src/utils/cobalt');
const { CATEGORIES, totals } = require('../src/catalog');
const app = require('../src/server');

process.env.OPENAI_API_KEY = 'test-only-key';
process.env.COBALT_DISABLE = 'true';
for (const key of ['GROQ_API_KEY', 'DEEPGRAM_API_KEY', 'ASSEMBLYAI_API_KEY', 'GOOGLE_TTS_KEY']) delete process.env[key];

const originalFetch = global.fetch;
const originals = {};
const replace = (obj, key, value) => { originals[key] = obj[key]; obj[key] = value; };
const fixture = 'https://media.fixture.test';
const imageUrl = `${fixture}/image.png`;
const videoUrl = `${fixture}/video.mp4`;
const audioUrl = `${fixture}/audio.mp3`;
const id = 'abc12345678';
let port;

function request(target, { method = 'GET', headers = {}, body } = {}) {
  const url = target.startsWith('http') ? new URL(target) : new URL(target, `http://127.0.0.1:${port}`);
  assert.equal(url.host, `127.0.0.1:${port}`, 'la URL de respuesta debe apuntar a la API de prueba');
  const data = body === undefined ? null : Buffer.from(typeof body === 'string' ? body : JSON.stringify(body));
  return new Promise((resolve, reject) => {
    const req = http.request(url, { method, headers: { ...(data ? { 'Content-Type': 'application/json', 'Content-Length': data.length } : {}), ...headers } }, res => {
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks), type: res.headers['content-type'] || '' }));
      res.on('error', reject);
    });
    req.setTimeout(60000, () => req.destroy(new Error(`timeout: ${url.pathname}`)));
    req.on('error', reject);
    req.end(data);
  });
}
const json = response => JSON.parse(response.body.toString());
const query = params => new URLSearchParams(params).toString();

async function main() {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'velirius-endpoints-'));
  const audioFile = path.join(temp, 'test.mp3');
  const audioBytes = Buffer.concat([Buffer.from('ID3'), Buffer.alloc(1200, 4)]);
  fs.writeFileSync(audioFile, audioBytes);
  const png = await sharp({ create: { width: 64, height: 48, channels: 3, background: '#ff00ff' } }).png().toBuffer();
  const dataImage = `data:image/png;base64,${png.toString('base64')}`;
  const png2 = await sharp({ create: { width: 64, height: 48, channels: 3, background: '#00ff00' } }).png().toBuffer();
  const dataImage2 = `data:image/png;base64,${png2.toString('base64')}`;

  const yt = (which = id) => ({
    id: which, title: 'Canción de prueba', author: 'Artista', duration: 60, thumbnail: imageUrl, source: 'test',
    formats: [
      { hasVideo: true, hasAudio: true, height: 720, quality: '720p', mime: 'video/mp4', url: videoUrl },
      { hasVideo: false, hasAudio: true, quality: '128kbps', mime: 'audio/mpeg', bitrate: 128000, url: audioUrl }
    ]
  });
  const pin = { id: '1234567890', type: 'image', title: 'Pin', url: 'https://www.pinterest.com/pin/1234567890/', image: imageUrl, video: null };
  replace(P, 'animeImage', async (kind, opts) => ({ kind, provider: 'test', count: opts.amount, images: Array.from({ length: opts.amount }, () => ({ image: imageUrl })) }));
  replace(P, 'pokemon', async (name, shiny) => ({ name: String(name), shiny, image: imageUrl }));
  replace(P, 'reaction', async reaction => ({ reaction, label: P.REACTIONS[reaction], provider: 'test', gif: imageUrl }));
  replace(P, 'translate', async (text, to, from) => ({ originalText: text, translatedText: 'Hello', to, from, engine: 'test' }));
  replace(P, 'tiktokDownload', async () => ({ title: 'TikTok', video_nowatermark: videoUrl, audio: audioUrl }));
  replace(P, 'resolveYoutubeTarget', async () => yt());
  replace(P, 'youtubeSearch', async () => ({ source: 'test', results: [{ id, title: 'Canción' }] }));
  replace(P, 'youtubeStreams', async which => yt(which));
  replace(P, 'youtubePlayable', async () => ({ url: videoUrl, hasAudio: true, height: 1080, quality: '1080p', mime: 'video/mp4', source: 'test' }));
  replace(P, 'youtubeAudio', async () => ({ url: audioUrl, mime: 'audio/mpeg', source: 'test' }));
  replace(P, 'youtubeAudioFile', async () => audioFile);
  replace(P, 'facebookDownload', async () => ({ title: 'Facebook', hd: videoUrl, sd: videoUrl }));
  replace(P, 'instagramDownload', async () => ({ shortcode: 'ABC', media: [{ type: 'video', url: videoUrl }, { type: 'image', url: imageUrl }] }));
  replace(P, 'pinterestDownload', async () => pin);
  replace(P, 'previewAudio', async () => ({ url: audioUrl, mime: 'audio/mpeg', title: 'Preview', artist: 'Artista', source: 'test', duration: 30 }));
  replace(P, 'lyricFor', async q => ({ query: q, title: 'Canción', artist: 'Artista', plainLyrics: 'hola mundo\nsegunda línea', syncedLyrics: '[00:01.00] hola mundo' }));
  replace(P, 'tiktokSearch', async () => [{ id: '1', title: 'Video', cover: imageUrl }]);
  replace(P, 'googleSearch', async q => ({ query: q, engine: 'test', count: 1, results: [{ title: 'Resultado', url: 'https://example.org/' }] }));
  replace(P, 'pinterestSearch', async q => ({ query: q, page: 1, source: 'test', count: 1, results: [pin] }));
  replace(P, 'wikipediaSearch', async q => ({ query: q, lang: 'es', count: 1, results: [{ title: 'Artículo', url: 'https://example.org/' }] }));

  global.fetch = async (target, options = {}) => {
    const url = String(target);
    if (url.startsWith('https://translate.google.com/translate_tts')) {
      return new Response(audioBytes, { status: 200, headers: { 'content-type': 'audio/mpeg' } });
    }
    if (url.startsWith('https://api.openai.com/v1/audio/transcriptions')) {
      return Response.json({ text: 'audio transcrito' });
    }
    if (url.startsWith(fixture + '/')) {
      const name = new URL(url).pathname;
      if (name === '/evil.html') return new Response('<script>evil()</script>', { headers: { 'content-type': 'text/html' } });
      if (name === '/redirect') return new Response(null, { status: 302, headers: { location: `http://127.0.0.1:${port}/private` } });
      const isImage = name.endsWith('.png');
      const bytes = isImage ? png : name.endsWith('.mp4') ? Buffer.from('fake mp4 fixture') : audioBytes;
      const type = isImage ? 'image/png' : name.endsWith('.mp4') ? 'video/mp4' : 'audio/mpeg';
      const range = new Headers(options.headers || {}).get('range');
      if (range) {
        const m = /^bytes=(\d+)-(\d*)$/.exec(range);
        if (!m || Number(m[1]) >= bytes.length) return new Response(null, { status: 416, headers: { 'content-range': `bytes */${bytes.length}` } });
        const start = Number(m[1]), end = Math.min(m[2] ? Number(m[2]) : bytes.length - 1, bytes.length - 1);
        const part = bytes.subarray(start, end + 1);
        return new Response(part, { status: 206, headers: { 'content-type': type, 'content-range': `bytes ${start}-${end}/${bytes.length}`, 'content-length': String(part.length) } });
      }
      return new Response(bytes, { status: 200, headers: { 'content-type': type, 'content-length': String(bytes.length) } });
    }
    throw new Error(`Fetch externo inesperado en la prueba: ${url}`);
  };

  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  port = server.address().port;
  let failures = 0;
  let covered = 0;
  const test = async (label, fn) => {
    try { await fn(); console.log(`✓ ${label}`); }
    catch (e) { failures++; console.error(`✗ ${label}: ${e.stack || e.message}`); }
  };
  const assertSuccess = response => {
    assert.equal(response.status, 200, response.body.toString().slice(0, 500));
    const payload = json(response);
    assert.equal(payload.status, true);
    return payload.result;
  };

  try {
    // Un GET por cada entrada del catálogo, con sus parámetros de ejemplo.
    for (const cat of CATEGORIES) {
      for (const ep of cat.endpoints) {
        await test(`GET /${cat.id}/${ep.id}`, async () => {
          const params = {};
          for (const p of ep.params) {
            if (p.example === '' || p.example == null || p.example === '__AVATAR__' || p.example === '__AVATAR2__') continue;
            params[p.name] = String(p.example);
          }
          if (cat.id === 'canvas' && ['attp', 'bratvideo'].includes(ep.id)) params.text = 'hola';
          if (cat.id === 'tools' && ep.id === 'resize') params.url = dataImage;
          if (cat.id === 'tools' && ep.id === 'stt') params.audio = 'AAECAwQ=';
          if (cat.id === 'downloader') params.direct = 'false';
          const response = await request(`/${cat.id}/${ep.id}?${query(params)}`);
          assert.equal(response.status, 200, response.body.toString().slice(0, 500));
          if (cat.id === 'canvas') {
            if (ep.id === 'attp') {
              assert.match(response.type, /^video\/webm/);
              assert.equal(response.body.subarray(0, 4).toString('hex'), '1a45dfa3');
            } else if (ep.id === 'bratvideo') {
              assert.match(response.type, /^video\/mp4/);
              assert.equal(response.body.subarray(4, 8).toString(), 'ftyp');
            } else {
              assert.match(response.type, /^image\/png/);
              const meta = await sharp(response.body).metadata();
              assert(meta.width > 0 && meta.height > 0);
            }
          } else if (cat.id === 'tools' && ep.id === 'resize') {
            assert.match(response.type, /^image\/png/);
            assert.equal((await sharp(response.body).metadata()).width, 512);
          } else {
            assert.match(response.type, /application\/json/);
            assert.equal(json(response).status, true);
          }
          covered++;
        });
      }
    }
    await test('cobertura completa del catálogo', () => assert.equal(covered, totals().endpoints));

    const aliases = [
      ['/tools/calc?expr=2%2B2', 'json'], ['/tools/calculadora?expr=2%2B2', 'json'],
      ['/tools/translate?text=hola', 'json'], ['/tools/traductor?text=hola', 'json'],
      ['/tools/morsecode?text=SOS', 'json'],
      ...['rezize', 'redimensionar'].map(alias => [`/tools/${alias}?url=${encodeURIComponent(dataImage)}&width=32`, 'image']),
      ...['texttospeech', 'speech', 'voz'].map(alias => [`/tools/${alias}?text=hola`, 'json']),
      ...['speechtotext', 'transcribir'].map(alias => [`/tools/${alias}?audio=AAECAwQ%3D`, 'json']),
      ...['tiktoksearch', 'yt', 'web', 'pin', 'pines', 'wiki'].map(alias => [`/searcher/${alias}?query=prueba`, 'json']),
      ...['yt', 'fb', 'ig', 'pin', 'ytmp3', 'ytmp4', 'lyrics'].map(alias => [`/downloader/${alias}?url=${encodeURIComponent(`https://www.youtube.com/watch?v=${id}`)}&query=prueba`, 'json']),
      ...['canvatextoxd', 'fotopc', 'sebusca', 'imagencanba'].map(alias => [`/canvas/${alias}`, 'image']),
      ['/reactions/all', 'json'], ['/search/google?query=prueba', 'json'],
      [`/download/yt?url=${encodeURIComponent(`https://www.youtube.com/watch?v=${id}`)}`, 'json']
    ];
    for (const [alias, type] of aliases) {
      await test(`alias ${alias.split('?')[0]}`, async () => {
        const r = await request(alias);
        assert.equal(r.status, 200, r.body.toString().slice(0, 300));
        if (type === 'image') assert.match(r.type, /^image\/png/);
        else assert.equal(json(r).status, true);
      });
    }
    await test('format=text y errores de usuario', async () => {
      const calc = await request('/tools/calculator?expr=2%2B2&format=text');
      assert.equal(calc.status, 200); assert.match(calc.type, /^text\/plain/); assert.match(calc.body.toString(), /4/);
      const reactionStub = P.reaction;
      try {
        P.reaction = originals.reaction;
        assert.equal((await request('/reactions/inventada')).status, 404);
      } finally { P.reaction = reactionStub; }
      // El proveedor inválido se valida con la implementación real en test-providers.
      assert.equal((await request('/canvas/inexistente')).status, 404);
      assert.equal((await request('/download')).status, 302);
      assert.equal((await request('/search')).status, 302);
    });

    // Todos los endpoints de imágenes/GIF también deben entregar el archivo.
    for (const cat of CATEGORIES.filter(c => c.id === 'anime' || c.id === 'reactions')) {
      for (const ep of cat.endpoints) {
        await test(`direct=true /${cat.id}/${ep.id}`, async () => {
          const r = await request(`/${cat.id}/${ep.id}?query=pikachu&direct=true&download=true`);
          assert.equal(r.status, 200);
          assert.match(r.type, /^image\//);
          assert.match(r.headers['content-disposition'], /^attachment/);
          assert.deepEqual(r.body, png);
        });
      }
    }

    const directCases = [
      ['tiktok', 'url=https%3A%2F%2Fwww.tiktok.com%2F%40user%2Fvideo%2F1&direct=mp4', /^video\//],
      ['tiktok', 'url=https%3A%2F%2Fwww.tiktok.com%2F%40user%2Fvideo%2F1&direct=mp3', /^audio\//],
      ['youtube', `url=https%3A%2F%2Fwww.youtube.com%2Fwatch%3Fv%3D${id}&direct=mp4`, /^video\//],
      ['youtube', `url=https%3A%2F%2Fwww.youtube.com%2Fwatch%3Fv%3D${id}&direct=mp3`, /^audio\//],
      ['facebook', 'url=https%3A%2F%2Fwww.facebook.com%2Fwatch%3Fv%3D123456&direct=true', /^video\//],
      ['instagram', 'url=https%3A%2F%2Fwww.instagram.com%2Freel%2FABC%2F&index=1&direct=true', /^image\//],
      ['pinterest', 'url=https%3A%2F%2Fpin.it%2Fabc&direct=true', /^image\//],
      ['mp3', `url=https%3A%2F%2Fwww.youtube.com%2Fwatch%3Fv%3D${id}&direct=true`, /^audio\//],
      ['mp4', `url=https%3A%2F%2Fwww.youtube.com%2Fwatch%3Fv%3D${id}&direct=true`, /^video\//],
      ['play', 'query=cancion&direct=true', /^audio\//]
    ];
    for (const [endpoint, params, type] of directCases) {
      await test(`archivo directo /downloader/${endpoint}`, async () => {
        const r = await request(`/downloader/${endpoint}?${params}&download=true`);
        assert.equal(r.status, 200, r.body.toString());
        assert.match(r.type, type);
        assert.match(r.headers['content-disposition'], /^attachment/);
        assert(r.body.length > 0);
      });
    }
    await test('Range 206 en archivo remoto', async () => {
      const r = await request(`/downloader/youtube?url=https%3A%2F%2Fyoutu.be%2F${id}&direct=mp4`, { headers: { Range: 'bytes=0-3' } });
      assert.equal(r.status, 206); assert.match(r.headers['content-range'], /^bytes 0-3\//); assert.equal(r.body.length, 4);
    });
    await test('Range inválido devuelve 416', async () => {
      const r = await request(`/downloader/youtube?url=https%3A%2F%2Fyoutu.be%2F${id}&direct=mp4`, { headers: { Range: 'bytes=9999-' } });
      assert.equal(r.status, 416); assert.match(r.headers['content-range'], /^bytes \*\//);
    });
    for (const format of ['txt', 'lrc', 'brat']) {
      await test(`/downloader/lyric format=${format}`, async () => {
        const r = await request(`/downloader/lyric?query=tema&format=${format}`);
        assert.equal(r.status, 200);
        assert.match(r.type, format === 'brat' ? /^image\/png/ : /^text\/plain/);
        if (format !== 'brat') assert.match(r.body.toString(), /hola mundo/i);
      });
    }
    await test('los proxies no entregan HTML como si fuera un archivo', async () => {
      const original = P.pinterestDownload;
      try {
        P.pinterestDownload = async () => ({ ...pin, image: `${fixture}/evil.html` });
        const r = await request('/downloader/pinterest?url=https%3A%2F%2Fpin.it%2Fabc&direct=true');
        assert.equal(r.status, 502); assert.match(r.type, /application\/json/);
        assert(!r.body.toString().includes('<script>'));
        P.pinterestDownload = async () => ({ ...pin, image: `${fixture}/redirect` });
        const redirected = await request('/downloader/pinterest?url=https%3A%2F%2Fpin.it%2Fabc&direct=true');
        assert.equal(redirected.status, 400);
      } finally { P.pinterestDownload = original; }
    });
    await test('/tools/tts devuelve audio directo', async () => {
      const r = await request('/tools/tts?text=hola&direct=true&download=true');
      assert.equal(r.status, 200); assert.match(r.type, /^audio\/mpeg/); assert.match(r.headers['content-disposition'], /^attachment/);
    });
    await test('/tools/stt acepta GET y POST JSON', async () => {
      const get = assertSuccess(await request('/tools/stt?audio=AAECAwQ='));
      const post = assertSuccess(await request('/tools/stt', { method: 'POST', body: { audio: 'data:audio/wav;base64,AAECAwQ=', lang: 'es' } }));
      assert.equal(get.text, 'audio transcrito'); assert.equal(post.text, 'audio transcrito'); assert.equal(post.mime, 'audio/wav');
    });
    await test('JSON inválido devuelve 400, no 500', async () => {
      const r = await request('/tools/stt', { method: 'POST', body: '{' }); assert.equal(r.status, 400);
    });
    await test('/tools/resize JSON enlaza a la imagen binaria', async () => {
      for (const mode of ['json=true', 'format=json']) {
        const r = await request(`/tools/resize?url=${encodeURIComponent(dataImage)}&width=32&${mode}`);
        const payload = assertSuccess(r);
        const image = await request(payload.image);
        assert.equal(image.status, 200); assert.match(image.type, /^image\/png/); assert.equal((await sharp(image.body).metadata()).width, 32);
      }
    });
    await test('/tools/resize acepta imagen de galería por POST', async () => {
      const r = await request('/tools/resize', { method: 'POST', body: { url: dataImage, width: 24 } });
      assert.equal(r.status, 200); assert.equal((await sharp(r.body).metadata()).width, 24);
      const j = assertSuccess(await request('/tools/resize?json=true', { method: 'POST', body: { image: dataImage, width: 24 } }));
      const image = await request(j.image); assert.equal(image.status, 200); assert.equal((await sharp(image.body).metadata()).width, 24);
    });
    await test('resize respeta orientación EXIF y reporta el tamaño real', async () => {
      const oriented = await sharp({ create: { width: 80, height: 40, channels: 3, background: '#ff0000' } })
        .jpeg().withMetadata({ orientation: 6 }).toBuffer();
      const r = await request('/tools/resize', { method: 'POST', body: { image: `data:image/jpeg;base64,${oriented.toString('base64')}`, width: 20 } });
      const meta = await sharp(r.body).metadata();
      assert.equal(meta.width, 20); assert.equal(meta.height, 40);
      const output = assertSuccess(await request('/tools/resize?json=true', { method: 'POST', body: { image: dataImage, width: 50, height: 50, fit: 'inside' } }));
      const file = await request(output.image);
      const actual = await sharp(file.body).metadata();
      assert.equal(output.width, actual.width); assert.equal(output.height, actual.height);
    });
    await test('archivos inválidos devuelven error de cliente', async () => {
      const fake = `data:image/png;base64,${Buffer.from('<script>x</script>').toString('base64')}`;
      assert.equal((await request('/upload', { method: 'POST', body: { image: fake } })).status, 400);
      assert.equal((await request('/upload', { method: 'POST', body: { image: `data:image/jpeg;base64,${png.toString('base64')}` } })).status, 400);
      assert.equal((await request('/upload', { method: 'POST', body: { image: `data:image/png;base64,${png.subarray(0, 40).toString('base64')}` } })).status, 400);
      assert.equal((await request('/upload', { method: 'POST', body: { image: `${dataImage}!` } })).status, 400);
      assert.equal((await request('/canvas/quotly', { method: 'POST', body: { image: fake } })).status, 400);
      assert.equal((await request('/tools/stt', { method: 'POST', body: { audio: 'data:audio/wav;base64,@@@' } })).status, 400);
    });
    await test('las subidas aceptan imágenes válidas por encima de 9 MB', async () => {
      const width = 1850, height = 1850;
      const raw = require('crypto').randomBytes(width * height * 3);
      const large = await sharp(raw, { raw: { width, height, channels: 3 } }).png({ compressionLevel: 0 }).toBuffer();
      assert(large.length > 9 * 1024 * 1024 && large.length < 15 * 1024 * 1024);
      const res = await request('/upload', { method: 'POST', body: { image: `data:image/png;base64,${large.toString('base64')}` } });
      assert.equal(res.status, 201, res.body.toString().slice(0, 300));
      require('../src/utils/uploadStore').clear();
    });
    for (const ep of CATEGORIES.find(c => c.id === 'canvas').endpoints.filter(e => !['attp', 'bratvideo'].includes(e.id))) {
      await test(`canvas con estilos extremos /canvas/${ep.id}`, async () => {
        const r = await request(`/canvas/${ep.id}`, { method: 'POST', body: {
          text: 'Hola', image: dataImage, size: 2, rotate: 45, x: 50, y: -50, zoom: 4
        } });
        assert.equal(r.status, 200, r.body.toString().slice(0, 300));
        assert.match(r.type, /^image\/png/);
      });
    }
    await test('caras desplazadas al otro borde se recortan sin error', async () => {
      for (const id of ['rata', 'minions']) {
        const r = await request(`/canvas/${id}`, { method: 'POST', body: { image: dataImage, x: -50, y: 50, zoom: 4 } });
        assert.equal(r.status, 200, r.body.toString().slice(0, 300));
      }
    });
    await test('quotly aplica sus partes y desplazamientos extremos', async () => {
      const simple = await request('/canvas/quotly?text=hola');
      const changed = await request('/canvas/quotly?text=hola&avatar.size=200&name.fill=ff0000&x=100&y=-100');
      assert.equal(changed.status, 200, changed.body.toString().slice(0, 300));
      assert.notDeepEqual(changed.body, simple.body);
    });
    await test('calculadora: signos, potencias, factorial y números grandes', async () => {
      for (const [expr, expected] of [['-2^2', -4], ['(-2)^2', 4], ['2^-2', 0.25], ['2^3^2', 512], ['10^300', 1e300]]) {
        const j = assertSuccess(await request(`/tools/calculator?expr=${encodeURIComponent(expr)}`));
        assert.equal(j.result, expected, expr);
      }
      assert.equal((await request('/tools/calculator?expr=fact(2.9)')).status, 400);
    });
    await test('subidas expiradas no sobreviven en la caché de imágenes', async () => {
      const up = await request('/upload', { method: 'POST', body: { image: dataImage } });
      assert.equal(up.status, 201);
      const url = json(up).result.url;
      const resize = `/tools/resize?url=${encodeURIComponent(url)}&width=32`;
      assert.equal((await request(resize)).status, 200);
      const now = Date.now;
      try {
        Date.now = () => now() + 31 * 60 * 1000;
        assert.equal((await request(url)).status, 404);
        assert.equal((await request(resize)).status, 400);
      } finally { Date.now = now; }
    });
    await test('canvas acepta varias fotos en una ranura', async () => {
      const r = await request('/canvas/quotly', { method: 'POST', body: { text: 'Hola', image: [dataImage, dataImage2] } });
      assert.equal(r.status, 200, r.body.toString().slice(0, 300)); assert.match(r.type, /^image\/png/);
    });
    await test('filtros limitan alto de imágenes muy verticales', async () => {
      const tall = await sharp({ create: { width: 64, height: 5000, channels: 3, background: '#ff00ff' } }).png().toBuffer();
      for (const endpoint of ['swirl', 'invert', 'gay']) {
        const r = await request(`/canvas/${endpoint}`, { method: 'POST', body: { image: `data:image/png;base64,${tall.toString('base64')}` } });
        assert.equal(r.status, 200); assert((await sharp(r.body).metadata()).height <= 4096);
      }
    });
    await test('rechazo de URL privada en imagen y audio', async () => {
      const privateUrl = `http://127.0.0.1:${port}/ping`;
      const r1 = await request(`/tools/resize?url=${encodeURIComponent(privateUrl)}&width=32`);
      const r2 = await request('/canvas/quotly', { method: 'POST', body: { image: privateUrl } });
      const r3 = await request(`/tools/stt?url=${encodeURIComponent(privateUrl)}`);
      assert.equal(r1.status, 400); assert.equal(r2.status, 400); assert.equal(r3.status, 400);
    });
    await test('cabeceras host maliciosas no inyectan scripts', async () => {
      const r = await request('/canvas', { headers: { 'X-Forwarded-Host': '</script><script>globalThis.injected=1</script>' } });
      assert.equal(r.status, 200); assert(!r.body.toString().includes('<script>globalThis.injected'));
    });

    // /play debe intentar también el audio, no sólo la ficha de cada video.
    await test('/play prueba el siguiente candidato si falla el audio', async () => {
      const save = { search: P.youtubeSearch, streams: P.youtubeStreams, audio: P.youtubeAudio, file: P.youtubeAudioFile, cobalt: COBALT.pedir };
      const calls = [];
      try {
        P.youtubeSearch = async () => ({ results: [{ id: 'first000001' }, { id: 'second00002' }] });
        P.youtubeStreams = async which => { calls.push(which); return which === 'first000001' ? { ...yt(which), formats: [] } : yt(which); };
        P.youtubeAudio = async () => { throw new Error('sin audio'); };
        COBALT.pedir = async () => { throw new Error('sin respaldo'); };
        P.youtubeAudioFile = async which => { if (which === 'first000001') throw new Error('bloqueado'); return audioFile; };
        const j = assertSuccess(await request('/downloader/play?query=tema&tries=2'));
        assert.equal(j.id, 'second00002'); assert.equal(j.fullSong, true); assert.match(j.playUrl, /tries=2/);
        assert.deepEqual(calls, ['first000001', 'second00002']);
        calls.length = 0;
        const direct = await request('/downloader/play?query=tema&tries=2&direct=true');
        assert.equal(direct.status, 200); assert.match(direct.type, /^audio\/mpeg/);
        assert.deepEqual(calls, ['first000001', 'second00002']);
      } finally { P.youtubeSearch = save.search; P.youtubeStreams = save.streams; P.youtubeAudio = save.audio; P.youtubeAudioFile = save.file; COBALT.pedir = save.cobalt; }
    });
    await test('/play no anuncia canción completa sin audio', async () => {
      const save = { search: P.youtubeSearch, streams: P.youtubeStreams, audio: P.youtubeAudio, cobalt: COBALT.pedir };
      try {
        P.youtubeSearch = async () => ({ results: [{ id: 'first000001' }] });
        P.youtubeStreams = async which => ({ ...yt(which), formats: [] });
        P.youtubeAudio = async () => { throw new Error('sin audio'); };
        COBALT.pedir = async () => { throw new Error('sin respaldo'); };
        const j = assertSuccess(await request('/downloader/play?query=tema&tries=1'));
        assert.equal(j.preview, true); assert.equal(j.fullSong, false);
      } finally { P.youtubeSearch = save.search; P.youtubeStreams = save.streams; P.youtubeAudio = save.audio; COBALT.pedir = save.cobalt; }
    });
    await test('/mp4 solicita DASH cuando mejora la calidad', async () => {
      const save = { resolve: P.resolveYoutubeTarget, playable: P.youtubePlayable };
      let calls = 0;
      try {
        P.resolveYoutubeTarget = async () => ({ ...yt(), formats: [
          { hasVideo: true, hasAudio: true, height: 360, url: videoUrl, mime: 'video/mp4' },
          { hasVideo: true, hasAudio: false, height: 1080, url: null, mime: 'video/mp4' },
          { hasVideo: false, hasAudio: true, url: audioUrl, mime: 'audio/mpeg' }
        ] });
        P.youtubePlayable = async () => { calls++; return { url: videoUrl, hasAudio: true, height: 1080, quality: '1080p' }; };
        const high = assertSuccess(await request('/downloader/mp4?query=tema&quality=1080'));
        assert.equal(high.video.height, 1080); assert.equal(calls, 1);
        const low = assertSuccess(await request('/downloader/mp4?query=tema&quality=360'));
        assert.equal(low.video.height, 360); assert.equal(calls, 1);
      } finally { P.resolveYoutubeTarget = save.resolve; P.youtubePlayable = save.playable; }
    });

    // Interacciones de búsqueda, enlaces profundos y probador en el DOM real.
    await test('buscador encuentra endpoints y descarta respuestas anteriores', async () => {
      const page = await request('/home');
      const docs = json(await request('/docs'));
      const dom = new JSDOM(page.body.toString(), { url: `http://127.0.0.1:${port}/home`, runScripts: 'outside-only' });
      try {
        const { window } = dom;
        let resolveDocs;
        window.fetch = () => new Promise(resolve => { resolveDocs = () => resolve(Response.json(docs)); });
        window.eval(fs.readFileSync(path.join(__dirname, '../public/js/home.js'), 'utf8'));
        const button = window.document.querySelector('[data-search-btn]');
        const input = window.document.querySelector('.searchbox input');
        const results = window.document.querySelector('.search-results');
        button.click();
        assert.equal(button.getAttribute('aria-expanded'), 'true');
        input.value = 'quotly'; input.dispatchEvent(new window.Event('input'));
        input.value = ''; input.dispatchEvent(new window.Event('input'));
        resolveDocs();
        await new Promise(resolve => setTimeout(resolve, 0));
        assert.equal(results.textContent, '', 'una búsqueda vieja no debe reaparecer');
        input.value = 'quotly'; input.dispatchEvent(new window.Event('input'));
        await new Promise(resolve => setTimeout(resolve, 0));
        assert(results.querySelector('a[href="/canvas#row-quotly"]'));
        button.click();
        assert.equal(button.getAttribute('aria-expanded'), 'false');
        assert.equal(input.value, '');
        assert([...window.document.querySelectorAll('.row.folder')].every(row => row.style.display !== 'none'));
      } finally { dom.window.close(); }
    });
    await test('enlace a endpoint abre el probador y conserva parámetros principales', async () => {
      const page = await request('/canvas');
      const dom = new JSDOM(page.body.toString(), { url: `http://127.0.0.1:${port}/canvas#row-quotly`, runScripts: 'outside-only' });
      try {
        const { window } = dom;
        window.Element.prototype.scrollIntoView = () => {};
        window.eval([...window.document.scripts].find(s => s.textContent.includes('window.VELIRIUS')).textContent);
        window.eval(fs.readFileSync(path.join(__dirname, '../public/js/category.js'), 'utf8'));
        const tester = window.document.getElementById('tester-quotly');
        const button = window.document.querySelector('[data-test-btn="quotly"]');
        assert.equal(button.getAttribute('aria-expanded'), 'true');
        assert(tester.classList.contains('open'));
        const bg = tester.querySelector('[data-param="bg"]');
        assert(bg && !bg.closest('.adv-fields'), 'los cuatro primeros parámetros deben ser visibles');
        const text = tester.querySelector('[data-param="text"]');
        text.value = 'Hola Velirius'; text.dispatchEvent(new window.Event('input', { bubbles: true }));
        assert.match(tester.querySelector('.code-url').textContent, /text=Hola\+Velirius/);
        assert.match(tester.querySelector('.code-fetch').textContent, /^fetch\("\/canvas\/quotly\?/);
        window.document.querySelector('[data-test-btn="brat"]').click();
        assert.equal(button.getAttribute('aria-expanded'), 'false');
        assert(window.document.getElementById('tester-brat').classList.contains('open'));
      } finally { dom.window.close(); }
    });

    // Probador web real en un DOM, incluyendo selección repetida de galería.
    await test('probador web muestra respuesta JSON de anime sin error de red', async () => {
      const page = await request('/anime');
      const dom = new JSDOM(page.body.toString(), { url: `http://127.0.0.1:${port}/anime`, runScripts: 'outside-only' });
      try {
        const { window } = dom;
        window.fetch = async (url, options) => {
          const r = await request(url, options || {});
          return new Response(r.body, { status: r.status, headers: r.headers });
        };
        window.eval([...window.document.scripts].find(s => s.textContent.includes('window.VELIRIUS')).textContent);
        window.eval(fs.readFileSync(path.join(__dirname, '../public/js/category.js'), 'utf8'));
        const row = window.document.querySelector('[data-endpoint="neko"]');
        const tester = row.nextElementSibling;
        tester.querySelector('[data-act="exec"]').click();
        await new Promise(resolve => setTimeout(resolve, 40));
        const result = tester.querySelector('.result').textContent;
        assert.match(result, /200 OK/); assert(!result.includes('ERROR DE RED'));
      } finally { dom.window.close(); }
    });
    await test('galería conserva el input y envía la foto por POST', async () => {
      const page = await request('/canvas');
      const dom = new JSDOM(page.body.toString(), { url: `http://127.0.0.1:${port}/canvas`, runScripts: 'outside-only' });
      try {
        const { window } = dom;
        let uploadCount = 0;
        let lastCanvasPost = null;
        window.URL.createObjectURL = () => 'blob:test';
        window.URL.revokeObjectURL = () => {};
        window.HTMLCanvasElement.prototype.getContext = () => ({ drawImage() {} });
        window.HTMLCanvasElement.prototype.toDataURL = () => dataImage;
        window.Image = class { set src(_) { this.width = 64; this.height = 48; queueMicrotask(() => this.onload()); } };
        window.fetch = async (url, options = {}) => {
          if (url === '/upload') { uploadCount++; return Response.json({ status: true, result: { url: `http://127.0.0.1:${port}/upload/fake${uploadCount}` } }); }
          if (String(url).startsWith('/canvas/quotly')) {
            lastCanvasPost = options;
            return new Response(png, { status: 200, headers: { 'content-type': 'image/png' } });
          }
          throw new Error(`Petición inesperada: ${url}`);
        };
        window.eval([...window.document.scripts].find(s => s.textContent.includes('window.VELIRIUS')).textContent);
        window.eval(fs.readFileSync(path.join(__dirname, '../public/js/category.js'), 'utf8'));
        const tester = window.document.querySelector('[data-endpoint="quotly"]').nextElementSibling;
        const input = tester.querySelector('input[type="file"][data-upload-for="image"]');
        const label = input.closest('label');
        Object.defineProperty(input, 'files', { configurable: true, value: [new window.File(['x'], 'a.png', { type: 'image/png' })] });
        input.dispatchEvent(new window.Event('change'));
        await new Promise(resolve => setTimeout(resolve, 30));
        assert(label.contains(input), 'el input no debe ser eliminado al cambiar el texto');
        input.dispatchEvent(new window.Event('change'));
        await new Promise(resolve => setTimeout(resolve, 30));
        assert(label.contains(input)); assert.equal(uploadCount, 2);
        tester.querySelector('[data-act="exec"]').click();
        await new Promise(resolve => setTimeout(resolve, 30));
        assert.equal(lastCanvasPost.method, 'POST');
        assert.equal(JSON.parse(lastCanvasPost.body).image.length, 2);
      } finally { dom.window.close(); }
    });
  } finally {
    await new Promise(resolve => server.close(resolve));
    global.fetch = originalFetch;
    for (const [key, value] of Object.entries(originals)) P[key] = value;
    fs.rmSync(temp, { recursive: true, force: true });
  }
  console.log(`\n${failures ? '✗' : '✓'} Endpoints: ${covered}/${totals().endpoints} comprobados; ${failures} fallo(s)`);
  if (failures) process.exitCode = 1;
}

main().catch(err => { console.error(err); process.exitCode = 1; });
