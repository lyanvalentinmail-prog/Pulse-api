// src/utils/videoStore.js — Guarda los videos que se suben al editor
// (`/canvas/videoeditor`) mientras se analizan y se procesan.
//
// ▸ Van a archivos temporales (no a memoria): un video de 40 MB no debe quedar
//   en el heap del proceso.
// ▸ Cada entrada vive 45 min y sólo se guardan las 4 más nuevas; el editor es
//   para probar y editar, no para hostear videos.
// ▸ En serverless cada instancia tiene su propio almacén (ver README): la web
//   reenvía el archivo si el id ya no existe.
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');

const DIR = path.join(os.tmpdir(), 'pulse-videos');
const TTL_MS = 45 * 60 * 1000;
const MAX_ITEMS = 4;
const store = new Map(); // id → { file, mime, size, name, at, meta }
let timer = null;

function ensureDir() {
  fs.mkdirSync(DIR, { recursive: true });
}

function removeItem(id, item) {
  store.delete(id);
  if (item && item.file) fs.rm(item.file, { force: true }, () => {});
}

function cleanup(now = Date.now()) {
  for (const [id, item] of store) {
    if (now - item.at >= TTL_MS) removeItem(id, item);
  }
  while (store.size > MAX_ITEMS) removeItem(store.keys().next().value, store.values().next().value);
}

function schedule() {
  if (timer || !store.size) return;
  const oldest = store.values().next().value;
  timer = setTimeout(() => {
    timer = null;
    cleanup();
    schedule();
  }, Math.max(1, oldest.at + TTL_MS - Date.now()));
  timer.unref?.();
}

/** Guarda el buffer del video y devuelve `{ id, file, size, mime, name }`. */
function save(buffer, { mime = 'video/mp4', name = 'video.mp4' } = {}) {
  cleanup();
  ensureDir();
  const id = crypto.randomBytes(9).toString('hex');
  const ext = /webm/.test(mime) ? 'webm' : /quicktime|mov/.test(mime) ? 'mov' : /matroska/.test(mime) ? 'mkv' : 'mp4';
  const file = path.join(DIR, `${id}.${ext}`);
  fs.writeFileSync(file, buffer);
  store.set(id, { file, mime, size: buffer.length, name, at: Date.now(), meta: null });
  cleanup();
  schedule();
  return { id, file, size: buffer.length, mime, name };
}

function get(id) {
  const item = store.get(String(id || ''));
  if (!item) return null;
  if (!fs.existsSync(item.file) || Date.now() - item.at >= TTL_MS) {
    removeItem(String(id), item);
    return null;
  }
  item.at = Date.now(); // se toca al usarse: vive mientras se edita
  return { id: String(id), ...item };
}

/** Guarda los datos que devolvió el análisis (duración, medidas, fps…). */
function setMeta(id, meta) {
  const item = store.get(String(id || ''));
  if (item) item.meta = meta;
}

module.exports = { save, get, setMeta, cleanup, count: () => store.size, TTL_MS, MAX_ITEMS, DIR };
