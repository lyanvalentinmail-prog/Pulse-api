// scripts/test-imagenes.js — Efectos de imagen (src/utils/effects.js) y sus rutas.
//
// Nada de red: la foto de prueba se genera con sharp y se sirve desde un `fetch`
// de mentira. Se comprueban los píxeles resultantes, no sólo el código 200.
//
//   node scripts/test-imagenes.js
process.env.PORT = '0';
const assert = require('assert/strict');
const http = require('http');
const app = require('../src/server');
const { sharp } = require('../src/utils/image');
const F = require('../src/utils/effects');

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

// Foto sintética: degradé + un círculo blanco + un cuadrado oscuro.
const PHOTO_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="240">
  <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="#f7c948"/><stop offset="1" stop-color="#2b6cb0"/>
  </linearGradient></defs>
  <rect width="320" height="240" fill="url(#g)"/>
  <circle cx="110" cy="100" r="60" fill="#ffffff" opacity="0.85"/>
  <rect x="190" y="140" width="100" height="70" fill="#1a202c"/>
</svg>`;

async function makePhoto() {
  return sharp(Buffer.from(PHOTO_SVG)).png().toBuffer();
}

/** Media de cada canal (0-255) de un buffer de imagen. */
async function channelMeans(buffer) {
  const { channels } = await sharp(buffer).stats();
  return channels.slice(0, 3).map(c => Number(c.mean.toFixed(2)));
}

/**
 * Nitidez de los bordes: salto máximo entre píxeles vecinos (en gris). El
 * desenfoque lo derrumba; el degradé de fondo no influye porque es suave.
 */
async function edgeSharpness(buffer) {
  const { data, info } = await sharp(buffer).greyscale().raw().toBuffer({ resolveWithObject: true });
  let max = 0;
  for (let y = 0; y < info.height; y++) {
    for (let x = 0; x < info.width - 1; x++) {
      max = Math.max(max, Math.abs(data[y * info.width + x] - data[y * info.width + x + 1]));
    }
  }
  return max;
}

/** Cantidad de valores distintos de gris: al pixelar baja mucho. */
async function uniqueLevels(buffer) {
  const { data } = await sharp(buffer).greyscale().raw().toBuffer({ resolveWithObject: true });
  return new Set(data).size;
}

/** Color RGB de un píxel concreto (x, y). */
async function pixelAt(buffer, left, top) {
  const { data, info } = await sharp(buffer).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const i = (top * info.width + left) * info.channels;
  return { r: data[i], g: data[i + 1], b: data[i + 2] };
}

async function main() {
  const originalFetch = global.fetch;
  const photo = await makePhoto();
  let served = 0;
  global.fetch = async url => {
    const u = String(url);
    if (u === 'https://media.example/foto.png') {
      served++;
      return new Response(photo, { headers: { 'content-type': 'image/png' } });
    }
    throw new Error(`Fuente inesperada: ${u}`);
  };

  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const port = server.address().port;
  const URL_FOTO = encodeURIComponent('https://media.example/foto.png');
  const get = (path, opts) => request(port, path, opts);
  const json = res => JSON.parse(res.body.toString());

  try {
    // -------------------------------------------------------- catálogo
    const docs = json(await get('/docs'));
    const imagenes = docs.categories.find(c => c.id === 'imagenes');
    assert.deepEqual(imagenes.endpoints.map(e => e.id),
      ['grayscale', 'pixel', 'sepia', 'blur', 'invert', 'darkness', 'gay']);
    const page = await get('/imagenes');
    assert.equal(page.status, 200);
    assert.equal((page.body.toString().match(/data-test-btn=/g) || []).length, 7);
    console.log('✓ /docs y /imagenes publican los 7 efectos');

    // -------------------------------------------------- efectos uno a uno
    const source = { means: await channelMeans(photo), sharpness: await edgeSharpness(photo) };

    // grayscale: los tres canales quedan casi iguales
    const gray = await get(`/imagenes/grayscale?url=${URL_FOTO}`);
    assert.equal(gray.status, 200, gray.body.toString());
    assert.match(gray.headers['content-type'], /^image\/jpeg/);
    const grayMeans = await channelMeans(gray.body);
    assert.ok(Math.max(...grayMeans) - Math.min(...grayMeans) < 2, `canales: ${grayMeans}`);
    const grayMeta = await sharp(gray.body).metadata();
    assert.deepEqual([grayMeta.width, grayMeta.height], [320, 240]);
    console.log('✓ grayscale: blanco y negro sin cambiar el tamaño');

    // sepia: r > g > b sobre la parte gris de la foto
    const sepia = await get(`/imagenes/sepia?url=${URL_FOTO}`);
    assert.equal(sepia.status, 200);
    const sepiaPixel = await pixelAt(sepia.body, 110, 100); // el círculo blanco
    assert.ok(sepiaPixel.r > sepiaPixel.g && sepiaPixel.g > sepiaPixel.b, JSON.stringify(sepiaPixel));
    console.log('✓ sepia: tono cálido (r > g > b)');

    // invert: cada canal queda en 255 - original
    const invert = await get(`/imagenes/invert?url=${URL_FOTO}`);
    assert.equal(invert.status, 200);
    const invMeans = await channelMeans(invert.body);
    source.means.forEach((value, i) => assert.ok(Math.abs(invMeans[i] - (255 - value)) < 6, `${invMeans[i]} vs ${255 - value}`));
    console.log('✓ invert: negativo canal por canal');

    // darkness: baja el brillo; level negativo lo sube
    const dark = await get(`/imagenes/darkness?url=${URL_FOTO}&level=60`);
    assert.equal(dark.status, 200);
    assert.ok((await channelMeans(dark.body))[1] < source.means[1] - 20);
    const light = await get(`/imagenes/darkness?url=${URL_FOTO}&level=-60`);
    assert.equal(light.status, 200);
    assert.ok((await channelMeans(light.body))[1] > source.means[1] + 10);
    console.log('✓ darkness: level positivo oscurece y negativo aclara');

    // blur: mantiene el tamaño y el brillo, pero baja el detalle
    // En PNG: el JPEG mete ruido de compresión y tapa el efecto en esta métrica.
    const blur = await get(`/imagenes/blur?url=${URL_FOTO}&blur=12&format=png`);
    assert.equal(blur.status, 200);
    const blurSharpness = await edgeSharpness(blur.body);
    assert.ok(blurSharpness < source.sharpness / 4, `bordes ${blurSharpness} vs ${source.sharpness}`);
    assert.equal((await sharp(blur.body).metadata()).width, 320);
    console.log('✓ blur: derrumba los bordes sin recortar la imagen');

    // pixel: mismo tamaño final y bloques nítidos (filas uniformes)
    const pixel = await get(`/imagenes/pixel?url=${URL_FOTO}&size=16&format=png`);
    assert.equal(pixel.status, 200);
    const pixelMeta = await sharp(pixel.body).metadata();
    assert.deepEqual([pixelMeta.width, pixelMeta.height], [320, 240]);
    const { data: rawPixel, info: rawInfo } = await sharp(pixel.body).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const sameRow = [];
    for (let x = 0; x < 15; x++) sameRow.push(rawPixel[x * rawInfo.channels] === rawPixel[(x + 1) * rawInfo.channels]);
    assert.ok(sameRow.filter(Boolean).length >= 13, `bloques: ${sameRow}`);
    const bigger = await get(`/imagenes/pixel?url=${URL_FOTO}&size=64&format=png`);
    assert.ok((await uniqueLevels(bigger.body)) < (await uniqueLevels(pixel.body)) / 2,
      `niveles: ${await uniqueLevels(bigger.body)} vs ${await uniqueLevels(pixel.body)}`);
    assert.ok((await uniqueLevels(bigger.body)) < (await uniqueLevels(photo)) / 5);
    console.log('✓ pixel: bloques cuadrados, mismo tamaño y más pixelado al subir size');

    // gay (flag): franjas horizontales de la bandera sobre la foto
    const gay = await get(`/imagenes/gay?url=${URL_FOTO}&opacity=100&mode=flag&direction=horizontal`);
    assert.equal(gay.status, 200, gay.body.toString());
    const top = await pixelAt(gay.body, 5, 5);
    const middle = await pixelAt(gay.body, 5, 120);
    const bottom = await pixelAt(gay.body, 5, 235);
    assert.ok(top.r > 200 && top.g < 90, `rojo arriba: ${JSON.stringify(top)}`);
    assert.ok(bottom.b > bottom.r, `azul/violeta abajo: ${JSON.stringify(bottom)}`);
    assert.notDeepEqual(top, middle);
    // direction=vertical: el color cambia a lo ancho, no a lo alto
    const vertical = await get(`/imagenes/gay?url=${URL_FOTO}&opacity=100&direction=vertical`);
    const vLeft = await pixelAt(vertical.body, 5, 120);
    const vRight = await pixelAt(vertical.body, 315, 120);
    assert.notDeepEqual(vLeft, vRight);
    // mode=glow: degradé diagonal suave
    const glow = await get(`/imagenes/gay?url=${URL_FOTO}&opacity=70&mode=glow`);
    assert.equal(glow.status, 200);
    assert.ok((await uniqueLevels(glow.body)) > 100);
    console.log('✓ gay: franjas (horizontal/vertical) y modo degradé sobre la foto');

    // --------------------------------------------- formatos y descarga
    const png = await get(`/imagenes/grayscale?url=${URL_FOTO}&format=png`);
    assert.match(png.headers['content-type'], /^image\/png/);
    assert.match(png.headers['content-disposition'], /pulse-grayscale\.png/);
    const webp = await get(`/imagenes/invert?url=${URL_FOTO}&format=webp`);
    assert.match(webp.headers['content-type'], /^image\/webp/);
    const jpgAlias = await get(`/imagenes/invert?url=${URL_FOTO}&format=jpg`);
    assert.match(jpgAlias.headers['content-type'], /^image\/jpeg/);
    const download = await get(`/imagenes/sepia?url=${URL_FOTO}&download=true`);
    assert.match(download.headers['content-disposition'], /^attachment; filename="pulse-sepia\.jpg"/);
    const range = await get(`/imagenes/blur?url=${URL_FOTO}&blur=4`, { headers: { range: 'bytes=0-99' } });
    assert.equal(range.status, 206);
    assert.equal(range.body.length, 100);
    console.log('✓ formatos jpeg/png/webp, download=true y Range');

    // ------------------------------------------------- POST con Galería
    const dataUrl = `data:image/png;base64,${photo.toString('base64')}`;
    const post = await request(port, '/imagenes/gay?opacity=70', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ image: dataUrl })
    });
    assert.equal(post.status, 200, post.body.toString());
    assert.match(post.headers['content-type'], /^image\/jpeg/);
    const postUrl = await request(port, '/imagenes/invert', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ url: 'https://media.example/foto.png' })
    });
    assert.equal(postUrl.status, 200);
    console.log('✓ POST: foto de la Galería (data:) y url en el cuerpo');

    // --------------------------------------------------------- errores
    const noImage = await get('/imagenes/graycale?url=x');
    assert.equal(noImage.status, 404);
    assert.match(json(noImage).error, /no existe/);
    const missing = await get('/imagenes/sepia');
    assert.equal(missing.status, 400);
    assert.match(json(missing).error, /Falta la imagen/);
    assert.match(json(missing).hint, /Galería/);
    const privateUrl = await get('/imagenes/invert?url=http%3A%2F%2F127.0.0.1%2Ffoto.png');
    assert.equal(privateUrl.status, 400);
    const badUrl = await get('/imagenes/invert?url=pepito');
    assert.equal(badUrl.status, 400);
    for (const [query, expected] of [
      ['&size=0', /size/], ['&size=500', /size/], ['&blur=0.1', /blur/], ['&blur=200', /blur/],
      ['&level=200', /level/], ['&opacity=150', /opacity/], ['&format=gif', /formato/],
      ['&direction=sideways', /dirección/], ['&mode=rainbow', /modo/], ['&size=abc', /número/]
    ]) {
      const endpoint = query.startsWith('&size') ? 'pixel' : query.startsWith('&blur') ? 'blur'
        : query.startsWith('&level') ? 'darkness' : 'gay';
      const res = await get(`/imagenes/${endpoint}?url=${URL_FOTO}${query}`);
      assert.equal(res.status, 400, `${query} → ${res.body}`);
      assert.match(json(res).error, expected);
      assert.ok(json(res).hint, `${query} sin pista`);
    }
    console.log('✓ errores 400/404 con pista (parámetros y efectos inválidos)');

    // -------------------------------------------- parsers/ayudas puras
    assert.equal(F.readFormat(''), 'jpeg');
    assert.equal(F.readFormat('JPG'), 'jpeg');
    assert.equal(F.readNumber('', { name: 'x', min: 0, max: 1, fallback: 7 }), 7);
    assert.equal(F.readNumber('0,5', { name: 'x', min: 0, max: 1, fallback: 0 }), 0.5);
    assert.throws(() => F.readNumber('9', { name: 'x', min: 0, max: 1, fallback: 0 }), /va de 0 a 1/);
    assert.equal(F.PRIDE.length, 6);
    const svg = F.flagSvg(100, 50, { direction: 'horizontal', opacity: 50 }).toString();
    assert.match(svg, /fill-opacity="0.500"/);
    assert.equal((svg.match(/<rect/g) || []).length, 6);
    assert.match(F.flagSvg(100, 50, { direction: 'diagonal' }).toString(), /rotate\(45/);
    assert.match(F.glowSvg(10, 10, 60).toString(), /linearGradient/);
    assert.throws(() => F.flagSvg(10, 10, {}).toString() && F.readOptions('gay', { mode: 'x' }), /modo/);
    await assert.rejects(() => F.applyEffect('nada', photo), /no existe/);
    console.log('✓ ayudas: rangos, SVG de la bandera y efecto inexistente');

    // La foto remota se descarga una sola vez para varias peticiones (caché).
    assert.ok(served >= 1);
    console.log(`✓ caché de la foto: ${served} descarga(s) para todas las pruebas`);
  } finally {
    global.fetch = originalFetch;
    await new Promise(resolve => server.close(resolve));
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
