// src/utils/audio.js — Texto a voz (TTS) y voz a texto (STT).
//
// **TTS** no necesita claves: usa el endpoint público de "escuchar" de Google
// Translate (el mismo que usa gTTS) y, si ese no contesta, StreamElements. El
// texto largo se parte en pedazos de ~190 caracteres (es el límite del servicio)
// y los MP3 se pegan en un solo archivo. Opcionalmente se puede usar Google
// Cloud TTS con `GOOGLE_TTS_KEY`.
//
// **STT** sí necesita un proveedor: no existe hoy un servicio público anónimo y
// estable que transcriba audio. Se usan las claves que estén configuradas:
// `GROQ_API_KEY` (Whisper, con capa gratis), `OPENAI_API_KEY`,
// `DEEPGRAM_API_KEY` o `ASSEMBLYAI_API_KEY`. Sin ninguna, el endpoint responde
// con la explicación exacta de qué configurar.
const crypto = require('crypto');
const { fetchBuffer, fetchJson, postJson, UA_DESKTOP, UA_MOBILE } = require('./http');

// ---------------------------------------------------------------------------
// TTS
// ---------------------------------------------------------------------------

/** Parte el texto en trozos que el servicio acepte (corta por frase, luego por palabra). */
function partirTexto(texto, max = 190) {
  const limpio = String(texto ?? '').replace(/\s+/g, ' ').trim();
  if (!limpio) return [];
  const partes = [];
  let resto = limpio;
  while (resto.length > max) {
    const ventana = resto.slice(0, max);
    let corte = Math.max(ventana.lastIndexOf('. '), ventana.lastIndexOf('? '), ventana.lastIndexOf('! '), ventana.lastIndexOf('; '));
    if (corte < max * 0.4) corte = ventana.lastIndexOf(', ');
    if (corte < max * 0.4) corte = ventana.lastIndexOf(' ');
    // Si no hay espacios, cortar exactamente en max (no max+1).
    let end = corte > 0 ? corte + 1 : max;
    // Evitar partir un par sustituto UTF-16 (p. ej. un emoji).
    if (end > 1 && end < resto.length && /[\uD800-\uDBFF]/.test(resto[end - 1]) && /[\uDC00-\uDFFF]/.test(resto[end])) end--;
    partes.push(resto.slice(0, end).trim());
    resto = resto.slice(end).trim();
  }
  if (resto) partes.push(resto);
  return partes;
}

const ttsCache = new Map(); // hash → { buffer, mime, engine }

async function chunkGoogle(texto, lang, slow) {
  const url = `https://translate.google.com/translate_tts?ie=UTF-8&client=tw-ob&tl=${encodeURIComponent(lang)}`
    + `&q=${encodeURIComponent(texto)}${slow ? '&ttsspeed=0.6' : ''}`;
  const buf = await fetchBuffer(url, {
    headers: {
      'User-Agent': UA_MOBILE,
      Referer: 'https://translate.google.com/',
      Accept: 'audio/mpeg,audio/*;q=0.9,*/*;q=0.5'
    },
    timeoutMs: 15000,
    maxBytes: 8 * 1024 * 1024
  });
  // Un MP3 empieza con "ID3" o con el frame sync 0xFF 0xEx/0xFx.
  const esMp3 = buf.length > 500 && (buf.slice(0, 3).toString() === 'ID3' || (buf[0] === 0xff && (buf[1] & 0xe0) === 0xe0));
  if (!esMp3) throw new Error('Google no devolvió un MP3');
  return buf;
}

async function chunkStreamElements(texto, voice) {
  const url = `https://api.streamelements.com/kappa/v2/speech?voice=${encodeURIComponent(voice)}&text=${encodeURIComponent(texto)}`;
  const buf = await fetchBuffer(url, { headers: { 'User-Agent': UA_DESKTOP }, timeoutMs: 15000, maxBytes: 8 * 1024 * 1024 });
  if (!(buf.length > 500)) throw new Error('StreamElements no devolvió audio');
  return buf;
}

/** Google Cloud TTS (sólo si hay `GOOGLE_TTS_KEY`). */
async function googleCloud(texto, lang, voice) {
  const key = String(process.env.GOOGLE_TTS_KEY || '').trim();
  const cuerpo = {
    input: { text: texto },
    voice: { languageCode: lang, ...(voice ? { name: voice } : {}) },
    audioConfig: { audioEncoding: 'MP3', speakingRate: 1 }
  };
  const json = await postJson(`https://texttospeech.googleapis.com/v1/text:synthesize?key=${encodeURIComponent(key)}`, cuerpo, { timeoutMs: 15000 });
  if (!json.audioContent) throw new Error('Google Cloud TTS sin audio');
  return Buffer.from(json.audioContent, 'base64');
}

