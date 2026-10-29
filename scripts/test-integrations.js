// HTTP de extremo a extremo: routers + providers reales; sólo se simulan los
// servidores externos. Así también se cubre la integración entre ambas capas.
const assert = require('assert/strict');
const http = require('http');
const { sharp } = require('../src/utils/image');
const { CATEGORIES } = require('../src/catalog');
const YT = require('../src/utils/youtube');
const app = require('../src/server');

const oldFetch = global.fetch;
const oldAvailable = YT.disponible;
const previousEnv = { ...process.env };
const fixture = 'https://cdn.fixture.test';
const imageUrl = `${fixture}/image.png`;
const videoUrl = `${fixture}/video.mp4`;
const audioUrl = `${fixture}/audio.mp3`;
const id = 'abc12345678';
let port;
function request(url) {
  return new Promise((resolve, reject) => {
    const req = http.get(`http://127.0.0.1:${port}${url}`, res => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode, type: res.headers['content-type'] || '', body: Buffer.concat(chunks) }));
    });
    req.setTimeout(20000, () => req.destroy(new Error('timeout')));
    req.on('error', reject);
  });
}
const json = data => Response.json(data);
const html = data => new Response(data, { headers: { 'content-type': 'text/html' } });

async function main() {
  process.env.COBALT_DISABLE = 'true';
  process.env.OPENAI_API_KEY = 'test-only-key';
  for (const key of ['GROQ_API_KEY', 'DEEPGRAM_API_KEY', 'ASSEMBLYAI_API_KEY', 'GOOGLE_TTS_KEY', 'COBALT_API_URL', 'COBALT_API_URLS']) delete process.env[key];
  YT.disponible = () => false;
  const png = await sharp({ create: { width: 32, height: 24, channels: 3, background: '#ff00ff' } }).png().toBuffer();
  const dataImage = `data:image/png;base64,${png.toString('base64')}`;
  const mp3 = Buffer.concat([Buffer.from('ID3'), Buffer.alloc(800)]);
  global.fetch = async input => {
    const url = new URL(String(input));
    const host = url.hostname, p = url.pathname;
    if (host === 'cdn.fixture.test') {
      const body = p.endsWith('.png') ? png : p.endsWith('.mp4') ? Buffer.from('video-fixture') : mp3;
      const type = p.endsWith('.png') ? 'image/png' : p.endsWith('.mp4') ? 'video/mp4' : 'audio/mpeg';
      return new Response(body, { headers: { 'content-type': type } });
    }
    if (host === 'nekos.best') return json({ results: [{ url: imageUrl, artist_name: 'Artista' }] });
    if (host === 'danbooru.donmai.us') return json({ rating: 'g', file_url: imageUrl });
    if (host === 'pokeapi.co') return p.includes('pokemon-species') ? json({ flavor_text_entries: [], genera: [] }) : json({
      id: 25, name: 'pikachu', height: 4, weight: 60, types: [], abilities: [], stats: [], sprites: { other: { 'official-artwork': { front_default: imageUrl } } }
    });
    if (host === 'translate.googleapis.com') return json([[['Hello', 'Hola']], null, 'es']);
    if (host === 'translate.google.com' && p === '/translate_tts') return new Response(mp3, { headers: { 'content-type': 'audio/mpeg' } });
    if (host === 'api.openai.com') return json({ text: 'transcripción de prueba' });
    if (host === 'www.tikwm.com') {
      const video = { id: '1', title: 'TikTok', hdplay: videoUrl, music: audioUrl, author: { unique_id: 'user' } };
      return p.includes('/feed/search') ? json({ code: 0, data: { videos: [video] } }) : json({ code: 0, data: video });
    }
    if (host === 'api.invidious.io') return json([]);
    if (host === 'www.youtube.com' && p === '/youtubei/v1/search') return json({ contents: { twoColumnSearchResultsRenderer: { primaryContents: { sectionListRenderer: { contents: [
      { itemSectionRenderer: { contents: [{ videoRenderer: { videoId: id, title: { runs: [{ text: 'Video' }] }, ownerText: { runs: [{ text: 'Canal' }] } } }] } }
    ] } } } } });
    if (host === 'yt.chocolatemoo53.com' && p.startsWith('/api/v1/videos/')) return json({
      title: 'Video', author: 'Canal', lengthSeconds: 60,
      formatStreams: [{ qualityLabel: '720p', type: 'video/mp4', url: videoUrl }],
      adaptiveFormats: [{ type: 'audio/mpeg', url: audioUrl, bitrate: 128000 }]
    });
    if (host.endsWith('facebook.com')) return html(`<meta property="og:title" content="Facebook">{"playable_url_quality_hd":"${videoUrl}"}`);
    if (host === 'oginstagram.com') return html(`<meta property="og:video" content="${videoUrl}"><meta property="og:image" content="${imageUrl}">`);
    if (host === 'www.pinterest.com') {
      if (p.includes('BaseSearchResource')) return json({ resource_response: { data: { results: [{ id: '1234567890', images: { orig: { url: imageUrl } } }] } } });
      if (p.includes('PinResource')) return json({ resource_response: { data: { id: '1234567890', images: { orig: { url: imageUrl } } } } });
      return html(`<meta property="og:image" content="${imageUrl}">`);
    }
    if (host === 'lrclib.net') return json([{ trackName: 'Tema', artistName: 'Artista', plainLyrics: 'hola mundo', syncedLyrics: '[00:01.00] hola mundo' }]);
    if (host === 'www.google.com') return html('<a href="https://example.org/article"><h3>Resultado de prueba</h3></a><p>Descripción</p>');
    if (host === 'es.wikipedia.org') return json({ query: { pages: { 1: { pageid: 1, index: 1, title: 'Artículo', extract: 'Resumen' } } } });
    throw new Error(`Proveedor no simulado: ${url.href}`);
  };
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  port = server.address().port;
  let tested = 0, failures = 0;
  const check = async (name, fn) => {
    try { await fn(); console.log(`✓ ${name}`); }
    catch (e) { failures++; console.error(`✗ ${name}: ${e.stack || e.message}`); }
  };
  try {
    for (const cat of CATEGORIES.filter(c => c.id !== 'canvas')) {
      for (const ep of cat.endpoints) {
        await check(`integración /${cat.id}/${ep.id}`, async () => {
          const params = {};
          for (const p of ep.params) {
            if (p.example === '' || p.example == null || p.example === '__AVATAR__' || p.example === '__AVATAR2__') continue;
            params[p.name] = String(p.example);
          }
          if (cat.id === 'anime' && ep.id !== 'pokemon') params.provider = ep.id === 'maid' ? 'danbooru' : 'nekos.best';
          if (cat.id === 'reactions') params.provider = 'nekos.best';
          if (cat.id === 'tools' && ep.id === 'resize') params.url = dataImage;
          if (cat.id === 'tools' && ep.id === 'stt') params.audio = 'AAECAwQ=';
          if (cat.id === 'downloader') params.direct = 'false';
          const res = await request(`/${cat.id}/${ep.id}?${new URLSearchParams(params)}`);
          assert.equal(res.status, 200, res.body.toString().slice(0, 500));
          if (cat.id === 'tools' && ep.id === 'resize') assert.match(res.type, /^image\/png/);
          else {
            const body = JSON.parse(res.body);
            assert.equal(body.status, true);
            assert(body.result != null);
            if (cat.id === 'reactions') assert.equal(body.result.gif, imageUrl);
            if (cat.id === 'searcher') assert(body.result.count > 0);
            if (cat.id === 'downloader' && ep.id === 'play') assert.equal(body.result.fullSong, true);
          }
          tested++;
        });
      }
    }
    for (const [endpoint, params, type] of [
      ['anime/neko', 'provider=nekos.best&direct=true', /^image\//],
      ['reactions/hug', 'provider=nekos.best&direct=true', /^image\//],
      ['downloader/tiktok', `url=${encodeURIComponent('https://www.tiktok.com/@user/video/1')}&direct=mp4`, /^video\//],
      ['downloader/facebook', `url=${encodeURIComponent('https://www.facebook.com/watch/?v=1234567')}&direct=true`, /^video\//],
      ['downloader/instagram', `url=${encodeURIComponent('https://www.instagram.com/reel/ABC123/')}&direct=true`, /^video\//],
      ['downloader/pinterest', `url=${encodeURIComponent('https://www.pinterest.com/pin/1234567890/')}&direct=true`, /^image\//],
      ['downloader/mp3', `url=${encodeURIComponent(`https://youtu.be/${id}`)}&direct=true`, /^audio\//],
      ['downloader/mp4', `url=${encodeURIComponent(`https://youtu.be/${id}`)}&direct=true`, /^video\//],
      ['downloader/play', 'query=tema&direct=true', /^audio\//]
    ]) {
      await check(`integración archivo /${endpoint}`, async () => {
        const res = await request(`/${endpoint}?${params}`);
        assert.equal(res.status, 200, res.body.toString().slice(0, 500)); assert.match(res.type, type); assert(res.body.length > 0);
      });
    }
    const expected = CATEGORIES.filter(c => c.id !== 'canvas').reduce((sum, cat) => sum + cat.endpoints.length, 0);
    await check('cobertura integrada de todas las rutas externas', () => assert.equal(tested, expected));
    console.log(`\n${failures ? '✗' : '✓'} Integraciones: ${tested}/${expected} rutas; ${failures} fallo(s)`);
  } finally {
    await new Promise(resolve => server.close(resolve));
    global.fetch = oldFetch;
    YT.disponible = oldAvailable;
    for (const key of Object.keys(process.env)) if (!(key in previousEnv)) delete process.env[key];
    Object.assign(process.env, previousEnv);
  }
  if (failures) process.exitCode = 1;
}
main().catch(e => { console.error(e); process.exitCode = 1; });
