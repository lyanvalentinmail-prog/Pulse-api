// src/utils/http.js — Cliente HTTP con timeout para APIs públicas sin token
const UA_DESKTOP =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
const UA_MOBILE =
  'Mozilla/5.0 (Linux; Android 13; SM-G981B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36';

async function fetchWithTimeout(url, options = {}, timeoutMs = 15000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(new Error('Tiempo de espera agotado')), timeoutMs);
  const signal = options.signal ? AbortSignal.any([options.signal, ctrl.signal]) : ctrl.signal;
  try {
    const { publicOnly, ...fetchOptions } = options;
    const doFetch = publicOnly ? require('./publicFetch').fetchPublic : fetch;
    return await doFetch(url, { ...fetchOptions, signal, redirect: options.redirect || 'follow' });
  } finally {
    clearTimeout(timer);
  }
}

// Deadline compartido por la conexión y todo el cuerpo, no sólo las cabeceras.
async function withDeadline(timeoutMs, fn) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(new Error('Tiempo de espera agotado')), timeoutMs);
  try { return await fn(ctrl.signal); } finally { clearTimeout(timer); }
}

async function readLimited(res, maxBytes, signal) {
  const length = Number(res.headers.get('content-length'));
  if (Number.isFinite(length) && length > maxBytes) {
    res.body?.cancel().catch(() => {});
    throw new Error(`El archivo remoto supera el tamaño máximo (${maxBytes} bytes)`);
  }
  if (!res.body) return Buffer.alloc(0);
  const reader = res.body.getReader();
  const chunks = [];
  let size = 0;
  let done = false;
  try {
    while (!done) {
      let onAbort;
      const aborted = new Promise((_, reject) => {
        onAbort = () => reject(signal.reason || new Error('Tiempo de espera agotado'));
        if (signal.aborted) onAbort();
        else signal.addEventListener('abort', onAbort, { once: true });
      });
      let part;
      try { part = await Promise.race([reader.read(), aborted]); }
      finally { signal.removeEventListener('abort', onAbort); }
      done = part.done;
      if (done) break;
      size += part.value.byteLength;
      if (size > maxBytes) throw new Error(`El archivo remoto supera el tamaño máximo (${maxBytes} bytes)`);
      chunks.push(Buffer.from(part.value));
    }
    return Buffer.concat(chunks, size);
  } finally {
    if (!done) reader.cancel().catch(() => {});
  }
}

async function fetchJson(url, { headers = {}, timeoutMs = 15000, method = 'GET', body, redirect = 'follow' } = {}) {
  return withDeadline(timeoutMs, async signal => {
    const res = await fetchWithTimeout(url, {
      method, headers: { 'User-Agent': UA_DESKTOP, Accept: 'application/json, text/plain, */*', ...headers },
      body, signal, redirect
    }, timeoutMs);
    const text = (await readLimited(res, 16 * 1024 * 1024, signal)).toString('utf8');
    let json = null;
    try { json = JSON.parse(text); } catch (_) { /* no-json */ }
    if (!res.ok) {
      const err = new Error(`HTTP ${res.status} en ${new URL(url).hostname}`);
      err.status = res.status; err.body = text.slice(0, 400); err.json = json;
      throw err;
    }
    if (json === null) throw new Error(`Respuesta no-JSON de ${new URL(url).hostname}`);
    return json;
  });
}

async function postJson(url, data, { headers = {}, timeoutMs = 15000, redirect = 'follow' } = {}) {
  return fetchJson(url, {
    method: 'POST', timeoutMs, redirect,
    headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(data)
  });
}

async function fetchText(url, { headers = {}, timeoutMs = 15000, publicOnly = false } = {}) {
  return withDeadline(timeoutMs, async signal => {
    const res = await fetchWithTimeout(url, { headers: { 'User-Agent': UA_DESKTOP, ...headers }, signal, publicOnly }, timeoutMs);
    if (!res.ok) { res.body?.cancel().catch(() => {}); const e = new Error(`HTTP ${res.status} en ${new URL(url).hostname}`); e.status = res.status; throw e; }
    return (await readLimited(res, 16 * 1024 * 1024, signal)).toString('utf8');
  });
}

