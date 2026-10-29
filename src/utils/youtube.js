// src/utils/youtube.js — Búsqueda y extracción de YouTube con youtubei.js.
//
// ¿Por qué este módulo? Porque los respaldos viejos (InnerTube a mano, Invidious,
// Piped) se fueron cayendo: hoy casi todas las instancias públicas tienen la API
// apagada (`api:false`). youtubei.js habla InnerTube con el player de YouTube
// actualizado, así que resuelve las firmas (`signatureCipher`) y el `n`-token
// sin que tengamos que reimplementarlos.
//
// Lo importante para el DOWNLOADER: casi siempre YouTube sólo publica los
// formatos buenos como DASH (video sin audio). Acá:
//   1. se busca un formato **progresivo** (video + audio en el mismo archivo),
//   2. si no hay, se bajan video y audio por separado y se **pegan con ffmpeg**.
// En los dos casos el resultado se reproduce con imagen y sonido.
//
// Si youtubei.js no está instalado (o falla), todas las funciones lanzan y quien
// llama sigue con los respaldos de providers.js.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFile } = require('child_process');
const { UA_DESKTOP, fetchWithTimeout } = require('./http');
const { selectVideoQuality } = require('./videoQuality');

// ---------------------------------------------------------------------------
// Cliente (se crea una sola vez por proceso)
// ---------------------------------------------------------------------------
let cliente = null;
let clienteError = null;
let clienteErrorAt = 0;

async function clienteYt() {
  if (cliente) return cliente;
  // Un fallo de red no debe envenenar el proceso para siempre: se reintenta a los 5 min.
  if (clienteError && Date.now() - clienteErrorAt < 300000) throw clienteError;
  try {
    const { Innertube } = require('youtubei.js');
    cliente = await Innertube.create({
      lang: 'es',
      location: 'US',
      retrieve_player: true,
      generate_session_locally: true
    });
    return cliente;
  } catch (e) {
    clienteError = new Error(`youtubei.js no está disponible (${e.message})`);
    clienteErrorAt = Date.now();
    throw clienteError;
  }
}

/**
 * Olvida el cliente y el último error. Se usa en los tests (y sirve para
 * reintentar enseguida después de un fallo de red).
 */
function reiniciar() {
  cliente = null;
  clienteError = null;
  clienteErrorAt = 0;
  cachePlay.clear();
}

/** true si el paquete está instalado (no prueba la red). */
function disponible() {
  try { require.resolve('youtubei.js'); return true; } catch (_) { return false; }
}

const segundos = s => (s ? `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}` : null);
const texto = v => (v == null ? null : String(v.toString ? v.toString() : v));

