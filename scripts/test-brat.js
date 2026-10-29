// Pruebas de diseño y comportamiento de brat/bratvideo, sin depender de Drive.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { sharp } = require('../src/utils/image');
const { generateCanvas } = require('../src/utils/canvasEngine');
const { bratSpec, fitBratText } = require('../src/utils/brat');
const { bratFrame, bratVideo } = require('../src/utils/video');
const { textLayer, measure, wrapLines } = require('../src/utils/textEngine');
const { emojiImages } = require('../src/utils/emoji');
const app = require('../src/server');

const ffmpeg = require('@ffmpeg-installer/ffmpeg').path;
const sample = "you're here with me 💚✨";
const videoText = 'welcome to apireon api 💚🔥';

async function rgb(input) {
  return sharp(input).flatten({ background: '#ffffff' }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
}

function countPixels(data, predicate) {
  let count = 0;
  for (let i = 0; i < data.length; i += 3) if (predicate(data[i], data[i + 1], data[i + 2])) count++;
  return count;
}

function blackBounds({ data, info: { width, height } }) {
  let left = width, top = height, right = -1, bottom = -1;
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const i = (y * width + x) * 3;
    if (data[i] < 100 && data[i + 1] < 100 && data[i + 2] < 100) {
      left = Math.min(left, x); right = Math.max(right, x);
      top = Math.min(top, y); bottom = Math.max(bottom, y);
    }
  }
  return { left, top, right, bottom };
}

async function difference(a, b) {
  const aa = (await rgb(a)).data;
  const bb = (await rgb(b)).data;
  assert.equal(aa.length, bb.length);
  let total = 0;
  for (let i = 0; i < aa.length; i++) total += Math.abs(aa[i] - bb[i]);
  return total / aa.length;
}

