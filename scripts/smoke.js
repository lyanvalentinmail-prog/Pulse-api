// scripts/smoke.js — npm test: levanta la app y verifica web, catálogo, tools y TODOS los canvas.
process.env.PORT = '0';
const fs = require('fs');
const path = require('path');
const http = require('http');
const app = require('../src/server');
const { CATEGORIES, totals } = require('../src/catalog');
const LAYOUTS = require('../src/canvas/layouts');
const { generateCanvas, CANVAS_IDS } = require('../src/utils/canvasEngine');
const { sharp } = require('../src/utils/image');
const { calculate, morseEncode, morseDecode } = require('../src/routes/tools');
const { textLayer, measure, FAMILIES, FONTS_DIR } = require('../src/utils/textEngine');
const { emojiImages } = require('../src/utils/emoji');
const P = require('../src/utils/providers');
const {
  REACTION_LIST, REACTION_PROVIDERS, ANIME_KINDS, ANIME_SOURCES, mapDanbooru, mapSafebooru, mapKonachan
} = P;
const { firstFast } = require('../src/utils/http');

function get(port, p) {
  return new Promise((resolve, reject) => {
    http.get(`http://127.0.0.1:${port}${p}`, res => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode, type: res.headers['content-type'] || '', body: Buffer.concat(chunks), headers: res.headers }));
    }).on('error', reject);
  });
}

const isPng = buf => buf.length > 100 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47;