// ---------------------------------------------------------------------------
// Búsqueda
// ---------------------------------------------------------------------------
function mapVideo(v) {
  const id = v.video_id || v.id;
  const thumbs = v.thumbnails || [];
  return {
    id,
    title: texto(v.title) || '',
    url: `https://www.youtube.com/watch?v=${id}`,
    thumbnail: thumbs.length ? (thumbs[thumbs.length - 1].url || thumbs[0].url) : `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
    duration: v.duration?.text || segundos(v.duration?.seconds),
    author: v.author?.name || '',
    views: texto(v.view_count) || null,
    published: texto(v.published) || null
  };
}

async function buscar(query, limit = 10) {
  const y = await clienteYt();
  const res = await y.search(query, { type: 'video' });
  const videos = res.videos || res.results || [];
  const items = videos.slice(0, limit).map(mapVideo).filter(v => v.id);
  if (!items.length) throw new Error('YouTube no devolvió resultados');
  return items;
}

// ---------------------------------------------------------------------------
// Formatos
// ---------------------------------------------------------------------------
const esMp4 = f => /mp4/i.test(String(f.mime_type || ''));

/** Mejor formato progresivo (video + audio) que no pase de `quality`. */
function mejorProgresivo(lista, quality = 0) {
  if (!lista.length) return null;
  const mp4 = lista.filter(esMp4);
  const pool = mp4.length ? mp4 : lista;
  return selectVideoQuality(pool, quality);
}

/** Video DASH: se prefiere mp4/avc para que el mp4 final abra en cualquier player. */
function mejorVideoDash(lista, quality = 0) {
  if (!lista.length) return null;
  const mp4 = lista.filter(esMp4);
  return selectVideoQuality(mp4.length ? mp4 : lista, quality);
}

/** Audio DASH: mp4a (AAC) primero, después lo que haya. */
function mejorAudioDash(lista) {
  if (!lista.length) return null;
  const aac = lista.filter(f => /mp4a/i.test(String(f.mime_type || '')));
  const pool = aac.length ? aac : lista;
  return pool.slice().sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0))[0] || null;
}

/**
 * Pide la info de un video y devuelve los grupos de formatos ya separados.
 * @param {string} id
 */
// Clientes InnerTube que se prueban en orden. YouTube bloquea ("Sign in to
// confirm you're not a bot") según el cliente y la IP del servidor; si el
// primero falla, se reintenta con otro antes de darse por vencido.
const CLIENTES = [null, 'TV', 'IOS', 'ANDROID', 'WEB_EMBEDDED'];

async function info(id) {
  const y = await clienteYt();
  let data = null;
  let ultimo = null;
  for (const client of CLIENTES) {
    try {
      const intento = client ? await y.getInfo(id, { client }) : await y.getInfo(id);
      const estado = intento.playability_status?.status;
      if (estado && estado !== 'OK') {
        const motivo = intento.playability_status?.reason || estado;
        ultimo = new Error(`YouTube no permite reproducir este video (${motivo})`);
        continue;
      }
      if (!intento.streaming_data) {
        ultimo = new Error('YouTube no devolvió formatos para este video');
        continue;
      }
      data = intento;
      break;
    } catch (e) {
      ultimo = e;
    }
  }
  if (!data) throw ultimo || new Error('YouTube no devolvió formatos para este video');
  const sd = data.streaming_data;
  return {
    y,
    data,
    meta: {
      id,
      title: texto(data.basic_info?.title) || '',
      author: texto(data.basic_info?.author) || '',
      duration: data.basic_info?.duration || null,
      thumbnail: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`
    },
    progressive: (sd.formats || []).filter(f => f.has_video && f.has_audio),
    videoOnly: (sd.adaptive_formats || []).filter(f => f.has_video && !f.has_audio),
    audioOnly: (sd.adaptive_formats || []).filter(f => !f.has_video && f.has_audio)
  };
}

const plain = f => ({
  itag: f.itag,
  quality: f.quality_label || f.quality || null,
  height: f.height || (f.quality_label ? parseInt(f.quality_label, 10) || null : null),
  mime: f.mime_type || null,
  hasVideo: !!f.has_video,
  hasAudio: !!f.has_audio,
  bitrate: f.bitrate || f.average_bitrate || null
});

/** Formatos para el JSON: los progresivos y el audio llevan URL reproducible. */
async function formatos(id) {
  const { y, meta, progressive, videoOnly, audioOnly } = await info(id);
  const player = y.session?.player;
  const out = [];
  for (const f of progressive.slice(0, 4)) {
    out.push({ ...plain(f), url: await f.decipher(player) });
  }
  for (const f of videoOnly.slice(0, 8)) out.push({ ...plain(f), url: null });
  for (const f of audioOnly.slice(0, 4)) {
    out.push({ ...plain(f), url: await f.decipher(player) });
  }
  return { meta, formats: out };
}

// ---------------------------------------------------------------------------
// Pegado video + audio (sólo cuando YouTube no da ningún formato progresivo)
// ---------------------------------------------------------------------------
function ffmpegPath() {
  try { return require('@ffmpeg-installer/ffmpeg').path; } catch (_) { return 'ffmpeg'; }
}

// googlevideo rechaza peticiones sin User-Agent de navegador; `-headers` es la
// forma portable de mandarlo (el build de ffmpeg no trae -user_agent).
const entradaFfmpeg = url => (/^https?:/i.test(String(url))
  ? ['-headers', `User-Agent: ${UA_DESKTOP}\r\n`]
  : []);

const MUX_DIR = path.join(os.tmpdir(), 'velirius-yt');
const MUX_TTL = 15 * 60 * 1000;

function limpiarTemporales() {
  try {
    if (!fs.existsSync(MUX_DIR)) return;
    const ahora = Date.now();
    for (const f of fs.readdirSync(MUX_DIR)) {
      const p = path.join(MUX_DIR, f);
      try {
        if (ahora - fs.statSync(p).mtimeMs > MUX_TTL) fs.unlinkSync(p);
      } catch (_) { /* archivo en uso */ }
    }
  } catch (_) { /* sin permiso: no pasa nada */ }
}

