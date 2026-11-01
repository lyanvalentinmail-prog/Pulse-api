// scripts/test-videotext.js — Pruebas SIN red del editor de textos de video.
//
//   node scripts/test-videotext.js
//
// Genera un video de prueba con ffmpeg (dos escenas con texto), lo analiza con
// OCR local, comprueba las pistas detectadas y exporta el video editado.
// Si ffmpeg o los datos de Tesseract no están, avisa y no rompe el `npm test`.
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const V = require('../src/utils/videoText');
const store = require('../src/utils/videoStore');

let failures = 0;
const ok = (name, fn) => {
  try { fn(); console.log(`✓ ${name}`); }
  catch (e) { failures++; console.log(`✗ ${name} — ${e.message}`); }
};

// ---------------------------------------------------------------- pistas
const box = (x, y, w, h) => ({ x, y, w, h });

ok('trackDetections: el mismo texto en la misma zona es un solo bloque', () => {
  const tracks = V.trackDetections([
    { t: 0, text: 'Hola mundo', confidence: 90, box: box(0.1, 0.2, 0.3, 0.08) },
    { t: 1, text: 'Hola mundo', confidence: 92, box: box(0.1, 0.2, 0.3, 0.08) },
    { t: 2, text: 'Hola  mundo', confidence: 88, box: box(0.1, 0.21, 0.3, 0.08) }
  ]);
  assert.equal(tracks.length, 1);
  assert.equal(tracks[0].start, 0);
  assert.equal(tracks[0].end, 2);
  assert.equal(tracks[0].text, 'Hola mundo');
  assert.equal(tracks[0].detections, 3);
  assert.equal(tracks[0].confidence, 90);
});

ok('trackDetections: textos distintos o lejanos no se mezclan', () => {
  const tracks = V.trackDetections([
    { t: 0, text: 'Arriba', confidence: 90, box: box(0.05, 0.05, 0.2, 0.06) },
    { t: 0, text: 'Abajo', confidence: 90, box: box(0.05, 0.8, 0.2, 0.06) },
    { t: 1, text: 'Arriba', confidence: 90, box: box(0.5, 0.5, 0.2, 0.06) }
  ]);
  assert.equal(tracks.length, 3);
});

ok('trackDetections: la misma frase separada por un corte es otro bloque', () => {
  const tracks = V.trackDetections([
    { t: 0, text: 'Intro', confidence: 90, box: box(0.1, 0.1, 0.3, 0.08) },
    { t: 9, text: 'Intro', confidence: 90, box: box(0.1, 0.1, 0.3, 0.08) }
  ], { gap: 2.5 });
  assert.equal(tracks.length, 2);
  assert.equal(tracks[0].end, 0);
  assert.equal(tracks[1].start, 9);
});

// -------------------------------------------------------------- utilidades
ok('cleanHex acepta hex con o sin # y descarta lo inválido', () => {
  assert.equal(V.cleanHex('#ffd166', '0x000000'), '0xffd166');
  assert.equal(V.cleanHex('8ACE00', '0x000000'), '0x8ace00');
  assert.equal(V.cleanHex('rojo', '0x000000'), '0x000000');
});

ok('looksLikeVideo reconoce MP4, WebM y AVI', () => {
  const mp4 = Buffer.concat([Buffer.alloc(4), Buffer.from('ftypisom'), Buffer.alloc(16)]);
  const webm = Buffer.from([0x1a, 0x45, 0xdf, 0xa3, 0, 0, 0, 0, 0, 0, 0, 0]);
  const avi = Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('AVI '), Buffer.alloc(8)]);
  assert.equal(V.looksLikeVideo(mp4), true);
  assert.equal(V.looksLikeVideo(webm), true);
  assert.equal(V.looksLikeVideo(avi), true);
  assert.equal(V.looksLikeVideo(Buffer.from('GIF89a......')), false);
  assert.equal(V.looksLikeVideo(Buffer.alloc(3)), false);
});

ok('videoStore guarda y devuelve el archivo subido', () => {
  const saved = store.save(Buffer.concat([Buffer.alloc(4), Buffer.from('ftypisom'), Buffer.alloc(32)]));
  const item = store.get(saved.id);
  assert.ok(item && fs.existsSync(item.file));
  assert.equal(store.get('no-existe'), null);
});

// --------------------------------------------------------- ffmpeg + OCR
const ffmpeg = (() => {
  try { return require('@ffmpeg-installer/ffmpeg').path; } catch (_) { return null; }
})();
const hasTessData = (() => {
  try { require('@tesseract.js-data/eng'); return true; } catch (_) { return false; }
})();

