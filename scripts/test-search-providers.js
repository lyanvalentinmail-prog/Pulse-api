// Protocolos de los tres proveedores simulados, incluyendo reintentos y caché.
const assert = require('assert/strict');
const http = require('http');
const app = require('../src/server');
const S = require('../src/utils/search');

function get(port, path, headers = {}) {
  return new Promise((resolve, reject) => {
    http.get({ host: '127.0.0.1', port, path, headers }, res => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks) }));
    }).on('error', reject);
  });
}
const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } });

async function main() {
  const original = global.fetch;
  let warm = 0, pins = 0, tik = 0, sticker = 0;
  const references = [];
  global.fetch = async (input, opts = {}) => {
    const url = String(input);
    const headers = new Headers(opts.headers);
    if (url === 'https://www.pinterest.com/') {
      warm++;
      return new Response('', { headers: { 'set-cookie': `csrftoken=token${warm}; Path=/; HttpOnly` } });
    }
    if (url.includes('pinterest.com/resource/')) {
      pins++;
      assert.equal(opts.redirect, 'error');
      assert.equal(headers.get('cookie'), `csrftoken=token${warm}`);
      assert.equal(headers.get('x-csrftoken'), `token${warm}`);
      assert.equal(headers.get('x-pinterest-pws-handler'), 'www/search/pins.js');
      if (pins === 1) return json({}, 403);
      return json({ resource_response: { data: { results: [{ id: 'pin', images: { orig: { url: 'https://media.example/pin.jpg' } } }] } } });
    }
    if (url.includes('tikwm.com/api/feed/search')) {
      tik++;
      assert.equal(new URL(url).searchParams.get('keywords'), 'gato');
      return json({ code: 0, data: { videos: [{ id: '123', play: 'https://media.example/video.mp4' }] } });
    }
    if (url === 'http://api.sticker.ly/v3.1/stickerPack/search?withAnimation=true') {
      sticker++;
      assert.equal(opts.method, 'POST');
      assert.equal(opts.redirect, 'error');
      assert.match(headers.get('x-duid'), /^[a-f0-9]{16}$/);
      assert.match(headers.get('user-agent'), /androidapp.stickerly/);
      assert.deepEqual(JSON.parse(opts.body), { keyword: 'gato', cursor: 0 });
      return json({ result: { stickerPacks: [{ packId: 'PACK1', name: 'Gatos', authorName: 'Autor', resourceUrlPrefix: 'https://media.example/stickers/', resourceFiles: ['one.webp', 'two.webp'] }] } });
    }
    if (url.startsWith('https://media.example/')) {
      references.push(headers.get('referer'));
      const range = headers.has('range');
      return new Response('0123456789', { status: range ? 206 : 200, headers: { 'content-type': url.endsWith('.mp4') ? 'video/mp4' : 'image/webp', ...(range ? { 'content-range': 'bytes 0-9/10' } : {}) } });
    }
    throw new Error(`URL inesperada: ${url}`);
  };
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const port = server.address().port;
  try {
    for (const id of ['pinterest', 'tiktok', 'stickerly']) {
      const response = await get(port, `/searcher/${id}?q=gato&limit=2`);
      assert.equal(response.status, 200, `${id}: ${response.body}`);
      const items = JSON.parse(response.body).result.items;
      assert.ok(items.length && items[0].playback && items[0].downloadUrl);
      if (id === 'stickerly') {
        assert.equal(items.length, 2);
        assert.equal(items[0].image, 'https://media.example/stickers/one.webp');
        assert.equal(items[0].link, 'https://sticker.ly/s/PACK1');
        assert.notEqual(items[0].id, items[1].id);
      }
      if (id === 'tiktok') assert.equal(items[0].link, 'https://www.tiktok.com/@_/video/123');
      assert.equal((await get(port, items[0].playback, { range: 'bytes=0-9' })).status, 206);
      assert.match((await get(port, items[0].downloadUrl)).headers['content-disposition'], /attachment/);
    }
    assert.equal(warm, 2, 'renueva sesión una vez tras 403');
    assert.equal(pins, 2, 'una búsqueda y su reintento, no una por vista previa');
    assert.equal(tik, 1, 'no repite la búsqueda para cada archivo');
    assert.equal(sticker, 1, 'no repite la búsqueda para cada archivo');
    assert.ok(references.includes('https://www.pinterest.com/'));
    assert.ok(references.includes('https://www.tiktok.com/'));
    const preview = S.parseStickerly({ result: { stickerPacks: [{ packId: 'XYZ', name: 'Pack', thumbnailUrl: 'https://media.example/cover.webp' }] } }, 1);
    assert.equal(preview[0].link, 'https://sticker.ly/s/XYZ');
    console.log('✓ Pinterest: sesión y renovación CSRF; TikTok: reproducción sin búsquedas redundantes');
    console.log('✓ Sticker.ly: POST móvil, archivos por pack y descarga; miniaturas de packs');
  } finally {
    global.fetch = original;
    await new Promise(resolve => server.close(resolve));
  }
}
main().catch(e => { console.error(e); process.exitCode = 1; });
