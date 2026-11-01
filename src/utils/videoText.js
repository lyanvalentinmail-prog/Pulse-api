// src/utils/videoText.js — Editor de textos de un video.
//
//  1. ffmpeg saca fotogramas del video (1 por segundo, ajustado al máximo).
//  2. Tesseract.js (WASM, local: no sale nada a internet) lee cada fotograma y
//     devuelve las líneas de texto con su caja (x, y, ancho, alto) y confianza.
//  3. Las detecciones se agrupan en "pistas": el mismo texto en la misma zona
//     pasa a ser un bloque con inicio y fin, que la web muestra como una capa
//     editable (estilo editor de video).
//  4. Al exportar, ffmpeg tapa el texto original con un parche del color del
//     fondo (drawbox) y dibuja el texto nuevo encima (drawtext), sólo durante
//     el intervalo de cada bloque.
//
// ▸ Modelo del texto: `eng` por defecto (VIDEO_OCR_LANG). Para otros idiomas
//   hace falta el paquete de datos: `npm i @tesseract.js-data/spa` (y poner
//   VIDEO_OCR_LANG=spa). Sin datos, el análisis responde 503 con la pista.
// ▸ Todo es local: ni el video ni el texto salen del servidor.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFile } = require('child_process');
const sharp = require('sharp');
const config = require('../config');

// ---------- Límites (evitan que un video enorme tumbe el proceso) ----------
const MAX_BYTES = 80 * 1024 * 1024;
const MAX_DURATION = 300;          // 5 min
const MAX_FRAMES = 40;             // fotogramas analizados por video
const MAX_LINES = 40;              // bloques de texto devueltos
const FRAME_WIDTH = 960;           // ancho de análisis (el render usa el real)
const MIN_CONFIDENCE = 45;

const FONTS = {
  sans: 'Inter-Bold.ttf',
  serif: 'Playfair-Bold.ttf',
  mono: 'JetBrainsMono-Bold.ttf',
  hand: 'CaveatBrush-Regular.ttf'
};
const FONT_DIR = path.join(__dirname, '..', '..', 'assets', 'fonts');

class VideoTextError extends Error {
  constructor(message, { status = 502, hint, code = 'video' } = {}) {
    super(message);
    this.name = 'VideoTextError';
    this.status = status;
    this.hint = hint;
    this.code = code;
  }
}

// ---------- ffmpeg ----------
function ffmpegPath() {
  try { return require('@ffmpeg-installer/ffmpeg').path; } catch (_) { return 'ffmpeg'; }
}

function runFfmpeg(args, timeoutMs = 120000) {
  return new Promise((resolve, reject) => {
    execFile(ffmpegPath(), ['-hide_banner', '-nostdin', ...args], { timeout: timeoutMs, maxBuffer: 8 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) {
        const msg = String(stderr || err.message).trim().split('\n').slice(-3).join(' ');
        return reject(new VideoTextError(`ffmpeg: ${msg.slice(0, 300)}`, { code: 'ffmpeg' }));
      }
      resolve({ stdout, stderr });
    });
  });
}

const num = (value, fallback) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};

/** Lee duración, medidas y presencia de audio sin ffprobe (ffmpeg -i). */
async function probe(file) {
  const out = await new Promise(resolve => {
    execFile(ffmpegPath(), ['-hide_banner', '-i', file], { timeout: 20000 }, (_err, _stdout, stderr) => resolve(String(stderr || '')));
  });
  const duration = (out.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/) || []);
  const seconds = duration.length
    ? Number(duration[1]) * 3600 + Number(duration[2]) * 60 + Number(duration[3])
    : 0;
  const video = out.match(/Stream #\d+:\d+.*?: Video: ([\w-]+).*?(\d{2,5})x(\d{2,5})/);
  const fps = out.match(/(\d+(?:\.\d+)?) fps/);
  return {
    duration: Math.max(0, seconds),
    width: video ? Number(video[2]) : 0,
    height: video ? Number(video[3]) : 0,
    codec: video ? video[1] : '',
    fps: fps ? Number(fps[1]) : 0,
    hasAudio: /Stream #\d+:\d+.*?: Audio: /.test(out)
  };
}

