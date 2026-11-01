// Brat esférico: texto libre, estilos, rutas y compatibilidad, sin red externa.
const assert = require('node:assert/strict');
const { sharp } = require('../src/utils/image');
const { generateCanvas } = require('../src/canvas');
const { love } = require('../src/canvas/generators/_referencias');
const app = require('../src/server');

async function pixels(image, box) {
  let file = sharp(image);
  if (box) file = file.extract(box);
  return file.ensureAlpha().raw().toBuffer();
}
async function different(a, b, box) {
  assert.notDeepEqual(await pixels(a, box), await pixels(b, box));
}

(async () => {
  const base = await generateCanvas('bratV2', { text: 'Hola\nMundo' });
  const first = await generateCanvas('bratv2', { text: 'Chau\nMundo' });
  const second = await generateCanvas('bratv2', { text: 'Hola\nGatos' });
  const meta = await sharp(base).metadata();
  assert.deepEqual([meta.format, meta.width, meta.height], ['png', 736, 736]);
  await different(base, first, { left: 0, top: 0, width: 736, height: 350 });
  await different(base, second, { left: 0, top: 390, width: 736, height: 346 });
  await different(await generateCanvas('bratv2', { text: 'HOLA' }), await generateCanvas('bratv2', { text: 'hola' }));
  const upper = await generateCanvas('bratv2', { text: 'hola', uppercase: 'true' });
  assert.deepEqual(await pixels(upper), await pixels(await generateCanvas('bratv2', { text: 'HOLA' })));

  const styled = await generateCanvas('bratv2', { text: 'Hola 😻', color: 'ff0000', bg: '00ff00', 'canvas.size': 201 });
  assert.deepEqual([(await sharp(styled).metadata()).width, (await sharp(styled).metadata()).height], [201, 201]);
  const raw = await pixels(styled);
  assert.deepEqual([...raw.subarray(0, 4)], [0, 255, 0, 255], 'el fondo alcanza las esquinas');
  let reds = 0, emoji = 0;
  for (let i = 0; i < raw.length; i += 4) {
    if (raw[i] > 200 && raw[i + 1] < 45 && raw[i + 2] < 45) reds++;
    if (raw[i] > 180 && raw[i + 1] > 100 && raw[i + 2] < 80) emoji++;
  }
  assert.ok(reds > 50, 'se aplica el color del texto');
  assert.ok(emoji > 30, 'se conserva el color del emoji');
  for (const text of ['Una sola palabra', 'texto más largo con muchas palabras, números 123 y símbolos <3', 'áéíóú ñ 👨‍👩‍👧‍👦', 'palabra'.repeat(50), 'línea\n'.repeat(40)]) {
    const img = await generateCanvas('bratv2', { text, 'canvas.size': 400 });
    assert.equal((await sharp(img).metadata()).width, 400);
  }
  await assert.rejects(generateCanvas('bratv2', { text: 'a'.repeat(2001) }), e => e.status === 400);

  const server = await new Promise(resolve => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  try {
    const baseUrl = `http://127.0.0.1:${server.address().port}`;
    const get = await fetch(`${baseUrl}/canvas/bratV2?text=Hola%20Mundo&download=true`);
    assert.equal(get.status, 200);
    assert.match(get.headers.get('content-disposition'), /attachment/);
    assert.equal((await sharp(Buffer.from(await get.arrayBuffer())).metadata()).format, 'png');
    const post = await fetch(`${baseUrl}/canvas/bratv2`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text: 'Hola\nMundo', color: 'ff0000', 'canvas.size': 201 }) });
    assert.equal(post.status, 200);
    assert.equal((await sharp(Buffer.from(await post.arrayBuffer())).metadata()).width, 201);
    const legacy = await fetch(`${baseUrl}/canvas/ilove?text=money`);
    assert.equal(legacy.status, 200);
    assert.deepEqual(await pixels(Buffer.from(await legacy.arrayBuffer())), await pixels(await love({ text: 'money' })));
    const docs = await (await fetch(`${baseUrl}/docs`)).json();
    const list = docs.categories.find(c => c.id === 'canvas').endpoints;
    assert.equal(list.find(e => e.id === 'bratv2').name, 'bratV2');
    assert.ok(!list.some(e => e.id === 'ilove'));
    const page = await (await fetch(`${baseUrl}/canvas`)).text();
    assert.match(page, /bratV2/);
    const tooLong = await fetch(`${baseUrl}/canvas/bratv2`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text: 'a'.repeat(2001) }) });
    assert.equal(tooLong.status, 400);
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
  console.log('✓ bratV2: texto libre, esfera, estilos, emojis, GET/POST y ruta antigua');
})().catch(e => { console.error(e); process.exitCode = 1; });