/** Decodifica los frames reales del MP4 para verificar tiempos y contenido. */
function decodeVideo(buf, { firstOnly = false } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'velirius-test-brat-'));
  try {
    const file = path.join(dir, 'video.mp4');
    fs.writeFileSync(file, buf);
    const args = ['-hide_banner', '-loglevel', 'error', '-i', file, '-vsync', '0'];
    if (firstOnly) args.push('-frames:v', '1');
    args.push(path.join(dir, 'frame-%03d.png'));
    execFileSync(ffmpeg, args);
    const frames = fs.readdirSync(dir).filter(name => name.endsWith('.png')).sort()
      .map(name => fs.readFileSync(path.join(dir, name)));
    return frames;
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

async function main() {
  const imageSpec = bratSpec();
  const videoSpec = bratSpec({}, { video: true });
  assert.equal(imageSpec.S, 736);
  assert.equal(videoSpec.S, 512);
  assert.equal(bratSpec({ 'canvas.size': 201 }).S, 201);
  assert.equal(bratSpec({ 'canvas.size': 201 }, { video: true }).S, 202);

  // Geometría de la imagen de referencia y ajuste de cada estado del video.
  const fit = fitBratText(sample, imageSpec);
  assert.deepEqual(fit.lines, ["you're", 'here with', 'me 💚✨']);
  assert.ok(fit.fontSize >= 200 && fit.fontSize <= 207);
  const stages = [
    ['welcome', ['welcome']],
    ['welcome to', ['welcome', 'to']],
    ['welcome to apireon', ['welcome', 'to', 'apireon']],
    ['welcome to apireon api', ['welcome', 'to apireon', 'api']],
    [videoText, ['welcome', 'to apireon', 'api 💚🔥']]
  ];
  const sizes = stages.map(([text, lines]) => {
    const result = fitBratText(text, videoSpec);
    assert.deepEqual(result.lines, lines);
    return result.fontSize;
  });
  assert.ok(sizes[0] > sizes[2] && sizes[2] > sizes[3], 'el video ajusta el tamaño en cada estado');
  assert.equal(sizes[3], sizes[4]);

  // El texto es condensado, pero el ancho de un emoji no se distorsiona.
  const plain = measure('welcome', { size: 100, weight: 400 });
  const narrow = measure('welcome', { size: 100, weight: 400, horizontalScale: 0.74 });
  assert.ok(Math.abs(narrow / plain - 0.74) < 0.001);
  assert.equal(measure('💚', { size: 100, weight: 400, horizontalScale: 0.74, emojiScale: 0.93 }),
    measure('💚', { size: 100, weight: 400, horizontalScale: 1, emojiScale: 0.93 }));
  const familyEmoji = '👨‍👩‍👧‍👦';
  const wrapped = wrapLines(`A${familyEmoji}B`, 35, { size: 50, weight: 400, maxLines: 20 });
  assert.deepEqual(wrapped, ['A', familyEmoji, 'B']);
  const complexEmojis = '👩🏽‍💻🇺🇾1️⃣';
  const sprites = await emojiImages(complexEmojis);
  assert.equal(sprites.size, 3);
  const emojiLayer = textLayer({ text: complexEmojis, width: 500, height: 150, fontSize: 50, autoFit: false, emojiImages: sprites });
  assert.equal((emojiLayer.svg.toString().match(/<image /g) || []).length, 3);
  assert.equal(emojiLayer.missing, 0);

  const png = await generateCanvas('brat', { text: sample });
  const meta = await sharp(png).metadata();
  assert.equal(meta.format, 'png');
  assert.equal(meta.width, 736);
  assert.equal(meta.height, 736);
  const pixels = await rgb(png);
  const bounds = blackBounds(pixels);
  assert.ok(bounds.left >= 35 && bounds.left <= 55 && bounds.right >= 660 && bounds.right <= 710);
  assert.ok(bounds.top >= 65 && bounds.top <= 95 && bounds.bottom >= 645 && bounds.bottom <= 685);
  assert.ok(countPixels(pixels.data, (r, g, b) => g > r * 1.2 && g > b * 1.1 && g > 80 && r < 220) > 12000, 'corazón verde');
  assert.ok(countPixels(pixels.data, (r, g, b) => r > 180 && g > 120 && b < 100) > 3500, 'estrellas amarillas');
  const corner = await sharp(png).extract({ left: 0, top: 0, width: 25, height: 25 }).removeAlpha().raw().toBuffer();
  assert.ok(corner.every(value => value === 255), 'fondo blanco uniforme');

  // PNG y frame comparten exactamente el mismo render a igual tamaño y opciones.
  const image512 = await generateCanvas('brat', { text: videoText, 'canvas.size': 512 });
  assert.deepEqual(image512, await bratFrame(videoText));
  const custom = { text: 'hola 💚', bg: '8ace00', color: 'ff0000', 'text.fill': '0000ff', 'canvas.size': 320 };
  const customPng = await generateCanvas('brat', custom);
  const customRgb = await rgb(customPng);
  assert.deepEqual([...customRgb.data.subarray(0, 3)], [0x8a, 0xce, 0]);
  assert.ok(countPixels(customRgb.data, (r, g, b) => r < 60 && g < 60 && b > 180) > 100, 'text.fill tiene prioridad sobre color');
  assert.ok(countPixels(customRgb.data, (r, g, b) => g > r * 1.2 && g > b * 1.1 && g > 80 && r < 220) > 100, 'el emoji sigue a color');
  assert.deepEqual(customPng, await bratFrame(custom.text, custom));
  const styled = bratSpec({ font: 'serif', uppercase: 'true', rotate: 15, 'text.weight': 700, 'text.align': 'end', 'text.size': 0.5 });
  assert.equal(styled.family, 'serif');
  assert.equal(styled.uppercase, true);
  assert.equal(styled.rotate, 15);
  assert.equal(styled.weight, 700);
  assert.equal(styled.align, 'end');
  assert.ok(fitBratText('hola', styled).fontSize < fitBratText('hola', imageSpec).fontSize);
  assert.notDeepEqual(await generateCanvas('brat', { text: 'hola', uppercase: true }),
    await generateCanvas('brat', { text: 'hola' }));

  const long = 'palabras con acentos y alegría para probar ajustes sin cortar líneas largas '.repeat(5).trim();
  const longFit = fitBratText(long, imageSpec);
  assert.equal(longFit.lines.join(' '), long);
  const longBounds = blackBounds(await rgb(await generateCanvas('brat', { text: long })));
  assert.ok(longBounds.left > 0 && longBounds.top > 0 && longBounds.right < 735 && longBounds.bottom < 735);
  assert.throws(() => fitBratText('W'.repeat(1000), bratSpec({ 'canvas.size': 200 })), error => error.status === 400);
  console.log('✓ brat: referencia, dimensiones, ajustes, colores y emojis');

  const video = await bratVideo(videoText);
  assert.strictEqual(await bratVideo(videoText), video, 'la misma solicitud reutiliza la caché');
  assert.equal(video.subarray(4, 8).toString(), 'ftyp');
  const frames = decodeVideo(video);
  assert.equal(frames.length, 70, '2,8 segundos a 25 fps');
  for (let i = 0; i < stages.length; i++) {
    assert.ok(await difference(frames[i * 10], await bratFrame(stages[i][0])) < 1,
      `estado ${i + 1} aparece a los ${i * 0.4} s`);
  }
  assert.ok(await difference(frames[40], frames[69]) < 0.5, 'la página final permanece 1,2 s');

  const pageOpts = { words: 2, canvasSize: 256, size: 0.7 };
  const paged = decodeVideo(await bratVideo('uno dos tres cuatro', pageOpts));
  assert.equal(paged.length, 80, 'dos páginas de 1,6 s a 25 fps');
  for (const [index, text] of [[0, 'uno'], [10, 'uno dos'], [39, 'uno dos'], [40, 'tres'], [50, 'tres cuatro'], [79, 'tres cuatro']]) {
    assert.ok(await difference(paged[index], await bratFrame(text, pageOpts)) < 1, `página en frame ${index}`);
  }
  const cacheOpts = { canvasSize: 200, size: 0.4 };
  const left = await bratVideo('hola', cacheOpts);
  const centered = await bratVideo('hola', { ...cacheOpts, 'text.align': 'middle' });
  const spaced = await bratVideo('hola', { ...cacheOpts, spacing: 5 });
  assert.notDeepEqual(left, centered, 'la alineación distingue entradas de caché');
  assert.notDeepEqual(left, spaced, 'el espaciado distingue entradas de caché');
  const prefix = 'x'.repeat(199) + '👩🏽‍💻';
  assert.strictEqual(await bratVideo(`${prefix}z`, cacheOpts), await bratVideo(prefix, cacheOpts),
    'el límite de 200 grafemas no parte un emoji compuesto');
  console.log('✓ bratvideo: 25 fps, tiempos, páginas, emojis y caché');

  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const get = await fetch(`${base}/canvas/brat?text=${encodeURIComponent(sample)}`);
    assert.equal(get.status, 200);
    assert.match(get.headers.get('content-type'), /image\/png/);
    assert.equal((await sharp(Buffer.from(await get.arrayBuffer())).metadata()).width, 736);
    const post = await fetch(`${base}/canvas/bratvideo?color=ff0000`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text: 'hola mundo 💚', bg: '8ace00', 'text.fill': '0000ff', 'canvas.size': 201 })
    });
    assert.equal(post.status, 200);
    assert.match(post.headers.get('content-type'), /video\/mp4/);
    const [frame] = decodeVideo(Buffer.from(await post.arrayBuffer()), { firstOnly: true });
    assert.equal((await sharp(frame).metadata()).width, 202);
    const frameRgb = await rgb(frame);
    const [r, g, b] = frameRgb.data;
    assert.ok(Math.abs(r - 0x8a) < 12 && Math.abs(g - 0xce) < 12 && b < 12, 'color de fondo por POST');
    assert.ok(countPixels(frameRgb.data, (rr, gg, bb) => rr < 80 && gg < 80 && bb > 150) > 100, 'text.fill por POST');
    const tooLong = await fetch(`${base}/canvas/brat`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text: 'W'.repeat(1000), 'canvas.size': 200 })
    });
    assert.equal(tooLong.status, 400);
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
  console.log('✓ rutas GET/POST, opciones y tamaños impares');
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