// ---------- OCR (Tesseract) ----------
let workerPromise = null;

function langData(lang) {
  try {
    const data = require(`@tesseract.js-data/${lang}`);
    const versioned = path.join(data.langPath, '4.0.0_best_int');
    const langPath = fs.existsSync(path.join(versioned, `${lang}.traineddata.gz`)) ? versioned : data.langPath;
    return { langPath, gzip: data.gzip !== false };
  } catch (_) {
    return null;
  }
}

async function getWorker() {
  if (workerPromise) return workerPromise;
  workerPromise = (async () => {
    const lang = config.videoOcrLang;
    const data = langData(lang);
    if (!data) {
      throw new VideoTextError(`Falta el idioma "${lang}" para leer textos`, {
        status: 503,
        code: 'ocr_lang',
        hint: `Instalá los datos con "npm i @tesseract.js-data/${lang}" (o usá ?lang=eng) y reiniciá el servidor.`
      });
    }
    const { createWorker } = require('tesseract.js');
    return createWorker(lang, 1, {
      langPath: data.langPath,
      gzip: data.gzip,
      cachePath: path.join(os.tmpdir(), 'pulse-tesseract'),
      logger: () => {}
    });
  })();
  try {
    return await workerPromise;
  } catch (e) {
    workerPromise = null;
    throw e;
  }
}

/** Cierra el worker de OCR (libera el processo WASM; útil en pruebas y al bajar). */
async function closeOcr() {
  if (!workerPromise) return;
  const pending = workerPromise;
  workerPromise = null;
  try {
    const worker = await pending;
    await worker.terminate();
  } catch (_) { /* ya estaba cerrado */ }
}

/** Detecta las líneas de texto de un fotograma (buffer PNG/JPEG). */
async function ocrFrame(buffer) {
  const worker = await getWorker();
  const { data } = await worker.recognize(buffer, {}, { text: true, blocks: true });
  const lines = [];
  for (const block of data.blocks || []) {
    for (const paragraph of block.paragraphs || []) {
      for (const line of paragraph.lines || []) {
        const text = String(line.text || '').replace(/\s+/g, ' ').trim();
        if (!text || text.length < 2) continue;
        lines.push({ text, confidence: Number(line.confidence) || 0, box: line.bbox });
      }
    }
  }
  return lines;
}

/** Huella del fotograma (dHash 8×8): dos frames iguales no se vuelven a leer. */
async function frameHash(buffer) {
  const raw = await sharp(buffer).greyscale().resize(9, 8, { fit: 'fill' }).raw().toBuffer();
  let bits = '';
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      bits += raw[y * 9 + x] < raw[y * 9 + x + 1] ? '1' : '0';
    }
  }
  return bits;
}

// ---------- Pistas (detecciones agrupadas en el tiempo) ----------
const normText = text => text.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '').trim();

function iou(a, b) {
  const ax2 = a.x + a.w;
  const ay2 = a.y + a.h;
  const bx2 = b.x + b.w;
  const by2 = b.y + b.h;
  const interW = Math.max(0, Math.min(ax2, bx2) - Math.max(a.x, b.x));
  const interH = Math.max(0, Math.min(ay2, by2) - Math.max(a.y, b.y));
  const inter = interW * interH;
  const union = a.w * a.h + b.w * b.h - inter;
  return union > 0 ? inter / union : 0;
}

/**
 * Agrupa detecciones (`{ t, text, confidence, box }` en orden temporal) en
 * pistas con inicio y fin. Misma zona + mismo texto = misma pista.
 */
