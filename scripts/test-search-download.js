// Pruebas HTTP de proveedores simulados y del probador web en un DOM real.
const assert = require('assert/strict');
const { JSDOM } = require('jsdom');
const http = require('http');
const fs = require('fs');
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
    req.on('error', reject); req.end(opts.body);
  });
}
const jsonResponse = value => new Response(JSON.stringify(value), { headers: { 'content-type': 'application/json' } });

async function main() {
  const originalFetch = global.fetch;
  const originalYoutube = E.youtube;
  const originalToMp3 = E.toMp3;
  const originals = Object.fromEntries(['tiktok', 'pinterest', 'instagram', 'facebook', 'spotify'].map(name => [name, E[name]]));
  const fixtures = {
    'pinterest.com/resource': { resource_response: { data: { results: [{ id: '1', title: 'pin', images: { orig: { url: 'https://media.example/image.jpg' } } }] } } },
    'tikwm.com/api/feed/search': { data: { videos: [{ video_id: '1', title: 'cat', play: 'https://media.example/video.mp4' }] } },
    '/search?q=': { items: [{ type: 'stream', url: '/watch?v=abcdefghijk', title: 'video' }] },
    '/api/v1/search': [{ videoId: 'abcdefghijk', title: 'video' }],
    'api.sticker.ly': { result: { stickers: [{ stickerId: '1', resourceUrl: 'https://media.example/sticker.png' }] } }
  };
  global.fetch = async (url, opts = {}) => {
    const u = String(url);
    if (u.includes('media.example')) {
      const range = new Headers(opts.headers).has('range');
      return new Response(Buffer.from('0123456789'), { status: range ? 206 : 200, headers: { 'content-type': u.includes('.mp4') ? 'video/mp4' : u.includes('.mp3') ? 'audio/mpeg' : 'image/jpeg', ...(range ? { 'content-range': 'bytes 0-9/10' } : {}) } });
    }
    if (u.includes('besthdwallpapers.org')) return new Response('<a href="/cat"><img src="/blank.png" data-src="https://media.example/cat.jpg?v=1" alt="cat"></a>');
    if (u.includes('motionbgs.com')) return new Response('<a href="/cat"><img src="https://media.example/cat.jpg"></a>');
    const key = Object.keys(fixtures).find(k => u.includes(k));
    if (key) return jsonResponse(fixtures[key]);
    throw new Error(`Fuente inesperada: ${u}`);
  };
  E.youtube = async () => ({ id: 'abcdefghijk', source: 'piped:test', download: 'https://media.example/video.mp4' });
  E.toMp3 = async () => Buffer.from('MP3 data');
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const port = server.address().port;
  try {
    for (const id of ['pinterest', 'tiktok', 'youtube', 'wallpapers', 'wallpapersv2', 'stickerly']) {
      const result = await request(port, `/busquedas/${id}?q=cat&limit=1`);
      assert.equal(result.status, 200, `${id}: ${result.body}`);
      const items = JSON.parse(result.body).result.items;
      assert.equal(items.length, 1, id);
      assert.ok(items[0].playback && items[0].downloadUrl, id);
      const media = await request(port, items[0].playback, { headers: { range: 'bytes=0-9' } });
      assert.equal(media.status, 206, id);
      const download = await request(port, items[0].downloadUrl);
      assert.equal(download.status, 200, id);
      assert.match(download.headers['content-disposition'], /attachment/, id);
      const alias = await request(port, `/searcher/${id}?q=cat&limit=1`);
      assert.equal(alias.status, 200, id);
      assert.match(JSON.parse(alias.body).result.items[0].playback, /^\/searcher\//);
      const post = await request(port, `/busquedas/${id}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ q: 'cat', limit: 1 }) });
      assert.equal(post.status, 200, id);
      console.log(`✓ ${id}: búsqueda, alias, POST, reproducción y descarga`);
    }
    assert.deepEqual(S.parsePinterestSearch({ resource_response: { data: { results: {} } } }, 10), []);
    assert.deepEqual(S.parseTikTokSearch({ data: { videos: {} } }, 10), []);
    assert.deepEqual(S.parsePipedSearch({ items: {} }, 10), []);
    assert.equal(S.parsePinterestSearch({ resource_response: { data: { results: [{ images: { orig: { url: 'https://media.example/a.jpg' } }, videos: { video_list: { V_HLSV4: { url: 'https://media.example/a.m3u8' } } } }] } } }, 10)[0].type, 'image');
    assert.equal(S.parseBestHdWallpapers('<img src="https://media.example/logo.jpg">', 10).length, 0);
    assert.match(S.parseBestHdWallpapers('<a href="/cat"><img src="/blank.png" data-src="/cat.jpg?size=1"></a>', 1)[0].image, /cat.jpg\?size=1/);

    // Un fallo del proveedor no debe convertirse en resultados inventados.
    const mockedFetch = global.fetch;
    global.fetch = async () => { throw new Error('fetch failed'); };
    for (const id of ['pinterest', 'tiktok', 'youtube', 'wallpapers', 'wallpapersv2', 'stickerly']) {
      const failure = await request(port, `/busquedas/${id}?q=cat`);
      assert.ok(failure.status >= 400, id);
      assert.equal(JSON.parse(failure.body).status, false, id);
    }
    global.fetch = mockedFetch;
    console.log('✓ Los seis buscadores informan errores de proveedor');

    const downloads = {
      tiktok: { video: 'https://media.example/video.mp4', id: '123' },
      pinterest: { type: 'image', image: 'https://media.example/image.jpg' },
      instagram: { type: 'video', video: 'https://media.example/video.mp4' },
      facebook: { video: 'https://media.example/video.mp4' },
      spotify: { preview: 'https://media.example/audio.mp3' }
    };
    for (const [id, data] of Object.entries(downloads)) E[id] = async () => data;
    for (const id of [...Object.keys(downloads), 'youtubemp4', 'youtubemp3', 'audio']) {
      const result = await request(port, `/descargas/${id}?url=https%3A%2F%2Fmedia.example%2Finput.mp4&direct=false`);
      assert.equal(result.status, 200, id);
      const data = JSON.parse(result.body).result;
      assert.ok(data.playback && data.downloadUrl, id);
      assert.equal(new URL(data.playback, 'http://pulse.test').searchParams.get('direct'), 'true');
      const playback = await request(port, data.playback);
      assert.equal(playback.status, 200, id);
      const file = await request(port, data.downloadUrl);
      assert.equal(file.status, 200, id);
      assert.match(file.headers['content-disposition'], /attachment/, id);
      console.log(`✓ descarga ${id}: JSON, reproducción y archivo`);
    }
    E.spotify = async () => ({ preview: '', thumbnail: 'https://media.example/image.jpg' });
    const noPreview = JSON.parse((await request(port, '/descargas/spotify?url=https://media.example/x')).body).result;
    assert.equal(noPreview.playback, undefined);
    assert.equal((await request(port, '/descargas/spotify?url=https://media.example/x&direct=true')).status, 404);

    // La página real y su JS: comprueba la vista previa con el parámetro por defecto direct=false.
    const page = await request(port, '/descargas');
    const dom = new JSDOM(page.body.toString(), { url: 'http://pulse.test/descargas', runScripts: 'outside-only' });
    dom.window.fetch = async path => {
      const url = new URL(path, 'http://pulse.test');
      assert.equal(url.searchParams.get('direct'), 'false');
      const endpoint = url.pathname.split('/').pop();
      const result = {
        tiktok: { type: 'video', video: 'https://media.example/video.mp4' },
        pinterest: { type: 'image', image: 'https://media.example/image.jpg' },
        spotify: { preview: 'https://media.example/audio.mp3' }
      }[endpoint];
      assert.ok(result, endpoint);
      return jsonResponse({ result });
    };
    dom.window.eval(dom.window.document.querySelector('script:not([src])').textContent);
    dom.window.eval(fs.readFileSync('public/js/category.js', 'utf8'));
    const tester = dom.window.document.querySelector('#tester-tiktok');
    tester.querySelector('[data-act="exec"]').click();
    await new Promise(resolve => setTimeout(resolve, 20));
    const player = tester.querySelector('.result video');
    assert.ok(player, tester.querySelector('.result').textContent);
    const playerUrl = new URL(player.getAttribute('src'), 'http://pulse.test');
    assert.deepEqual(playerUrl.searchParams.getAll('direct'), ['true']);
    const download = new URL(tester.querySelector('.result a.dl').getAttribute('href'), 'http://pulse.test');
    assert.equal(download.searchParams.get('direct'), 'true');
    assert.equal(download.searchParams.get('download'), 'true');
    for (const [id, selector] of [['pinterest', '.result img'], ['spotify', '.result audio']]) {
      const panel = dom.window.document.querySelector(`#tester-${id}`);
      panel.querySelector('[data-act="exec"]').click();
      await new Promise(resolve => setTimeout(resolve, 20));
      const media = panel.querySelector(selector);
      assert.ok(media, `${id}: ${panel.querySelector('.result').textContent}`);
      assert.deepEqual(new URL(media.getAttribute('src'), 'http://pulse.test').searchParams.getAll('direct'), ['true']);
      assert.equal(new URL(panel.querySelector('.result a.dl').getAttribute('href'), 'http://pulse.test').searchParams.get('download'), 'true');
    }
    dom.window.close();
    console.log('✓ Probador web: imagen, video y audio con direct=false inicial');
  } finally {
    Object.assign(E, originals); E.youtube = originalYoutube; E.toMp3 = originalToMp3; global.fetch = originalFetch;
    await new Promise(resolve => server.close(resolve));
  }
}
main().catch(err => { console.error(err); process.exitCode = 1; });
