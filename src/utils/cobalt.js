// src/utils/cobalt.js — Respaldo universal de descargas con **cobalt**.
//
// ¿Por qué? YouTube (y cada vez más Instagram/Facebook) bloquean por IP a los
// servidores de las APIs públicas. cobalt es el descargador open source de
// referencia: habla InnerTube/hls, resuelve firmas y devuelve un enlace directo
// (o un túnel) al archivo. Su instancia pública bloquea YouTube desde 2025,
// pero **una instancia propia sí funciona** (Railway/Docker, 3 minutos).
//
// Configuración (opcional, sin dependencias):
//   COBALT_API_URL   → una instancia (ej. https://cobalt-mi-api.up.railway.app)
//   COBALT_API_URLS  → varias separadas por coma (se prueban en orden)
//   COBALT_API_KEY   → clave si tu instancia la pide (se manda como Api-Key)
//
// Si no hay ninguna configurada se prueban instancias comunitarias de
// https://instances.cobalt.best (las que hoy sí permiten la API JSON). Si todas
// fallan, el llamador sigue con sus respaldos: esto nunca rompe un endpoint.
const { postJson, UA_DESKTOP } = require('./http');

// Instancias comunitarias conocidas (se prueban en orden, la primera que
// responda gana). Se pueden pisar con las variables de entorno de arriba.
const COMUNITARIAS = [
  'https://cobalt-api.meowing.de',
  'https://cobalt-backend.canine.tools',
  'https://capi.3kh0.net'
];

const limpiar = u => String(u || '').trim().replace(/\/+$/, '');
const clave = () => String(process.env.COBALT_API_KEY || '').trim();

/** Lista de instancias a probar: primero las configuradas, después las públicas. */
function instanciasPropias() {
  return [...new Set([process.env.COBALT_API_URL, ...String(process.env.COBALT_API_URLS || '').split(',')]
    .map(limpiar).filter(Boolean))];
}

function instancias() {
  return [...new Set([...instanciasPropias(), ...COMUNITARIAS])];
}

const HAY_CONFIG = () => Boolean(limpiar(process.env.COBALT_API_URL) || limpiar(process.env.COBALT_API_URLS));

/**
 * Pide una descarga a cobalt.
 * @param {string} url  enlace del video/post
 * @param {object} opts { downloadMode: 'auto'|'audio'|'mute', videoQuality, audioFormat, audioBitrate, filenameStyle }
 * @returns {Promise<{url:string, filename:string|null, instance:string, status:string}>}
 */
async function pedir(url, opts = {}) {
  if (!disponible()) throw new Error('cobalt está desactivado');
  if (!/^https?:\/\//i.test(String(url || ''))) throw new Error('cobalt necesita una URL http(s)');
  const cuerpo = {
    url: String(url),
    downloadMode: opts.downloadMode || 'auto',
    videoQuality: opts.videoQuality ? String(opts.videoQuality) : '1080',
    audioFormat: opts.audioFormat || 'mp3',
    audioBitrate: opts.audioBitrate ? String(opts.audioBitrate) : '128',
    filenameStyle: opts.filenameStyle || 'basic',
    disableMetadata: false,
    youtubeVideoCodec: 'h264',
    youtubeBetterAudio: true
  };
  const headers = { 'User-Agent': UA_DESKTOP, Accept: 'application/json' };
  const propias = new Set(instanciasPropias());
  const errores = [];
  for (const base of instancias()) {
    // La clave sólo se envía a instancias explícitamente configuradas.
    const k = clave();
    const instanceHeaders = { ...headers, ...(k && propias.has(base) ? { 'Api-Key': k } : {}) };
    for (const ruta of ['', '/api/json']) {
      try {
        const j = await postJson(`${base}${ruta}`, cuerpo, { headers: instanceHeaders, timeoutMs: 25000, redirect: 'error' });
        const r = normalizar(j, base);
        if (r) return r;
        errores.push(`${new URL(base).hostname}: respuesta sin archivo`);
        break;
      } catch (e) {
        // 404 en la raíz → probar /api/json (instancias v7)
        if (e.status === 404 && ruta === '') continue;
        errores.push(`${new URL(base).hostname}: ${e.message}`);
        break;
      }
    }
  }
  const err = new Error('cobalt no pudo resolver la descarga');
  err.details = errores.slice(0, 4);
  throw err;
}

/** Normaliza la respuesta de cobalt (v10 y v7) a un objeto simple. */
function normalizar(j, base) {
  if (!j || typeof j !== 'object') return null;
  const estado = String(j.status || '').toLowerCase();
  if (estado === 'error') {
    const code = j.error && (j.error.code || j.error.message);
    const e = new Error(`cobalt: ${code || 'error'}`);
    e.cobalt = true;
    throw e;
  }
  // v10: tunnel / redirect · v7: stream / redirect / picker
  let url = j.url || null;
  if (!url && Array.isArray(j.picker) && j.picker[0]) url = j.picker[0].url || null;
  if (!url || !/^https?:\/\//i.test(url)) return null;
  return {
    url,
    filename: j.filename || null,
    status: estado || 'ok',
    instance: limpiar(base),
    audio: j.audio || null
  };
}

/** ¿Hay alguna instancia que valga la pena intentar? (siempre, salvo que se apague) */
function disponible() {
  if (String(process.env.COBALT_DISABLE || '').toLowerCase() === 'true') return false;
  return instancias().length > 0;
}

module.exports = { pedir, disponible, instancias, normalizar, HAY_CONFIG };