function trackDetections(detections, { gap = 2.5 } = {}) {
  const tracks = [];
  for (const det of detections) {
    const key = normText(det.text);
    if (!key) continue;
    let best = null;
    let bestScore = 0;
    for (const track of tracks) {
      if (track.key !== key) continue;
      if (det.t - track.end > gap) continue;
      const score = iou(track.box, det.box);
      if (score > bestScore) { bestScore = score; best = track; }
    }
    if (best && bestScore >= 0.35) {
      best.end = Math.max(best.end, det.t);
      best.hits.push(det);
      const n = best.hits.length;
      // Caja promedio: se mueve con el texto pero no tiembla.
      best.box = {
        x: (best.box.x * (n - 1) + det.box.x) / n,
        y: (best.box.y * (n - 1) + det.box.y) / n,
        w: (best.box.w * (n - 1) + det.box.w) / n,
        h: (best.box.h * (n - 1) + det.box.h) / n
      };
      continue;
    }
    tracks.push({
      key,
      start: det.t,
      end: det.t,
      box: { ...det.box },
      hits: [det]
    });
  }

  return tracks.map((track, index) => {
    // Texto ganador (el que más se repitió) y confianza media.
    const counts = new Map();
    for (const hit of track.hits) counts.set(hit.text, (counts.get(hit.text) || 0) + 1);
    const text = [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
    const confidence = Math.round(track.hits.reduce((sum, hit) => sum + hit.confidence, 0) / track.hits.length);
    return {
      id: `t${index + 1}`,
      text,
      start: Number(track.start.toFixed(2)),
      end: Number(track.end.toFixed(2)),
      confidence,
      box: {
        x: Number(track.box.x.toFixed(4)),
        y: Number(track.box.y.toFixed(4)),
        w: Number(track.box.w.toFixed(4)),
        h: Number(track.box.h.toFixed(4))
      },
      detections: track.hits.length
    };
  }).sort((a, b) => (a.start - b.start) || (a.box.y - b.box.y));
}

// ---------- Análisis completo ----------
/**
 * Analiza el video y devuelve las pistas de texto.
 * `opts`: { fps, lang, minConfidence, maxFrames }
 */
async function scanVideo(file, opts = {}) {
  const info = await probe(file);
  if (!info.width || !info.height) {
    throw new VideoTextError('El archivo no parece un video válido', {
      status: 400, code: 'not_video', hint: 'Probá con MP4 (H.264) o WebM.'
    });
  }
  if (info.duration > MAX_DURATION) {
    throw new VideoTextError(`El video dura ${Math.round(info.duration)} s (máximo ${MAX_DURATION} s)`, {
      status: 400, code: 'duration', hint: 'Recortá el video o subí uno más corto.'
    });
  }

  const maxFrames = Math.min(MAX_FRAMES, Math.max(4, Math.round(num(opts.maxFrames, MAX_FRAMES))));
  const wantedFps = Math.min(3, Math.max(0.25, num(opts.fps, 1)));
  // Para videos largos se baja el muestreo para no pasar el tope de fotogramas,
  // así el análisis cubre todo el video y no sólo el principio.
  const fps = info.duration > 1 ? Math.max(0.05, Math.min(wantedFps, maxFrames / info.duration)) : wantedFps;
  const minConfidence = Math.min(95, Math.max(0, num(opts.minConfidence, MIN_CONFIDENCE)));

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pulse-scan-'));
  const started = Date.now();
  try {
    await runFfmpeg([
      '-loglevel', 'error', '-i', file,
      '-vf', `fps=${fps.toFixed(4)},scale='min(${FRAME_WIDTH},iw)':-2`,
      '-frames:v', String(maxFrames),
      '-start_number', '1',
      path.join(dir, 'f%04d.png')
    ], 180000);

    const files = fs.readdirSync(dir).filter(name => name.endsWith('.png')).sort();
    if (!files.length) throw new VideoTextError('No se pudo leer ningún fotograma', { code: 'frames' });

    const first = await sharp(path.join(dir, files[0])).metadata();
    const frameWidth = first.width;
    const frameHeight = first.height;

    const detections = [];
    let previousHash = null;
    let analyzed = 0;
    let skipped = 0;
    // Lo último leído: si el fotograma siguiente es idéntico no hace falta
    // volver a pasar el OCR, pero el texto sigue en pantalla y la pista se
    // estira hasta el cambio de escena.
    let lastBoxes = [];

    for (const [index, name] of files.entries()) {
      const buffer = fs.readFileSync(path.join(dir, name));
      const t = index / fps;
      const hash = await frameHash(buffer);
      if (hash === previousHash) {
        skipped++;
        for (const box of lastBoxes) detections.push({ ...box, t });
        continue;
      }
      previousHash = hash;
      let lines = [];
      try { lines = await ocrFrame(buffer); }
      catch (e) {
        throw new VideoTextError('No se pudo leer el texto del video', {
          status: 502, code: 'ocr', hint: e.message
        });
      }
      analyzed++;
      lastBoxes = [];
      for (const line of lines) {
        if (line.confidence < minConfidence) continue;
        const box = {
          x: Math.max(0, line.box.x0 / frameWidth),
          y: Math.max(0, line.box.y0 / frameHeight),
          w: Math.min(1, (line.box.x1 - line.box.x0) / frameWidth),
          h: Math.min(1, (line.box.y1 - line.box.y0) / frameHeight)
        };
        lastBoxes.push({ text: line.text.slice(0, 120), confidence: line.confidence, box });
        detections.push({ t, text: line.text.slice(0, 120), confidence: line.confidence, box });
      }
    }

    // Cada bloque dura hasta medio paso de muestreo después de la última vez
    // que se vio (el texto no desaparece de golpe) y nunca más que el video.
    const tail = (1 / fps) / 2;
    const duration = info.duration || (files.length / fps);
    const tracks = trackDetections(detections).map(track => ({
      ...track,
      end: Number(Math.min(duration, track.end + tail).toFixed(2))
    })).slice(0, MAX_LINES);

    return {
      video: {
        duration: Number(info.duration.toFixed(2)),
        width: info.width,
        height: info.height,
        fps: info.fps,
        hasAudio: info.hasAudio,
        codec: info.codec
      },
      scan: {
        fps: Number(fps.toFixed(3)),
        frames: files.length,
        analyzed,
        skipped,
        frameWidth,
        frameHeight,
        detections: detections.length,
        lang: config.videoOcrLang,
        ms: Date.now() - started
      },
      names: files,
      texts: tracks
    };
  } finally {
    fs.rm(dir, { recursive: true, force: true }, () => {});
  }
}

// ---------- Color del parche ----------
const hex = (r, g, b) => `0x${[r, g, b].map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('')}`;

/**
 * Color dominante alrededor de una caja (para tapar el texto original con el
 * color del fondo). Se toma una zona ampliada y se usa la mediana: el texto es
 * una minoría de píxeles, así que no arrastra el color.
 */
async function sampleBackground(frameBuffer, box) {
  const meta = await sharp(frameBuffer).metadata();
  const { width, height } = meta;
  const padX = Math.max(6, Math.round(box.w * width * 0.25));
  const padY = Math.max(4, Math.round(box.h * height * 0.45));
  const left = Math.max(0, Math.round(box.x * width) - padX);
  const top = Math.max(0, Math.round(box.y * height) - padY);
  const right = Math.min(width, Math.round((box.x + box.w) * width) + padX);
  const bottom = Math.min(height, Math.round((box.y + box.h) * height) + padY);
  const regionWidth = Math.max(1, right - left);
  const regionHeight = Math.max(1, bottom - top);

  const raw = await sharp(frameBuffer).extract({ left, top, width: regionWidth, height: regionHeight })
    .removeAlpha().resize(24, 24, { fit: 'fill' }).raw().toBuffer();
  const channels = [[], [], []];
  for (let i = 0; i + 2 < raw.length; i += 3) {
    channels[0].push(raw[i]);
    channels[1].push(raw[i + 1]);
    channels[2].push(raw[i + 2]);
  }
  const median = values => {
    if (!values.length) return 0;
    const sorted = values.slice().sort((a, b) => a - b);
    return sorted[Math.floor(sorted.length / 2)];
  };
  return hex(median(channels[0]), median(channels[1]), median(channels[2]));
}

// ---------- Render ----------
const cleanHex = (value, fallback) => {
  const raw = String(value || '').replace(/^#/, '').trim();
  return /^[0-9a-f]{6}$/i.test(raw) ? `0x${raw.toLowerCase()}` : fallback;
};

const escapeFilterPath = file => file.replace(/\\/g, '/').replace(/:/g, '\\:').replace(/'/g, "\\'");

/**
 * Dibuja los textos nuevos sobre el video y devuelve la ruta del MP4.
 * `texts`: [{ text, start, end, box:{x,y,w,h}, color, bgColor, hideOriginal,
 *             fontSizePct, font, outline, opacity }]
 */
async function renderVideo(file, { texts = [], font = 'sans', hideOriginal = true, outputPath } = {}) {
  const info = await probe(file);
  if (!info.width || !info.height) {
    throw new VideoTextError('El archivo no parece un video válido', { status: 400, code: 'not_video' });
  }
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pulse-render-'));
  const out = outputPath || path.join(dir, 'salida.mp4');

  try {
    const patches = [];
    const draws = [];
    let index = 0;

    // Color de fondo: se toma del fotograma del inicio de cada bloque.
    for (const item of texts) {
      const text = String(item.text || '').replace(/\s+/g, ' ').trim().slice(0, 200);
      if (!text) continue;
      const start = Math.max(0, Math.min(info.duration, num(item.start, 0)));
      const end = Math.max(start + 0.1, Math.min(info.duration || start + 1, num(item.end, start + 2)));
      const box = item.box && typeof item.box === 'object' ? item.box : null;
      if (!box) continue;
      const x = Math.max(0, Math.min(1, num(box.x, 0.05)));
      const y = Math.max(0, Math.min(1, num(box.y, 0.05)));
      const w = Math.max(0.02, Math.min(1 - x, num(box.w, 0.4)));
      const h = Math.max(0.02, Math.min(1 - y, num(box.h, 0.08)));

      const px = Math.round(x * info.width);
      const py = Math.round(y * info.height);
      const pw = Math.round(w * info.width);
      const ph = Math.round(h * info.height);

      index++;
      const enable = `enable='between(t,${start.toFixed(2)},${end.toFixed(2)})'`;

      // 1) tapar el original (con margen para que no quede ningún borde)
      if (item.hideOriginal === undefined ? hideOriginal : item.hideOriginal) {
        let color = cleanHex(item.bgColor, '');
        if (!color) {
          try {
            const frame = await grabFrame(file, start);
            color = await sampleBackground(frame, { x, y, w, h });
          } catch (_) { color = '0x000000'; }
        }
        const padX = Math.max(4, Math.round(ph * 0.18));
        const padY = Math.max(3, Math.round(ph * 0.22));
        const bx = Math.max(0, px - padX);
        const by = Math.max(0, py - padY);
        const bw = Math.min(info.width - bx, pw + padX * 2);
        const bh = Math.min(info.height - by, ph + padY * 2);
        patches.push(`drawbox=x=${bx}:y=${by}:w=${bw}:h=${bh}:color=${color}@1:t=fill:${enable}`);
      }

      // 2) dibujar el texto nuevo
      const textFile = path.join(dir, `t${index}.txt`);
      fs.writeFileSync(textFile, text, 'utf8');
      const fontFile = path.join(FONT_DIR, FONTS[item.font] || FONTS[font] || FONTS.sans);
      const sizePct = Math.min(200, Math.max(30, num(item.fontSizePct, 100)));
      const fontSize = Math.max(8, Math.round(ph * sizePct / 100));
      const color = cleanHex(item.color, '0xffffff');
      const outline = item.outline === false ? 0 : Math.max(1, Math.round(fontSize * 0.06));
      // El texto queda centrado en la caja del original (si cambia el tamaño,
      // crece hacia arriba y abajo en partes iguales).
      const top = Math.round(py + (ph - fontSize) / 2);
      draws.push([
        'drawtext=fontfile=' + escapeFilterPath(fontFile),
        'textfile=' + escapeFilterPath(textFile),
        `x=${px}`,
        `y=${Math.max(0, Math.min(top, info.height - fontSize))}`,
        `fontsize=${fontSize}`,
        `fontcolor=${color}`,
        'line_spacing=6',
        outline ? `borderw=${outline}:bordercolor=0x000000@0.65` : null,
        enable
      ].filter(Boolean).join(':'));
    }

    if (!patches.length && !draws.length) {
      throw new VideoTextError('No hay textos para dibujar', { status: 400, code: 'empty', hint: 'Editá al menos un bloque antes de exportar.' });
    }

    // Los parches van primero: así el texto nuevo nunca queda tapado.
    const filters = [...patches, ...draws].join(',');
    await runFfmpeg([
      '-loglevel', 'error', '-y', '-i', file,
      '-vf', filters,
      '-map', '0:v:0', '-map', '0:a:0?',
      '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', '-pix_fmt', 'yuv420p',
      '-c:a', 'aac', '-b:a', '128k',
      '-movflags', '+faststart',
      out
    ], 240000);

    return { file: out, dir, info };
  } catch (e) {
    fs.rm(dir, { recursive: true, force: true }, () => {});
    if (e instanceof VideoTextError) throw e;
    throw new VideoTextError('No se pudo exportar el video', { code: 'render', hint: e.message });
  }
}

/** Un fotograma del video en el instante `t` (buffer PNG). */
async function grabFrame(file, t) {
  return new Promise((resolve, reject) => {
    execFile(ffmpegPath(), [
      '-hide_banner', '-nostdin', '-loglevel', 'error',
      '-ss', Math.max(0, t).toFixed(3), '-i', file,
      '-frames:v', '1', '-f', 'image2pipe', '-vcodec', 'png', 'pipe:1'
    ], { timeout: 20000, maxBuffer: 32 * 1024 * 1024, encoding: 'buffer' }, (err, stdout) => {
      if (err || !stdout || !stdout.length) return reject(err || new Error('sin fotograma'));
      resolve(stdout);
    });
  });
}

/** ¿El archivo parece un video? (por firma de bytes, antes de tocar ffmpeg). */
function looksLikeVideo(buffer) {
  if (!buffer || buffer.length < 12) return false;
  const head = buffer.subarray(0, 12);
  if (head.subarray(4, 8).toString('ascii') === 'ftyp') return true;               // MP4/MOV/M4V
  if (head[0] === 0x1a && head[1] === 0x45 && head[2] === 0xdf && head[3] === 0xa3) return true; // WebM/MKV
  if (head.subarray(0, 4).toString('ascii') === 'RIFF' && buffer.subarray(8, 12).toString('ascii') === 'AVI ') return true;
  return false;
}

module.exports = {
  VideoTextError,
  scanVideo,
  renderVideo,
  trackDetections,
  probe,
  sampleBackground,
  looksLikeVideo,
  ocrFrame,
  closeOcr,
  frameHash,
  grabFrame,
  // límites y utilidades para el catálogo / la web / las pruebas
  LIMITS: { MAX_BYTES, MAX_DURATION, MAX_FRAMES, MAX_LINES, FRAME_WIDTH, MIN_CONFIDENCE },
  FONTS,
  cleanHex
};
