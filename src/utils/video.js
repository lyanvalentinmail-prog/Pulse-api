// src/utils/video.js — Canvas en video: bratvideo (MP4) y attp (WebM sticker).
// El texto de cada frame se dibuja en vectores (textEngine) para que no dependa de
// las fuentes del sistema del host. La tipografía sale de src/canvas/layouts.js
// (la misma que usa /canvas/brat), así el video y la imagen se ven iguales.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFile } = require('child_process');
const { sharp } = require('./image');
const { textLayer } = require('./textEngine');
const { emojiImages } = require('./emoji');
const { bratSpec, renderBrat } = require('./brat');

function ffmpegPath() {
  try { return require('@ffmpeg-installer/ffmpeg').path; } catch (_) { return 'ffmpeg'; }
}

function runFfmpeg(args, timeoutMs = 45000) {
  return new Promise((resolve, reject) => {
    execFile(ffmpegPath(), args, { timeout: timeoutMs }, (err, _out, stderr) => {
      if (err) return reject(new Error(`ffmpeg: ${String(stderr || err.message).slice(-300)}`));
      resolve();
    });
  });
}

const cache = new Map();
function cached(key, buf) {
  cache.set(key, buf);
  while (cache.size > 12) cache.delete(cache.keys().next().value);
  return buf;
}

const clampScale = v => Math.max(0.3, Math.min(2.5, Number(v) || 1));

// ======================= BRAT (imagen y video) =======================
// Cinco palabras por pantalla y 0,4 s por aparición, como el video de Drive.
const BRAT_WORDS_PER_PAGE = 5;
// Dos intervalos extra con la página completa: pausa de 1,2 s en total.
const BRAT_HOLD_FRAMES = 2;

/** Renderiza cada estado con el mismo diseño y ajuste que el PNG. */
async function bratFrame(text, opts = {}, size = null) {
  const spec = opts.spec || bratSpec(opts, { video: true });
  return renderBrat(text, spec, { emojis: opts.emojis || null, maxFont: size || spec.maxFont });
}

/**
 * Las palabras aparecen una por una. Cada página contiene como máximo `words`
 * palabras; al llenarse, queda visible antes de pasar a las siguientes. El
 * texto se vuelve a ajustar en cada estado, igual que en el video de referencia.
 */
async function bratVideo(text, opts = {}) {
  const perPage = Math.max(1, Math.min(8, Math.round(Number(opts.words) || BRAT_WORDS_PER_PAGE)));
  const value = String(text || 'Welcome to Velirius API').trim();
  // Limitar por grafemas evita cortar un emoji compuesto o un par sustituto.
  const segmenter = new Intl.Segmenter('es', { granularity: 'grapheme' });
  let clean = '';
  let count = 0;
  for (const { segment } of segmenter.segment(value)) {
    if (count++ === 200) break;
    clean += segment;
  }
  const spec = bratSpec(opts, { video: true });
  const words = clean.split(/\s+/).filter(Boolean).slice(0, perPage * 8);
  if (!words.length) words.push('brat');

  // Todos los parámetros que afectan al render deben distinguir la caché.
  const key = `bratvideo:${JSON.stringify({ clean, perPage, spec })}`;
  if (cache.has(key)) return cache.get(key);

  const pages = [];
  for (let i = 0; i < words.length; i += perPage) pages.push(words.slice(i, i + perPage));
  const emojis = await emojiImages(spec.uppercase ? clean.toUpperCase() : clean.toLowerCase());
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'velirius-brat-'));
  try {
    let n = 0;
    for (const page of pages) {
      let lastFrame;
      for (let i = 1; i <= page.length; i++) {
        lastFrame = await bratFrame(page.slice(0, i).join(' '), { spec, emojis });
        fs.writeFileSync(path.join(dir, `f-${String(n++).padStart(3, '0')}.png`), lastFrame);
      }
      // Reutilizar el último PNG mantiene idéntica la pausa y evita rerenderizarlo.
      for (let h = 0; h < BRAT_HOLD_FRAMES; h++) {
        fs.writeFileSync(path.join(dir, `f-${String(n++).padStart(3, '0')}.png`), lastFrame);
      }
    }
    const out = path.join(dir, 'out.mp4');
    await runFfmpeg([
      '-y', '-framerate', '2.5', '-i', path.join(dir, 'f-%03d.png'),
      '-vf', 'fps=25,format=yuv420p', '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '20',
      '-movflags', '+faststart', out
    ]);
    return cached(key, fs.readFileSync(out));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

const ATTP_COLORS = ['#ff004d', '#ff8a00', '#ffe600', '#00e05a', '#00c2ff', '#8a2be2', '#ff5da2', '#ffffff'];

async function attpFrame(text, color, dx, opts = {}) {
  const S = 512;
  const scale = clampScale(opts.size);
  const layer = textLayer({
    text,
    width: S,
    height: S,
    family: opts.font || 'sans',
    weight: 800,
    maxFont: Math.round(84 * scale),
    minFont: 14,
    maxLines: 4,
    lineHeight: 1.15,
    letterSpacing: 1,
    fill: color,
    align: 'middle',
    padding: 22,
    offsetX: dx,
    stroke: '#000000',
    strokeWidth: Math.max(5, 8 * scale)
  });
  return sharp(layer.svg).png().toBuffer();
}

async function attpVideo(text, opts = {}) {
  const clean = String(text || 'Welcome to Velirius').trim().slice(0, 60);
  const key = `attp:${clean}:${opts.size || 1}`;
  if (cache.has(key)) return cache.get(key);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'velirius-attp-'));
  try {
    const frames = 16;
    for (let i = 0; i < frames; i++) {
      const frame = await attpFrame(clean, ATTP_COLORS[i % ATTP_COLORS.length], i % 2 === 0 ? -4 : 4, opts);
      fs.writeFileSync(path.join(dir, `f-${String(i).padStart(3, '0')}.png`), frame);
    }
    const out = path.join(dir, 'out.webm');
    await runFfmpeg([
      '-y', '-stream_loop', '2', '-framerate', '10', '-i', path.join(dir, 'f-%03d.png'),
      '-t', '3.2', '-vf', 'fps=20', '-c:v', 'libvpx-vp9', '-pix_fmt', 'yuva420p',
      '-b:v', '600k', '-auto-alt-ref', '0', out
    ]);
    return cached(key, fs.readFileSync(out));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

// Endpoints de video: no viven en src/canvas/generators (son MP4/WebM animados)
// sino acá. `scripts/validate-catalog.js` los usa para cuadrar el catálogo.
const VIDEO_IDS = ['bratvideo', 'attp'];

module.exports = { bratVideo, attpVideo, bratFrame, attpFrame, VIDEO_IDS };