/**
 * Texto → MP3.
 * @param {string} texto
 * @param {{lang?:string, voice?:string, engine?:string, slow?:boolean}} opts
 */
async function textoAVoz(texto, opts = {}) {
  const lang = String(opts.lang || 'es').toLowerCase();
  const engine = String(opts.engine || 'auto').toLowerCase();
  const voice = String(opts.voice || '').trim();
  const chunks = partirTexto(texto, 190);
  if (!chunks.length) {
    const err = new Error('Falta el parámetro text');
    err.status = 400;
    throw err;
  }
  const clave = crypto.createHash('sha1').update(`${lang}|${voice}|${engine}|${opts.slow ? 1 : 0}|${chunks.join(' ')}`).digest('hex');
  if (ttsCache.has(clave)) return ttsCache.get(clave);

  const intentos = [];
  if (process.env.GOOGLE_TTS_KEY && engine !== 'streamelements') intentos.push(['google-cloud', () => googleCloud(chunks.join(' '), lang, voice)]);
  if (engine !== 'streamelements') intentos.push(['google-translate', async () => Buffer.concat(await Promise.all(chunks.map(c => chunkGoogle(c, lang, opts.slow))))]);
  if (engine !== 'google') intentos.push(['streamelements', async () => Buffer.concat(await Promise.all(chunks.map(c => chunkStreamElements(c, voice || 'Brian'))))]);

  const errores = [];
  for (const [nombre, fn] of intentos) {
    try {
      const buffer = await fn();
      const salida = { buffer, mime: 'audio/mpeg', engine: nombre, chunks: chunks.length, lang };
      if (ttsCache.size > 40) ttsCache.delete(ttsCache.keys().next().value);
      ttsCache.set(clave, salida);
      return salida;
    } catch (e) {
      errores.push(`${nombre}: ${e.message}`);
    }
  }
  const err = new Error('No se pudo generar el audio ahora mismo');
  err.status = 502;
  err.hint = errores.slice(0, 3).join(' · ');
  throw err;
}

// ---------------------------------------------------------------------------
// STT
// ---------------------------------------------------------------------------

const extensionDe = mime => {
  const m = String(mime || '').toLowerCase();
  if (m.includes('wav')) return 'wav';
  if (m.includes('ogg') || m.includes('opus')) return 'ogg';
  if (m.includes('webm')) return 'webm';
  if (m.includes('mp4') || m.includes('m4a') || m.includes('aac')) return 'm4a';
  if (m.includes('flac')) return 'flac';
  return 'mp3';
};

/** Qué proveedor está configurado (para el JSON informativo y el error claro). */
function proveedoresSTT() {
  const listos = [];
  if (process.env.GROQ_API_KEY) listos.push('groq');
  if (process.env.OPENAI_API_KEY) listos.push('openai');
  if (process.env.DEEPGRAM_API_KEY) listos.push('deepgram');
  if (process.env.ASSEMBLYAI_API_KEY) listos.push('assemblyai');
  return listos;
}

async function transcriptionJson(url, options, provider) {
  try { return await fetchJson(url, options); }
  catch (e) {
    const detail = e.json?.error?.message || e.message;
    throw new Error(`${provider}: ${detail}`);
  }
}

async function groqWhisper(buffer, mime, lang) {
  const form = new FormData();
  form.append('file', new Blob([buffer], { type: mime || 'audio/mpeg' }), `audio.${extensionDe(mime)}`);
  form.append('model', String(process.env.GROQ_STT_MODEL || 'whisper-large-v3-turbo'));
  form.append('response_format', 'json');
  if (lang) form.append('language', lang);
  const json = await transcriptionJson('https://api.groq.com/openai/v1/audio/transcriptions', {
    method: 'POST', headers: { Authorization: `Bearer ${process.env.GROQ_API_KEY}` }, body: form, timeoutMs: 45000
  }, 'Groq');
  return { text: String(json.text || '').trim(), provider: 'groq' };
}

