// Pruebas HTTP de los ocho efectos con ffmpeg real y red simulada.
const assert = require('assert/strict');
const http = require('http');
const { execFileSync } = require('child_process');
const app = require('../src/server');
const { effects } = require('../src/utils/audioEffects');
const config = require('../src/config');

function request(port, path, options = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port, path, ...options }, res => {
      const parts = [];
      res.on('data', part => parts.push(part));
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(parts) }));
    });
    req.on('error', reject);
    req.end(options.body);
  });
}

async function main() {
  const ffmpeg = require('@ffmpeg-installer/ffmpeg').path;
  const wav = execFileSync(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=0.3', '-f', 'wav', 'pipe:1']);
  const originalFetch = global.fetch;
  const originalKey = config.geminiKey;
  let invalidFile = false;
  let captured;
  global.fetch = async (url, options) => {
    if (String(url).includes('generativelanguage.googleapis.com')) {
      captured = JSON.parse(options.body);
      return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: 'hola' }] } }] }), { headers: { 'content-type': 'application/json' } });
    }
    return new Response(invalidFile ? 'not audio' : wav, { headers: { 'content-type': 'audio/wav' } });
  };
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const port = server.address().port;
  try {
    for (const id of Object.keys(effects)) {
      const noUrl = await request(port, `/audios/${id}`);
      assert.equal(noUrl.status, 400, id);
      const result = await request(port, `/audios/${id}?url=https%3A%2F%2Fmedia.example%2Fa.wav&download=true`);
      assert.equal(result.status, 200, `${id}: ${result.body.toString()}`);
      assert.match(result.headers['content-type'], /^audio\/mpeg/);
      assert.match(result.headers['content-disposition'], /attachment/);
      assert.ok(result.body.length > 100);
      // El MP3 generado debe ser decodificable, no sólo tener encabezados válidos.
      execFileSync(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-i', 'pipe:0', '-f', 'null', '-'], { input: result.body });
      const range = await request(port, `/audios/${id}?url=https%3A%2F%2Fmedia.example%2Fa.wav`, { headers: { range: 'bytes=0-9' } });
      assert.equal(range.status, 206);
      assert.equal(range.body.length, 10);
      console.log(`✓ /audios/${id}: MP3 decodificable, descarga y Range`);
    }
    const postBody = JSON.stringify({ url: 'https://media.example/a.wav', pitch: 1.5 });
    assert.equal((await request(port, '/audios/robot', { method: 'POST', headers: { 'content-type': 'application/json' }, body: postBody })).status, 200);
    for (const path of ['/audios/robot?url=http://127.0.0.1/test', '/audios/bass?url=https://media.example/a&gain=NaN', '/audios/echo?url=https://media.example/a&delay=3']) {
      assert.equal((await request(port, path)).status, 400, path);
    }
    assert.equal((await request(port, '/audios/noexiste?url=https://media.example/a')).status, 404);
    for (const path of ['/audios/constructor', '/descargas/constructor', '/busquedas/constructor']) {
      assert.equal((await request(port, path)).status, 404, path);
    }
    invalidFile = true;
    assert.equal((await request(port, '/audios/robot?url=https://media.example/a')).status, 400);
    config.geminiKey = 'test-key';
    assert.equal((await request(port, '/ia/gemini?prompt=hola&temperature=0')).status, 200);
    assert.equal(captured.generationConfig.temperature, 0);
    assert.equal((await request(port, '/ia/gemini?prompt=hola&temperature=no')).status, 400);
    assert.equal((await request(port, '/css/style.css')).headers['access-control-allow-origin'], '*');
    console.log('✓ POST, validación, SSRF, audio inválido, Gemini y CORS');
  } finally {
    config.geminiKey = originalKey;
    global.fetch = originalFetch;
    await new Promise(resolve => server.close(resolve));
  }
}
main().catch(err => { console.error(err); process.exitCode = 1; });