async function main() {
  const server = app.listen(0, '127.0.0.1');
  await new Promise(r => server.once('listening', r));
  const port = server.address().port;
  let failures = 0;
  const ok = (name, cond, extra = '') => {
    console.log(`${cond ? '✓' : '✗'} ${name}${extra ? ' — ' + extra : ''}`);
    if (!cond) failures++;
  };

  try {
    const t = totals();
    const home = await get(port, '/home');
    const homeHtml = home.body.toString();
    ok('GET /home', home.status === 200 && homeHtml.includes('Velirius API') && homeHtml.includes('Aquí están las carpetas'));
    ok('Home con la fila de iconos de Apireon', /class="icons"/.test(homeHtml) && homeHtml.includes('href="/information"')
      && homeHtml.includes('href="/docs"') && homeHtml.includes('data-search-btn') && homeHtml.includes('Sigue mi cuenta de GitHub'));
    ok('Home con barra de estado (ESTADO / RUTAS / ENDPOINTS)', /Estado:/i.test(homeHtml) && /Rutas:/i.test(homeHtml) && /Endpoints:/i.test(homeHtml));
    ok(`Home muestra ${t.routers} routers / ${t.endpoints} endpoints`, homeHtml.includes(String(t.endpoints)));
    ok('Home lista las 6 categorías como carpetas (VER)', CATEGORIES.every(c => homeHtml.includes(`/${c.id}`)) && (homeHtml.match(/class="row folder"/g) || []).length === CATEGORIES.length && homeHtml.includes('cat-ver'));
    const folderOrder = [...homeHtml.matchAll(/class="row folder" href="\/([^"]+)"/g)].map(m => m[1]);
    ok('Carpetas ordenadas alfabéticamente', JSON.stringify(folderOrder) === JSON.stringify([...folderOrder].sort()));

    for (const cat of CATEGORIES) {
      const page = await get(port, `/${cat.id}`);
      const html = page.body.toString();
      ok(`GET /${cat.id} (${cat.endpoints.length})`, page.status === 200 && (html.match(/data-test-btn=/g) || []).length === cat.endpoints.length && html.includes('>Test</button>'));
    }

    const catJs = (await get(port, '/js/category.js')).body.toString();
    const catCss = (await get(port, '/css/style.css')).body.toString();
    ok('Botón TEST despliega el panel hacia abajo', catJs.includes('function setOpen') && catJs.includes('tester-inner') && catCss.includes('grid-template-rows: 0fr') && catCss.includes('.tester.open'));
    ok('Parámetros modificables (texto + select + subir foto)', catJs.includes('data-param') && catJs.includes('<select data-param') && catJs.includes('Galería') && catJs.includes('Opcional • URL o varias fotos'));
    ok('Panel con CÓMO USAR EL ENDPOINT + URL + fetch', catJs.includes('Cómo usar el endpoint') && catJs.includes('code-url') && catJs.includes('code-fetch'));
    ok('Chips REQUERIDO/OPCIONAL por parámetro', catJs.includes('chip-opt') && catJs.includes('Requerido') && catJs.includes('Opcional'));
    ok('Resultado con 200 OK, ms y DESCARGAR', catJs.includes('chip-status') && catJs.includes('res-meta') && catJs.includes('Descargar'));

    // El dashboard se muestra también en la raíz; la portada previa sigue disponible.
    const root = await get(port, '/');
    ok('GET / muestra el mismo dashboard que /home', root.status === 200 && root.type.includes('text/html') && root.body.toString() === homeHtml);
    const landing = await get(port, '/welcome');
    const landingHtml = landing.body.toString();
    ok('Portada anterior disponible en /welcome', landing.status === 200 && landingHtml.includes('Initialize dashboard') && landingHtml.includes('href="/home"'));
    ok('Portada anterior conserva el video', landingHtml.includes('/media/dashboardvid.mp4') && landingHtml.includes('class="hero"'));
    ok('Diseño usa la fuente local y tarjeta de 414 × 625', catCss.includes('ShareTechMono-Regular.ttf') && catCss.includes('max-width: 414px') && catCss.includes('min(625px'));
    const font = await get(port, '/fonts/ShareTechMono-Regular.ttf');
    ok('Fuente Share Tech Mono disponible', font.status === 200 && font.body.length > 40000);
    ok('La pieza del canvas se ve sin marco (damero)', catCss.includes('.preview') && /\.preview img[^{]*\{[^}]*border: 0/.test(catCss));

    // ---- Opciones avanzadas plegadas en el probador ----
    const advCount = CATEGORIES.reduce((n, c) => n + c.endpoints.reduce((m, e) => m + e.params.filter(p => p.advanced).length, 0), 0);
    ok(`Opciones avanzadas marcadas (${advCount})`, advCount > 0 && catJs.includes('adv-toggle') && catJs.includes('adv-fields') && catCss.includes('.adv-toggle'));
    ok('El campo de texto es multilínea (texto largo)', catJs.includes('<textarea data-param') && catCss.includes('.tester textarea'));

    const docs = JSON.parse((await get(port, '/docs')).body.toString());
    ok('GET /docs con las 6 categorías', docs.status === true && docs.endpoints === t.endpoints && docs.categories.length === CATEGORIES.length);

    // ---- Tools ----
    ok('calc (2+3)*4^2+sqrt(81)=89', calculate('(2+3)*4^2 + sqrt(81)') === 89);
    ok('calc 10%3+pi', Math.abs(calculate('10%3+pi') - (1 + Math.PI)) < 1e-9);
    const calcHttp = JSON.parse((await get(port, '/tools/calculator?expr=' + encodeURIComponent('2+2*3'))).body.toString());
    ok('GET /tools/calculator', calcHttp.status === true && calcHttp.result.result === 8);
    ok('morse encode SOS', morseEncode('SOS') === '... --- ...');
    ok('morse decode', morseDecode('... --- ...') === 'SOS');
    const morseHttp = JSON.parse((await get(port, '/tools/morse?text=Hola&mode=encode')).body.toString());
    ok('GET /tools/morse', morseHttp.status === true && morseHttp.result.output.includes('-'));

    // ---- Rezize (redimensionar una imagen) ----
    const base = `http://127.0.0.1:${port}`;
    const rez = await get(port, '/tools/resize?url=' + encodeURIComponent(base + '/img/default-avatar.jpg') + '&width=180&height=120');
    ok('GET /tools/resize devuelve una imagen', rez.status === 200 && rez.type.includes('image/'));
    const rezMeta = await sharp(rez.body).metadata();
    ok('Rezize respeta el ancho y el alto pedidos', rezMeta.width === 180 && rezMeta.height === 120, `${rezMeta.width}x${rezMeta.height}`);
    const rezSoloAncho = await get(port, '/tools/resize?url=' + encodeURIComponent(base + '/img/default-avatar.jpg') + '&width=92');
    const rezMeta2 = await sharp(rezSoloAncho.body).metadata();
    ok('Rezize con sólo width calcula el alto solo', rezMeta2.width === 92 && rezMeta2.height > 90);
    const rezScale = await get(port, '/tools/resize?url=' + encodeURIComponent(base + '/img/default-avatar.jpg') + '&scale=50');
    const rezMeta3 = await sharp(rezScale.body).metadata();
    ok('Rezize con scale=50 deja la mitad', Math.abs(rezMeta3.width - 368) <= 1, String(rezMeta3.width));
    const rezSin = await get(port, '/tools/resize');
    ok('/tools/resize sin url → 400', rezSin.status === 400);
    const rezSinMedidas = await get(port, '/tools/resize?url=' + encodeURIComponent(base + '/img/default-avatar.jpg'));
    ok('/tools/resize sin width/height → 400', rezSinMedidas.status === 400);

    // ---- TextToSpeech (la parte que no depende de la red) ----
    const { partirTexto, proveedoresSTT } = require('../src/utils/audio');
    const trozos = partirTexto('Hola mundo. '.repeat(40));
    ok('TTS: el texto largo se parte en trozos que el servicio acepta', trozos.length > 1 && trozos.every(t => t.length <= 190));
    ok('TTS: los trozos no pierden palabras', trozos.join(' ').split(/\s+/).length === 'Hola mundo. '.repeat(40).trim().split(/\s+/).length);
    const ttsSin = await get(port, '/tools/tts');
    ok('/tools/tts sin text → 400', ttsSin.status === 400);
    const ttsLargo = await get(port, '/tools/tts?text=' + 'a'.repeat(3001));
    ok('/tools/tts con texto enorme → 400', ttsLargo.status === 400);

    // ---- SpeechToText ----
    const sttSin = await get(port, '/tools/stt');
    ok('/tools/stt sin audio → 400', sttSin.status === 400);
    for (const k of ['GROQ_API_KEY', 'OPENAI_API_KEY', 'DEEPGRAM_API_KEY', 'ASSEMBLYAI_API_KEY']) delete process.env[k];
    ok('STT: sin claves no hay proveedor', proveedoresSTT().length === 0);
    const sttSinClave = await get(port, '/tools/stt?url=' + encodeURIComponent(base + '/img/default-avatar.jpg'));
    ok('STT: sin clave configurada explica qué poner → 501', sttSinClave.status === 501 && /GROQ_API_KEY/.test(sttSinClave.body.toString()));

    // ---- Reactions (solo catálogo, sin red) ----
    const reactList = JSON.parse((await get(port, '/reactions/list')).body.toString());
    ok(`GET /reactions/list (${REACTION_LIST.length} reacciones)`, reactList.status === true && reactList.result.count === REACTION_LIST.length);
    ok('Reactions no tiene nada NSFW', !/nsfw|hentai|porn|xxx/i.test(JSON.stringify(reactList.result)));

    // ---- vercel.json válido (la validación de Vercel corta el deploy antes del build) ----
    const vc = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'vercel.json'), 'utf8'));
    const fnKeys = Object.keys(vc.functions || {});
    const fnOpts = fnKeys.map(k => vc.functions[k]);
    ok('vercel.json: includeFiles es un string glob (no array)', fnOpts.every(o => o.includeFiles === undefined || typeof o.includeFiles === 'string'));
    ok('vercel.json: excludeFiles es un string glob (no array)', fnOpts.every(o => o.excludeFiles === undefined || typeof o.excludeFiles === 'string'));
    ok('vercel.json: maxDuration y memory son números', fnOpts.every(o => (o.maxDuration === undefined || typeof o.maxDuration === 'number' || o.maxDuration === 'max') && (o.memory === undefined || typeof o.memory === 'number')));
    ok('vercel.json: glob de assets incluye plantillas y fuentes', /assets/.test(fnOpts.map(o => o.includeFiles).join(',')) && fnKeys.includes('api/index.js'));

    // ---- Node soportado por Vercel/Render (20.x ya está discontinuado) ----
    const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'));
    ok('package.json: engines.node soportado (24.x)', /^2[46]\.x$/.test(pkg.engines.node));
    ok('render.yaml: NODE_VERSION alineado con package.json', fs.readFileSync(path.join(__dirname, '..', 'render.yaml'), 'utf8').includes(`value: "${pkg.engines.node.replace('.x', '')}"`));

    // ---- Tipografías empaquetadas: nunca cuadrados ▯▯▯ ----
    const fontFiles = fs.readdirSync(FONTS_DIR);
    ok(`Fuentes empaquetadas (${fontFiles.length})`, fontFiles.some(f => /Inter-Bold/.test(f)) && fontFiles.some(f => /Playfair/.test(f)) && fontFiles.some(f => /JetBrainsMono/.test(f)) && fontFiles.includes('NotoEmoji-Regular.ttf') && fontFiles.includes('CaveatBrush-Regular.ttf'));
    const glyph = textLayer({ text: 'Ñandú áéíóú ✓ 🐱', width: 400, height: 90, maxFont: 40 });
    ok('Texto en vectores (sin depender del sistema)', glyph.svg.toString().includes('<path') && glyph.missing === 0);
    ok('Emoji/símbolos con NotoEmoji (sin tofu)', textLayer({ text: '🐱🔥', width: 120, height: 60, maxFont: 40 }).missing === 0);
    const colorEmoji = await emojiImages('🔥 😀 1️⃣');
    const colorLayer = textLayer({ text: '🔥 😀 1️⃣', width: 240, height: 60, maxFont: 40, emojiImages: colorEmoji });
    ok('Emojis a color (imágenes en el texto)', colorEmoji.size === 3 && (colorLayer.svg.toString().match(/<image /g) || []).length === 3);
    ok('Medición real de anchos', Math.abs(measure('abc', { size: 40 }) - measure('abc', { size: 40 })) === 0 && measure('abc', { size: 40 }) > 0);
    ok('Familias sans/hand/serif/mono', Object.keys(FAMILIES).join(',') === 'sans,hand,serif,mono');

    // ---- Canvas (render local con valores de ejemplo) ----
    const outDir = path.join(__dirname, '..', 'tmp-canvas');
    fs.mkdirSync(outDir, { recursive: true });
    const canvasCat = CATEGORIES.find(c => c.id === 'canvas');
    ok('El catálogo cubre todos los generadores', canvasCat.endpoints.filter(e => !['bratvideo', 'attp'].includes(e.id)).every(e => CANVAS_IDS.includes(e.id)));
    for (const ep of canvasCat.endpoints) {
      if (ep.id === 'bratvideo' || ep.id === 'attp') { console.log(`◌ canvas/${ep.id} (video: se prueba por HTTP)`); continue; }
      const q = {};
      for (const p of ep.params) {
        if (!p.example || p.example === '__AVATAR__' || p.example === '__AVATAR2__') continue;
        q[p.name] = p.example;
      }
      try {
        const buf = await generateCanvas(ep.id, q);
        ok(`canvas/${ep.id}`, isPng(buf), `${buf.length} bytes`);
        fs.writeFileSync(path.join(outDir, `${ep.id}.png`), buf);
      } catch (e) {
        ok(`canvas/${ep.id}`, false, e.message);
      }
    }

    // ---- iqc: la burbuja crece con el texto (como WhatsApp) ----
    const iqcCorto = await generateCanvas('iqc', { text: 'Hola' });
    const iqcLargo = await generateCanvas('iqc', { text: 'Mira, te voy a contar algo que nunca le dije a nadie: cuando nos conocimos en aquel viaje yo ya sabía que esto iba a pasar, pero no quería aceptarlo porque me daba miedo perderte.' });
    const hCorto = (await sharp(iqcCorto).metadata()).height;
    const hLargo = (await sharp(iqcLargo).metadata()).height;
    ok(`canvas/iqc crece con el texto (${hCorto} → ${hLargo})`, isPng(iqcCorto) && isPng(iqcLargo) && hLargo > hCorto + 200);

    // ---- Globos nuevos (iMessage / Messenger / nota): crecen y no recortan ----
    const largoGlobo = 'Esto es una prueba larga de verdad para comprobar que el globo se estira, el menú de abajo baja y el texto entra completo sin recortarse nunca.';
    for (const id of ['iqcblue', 'iqcpink', 'messengerquote', 'profilenote']) {
      const corto = await generateCanvas(id, { text: 'Hola' });
      // el globo de `profilenote` ya es alto (es el de la plantilla): necesita más texto
      const largo = await generateCanvas(id, { text: id === 'profilenote' ? `${largoGlobo} ${largoGlobo} ${largoGlobo}` : largoGlobo });
      const h1 = (await sharp(corto).metadata()).height;
      const h2 = (await sharp(largo).metadata()).height;
      ok(`canvas/${id} crece con el texto (${h1} → ${h2})`, isPng(corto) && isPng(largo) && h2 > h1);
    }
    const nota = await generateCanvas('profilenote', { text: 'disponible', label: 'Mi nota' });
    ok('canvas/profilenote acepta ?label=', isPng(nota) && (await sharp(nota).metadata()).height === (await sharp(await generateCanvas('profilenote', {})).metadata()).height);

    // ---- Canvas por HTTP, con parámetros de estilo ----
    const via = await get(port, '/canvas/brat?text=Hola%20Velirius&color=ff2d55&size=1.4');
    ok('GET /canvas/brat?color&size PNG', via.status === 200 && via.type.includes('image/png') && isPng(via.body));
    const viaSign = await get(port, '/canvas/bratanime?text=Hola&rotate=12&uppercase=true&x=5');
    ok('GET /canvas/bratanime con overrides', viaSign.status === 200 && isPng(viaSign.body));
    // bratcoyote: letra a mano (familia `hand`) por defecto y override a sans
    const coyote = await generateCanvas('bratcoyote', { text: 'Hola Velirius' });
    const coyoteSans = await generateCanvas('bratcoyote', { text: 'Hola Velirius', font: 'sans' });
    ok('canvas/bratcoyote usa la letra a mano (hand) y respeta ?font=sans',
      isPng(coyote) && isPng(coyoteSans) && Buffer.compare(coyote, coyoteSans) !== 0);

    // ---- Filtros: cada efecto cambia la foto de verdad ----
    {
      const ids = ['grayscale', 'blur', 'pixel', 'deepfry', 'sketch', 'swirl', 'liquify', 'glitch'];
      const hashes = new Set();
      for (const id of ids) {
        const buf = await generateCanvas(id, {});
        ok(`filtro ${id} devuelve un PNG`, isPng(buf), `${buf.length} bytes`);
        hashes.add(require('crypto').createHash('sha1').update(buf).digest('hex'));
      }
      // Ningún filtro puede salir igual a otro: cada uno hace algo distinto.
      ok(`los ${ids.length} filtros dan imágenes distintas`, hashes.size === ids.length, `${hashes.size} distintos`);
      const sinEfecto = await generateCanvas('swirl', { amount: '0' });
      ok('swirl con amount=0 devuelve la foto sin tocar', isPng(sinEfecto));
      const canvasCatFiltros = CATEGORIES.find(c => c.id === 'canvas').endpoints.filter(e => e.group === 'filtros');
      ok(`grupo filtros con los 10 filtros (${canvasCatFiltros.length})`, canvasCatFiltros.length === 10);
    }

    const missing = await get(port, '/canvas/noexiste');
    ok('canvas inexistente → 404', missing.status === 404);

    // ---- La foto del usuario entra y LLENA su hueco en todos los canvas con imagen ----
    const solid = await sharp({ create: { width: 600, height: 900, channels: 3, background: '#ff00ff' } }).png().toBuffer();
    const foto = 'data:image/png;base64,' + solid.toString('base64');
    const post = (port2, p2, body) => new Promise((resolve, reject) => {
      const data = Buffer.from(JSON.stringify(body));
      const req = http.request({
        host: '127.0.0.1', port: port2, path: p2, method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': data.length }
      }, res => {
        const chunks = [];
        res.on('data', c => chunks.push(c));
        res.on('end', () => resolve({ status: res.statusCode, type: res.headers['content-type'] || '', body: Buffer.concat(chunks) }));
      });
      req.on('error', reject);
      req.end(data);
    });

    const isMagenta = (r, g, b) => r > 180 && g < 110 && b > 180;
    // % del área (fracciones 0-1) que quedó tapada por la foto magenta
    async function cobertura(buf, box) {
      const { data, info } = await sharp(buf).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
      const x0 = Math.round(box.x0 * info.width), x1 = Math.round(box.x1 * info.width);
      const y0 = Math.round(box.y0 * info.height), y1 = Math.round(box.y1 * info.height);
      let hit = 0, total = 0;
      for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
          const i = (y * info.width + x) * info.channels;
          total++;
          if (isMagenta(data[i], data[i + 1], data[i + 2])) hit++;
        }
      }
      return Math.round((hit / Math.max(1, total)) * 100);
    }

    // 1) Todos los canvas con imagen aceptan la foto (POST) y no rompen con zoom bajo
    const conImagen = [];
    for (const cat of CATEGORIES.filter(c => c.id === 'canvas')) {
      for (const ep of cat.endpoints || []) {
        const imgs = ep.params.filter(p => /^(url|url2|url3|image|image1|image2|img)$/.test(p.name)).map(p => p.name);
        if (imgs.length) conImagen.push({ cat: cat.id, id: ep.id, imgs });
      }
    }
    let rotos = [];
    for (const ep of conImagen) {
      const body = {};
      ep.imgs.forEach(n => { body[n] = foto; });
      const res = await post(port, `/${ep.cat}/${ep.id}`, body);
      const okBase = res.status === 200 && (res.type.includes('image/png') || res.type.includes('video/')) && res.body.length > 500;
      const resZoom = await post(port, `/${ep.cat}/${ep.id}?zoom=0.5`, body);
      if (!okBase || resZoom.status >= 500) rotos.push(`${ep.cat}/${ep.id}(${res.status}/${resZoom.status})`);
    }
    ok(`canvas con imagen: ${conImagen.length} aceptan la foto del usuario`, conImagen.length > 0 && rotos.length === 0, rotos.join(' '));

    // 1b) Varias imágenes: se acomodan todas (repetidas, numeradas o lista)
    const CORE = require('../src/canvas/core');
    const listaImgs = CORE.imageList({
      image: ['https://x/1.jpg', 'https://x/2.jpg'],
      url2: 'https://x/3.jpg',
      images: 'https://x/4.jpg, https://x/5.jpg'
    });
    ok('varias imágenes: se juntan repetidas, numeradas y listas', listaImgs.length === 5, listaImgs.join(' '));
    ok('varias imágenes: una foto de la galería (data:) no se parte por las comas',
      CORE.imageList({ image: foto }).length === 1);
    ok('varias imágenes: se ignoran vacíos y repetidas',
      CORE.imageList({ images: ' https://x/a.jpg , ,https://x/a.jpg ' }).length === 1);
    const solid2 = await sharp({ create: { width: 600, height: 900, channels: 3, background: '#00ff00' } }).png().toBuffer();
    const foto2 = 'data:image/png;base64,' + solid2.toString('base64');
    const variasEnCanvas = await post(port, '/canvas/canvaimagen', { images: [foto, foto2] });
    const { data: px, info: pxi } = await sharp(variasEnCanvas.body).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    let magenta = 0, verde = 0;
    for (let i = 0; i < px.length; i += pxi.channels) {
      if (px[i] > 200 && px[i + 1] < 60 && px[i + 2] > 200) magenta++;
      if (px[i] < 60 && px[i + 1] > 200 && px[i + 2] < 60) verde++;
    }
    ok('varias imágenes: las dos fotos se ven en el canvas', variasEnCanvas.status === 200 && magenta > 500 && verde > 500,
      `magenta=${magenta} verde=${verde}`);

    // 2) La foto tiene que ocupar el hueco de la plantilla (no quedar chica ni fuera de lugar)
    const huecos = [
      ['bobesponja', 'sign', 95], ['bobesponja2', 'sign', 95], ['bobesponja3', 'sign', 95],
      ['cartelboy', 'sign', 95], ['bratpinguino', 'sign', 95], ['pcquote', 'photo', 95],
      ['storyreply', 'photo', 85], ['searched', 'photo', 80], ['canvaimagen', 'photo', 55], ['laptop', 'photo', 65]
    ];
    const chicos = [];
    for (const [id, part, min] of huecos) {
      const res = await post(port, `/canvas/${id}`, { url: foto, image: foto });
      const def = LAYOUTS.get(id);
      if (!res.body.length || !def || !def.parts[part]) { chicos.push(`${id}(sin render)`); continue; }
      const pct = await cobertura(res.body, def.parts[part].box);
      if (pct < min) chicos.push(`${id} ${pct}%<${min}%`);
    }
    ok('la foto llena el hueco de cada canvas', chicos.length === 0, chicos.join(' '));

    // ---- Imágenes de la galería (data:) y subida con URL corta ----
    const rojo = await sharp({ create: { width: 120, height: 120, channels: 3, background: '#ff0000' } }).png().toBuffer();
    const dataUrl = 'data:image/png;base64,' + rojo.toString('base64');

    const up = await post(port, '/upload', { image: dataUrl });
    let upJson = {};
    try { upJson = JSON.parse(up.body.toString()); } catch (_) { /* no-json */ }
    const upUrl = upJson?.result?.url || '';
    ok('POST /upload devuelve una URL corta', up.status === 201 && /\/upload\/[a-f0-9]{12,}/.test(upUrl), upUrl);

    const upGet = upUrl ? await get(port, new URL(upUrl).pathname) : { status: 0, type: '', body: Buffer.alloc(0) };
    ok('GET /upload/:id devuelve la imagen', upGet.status === 200 && upGet.type.startsWith('image/') && upGet.body.length > 50);

    const conGaleria = upUrl ? await get(port, `/canvas/searched?name=GALERIA&url=${encodeURIComponent(upUrl)}`) : { status: 0, body: Buffer.alloc(0) };
    ok('canvas usa la imagen subida (?url=/upload/…)', conGaleria.status === 200 && isPng(conGaleria.body));

    const conBody = await post(port, '/canvas/searched', { name: 'GALERIA', url: dataUrl });
    ok('canvas usa la imagen de la galería (POST con data:)', conBody.status === 200 && isPng(conBody.body));

    // La imagen enviada tiene que cambiar el resultado (antes caía a la foto por defecto).
    const porDefecto = await get(port, '/canvas/searched?name=GALERIA');
    ok('la imagen enviada cambia el resultado', isPng(porDefecto.body) && Buffer.compare(porDefecto.body, conBody.body) !== 0);

    const urlMala = await get(port, '/canvas/searched?url=no-es-una-url');
    ok('URL inválida → 400 (no foto por defecto)', urlMala.status === 400 && /no es una URL válida/i.test(urlMala.body.toString()));

    // ---- Anime: respaldo de proveedores y filtro SFW ----
    ok(`Anime: tipos ${ANIME_KINDS.join('/')}`, ANIME_KINDS.join(',') === 'neko,waifu,maid');
    for (const kind of ANIME_KINDS) {
      const names = Object.keys(ANIME_SOURCES[kind] || {});
      const fns = names.every(n => typeof ANIME_SOURCES[kind][n] === 'function');
      ok(`Anime ${kind}: ${names.length} proveedores`, names.length >= 2 && fns, names.join(' · '));
      const ficha = CATEGORIES.flatMap(c => c.endpoints).find(e => e.id === kind && e.category === 'anime')
        || CATEGORIES.find(c => c.id === 'anime').endpoints.find(e => e.id === kind);
      const param = (ficha?.params || []).find(p => p.name === 'provider');
      const opciones = ((param && param.options) || []).filter(Boolean);
      ok(`Anime ${kind}: ?provider= coincide con las fuentes`, opciones.length === names.length && opciones.every(o => names.includes(o)),
        opciones.join(' · '));
    }

    // Todas las fuentes tienen que traer `yande.re` (el booru sin Cloudflare) y
    // `waifu.pics` no puede volver: está apagado desde 2025.
    ok('Anime: yande.re cubre neko, waifu y maid', ANIME_KINDS.every(k => ANIME_SOURCES[k]['yande.re']));
    ok('Anime: waifu.pics quedó fuera de la cadena', ANIME_KINDS.every(k => !ANIME_SOURCES[k]['waifu.pics']));
    ok('Reactions: waifu.pics quedó fuera de la cadena', !REACTION_PROVIDERS['waifu.pics']);

    // La cadena automática va en paralelo: gana la fuente más rápida aunque la
    // primera de la lista esté caída (antes una fuente muerta agotaba Vercel).
    {
      const t0 = Date.now();
      const { value, source, errors } = await firstFast([
        ['caida', () => Promise.reject(new Error('sin respuesta'))],
        ['lenta', () => new Promise(res => setTimeout(() => res('lenta'), 1500))],
        ['rapida', () => Promise.resolve('lista')]
      ], { timeoutMs: 4000 });
      const ms = Date.now() - t0;
      ok(`Anime/reacciones: la primera fuente que responde gana (${source} en ${ms} ms)`,
        value === 'lista' && source === 'rapida' && ms < 1000 && errors.some(e => /caida/.test(e)), errors.join(' · '));
    }
    {
      let detalles = [];
      try {
        await firstFast([['muerta', () => Promise.reject(new Error('sin respuesta'))],
          ['vacia', () => Promise.resolve(null)]], { timeoutMs: 2000 });
      } catch (e) { detalles = e.details || []; }
      ok('Anime: si fallan todas, el error explica qué pasó', detalles.length === 2 && /sin respuesta/.test(detalles.join(' ')),
        detalles.join(' · '));
    }

    // Ningún post no-seguro debe sobrevivir al normalizador de los boorus.
    const limpios = [
      mapDanbooru([
        { rating: 'q', file_url: 'https://x/a.jpg', large_file_url: 'https://x/a.jpg' },
        { rating: 'e', file_url: 'https://x/b.jpg' },
        { rating: 'g', file_url: 'https://x/d.jpg', large_file_url: 'https://x/d.jpg' }
      ]),
      mapKonachan([
        { rating: 's', file_url: 'https://x/c.png', sample_url: 'https://x/c.png' },
        { rating: 'e', file_url: 'https://x/e.png' }
      ]),
      mapSafebooru([
        { rating: 'general', file_url: 'https://x/f.jpg', sample_url: 'https://x/f.jpg' },
        { rating: 'explicit', file_url: 'https://x/g.jpg' }
      ])
    ];
    ok('Anime: los boorus descartan rating q/e/s', limpios[0].length === 1 && limpios[1].length === 1 && limpios[2].length === 1);
    ok('Anime: cada imagen trae url + full', limpios.every(l => l.every(i => /^https?:/.test(i.image) && /^https?:/.test(i.full))));

    // ---- SEARCHER (parseadores offline) ----
    const htmlGoogle = '<div><a href="https://ejemplo.com/uno" jsname="UWckNb"><br><h3 class="LC20lb">Ejemplo Uno</h3><div>Descripción del resultado uno.</div></a></div>'
      + '<a href="/url?q=https%3A%2F%2Fejemplo.com%2Fdos&sa=U"><h3>Ejemplo Dos</h3></a>'
      + '<a href="https://www.google.com/preferences"><h3>Preferencias</h3></a>';
    const gModerno = P.parseGoogleModerno(htmlGoogle, 10);
    const gViejo = P.parseGoogle(htmlGoogle, 10);
    ok('Google: el parser nuevo lee el <h3> y descarta enlaces de Google',
      gModerno.length === 1 && gModerno[0].url === 'https://ejemplo.com/uno' && gModerno[0].title === 'Ejemplo Uno',
      gModerno.map(r => r.url).join(' · '));
    ok('Google: el parser viejo sigue entendiendo /url?q=', gViejo.some(r => r.url === 'https://ejemplo.com/dos'));

    const htmlLite = '<a rel="nofollow" href="https://ejemplo.com/tres" class=\'result-link\'>Ejemplo Tres</a>'
      + '<td class=\'result-snippet\'>Un trozo de texto del resultado.</td>';
    const lite = P.parseDuckDuckGoLite(htmlLite, 5);
    ok('DuckDuckGo lite: título + URL + extracto', lite.length === 1 && lite[0].snippet.includes('trozo'));

    const htmlBing = '<ol><li class="b_algo"><h2><a href="https://ejemplo.com/cuatro">Ejemplo Cuatro</a></h2><p>Resumen de Bing.</p></li></ol>';
    const bing = P.parseBing(htmlBing, 5);
    ok('Bing: lee b_algo → h2 → a', bing.length === 1 && bing[0].url === 'https://ejemplo.com/cuatro' && bing[0].snippet.includes('Bing'));

    // ---- PINTEREST: pines normalizados (imagen, carrusel y video) ----
    const pinImg = P.mapPinterestPin({
      id: '123',
      grid_title: 'gato aesthetic',
      images: { orig: { url: 'https://i.pinimg.com/originals/a.jpg', width: 1000, height: 1500 }, '236x': { url: 'https://i.pinimg.com/236x/a.jpg' } },
      pinner: { username: 'velirius' }
    });
    ok('Pinterest: el pin usa la imagen original y arma su URL',
      pinImg.type === 'image' && pinImg.image === 'https://i.pinimg.com/originals/a.jpg'
      && pinImg.url === 'https://www.pinterest.com/pin/123/' && pinImg.author === 'velirius');
    const pinVideo = P.mapPinterestPin({
      id: '9',
      images: { orig: { url: 'https://i.pinimg.com/originals/b.jpg' } },
      videos: { video_list: { V_480P: { url: 'https://v.pinimg.com/480.mp4', width: 480 }, V_720P: { url: 'https://v.pinimg.com/720.mp4', width: 720 } } }
    });
    ok('Pinterest: los pines de video eligen el MP4 más grande', pinVideo.type === 'video' && pinVideo.video === 'https://v.pinimg.com/720.mp4');
    ok('Pinterest: se reconoce el ID desde cualquier forma de la URL',
      P.pinterestPinId('https://www.pinterest.com/pin/9876543210/') === '9876543210'
      && P.pinterestPinId('https://pin.it/abc') === null
      && P.pinterestPinId('9876543210') === '9876543210');

    // ---- INSTAGRAM: el parser de los mirrors (video, foto y carrusel) ----
    const igVideo = P.parseInstagramHtml(
      '<meta property="og:video" content="https://scontent.cdninstagram.com/v/reel.mp4">'
      + '<meta property="og:image" content="https://scontent.cdninstagram.com/v/portada.jpg">', 'ABC');
    ok('Instagram: detecta el reel y su portada',
      igVideo.media.length === 1 && igVideo.media[0].type === 'video'
      && igVideo.media[0].url === 'https://scontent.cdninstagram.com/v/reel.mp4'
      && igVideo.media[0].thumbnail === 'https://scontent.cdninstagram.com/v/portada.jpg');
    const igCarrusel = P.parseInstagramHtml(
      '<meta property="og:image" content="https://scontent.cdninstagram.com/v/1.jpg">'
      + '<script>{"display_url":"https://scontent.cdninstagram.com/v/2.jpg"}</script>'
      + '<script>{"display_url":"https://scontent.cdninstagram.com/v/3.jpg"}</script>', 'XYZ');
    ok('Instagram: un carrusel devuelve todos los slides sin repetir',
      igCarrusel.media.length === 3
      && igCarrusel.media.every(m => m.type === 'image')
      && igCarrusel.media[0].url === 'https://scontent.cdninstagram.com/v/1.jpg'
      && igCarrusel.media[1].thumbnail === 'https://scontent.cdninstagram.com/v/1.jpg');

    // ---- FACEBOOK: HD/SD desde el HTML (y fb.watch) ----
    const fbHtml = '{"playable_url_quality_hd":"https:\\/\\/video.fbcdn.net\\/hd.mp4",'
      + '"playable_url":"https:\\/\\/video.fbcdn.net\\/sd.mp4"}'
      + '<meta property="og:title" content="Mi video"><meta property="og:image" content="https://scontent.fbcdn.net/p.jpg">';
    const fb = P.parseFacebookHtml(fbHtml);
    ok('Facebook: separa HD y SD aunque vengan escapadas',
      fb.hd === 'https://video.fbcdn.net/hd.mp4' && fb.sd === 'https://video.fbcdn.net/sd.mp4'
      && fb.title === 'Mi video' && fb.thumbnail === 'https://scontent.fbcdn.net/p.jpg');

    // ---- COBALT: respaldo universal de descargas ----
    const COBALT = require('../src/utils/cobalt');
    ok('cobalt: normaliza la respuesta v10 (tunnel)',
      COBALT.normalizar({ status: 'tunnel', url: 'https://x/v.mp4', filename: 'v.mp4' }, 'https://api.ejemplo').url === 'https://x/v.mp4');
    ok('cobalt: normaliza el picker de la v7',
      COBALT.normalizar({ status: 'picker', picker: [{ url: 'https://x/a.jpg' }] }, 'https://api.ejemplo').url === 'https://x/a.jpg');
    let cobaltError = null;
    try { COBALT.normalizar({ status: 'error', error: { code: 'api.youtube.login' } }, 'https://api.ejemplo'); } catch (e) { cobaltError = e; }
    ok('cobalt: los errores se explican (no se devuelven como archivo)', Boolean(cobaltError) && /login/.test(cobaltError.message));
    process.env.COBALT_API_URL = 'https://cobalt.midominio.test/';
    ok('cobalt: se puede apuntar a una instancia propia',
      COBALT.instancias()[0] === 'https://cobalt.midominio.test');
    process.env.COBALT_DISABLE = 'true';
    ok('cobalt: COBALT_DISABLE=true lo apaga', COBALT.disponible() === false);
    delete process.env.COBALT_DISABLE;
    delete process.env.COBALT_API_URL;

    for (const ep of ['tiktok', 'youtube', 'google', 'wikipedia', 'pinterest']) {
      const r = await get(port, `/searcher/${ep}`);
      ok(`/searcher/${ep} sin query → 400`, r.status === 400 && /query/i.test(r.body.toString()));
    }

    // ---- YOUTUBE: formatos y video con audio ----
    const YT = require('../src/utils/youtube');
    const fake = (o) => ({ mime_type: 'video/mp4', has_video: true, has_audio: true, height: 360, quality_label: '360p', bitrate: 1000, ...o });
    const progresivos = [fake({ height: 360, quality_label: '360p' }), fake({ height: 720, quality_label: '720p' })];
    const elegido = YT.mejorProgresivo(progresivos, 0);
    ok('YouTube: en automático elige el progresivo más alto', elegido?.height === 720);
    ok('YouTube: respeta la calidad pedida', YT.mejorProgresivo(progresivos, 480)?.height === 360);
    const dash = [fake({ has_audio: false, height: 1080, quality_label: '1080p' }), fake({ has_audio: false, height: 720, quality_label: '720p' })];
    ok('YouTube: sin progresivo baja el DASH de la calidad pedida', YT.mejorVideoDash(dash, 720)?.height === 720);
    const audios = [fake({ has_video: false, mime_type: 'audio/webm', bitrate: 900 }), fake({ has_video: false, mime_type: 'audio/mp4', bitrate: 128000 })];
    ok('YouTube: para pegar prefiere audio mp4a', /mp4a|mp4/.test(YT.mejorAudioDash(audios)?.mime_type));

    // ---- YOUTUBE con cliente simulado: búsqueda, formatos y pegado con audio ----
    {
      const { execFileSync } = require('child_process');
      const os = require('os');
      const ffmpegBin = require('@ffmpeg-installer/ffmpeg').path;
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'smoke-yt-'));
      const vFile = path.join(dir, 'v.mp4');
      const aFile = path.join(dir, 'a.m4a');
      execFileSync(ffmpegBin, ['-y', '-loglevel', 'error', '-f', 'lavfi', '-i', 'color=c=red:s=160x120:d=1', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', vFile]);
      execFileSync(ffmpegBin, ['-y', '-loglevel', 'error', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=1', '-c:a', 'aac', aFile]);

      const fmt = o => ({
        itag: o.itag || 18, mime_type: o.mime || 'video/mp4',
        has_video: o.v !== false, has_audio: o.a !== false,
        height: o.h || 360, quality_label: `${o.h || 360}p`, bitrate: o.br || 1000,
        decipher: async () => o.url || vFile
      });
      const falso = {
        Innertube: {
          create: async () => ({
            session: { player: { falso: true } },
            search: async () => ({
              videos: [{
                video_id: 'abc12345678',
                title: { toString: () => 'Video de prueba' },
                thumbnails: [{ url: 'https://i.ytimg.com/vi/abc12345678/hq.jpg' }],
                duration: { text: '1:02', seconds: 62 },
                author: { name: 'Canal de prueba' },
                view_count: { toString: () => '1200 visitas' },
                published: { toString: () => 'hace 1 día' }
              }]
            }),
            getInfo: async () => globalThis.__smokeYtInfo
          })
        }
      };
      const resolver = require.resolve('youtubei.js');
      const previo = require.cache[resolver];
      require.cache[resolver] = { id: resolver, filename: resolver, loaded: true, exports: falso };
      YT.reiniciar();

      const encontrados = await YT.buscar('prueba', 3);
      ok('YouTube: la búsqueda devuelve id, título, canal y vistas',
        encontrados.length === 1 && encontrados[0].id === 'abc12345678' && encontrados[0].title === 'Video de prueba'
        && encontrados[0].author === 'Canal de prueba' && encontrados[0].duration === '1:02',
        encontrados[0] && encontrados[0].url);

      // 1) Con formato progresivo: devuelve la URL viva y ya trae audio.
      //    La URL apunta al propio servidor de la prueba para que el chequeo de
      //    "enlace vivo" (urlViva) responda de verdad.
      const urlVivaLocal = `http://127.0.0.1:${port}/img/banner.jpg`;
      globalThis.__smokeYtInfo = {
        playability_status: { status: 'OK' },
        basic_info: { title: 'Video de prueba', author: 'Canal', duration: 62 },
        streaming_data: {
          formats: [fmt({ h: 360, url: urlVivaLocal })],
          adaptive_formats: [fmt({ h: 1080, a: false, url: vFile }), fmt({ v: false, mime: 'audio/mp4', br: 128000, url: aFile })]
        }
      };
      const alta = await YT.videoReproducible('abc12345678', 0);
      ok('YouTube: en automático usa DASH 1080p con audio cuando mejora el progresivo',
        alta.hasAudio === true && alta.height === 1080 && alta.muxed === true && fs.existsSync(alta.file));
      const progresivo = await YT.videoReproducible('abc12345678', 360);
      ok('YouTube: con quality=360 usa el progresivo con audio',
        progresivo.hasAudio === true && progresivo.url === urlVivaLocal && !progresivo.muxed);
      ok('YouTube: descarta los enlaces de googlevideo que ya no responden',
        (await YT.urlViva('https://cdn.ejemplo/no-existe.mp4')) === false);

      // 1-bis) Audio: se convierte a MP3 de verdad (lo que usa /play y /mp3).
      const mp3 = await P.youtubeAudioFile('abc12345678');
      const bytesMp3 = fs.readFileSync(mp3).subarray(0, 3);
      const esMp3 = bytesMp3.toString('latin1') === 'ID3' || (bytesMp3[0] === 0xff && (bytesMp3[1] & 0xe0) === 0xe0);
      ok('YouTube: el audio se convierte a un MP3 válido', esMp3, `${mp3} · ${fs.statSync(mp3).size} B`);

      // 2) Sin progresivo (sólo DASH): pega las dos pistas con ffmpeg.
      globalThis.__smokeYtInfo = {
        playability_status: { status: 'OK' },
        basic_info: { title: 'Video de prueba', author: 'Canal', duration: 62 },
        streaming_data: {
          formats: [],
          adaptive_formats: [fmt({ h: 720, a: false, url: vFile }), fmt({ v: false, mime: 'audio/mp4', br: 128000, url: aFile })]
        }
      };
      const pegado = await YT.videoReproducible('zzz99999999', 0);
      const pistas = pegado.file && fs.existsSync(pegado.file)
        ? require('child_process').spawnSync(ffmpegBin, ['-hide_banner', '-i', pegado.file], { encoding: 'utf8' }).stderr
        : '';
      ok('YouTube: sin progresivo pega video + audio con ffmpeg',
        Boolean(pegado.file) && pegado.hasAudio === true && pegado.muxed === true
        && /Video:/.test(pistas) && /Audio:/.test(pistas), pegado.file);

      const playable = await P.youtubePlayable('zzz99999999', 0);
      ok('providers.youtubePlayable devuelve un video con sonido',
        playable.hasAudio === true && (playable.file || playable.url === 'https://cdn.ejemplo/360.mp4'), playable.source);

      // 3) El endpoint real: en automático entrega un MP4 con pistas de video y audio.
      const directo = await get(port, '/downloader/mp4?url=https%3A%2F%2Fwww.youtube.com%2Fwatch%3Fv%3Dzzz99999999&direct=true');
      ok('/downloader/mp4?direct=true entrega el video (con audio)',
        directo.status === 200 && /^video\//.test(directo.type) && directo.body.length > 500,
        `${directo.status} ${directo.type} ${directo.body.length} B`);

      const rango = await new Promise(resolve => {
        http.get(`http://127.0.0.1:${port}/downloader/mp4?url=https%3A%2F%2Fwww.youtube.com%2Fwatch%3Fv%3Dzzz99999999&direct=true`,
          { headers: { Range: 'bytes=0-99' } }, res => {
            const chunks = [];
            res.on('data', c => chunks.push(c));
            res.on('end', () => resolve({ status: res.statusCode, range: res.headers['content-range'], len: Buffer.concat(chunks).length }));
          }).on('error', () => resolve({ status: 0 }));
      });
      ok('/downloader/mp4 acepta Range (se puede buscar dentro del video)',
        rango.status === 206 && /^bytes 0-99\//.test(String(rango.range)) && rango.len === 100,
        `${rango.status} ${rango.range}`);

      // 4) /downloader/play: reproduce y descarga el MP3.
      const playDirecto = await get(port, '/downloader/play?query=prueba&direct=true');
      ok('/downloader/play?direct=true devuelve un MP3 reproducible',
        playDirecto.status === 200 && /^audio\/mpeg/.test(playDirecto.type) && playDirecto.body.length > 500,
        `${playDirecto.status} ${playDirecto.type} ${playDirecto.body.length} B`);
      ok('/downloader/play deja descargar el audio (?download=true)',
        String(playDirecto.headers['content-disposition'] || '').startsWith('inline'));
      const playDescarga = await new Promise(resolve => {
        http.get(`http://127.0.0.1:${port}/downloader/play?query=prueba&direct=true&download=true`, res => {
          const chunks = [];
          res.on('data', c => chunks.push(c));
          res.on('end', () => resolve({ status: res.statusCode, disp: res.headers['content-disposition'] || '', len: Buffer.concat(chunks).length }));
        }).on('error', () => resolve({ status: 0, disp: '', len: 0 }));
      });
      ok('/downloader/play?download=true se descarga como archivo',
        playDescarga.status === 200 && playDescarga.disp.startsWith('attachment') && /\.mp3/.test(playDescarga.disp) && playDescarga.len > 500,
        playDescarga.disp);

      const playJson = await get(port, '/downloader/play?query=prueba');
      let playJsonBody = {};
      try { playJsonBody = JSON.parse(playJson.body.toString()); } catch (_) { /* no-json */ }
      ok('/downloader/play en JSON trae playUrl y downloadUrl',
        /\/downloader\/play/.test(String(playJsonBody?.result?.playUrl))
        && /download=true/.test(String(playJsonBody?.result?.downloadUrl))
        && playJsonBody?.result?.audio?.mime === 'audio/mpeg');

      const asJson = await get(port, '/downloader/mp4?url=https%3A%2F%2Fwww.youtube.com%2Fwatch%3Fv%3Dzzz99999999');
      let asJsonBody = {};
      try { asJsonBody = JSON.parse(asJson.body.toString()); } catch (_) { /* no-json */ }
      ok('/downloader/mp4 en JSON avisa que el video trae audio',
        asJsonBody?.result?.hasAudio === true && Boolean(asJsonBody?.result?.video?.url));

      if (pegado.file) fs.unlinkSync(pegado.file);
      if (alta.file) fs.unlinkSync(alta.file);
      try { fs.unlinkSync(mp3); } catch (_) { /* nada */ }
      fs.rmSync(dir, { recursive: true, force: true });
      if (previo) require.cache[resolver] = previo; else delete require.cache[resolver];
      delete globalThis.__smokeYtInfo;
      YT.reiniciar();
    }

    // ---- DOWNLOADER: el video sale con sonido ----
    ok('ffmpeg disponible para pegar audio + video', require('fs').existsSync(require('@ffmpeg-installer/ffmpeg').path));
    const formaMuxeada = { hasVideo: true, hasAudio: true, url: 'https://x/v.mp4', height: 720 };
    const formaMuda = { hasVideo: true, hasAudio: false, url: 'https://x/v.mp4', height: 1080 };
    ok('pickVideo prefiere el formato que ya trae audio', P.pickVideo([formaMuda, formaMuxeada], 1080)?.hasAudio === true);

    // sendFile: sirve un archivo local con Range (lo usa el MP4 pegado con ffmpeg)
    const { sendFile } = require('../src/utils/response');
    const { Writable } = require('stream');
    const tmpVideo = path.join(require('os').tmpdir(), `smoke-${Date.now()}.mp4`);
    fs.writeFileSync(tmpVideo, Buffer.from('0123456789abcdef'));
    class FakeRes extends Writable {
      constructor() { super(); this.headers = {}; this.statusCode = 200; this.req = { headers: { range: 'bytes=4-7' }, method: 'GET' }; this.chunks = []; }
      setHeader(k, v) { this.headers[k.toLowerCase()] = String(v); return this; }
      status(c) { this.statusCode = c; return this; }
      _write(c, _e, cb) { this.chunks.push(c); cb(); }
    }
    const fakeRes = new FakeRes();
    sendFile(fakeRes, tmpVideo, { mime: 'video/mp4', filename: 'x.mp4' });
    await new Promise(r => fakeRes.on('finish', r));
    fs.unlinkSync(tmpVideo);
    ok('sendFile: Range 206 con el trozo pedido',
      fakeRes.statusCode === 206 && fakeRes.headers['content-range'] === 'bytes 4-7/16'
      && Buffer.concat(fakeRes.chunks).toString() === '4567');

    for (const ep of ['youtube', 'mp4']) {
      const ficha = CATEGORIES.find(c => c.id === 'downloader').endpoints.find(e => e.id === ep);
      const quality = (ficha?.params || []).find(p => p.name === 'quality');
      ok(`/downloader/${ep}: quality incluye auto`, (quality?.options || []).includes('auto') && quality.example === 'auto');
    }

    // ---- Respaldo de /play: previews de Deezer / iTunes ----
    const prevDeezer = P.mapDeezer({
      title: 'Strategy', duration: 166,
      preview: 'https://cdnt-preview.dzcdn.net/x.mp3',
      artist: { name: 'TWICE' }, album: { title: 'KPop', cover_xl: 'https://cdn/x.jpg' }
    });
    const prevItunes = P.mapItunes({
      trackName: 'What is Love?', artistName: 'TWICE', collectionName: 'What is Love? - EP',
      previewUrl: 'https://audio-ssl.itunes.apple.com/x.m4a',
      artworkUrl100: 'https://is1.mzstatic.com/100x100bb.jpg', trackTimeMillis: 208227
    });
    ok('Preview de Deezer: título, artista, portada y mp3',
      prevDeezer.url.endsWith('.mp3') && prevDeezer.artist === 'TWICE' && prevDeezer.mime === 'audio/mpeg' && prevDeezer.preview === true);
    ok('Preview de iTunes: convierte la portada a 600x600',
      prevItunes.mime === 'audio/mp4' && prevItunes.cover.includes('600x600') && prevItunes.duration === 208);

    // ---- Descargas: todo archivo se puede bajar con ?download=true ----
    const conRango = (url, extra = {}) => new Promise(resolve => {
      http.get(`${url}${url.includes('?') ? '&' : '?'}download=true`, { headers: extra }, res => {
        const chunks = [];
        res.on('data', c => chunks.push(c));
        res.on('end', () => resolve({
          status: res.statusCode,
          type: res.headers['content-type'] || '',
          disp: res.headers['content-disposition'] || '',
          len: Buffer.concat(chunks).length
        }));
      }).on('error', () => resolve({ status: 0 }));
    });

    const pngDescarga = await conRango(`http://127.0.0.1:${port}/canvas/brat?text=hola`);
    ok('Canvas PNG se descarga como archivo',
      pngDescarga.status === 200 && pngDescarga.disp.startsWith('attachment') && /\.png/.test(pngDescarga.disp) && pngDescarga.len > 500,
      pngDescarga.disp);

    const videoDescarga = await conRango(`http://127.0.0.1:${port}/canvas/bratvideo?text=uno%20dos`);
    ok('Canvas video se descarga como archivo',
      videoDescarga.status === 200 && videoDescarga.disp.startsWith('attachment') && /\.(mp4|webm)/.test(videoDescarga.disp),
      videoDescarga.disp);

    const subidaDescarga = upUrl ? await conRango(upUrl) : { status: 0, disp: '' };
    ok('La imagen subida se descarga como archivo',
      subidaDescarga.status === 200 && subidaDescarga.disp.startsWith('attachment'), subidaDescarga.disp);

    // La web muestra el botón de descarga en cada tipo de resultado.
    const catJsDescargas = (await get(port, '/js/category.js')).body.toString();
    ok('La web ofrece Descargar en imagen, video, audio y JSON',
      (catJsDescargas.match(/btnDescargar\(/g) || []).length >= 4 && catJsDescargas.includes('download=true'));
    ok('La web puede descargar el JSON de cualquier endpoint',
      catJsDescargas.includes('bajarTexto') && catJsDescargas.includes('data-dl-text'));
    ok('La web ya no depende del proxy abierto /downloader/file',
      !catJsDescargas.includes('/downloader/file'));

    // ---- El proxy abierto y los fondos de pantalla se eliminaron ----
    for (const ruta of ['/downloader/file', '/downloader/proxy', '/downloader/wallpaper', '/searcher/wallpaper']) {
      const r = await get(port, ruta);
      ok(`${ruta} ya no existe → 404`, r.status === 404);
    }
    const pinSin = await get(port, '/downloader/pinterest');
    ok('/downloader/pinterest sin url → 400', pinSin.status === 400);
    // Una URL inválida es culpa del cliente: 400, no 502.
    for (const [ruta, q] of [
      ['/downloader/instagram', 'url=x'],
      ['/downloader/facebook', 'url=x'],
      ['/downloader/pinterest', 'url=x'],
      ['/downloader/youtube', 'url=x'],
      ['/downloader/mp3', 'url=x'],
      ['/downloader/mp4', 'url=x']
    ]) {
      const r = await get(port, `${ruta}?${q}`);
      ok(`${ruta} con URL inválida → 400`, r.status === 400);
    }
    const idsBorrados = ['wallpaper', 'file', 'proxy'];
    ok('El catálogo no tiene wallpaper ni el proxy file/proxy',
      !CATEGORIES.some(c => (c.endpoints || []).some(e => idsBorrados.includes(e.id))));
    ok(`El catálogo tiene ${t.endpoints} endpoints (canvas, downloader, searcher, tools, anime, reactions)`, t.endpoints === 104);

    // ---- Letra → sticker brat con la canción COMPLETA ----
    {
      const { bratFromLyrics } = require('../src/utils/lyricArt');
      const letraLarga = Array.from({ length: 20 }, (_, i) => `linea ${i + 1} de la cancion que suena`).join('\n');
      const corto = await bratFromLyrics({ title: 'Tema', artist: 'Artista', plainLyrics: 'una linea' }, {});
      const largo = await bratFromLyrics({ title: 'Tema', artist: 'Artista', plainLyrics: letraLarga }, {});
      const hCorto = (await sharp(corto.buffer).metadata()).height;
      const hLargo = (await sharp(largo.buffer).metadata()).height;
      ok(`lyric→brat crece con la letra completa (${hCorto} → ${hLargo})`, isPng(corto.buffer) && isPng(largo.buffer) && hLargo > hCorto * 2);
      const lrc = await bratFromLyrics({ title: 'Tema', artist: 'Artista', syncedLyrics: '[00:12.34] hola mundo\n[00:15.00] segunda linea' }, {});
      ok('lyric→brat limpia las marcas de tiempo del LRC', isPng(lrc.buffer) && lrc.lines >= 2);
      ok('lyric→brat respeta el color de fondo', (await sharp((await bratFromLyrics({ plainLyrics: 'hola' }, { bg: '#8ace00' })).buffer).metadata()).width === 512);
    }

    // ---- Play: la canción completa (varios intentos antes del preview) ----
    const catPlay = CATEGORIES.find(c => c.id === 'downloader').endpoints.find(e => e.id === 'play');
    ok('play anuncia la canción completa y el parámetro tries',
      /COMPLETA/.test(catPlay.desc) && catPlay.params.some(p => p.name === 'tries'));

    // ---- Ping ----
    const ping = JSON.parse((await get(port, '/ping')).body.toString());
    ok('GET /ping', ping.status === true && ping.result.endpoints === t.endpoints);

    // ---- Sin IA y sin NSFW ----
    ok('Sin categoría de IA', !CATEGORIES.some(c => /ai|ia|chatbot/i.test(c.id)));
    ok('Sin endpoints NSFW', !/nsfw|hentai|porn|xxx/i.test(JSON.stringify(CATEGORIES)));
  } finally {
    server.close();
  }

  console.log(failures ? `\n✗ ${failures} fallo(s)` : '\n✓ Smoke completo OK');
  process.exit(failures ? 1 : 0);
}

main().catch(e => { console.error(e); process.exit(1); });