if (!ffmpeg || !hasTessData) {
  console.log(`\n⚠️  Salto las pruebas de OCR: ${!ffmpeg ? 'falta ffmpeg' : 'faltan los datos de Tesseract'}`);
  console.log(`\n${failures ? `✗ ${failures} fallo(s)` : '✓ Editor de video en orden'}`);
  if (failures) process.exitCode = 1;
} else {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pulse-videotext-test-'));
  const video = path.join(dir, 'escenas.mp4');
  const font = path.join(__dirname, '..', 'assets', 'fonts', 'Inter-Bold.ttf');

  execFileSync(ffmpeg, [
    '-hide_banner', '-y', '-loglevel', 'error',
    '-f', 'lavfi', '-i', 'color=c=0x101820:s=960x540:d=6:r=25',
    '-vf', [
      `drawtext=fontfile=${font}:text='PRIMERA ESCENA':fontcolor=white:fontsize=48:x=40:y=80:enable='lt(t,3)'`,
      `drawtext=fontfile=${font}:text='SEGUNDA ESCENA':fontcolor=0xffd166:fontsize=44:x=60:y=300:enable='gte(t,3)'`
    ].join(','),
    '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', video
  ], { timeout: 60000 });

  (async () => {
    let scan = null;
    try {
      scan = await V.scanVideo(video, { fps: 1 });
      console.log('✓ scanVideo: analiza el video y detecta el texto');
    } catch (e) {
      failures++;
      console.log(`✗ scanVideo — ${e.message}`);
    }

    if (scan) {
      ok('scanVideo: duración y medidas del video', () => {
        assert.equal(scan.video.duration, 6);
        assert.equal(scan.video.width, 960);
        assert.equal(scan.video.height, 540);
        assert.equal(scan.scan.lang, 'eng');
      });

      ok('scanVideo: encuentra las dos escenas con su intervalo', () => {
        assert.equal(scan.texts.length, 2, JSON.stringify(scan.texts.map(t => t.text)));
        assert.match(scan.texts[0].text, /PRIMERA ESCENA/i);
        assert.match(scan.texts[1].text, /SEGUNDA ESCENA/i);
        assert.ok(scan.texts[0].start === 0 && scan.texts[0].end >= 2, `t1 ${scan.texts[0].start}-${scan.texts[0].end}`);
        assert.ok(scan.texts[1].start >= 3 && scan.texts[1].end >= 5, `t2 ${scan.texts[1].start}-${scan.texts[1].end}`);
        for (const text of scan.texts) {
          assert.ok(text.confidence >= V.LIMITS.MIN_CONFIDENCE);
          assert.ok(text.box.x >= 0 && text.box.x <= 1 && text.box.w > 0 && text.box.w <= 1);
        }
      });

      ok('scanVideo: los fotogramas repetidos no se vuelven a leer', () => {
        assert.ok(scan.scan.skipped > scan.scan.analyzed, `${scan.scan.analyzed} analizados / ${scan.scan.skipped} repetidos`);
      });

      try {
        const out = await V.renderVideo(video, {
          texts: scan.texts.map((text, index) => ({
            ...text,
            text: index === 0 ? 'TEXTO UNO' : 'TEXTO DOS',
            color: 'ffd166',
            fontSizePct: 110
          }))
        });
        console.log('✓ renderVideo: exporta el MP4 editado');
        const info = await V.probe(out.file);
        ok('renderVideo: el MP4 dura lo mismo y conserva medidas', () => {
          assert.ok(fs.statSync(out.file).size > 5000);
          assert.ok(Math.abs(info.duration - 6) < 0.6, `duración ${info.duration}`);
          assert.equal(info.width, 960);
          assert.equal(info.height, 540);
        });
        // El texto original ya no debería leerse: el parche lo tapa.
        const rescan = await V.scanVideo(out.file, { fps: 1 });
        ok('renderVideo: el texto original quedó tapado y se lee el nuevo', () => {
          const todo = rescan.texts.map(t => t.text).join(' | ');
          assert.ok(!/PRIMERA ESCENA|SEGUNDA ESCENA/i.test(todo), `todavía se lee: ${todo}`);
          assert.match(todo, /TEXTO (UNO|DOS)/i);
        });
        fs.rmSync(out.dir, { recursive: true, force: true });
      } catch (e) {
        failures++;
        console.log(`✗ renderVideo — ${e.message}`);
      }
    }

    try {
      await V.renderVideo(video, { texts: [] });
      failures++;
      console.log('✗ renderVideo sin textos — no lanzó error');
    } catch (e) {
      console.log(e.status === 400 ? '✓ renderVideo: sin textos responde 400' : `✗ renderVideo sin textos — ${e.status}`);
      if (e.status !== 400) failures++;
    }

    fs.rmSync(dir, { recursive: true, force: true });
    await V.closeOcr();
    console.log(`\n${failures ? `✗ ${failures} fallo(s)` : '✓ Editor de video en orden'}`);
    if (failures) process.exitCode = 1;
    process.exit(failures ? 1 : 0);
  })();
}
