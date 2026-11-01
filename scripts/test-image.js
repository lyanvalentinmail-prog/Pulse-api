// scripts/test-image.js — Pruebas SIN red de /ia/image (utilidades de Perchance).
//
//   node scripts/test-image.js
//
// No llama a perchance.org: los proveedores se inyectan, así el test corre igual
// en CI y en cualquier máquina sin salida a internet.
const assert = require('node:assert/strict');
const P = require('../src/utils/perchance');

let failures = 0;
const ok = (name, fn) => {
  try { fn(); console.log(`✓ ${name}`); }
  catch (e) { failures++; console.log(`✗ ${name} — ${e.message}`); }
};
const okAsync = async (name, fn) => {
  try { await fn(); console.log(`✓ ${name}`); }
  catch (e) { failures++; console.log(`✗ ${name} — ${e.message}`); }
};

const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(200, 7)]);
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(200, 1)]);
const dataUrl = (mime, buffer) => `data:${mime};base64,${buffer.toString('base64')}`;

// ------------------------------------------------------------------- estilos
ok('applyStyle suma el estilo al prompt y a los negativos', () => {
  const r = P.applyStyle('un gato', 'anime', 'feo');
  assert.match(r.prompt, /^un gato, anime style/);
  assert.match(r.negative, /^feo, photo, realistic$/);
});

ok('applyStyle sin estilo (o desconocido) no toca nada', () => {
  assert.deepEqual(P.applyStyle('un gato', '', ''), { prompt: 'un gato', negative: '' });
  assert.deepEqual(P.applyStyle('un gato', 'no-existe', 'x'), { prompt: 'un gato', negative: 'x' });
});

ok('Los estilos del catálogo existen en el motor', () => {
  assert.ok(P.STYLE_NAMES.includes('cinematic'));
  assert.equal(P.STYLE_NAMES.length, Object.keys(P.STYLES).length);
});

// -------------------------------------------------------------- resoluciones
ok('normResolution acepta tamaños, alias y basura', () => {
  assert.equal(P.normResolution('512x768'), '512x768');
  assert.equal(P.normResolution('768×768'), '768x768');
  assert.equal(P.normResolution('portrait'), '512x768');
  assert.equal(P.normResolution('LANDSCAPE'), '768x512');
  assert.equal(P.normResolution('cuadrado'), '768x768');
  assert.equal(P.normResolution('9999x9999'), '768x768');
  assert.equal(P.normResolution(undefined), '768x768');
});

ok('normSeed / normGuidance recortan al rango útil', () => {
  assert.equal(P.normSeed('42'), 42);
  assert.equal(P.normSeed('-1'), -1);
  assert.equal(P.normSeed('abc'), -1);
  assert.equal(P.normSeed(''), -1);
  assert.equal(P.normSeed('99999999999'), 2147483647);
  assert.equal(P.normGuidance('0'), 1);
  assert.equal(P.normGuidance('99'), 30);
  assert.equal(P.normGuidance('x'), 7);
});

// ------------------------------------------------------------------ imágenes
ok('parseDataUrl decodifica base64 y descarta lo que no es imagen', () => {
  const parsed = P.parseDataUrl(dataUrl('image/jpeg', JPEG));
  assert.equal(parsed.mime, 'image/jpeg');
  assert.equal(parsed.buffer.length, JPEG.length);
  assert.equal(P.parseDataUrl('https://x/y.jpg'), null);
  assert.equal(P.parseDataUrl('data:image/jpeg;base64,'), null);
});

ok('sniffMime reconoce JPEG, PNG y WEBP por los bytes', () => {
  assert.equal(P.sniffMime(JPEG), 'image/jpeg');
  assert.equal(P.sniffMime(PNG), 'image/png');
  const webp = Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WEBP'), Buffer.alloc(64)]);
  assert.equal(P.sniffMime(webp), 'image/webp');
  assert.equal(P.sniffMime(Buffer.from('no soy una imagen')), null);
});

ok('extractImage: data URL, proxy anidado e imageId', () => {
  const desdeData = P.extractImage({ imageDataUrls: [dataUrl('image/png', PNG)] });
  assert.equal(desdeData.mime, 'image/png');

  const desdeProxy = P.extractImage({ result: { imageDownloadUrl: '/api/downloadTemporaryImageViaProxy?t=v1.abc' } });
  assert.equal(desdeProxy.proxy, 'https://image-generation.perchance.org/api/downloadTemporaryImageViaProxy?t=v1.abc');

  const token = `v1.${'a'.repeat(120)}`;
  const desdeToken = P.extractImage({ imageId: 'x1', token });
  assert.match(desdeToken.proxy, /downloadTemporaryImageViaProxy\?t=v1\./);

  assert.deepEqual(P.extractImage({ imageId: 'abc' }), { imageId: 'abc' });
  assert.equal(P.extractImage({ status: 'success' }), null);
});