async function fetchBuffer(url, { headers = {}, timeoutMs = 20000, maxBytes = 25 * 1024 * 1024, publicOnly = false } = {}) {
  return withDeadline(timeoutMs, async signal => {
    const res = await fetchWithTimeout(url, { headers: { 'User-Agent': UA_DESKTOP, ...headers }, signal, publicOnly }, timeoutMs);
    if (!res.ok) { res.body?.cancel().catch(() => {}); const e = new Error(`HTTP ${res.status} al descargar ${new URL(url).hostname}`); e.status = res.status; throw e; }
    return readLimited(res, maxBytes, signal);
  });
}

/** Ejecuta productores en orden hasta que uno responda; acumula errores. */
async function firstSuccess(producers) {
  const errors = [];
  for (const [label, fn] of producers) {
    try {
      const value = await fn();
      if (value !== null && value !== undefined) return { value, source: label, errors };
      errors.push(`${label}: sin datos`);
    } catch (e) {
      errors.push(`${label}: ${e.message}`);
    }
  }
  const err = new Error('Ninguna fuente pública respondió. Intenta de nuevo en unos segundos.');
  err.details = errors;
  throw err;
}

/**
 * Igual que `firstSuccess` pero **en paralelo**: dispara todos los productores a
 * la vez y devuelve el primero que responda. Sirve para no comerse el límite de
 * tiempo de Vercel (10 s) cuando la primera fuente está caída o lenta: antes se
 * probaban una por una y una fuente muerta (12-15 s) tumbaba la petición entera.
 *
 * `timeoutMs` es el presupuesto TOTAL: si nadie contestó en ese tiempo, corta.
 */
function firstFast(producers, { timeoutMs = 7000 } = {}) {
  const lista = (producers || []).filter(p => p && typeof p[1] === 'function');
  const errors = [];
  const fallo = (extra) => {
    const err = new Error('Ninguna fuente pública respondió a tiempo. Intenta de nuevo en unos segundos.');
    err.details = extra ? errors.concat(extra) : errors.slice();
    return err;
  };
  if (!lista.length) return Promise.reject(fallo('sin proveedores'));
  return new Promise((resolve, reject) => {
    let resuelto = false;
    let pendientes = lista.length;
    const timer = setTimeout(() => {
      if (resuelto) return;
      resuelto = true;
      reject(fallo(`tiempo agotado (${timeoutMs} ms)`));
    }, timeoutMs);
    const terminar = (fn, arg) => {
      if (resuelto) return;
      resuelto = true;
      clearTimeout(timer);
      fn(arg);
    };
    const restar = () => {
      pendientes -= 1;
      if (pendientes <= 0 && !resuelto) terminar(reject, fallo());
    };
    for (const [label, fn] of lista) {
      Promise.resolve()
        .then(fn)
        .then(valor => {
          if (valor === null || valor === undefined) {
            errors.push(`${label}: sin datos`);
            return restar();
          }
          terminar(resolve, { value: valor, source: label, errors });
        })
        .catch(e => {
          errors.push(`${label}: ${(e && e.message) || e}`);
          restar();
        });
    }
  });
}

function safeHost(raw) {
  const host = String(raw || '').split(',')[0].trim();
  if (!host || /[\s<>"'\\/@?#]/.test(host)) return null;
  try {
    const url = new URL(`http://${host}`);
    return url.username || url.password || url.pathname !== '/' || url.search || url.hash ? null : url.host;
  } catch (_) { return null; }
}
function absoluteUrl(req, path) {
  const supplied = String(req.headers['x-forwarded-proto'] || req.protocol || 'http').split(',')[0].trim().toLowerCase();
  const proto = supplied === 'https' ? 'https' : 'http';
  const host = safeHost(req.headers['x-forwarded-host']) || safeHost(req.get('host')) || 'localhost';
  return `${proto}://${host}${path}`;
}

module.exports = { UA_DESKTOP, UA_MOBILE, fetchWithTimeout, fetchJson, postJson, fetchText, fetchBuffer, firstSuccess, firstFast, absoluteUrl };