/** Une pista de video + pista de audio en un solo MP4 (sin recodificar). */
function pegar(videoUrl, audioUrl, id) {
  fs.mkdirSync(MUX_DIR, { recursive: true });
  limpiarTemporales();
  const seguro = String(id || 'video').replace(/[^\w-]/g, '') || 'video';
  const salida = path.join(MUX_DIR, `${seguro}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.mp4`);
  return new Promise((resolve, reject) => {
    execFile(ffmpegPath(), [
      '-y', '-hide_banner', '-loglevel', 'error',
      ...entradaFfmpeg(videoUrl), '-i', videoUrl,
      ...entradaFfmpeg(audioUrl), '-i', audioUrl,
      '-map', '0:v:0', '-map', '1:a:0',
      '-c', 'copy', '-movflags', '+faststart',
      salida
    ], { timeout: 150000, maxBuffer: 1024 * 1024 }, err => {
      if (err) {
        try { fs.unlinkSync(salida); } catch (_) { /* nada */ }
        return reject(new Error(`No se pudo pegar el audio con el video (ffmpeg): ${String(err.message).slice(-180)}`));
      }
      resolve(salida);
    });
  });
}

/**
 * ¿La URL de googlevideo responde? YouTube caduca los enlaces y a veces devuelve
 * 403: pedimos los primeros 2 bytes antes de mandarle el archivo al usuario.
 */