async function openaiWhisper(buffer, mime, lang) {
  const form = new FormData();
  form.append('file', new Blob([buffer], { type: mime || 'audio/mpeg' }), `audio.${extensionDe(mime)}`);
  form.append('model', String(process.env.OPENAI_STT_MODEL || 'whisper-1'));
  if (lang) form.append('language', lang);
  const json = await transcriptionJson('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST', headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` }, body: form, timeoutMs: 45000
  }, 'OpenAI');
  return { text: String(json.text || '').trim(), provider: 'openai' };
}

async function deepgram(buffer, mime, lang) {
  const params = new URLSearchParams({ model: process.env.DEEPGRAM_MODEL || 'nova-3', smart_format: 'true' });
  if (lang) params.set('language', lang);
  const json = await transcriptionJson(`https://api.deepgram.com/v1/listen?${params}`, {
    method: 'POST', headers: { Authorization: `Token ${process.env.DEEPGRAM_API_KEY}`, 'Content-Type': mime || 'audio/mpeg' },
    body: buffer, timeoutMs: 45000
  }, 'Deepgram');
  const alt = json?.results?.channels?.[0]?.alternatives?.[0];
  return { text: String(alt?.transcript || '').trim(), provider: 'deepgram' };
}

async function assembly(buffer, mime, lang) {
  const headers = { authorization: process.env.ASSEMBLYAI_API_KEY };
  const up = await transcriptionJson('https://api.assemblyai.com/v2/upload', {
    method: 'POST', headers: { ...headers, 'Content-Type': 'application/octet-stream' }, body: buffer, timeoutMs: 45000
  }, 'AssemblyAI upload');
  if (!up.upload_url) throw new Error('AssemblyAI no devolvió URL de audio');
  const job = await transcriptionJson('https://api.assemblyai.com/v2/transcript', {
    method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({ audio_url: up.upload_url, ...(lang ? { language_code: lang } : {}) }), timeoutMs: 20000
  }, 'AssemblyAI transcript');
  if (!job.id) throw new Error('AssemblyAI no devolvió ID de transcripción');
  for (let i = 0; i < 30; i++) {
    await new Promise(r => setTimeout(r, 1000));
    const data = await transcriptionJson(`https://api.assemblyai.com/v2/transcript/${encodeURIComponent(job.id)}`, {
      headers, timeoutMs: 15000
    }, 'AssemblyAI');
    if (data.status === 'completed') return { text: String(data.text || '').trim(), provider: 'assemblyai' };
    if (data.status === 'error') throw new Error(`AssemblyAI: ${data.error || 'error'}`);
  }
  throw new Error('AssemblyAI tardó demasiado');
}

/**
 * Audio → texto.
 * @param {Buffer} buffer
 * @param {{mime?:string, language?:string}} opts
 */
async function vozATexto(buffer, opts = {}) {
  if (!buffer || !buffer.length) {
    const err = new Error('Falta el audio (url=, audio= en el cuerpo, o subí un archivo)');
    err.status = 400;
    throw err;
  }
  const mime = opts.mime || 'audio/mpeg';
  const lang = String(opts.language || '').trim().toLowerCase().slice(0, 5) || undefined;
  const errores = [];

  if (process.env.GROQ_API_KEY) {
    try { return await groqWhisper(buffer, mime, lang); } catch (e) { errores.push(e.message); }
  }
  if (process.env.OPENAI_API_KEY) {
    try { return await openaiWhisper(buffer, mime, lang); } catch (e) { errores.push(e.message); }
  }
  if (process.env.DEEPGRAM_API_KEY) {
    try { return await deepgram(buffer, mime, lang); } catch (e) { errores.push(e.message); }
  }
  if (process.env.ASSEMBLYAI_API_KEY) {
    try { return await assembly(buffer, mime, lang); } catch (e) { errores.push(e.message); }
  }
  if (errores.length) {
    const err = new Error('Los proveedores de transcripción fallaron');
    err.status = 502;
    err.hint = errores.slice(0, 3).join(' · ');
    throw err;
  }
  const err = new Error('SpeechToText necesita una clave de transcripción configurada');
  err.status = 501;
  err.hint = 'Configurá GROQ_API_KEY (capa gratis, la más rápida), OPENAI_API_KEY, DEEPGRAM_API_KEY o ASSEMBLYAI_API_KEY en las variables de entorno';
  throw err;
}

module.exports = { textoAVoz, vozATexto, partirTexto, proveedoresSTT };