ok('absoluteProxyUrl arma la URL final en todos los formatos', () => {
  assert.equal(P.absoluteProxyUrl('/downloadTemporaryImageViaProxy?t=1'),
    'https://image-generation.perchance.org/api/downloadTemporaryImageViaProxy?t=1');
  assert.equal(P.absoluteProxyUrl('https://otro/x'), 'https://otro/x');
  assert.match(P.absoluteProxyUrl('v1.abc'), /downloadTemporaryImageViaProxy\?t=v1\.abc$/);
});

// ------------------------------------------------------------ generateImage
(async () => {
  await okAsync('generateImage devuelve archivo, proveedor y metadatos', async () => {
    P._reset();
    const r = await P.generateImage(
      { prompt: 'un gato', style: 'no-existe', seed: '7', resolution: 'portrait' },
      { impl: { perchance: async opts => ({ buffer: JPEG, mime: 'image/jpeg', extension: 'jpg', seed: opts.seed, width: 512, height: 768, prompt: opts.prompt, nsfw: false, source: 'perchance' }) } }
    );
    assert.equal(r.provider, 'perchance');
    assert.equal(r.mime, 'image/jpeg');
    assert.equal(r.seed, 7);
    assert.equal(r.resolution, '512x768');
    assert.equal(r.cached, false);
    assert.ok(r.negativePrompt.includes('NSFW'));
  });

  await okAsync('La segunda llamada idéntica sale de la caché', async () => {
    let llamadas = 0;
    const impl = { perchance: async opts => { llamadas++; return { buffer: PNG, mime: 'image/png', extension: 'png', seed: 1, prompt: opts.prompt, nsfw: false }; } };
    await P.generateImage({ prompt: 'un perro', seed: 3 }, { impl });
    const otra = await P.generateImage({ prompt: 'un perro', seed: 3 }, { impl });
    assert.equal(llamadas, 1);
    assert.equal(otra.cached, true);
  });

  await okAsync('auto: si Perchance falla, usa Pollinations', async () => {
    const r = await P.generateImage({ prompt: 'una casa' }, {
      impl: {
        perchance: async () => { throw new P.ImageError('Cloudflare', { code: 'blocked' }); },
        pollinations: async opts => ({ buffer: JPEG, mime: 'image/jpeg', extension: 'jpg', seed: 5, prompt: opts.prompt, nsfw: false })
      }
    });
    assert.equal(r.provider, 'pollinations');
    assert.equal(r.errors.length, 1);
    assert.match(r.errors[0], /^perchance: Cloudflare/);
  });

  await okAsync('provider=perchance no cae al respaldo y explica el fallo', async () => {
    await assert.rejects(
      P.generateImage({ prompt: 'una casa', provider: 'perchance' }, {
        impl: {
          perchance: async () => { throw new P.ImageError('bloqueado'); },
          pollinations: async () => { throw new Error('no debería usarse'); }
        }
      }),
      e => e.status === 502 && e.details.some(d => d.startsWith('perchance:'))
    );
  });

  await okAsync('NSFW se corta con 422 y no se sirve', async () => {
    await assert.rejects(
      P.generateImage({ prompt: 'algo' }, {
        impl: { perchance: async opts => ({ buffer: JPEG, mime: 'image/jpeg', seed: 1, prompt: opts.prompt, nsfw: true }) }
      }),
      e => e.status === 422 && e.code === 'nsfw'
    );
  });

  await okAsync('Sin prompt: 400 con pista', async () => {
    await assert.rejects(P.generateImage({ prompt: '   ' }), e => e.status === 400 && /prompt/i.test(e.hint));
  });

  // ------------------------------------------------- protocolo de Perchance
  // Sin salir a internet: se reemplaza fetch() por un Perchance de mentira para
  // comprobar el flujo real (código de anuncios → userKey → generate → bytes).
  const HEX64 = 'a'.repeat(64);
  const llamadas = [];
  const ruta = url => {
    const u = String(url);
    if (u.startsWith('https://perchance.org/api/getAccessCodeForAdPoweredStuff')) return 'adcode';
    if (u.includes('image-generation.perchance.org/api/verifyUser')) return 'verify';
    if (u.includes('image-generation.perchance.org/api/generate')) return 'generate';
    if (u.includes('downloadTemporaryImageViaProxy')) return 'proxy';
    if (u.includes('downloadTemporaryImage')) return 'download';
    if (u.startsWith('https://image.pollinations.ai/')) return 'pollinations';
    return 'otro';
  };
  const realFetch = global.fetch;
  let respuestas = {};
  global.fetch = async (url, options = {}) => {
    const kind = ruta(url);
    llamadas.push({ kind, url: String(url), options });
    const respond = respuestas[kind];
    if (!respond) return new Response('nope', { status: 404 });
    return respond(String(url), options);
  };
  const json = (data, extra = {}) => new Response(JSON.stringify(data), {
    status: 200, headers: { 'content-type': 'application/json', ...extra }
  });

  await okAsync('Perchance: flujo completo con data URL y cookies de sesión', async () => {
    P._reset();
    llamadas.length = 0;
    respuestas = {
      adcode: () => new Response(HEX64, { status: 200 }),
      verify: () => json({ status: 'success', userKey: HEX64 }, { 'set-cookie': 'cf_clearance=abc; Path=/; HttpOnly' }),
      generate: () => json({ status: 'success', seed: 123, width: 768, height: 768, imageDataUrls: [dataUrl('image/jpeg', JPEG)] })
    };
    const r = await P.generateImage({ prompt: 'un gato', provider: 'perchance', seed: 11 });
    assert.equal(r.provider, 'perchance');
    assert.equal(r.mime, 'image/jpeg');
    assert.equal(r.seed, 123);
    assert.equal(r.buffer.length, JPEG.length);

    const gen = llamadas.find(l => l.kind === 'generate');
    assert.match(gen.url, /userKey=a{64}/);
    assert.match(gen.url, /adAccessCode=a{64}/);
    assert.match(gen.url, /v=[a-f0-9]{64}/);
    const body = JSON.parse(gen.options.body);
    assert.equal(body.prompt, 'un gato');
    assert.equal(body.seed, 11);
    assert.equal(body.resolution, '768x768');
    assert.equal(body.guidanceScale, 7);
    assert.match(body.negativePrompt, /NSFW/);
    // La cookie de Cloudflare que dejó verifyUser viaja en la generación.
    assert.match(gen.options.headers.Cookie, /cf_clearance=abc/);
  });

  await okAsync('Perchance: si devuelve imageId, baja la imagen por separado', async () => {
    P._reset();
    llamadas.length = 0;
    respuestas = {
      adcode: () => new Response(HEX64, { status: 200 }),
      verify: () => json({ status: 'success', userKey: HEX64 }),
      generate: () => json({ status: 'success', imageId: 'img-1', fileExtension: 'jpeg', seed: 9 }),
      download: () => new Response(PNG, { status: 200, headers: { 'content-type': 'application/octet-stream' } })
    };
    const r = await P.generateImage({ prompt: 'una casa', provider: 'perchance' });
    assert.equal(r.mime, 'image/png');           // se detecta por los bytes, no por el header
    assert.ok(llamadas.some(l => l.kind === 'download' && l.url.endsWith('imageId=img-1')));
  });

  await okAsync('Perchance: invalid_key se reintenta con una sesión nueva', async () => {
    P._reset();
    llamadas.length = 0;
    let generaciones = 0;
    respuestas = {
      adcode: () => new Response(HEX64, { status: 200 }),
      verify: () => json({ status: 'success', userKey: HEX64 }),
      generate: () => {
        generaciones++;
        return generaciones === 1
          ? json({ status: 'invalid_key' })
          : json({ status: 'success', imageDataUrls: [dataUrl('image/jpeg', JPEG)] });
      }
    };
    const r = await P.generateImage({ prompt: 'un perro', provider: 'perchance' });
    assert.equal(r.provider, 'perchance');
    assert.equal(generaciones, 2);
    assert.equal(llamadas.filter(l => l.kind === 'verify').length, 2);
  });

  await okAsync('Perchance: Cloudflare 403 cae a Pollinations en modo auto', async () => {
    P._reset();
    respuestas = {
      adcode: () => new Response('<html>Just a moment…</html>', { status: 403 }),
      pollinations: () => new Response(JPEG, { status: 200, headers: { 'content-type': 'image/jpeg' } })
    };
    const r = await P.generateImage({ prompt: 'un bosque' });
    assert.equal(r.provider, 'pollinations');
    assert.equal(r.mime, 'image/jpeg');
    assert.match(r.errors[0], /perchance: .*Cloudflare/);
  });

  global.fetch = realFetch;
  P._reset();

  console.log(`\n${failures ? `✗ ${failures} fallo(s)` : '✓ Imágenes con IA en orden'}`);
  if (failures) process.exitCode = 1;
})();