async function urlViva(url) {
  if (!url || !/^https?:/i.test(url)) return Boolean(url);
  try {
    const r = await fetchWithTimeout(url, {
      headers: { 'User-Agent': UA_DESKTOP, Range: 'bytes=0-1' }
    }, 8000);
    const ok = r.ok || r.status === 206;
    await r.body?.cancel?.();
    return ok;
  } catch (_) {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Audio en MP3 (para /downloader/play y /downloader/mp3)
// ---------------------------------------------------------------------------
const AUDIO_DIR = path.join(os.tmpdir(), 'velirius-audio');
const AUDIO_TTL = 60 * 60 * 1000;

function limpiarAudio() {
  try {
    if (!fs.existsSync(AUDIO_DIR)) return;
    const ahora = Date.now();
    for (const f of fs.readdirSync(AUDIO_DIR)) {
      const p = path.join(AUDIO_DIR, f);
      try {
        if (ahora - fs.statSync(p).mtimeMs > AUDIO_TTL) fs.unlinkSync(p);
      } catch (_) { /* archivo en uso */ }
    }
  } catch (_) { /* sin permiso */ }
}

/**
 * Baja el audio de un video y lo convierte a MP3 de verdad.
 * Así el navegador lo reproduce siempre (y el archivo se puede descargar como
 * .mp3), sin depender de que el enlace temporal de googlevideo siga vivo.
 * El MP3 queda en `os.tmpdir()/velirius-audio` y se reutiliza una hora.
 */
async function audioArchivo(id, { bitrate = '160k' } = {}) {
  fs.mkdirSync(AUDIO_DIR, { recursive: true });
  limpiarAudio();
  const seguro = String(id || 'audio').replace(/[^\w-]/g, '');
  const salida = path.join(AUDIO_DIR, `${seguro}.mp3`);
  try {
    const st = fs.statSync(salida);
    if (st.size > 2000 && Date.now() - st.mtimeMs < AUDIO_TTL) return salida;
  } catch (_) { /* no está todavía */ }

  const audio = await audioReproducible(id);
  const parcial = `${salida}.${process.pid}-${Math.random().toString(36).slice(2, 8)}.part`;
  await new Promise((resolve, reject) => {
    execFile(ffmpegPath(), [
      '-y', '-hide_banner', '-loglevel', 'error',
      ...entradaFfmpeg(audio.url), '-i', audio.url,
      '-vn', '-c:a', 'libmp3lame', '-b:a', bitrate, '-f', 'mp3',
      parcial
    ], { timeout: 150000, maxBuffer: 1024 * 1024 }, err => {
      if (err) {
        try { fs.unlinkSync(parcial); } catch (_) { /* nada */ }
        return reject(new Error(`No se pudo convertir el audio a MP3: ${String(err.message).slice(-160)}`));
      }
      try { fs.renameSync(parcial, salida); } catch (e) { return reject(e); }
      resolve();
    });
  });
  return salida;
}

// ---------------------------------------------------------------------------
// Resultado reproducible
// ---------------------------------------------------------------------------
const cachePlay = new Map(); // `${id}:${quality}` -> { at, value }
const PLAY_TTL = 20 * 60 * 1000;

/**
 * Devuelve algo que se puede reproducir CON audio y video.
 * @param {string} id
 * @param {number|'auto'} quality alto máximo preferido (0/'auto' = el mejor)
 * @returns {Promise<{url?:string, file?:string, hasAudio:boolean, height?:number, quality?:string, muxed:boolean}>}
 */
async function videoReproducible(id, quality = 0) {
  try {
    return await unIntentoDeVideo(id, quality);
  } catch (e) {
    // El cliente puede quedar con datos viejos: se renueva y se prueba otra vez.
    reiniciar();
    return unIntentoDeVideo(id, quality);
  }
}

async function unIntentoDeVideo(id, quality = 0) {
  const key = `${id}:${quality || 'auto'}`;
  const hit = cachePlay.get(key);
  if (hit && Date.now() - hit.at < PLAY_TTL && (!hit.value.file || fs.existsSync(hit.value.file))) return hit.value;

  const { y, progressive, videoOnly, audioOnly } = await info(id);
  const player = y.session?.player;
  let salida;

  // Se buscan progresivos vivos, pero no se elige uno de 360p si también se
  // puede formar un 1080p con audio y el usuario pidió 1080p o automático.
  const candidatos = progressive.slice();
  const ordenados = [];
  while (candidatos.length) {
    const next = selectVideoQuality(candidatos, quality);
    ordenados.push(next);
    candidatos.splice(candidatos.indexOf(next), 1);
  }
  let prog = null;
  let progUrl = null;
  for (const f of ordenados) {
    try {
      const url = await f.decipher(player);
      if (await urlViva(url)) { prog = f; progUrl = url; break; }
    } catch (_) { /* probar el siguiente formato */ }
  }

  const v = mejorVideoDash(videoOnly, quality);
  const a = mejorAudioDash(audioOnly) || prog;
  const best = selectVideoQuality([prog, v && a ? v : null].filter(Boolean), quality);
  if (best === v && v && a) {
    try {
      const file = await pegar(await v.decipher(player), await a.decipher(player), id);
      salida = {
        file, height: v.height || null, quality: v.quality_label || null,
        mime: 'video/mp4', hasAudio: true, muxed: true
      };
    } catch (e) {
      // Si el mux falla y existe un progresivo, sigue siendo reproducible.
      if (!prog) throw e;
    }
  }
  if (!salida && prog) {
    salida = {
      url: progUrl, height: prog.height || null, quality: prog.quality_label || null,
      mime: String(prog.mime_type || 'video/mp4').split(';')[0], hasAudio: true, muxed: false
    };
  }
  if (!salida) throw new Error(v ? 'YouTube no ofrece audio para este video' : 'YouTube no ofrece video para este video');

  cachePlay.set(key, { at: Date.now(), value: salida });
  return salida;
}

/** URL del mejor audio suelto (para /mp3 y /play). */
async function audioReproducible(id) {
  try {
    return await unIntentoDeAudio(id);
  } catch (e) {
    reiniciar();
    return unIntentoDeAudio(id);
  }
}

async function unIntentoDeAudio(id) {
  const { y, audioOnly, progressive } = await info(id);
  const player = y.session?.player;
  const orden = audioOnly.slice().sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0));
  for (const f of orden) {
    const url = await f.decipher(player);
    if (await urlViva(url)) {
      return {
        url,
        mime: f.mime_type || 'audio/mp4',
        bitrate: f.bitrate || null,
        quality: f.quality_label || null
      };
    }
  }
  const prog = mejorProgresivo(progressive, 0);
  if (!prog) throw new Error('YouTube no ofrece audio para este video');
  const url = await prog.decipher(player);
  if (!(await urlViva(url))) throw new Error('El enlace de audio de YouTube caducó');
  return {
    url,
    mime: 'video/mp4',
    bitrate: prog.bitrate || null,
    quality: prog.quality_label || null
  };
}

module.exports = {
  disponible,
  reiniciar,
  urlViva,
  audioArchivo,
  AUDIO_DIR,
  buscar,
  info,
  formatos,
  videoReproducible,
  audioReproducible,
  mejorProgresivo,
  mejorVideoDash,
  mejorAudioDash,
  pegar,
  limpiarTemporales,
  MUX_DIR
};
