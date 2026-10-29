// src/utils/uploadStore.js — Guarda en memoria las imágenes que sube la web
// ("Galería" del probador TEST) y les da una URL corta para poder usarlas como
// cualquier otra: `?url=https://api…/upload/abc123`.
//
// ▸ Es un almacén temporal (TTL 30 min, máximo 60 imágenes): sirve para probar
//   un canvas al instante, no como hosting permanente.
// ▸ El buffer se comparte entre peticiones del mismo proceso; en serverless
//   (Vercel) cada instancia tiene el suyo, por eso la web además manda la imagen
//   en el cuerpo del POST cuando hace falta (ver public/js/category.js).
const crypto = require('crypto');

const MAX_ITEMS = 60;
const TTL_MS = 30 * 60 * 1000;
const store = new Map(); // id → { buffer, mime, at, hits }
let expiryTimer = null;

function cleanup(now = Date.now()) {
  for (const [id, item] of store) {
    if (now - item.at >= TTL_MS) store.delete(id);
  }
  // Si sigue lleno, se van las más viejas.
  while (store.size > MAX_ITEMS) store.delete(store.keys().next().value);
}

// La limpieza también ocurre si no llegan más peticiones al proceso. Hay un
// solo temporizador para todo el almacén, no uno por cada archivo subido.
function scheduleCleanup() {
  if (expiryTimer || !store.size) return;
  const oldest = store.values().next().value;
  const delay = Math.max(1, oldest.at + TTL_MS - Date.now());
  expiryTimer = setTimeout(() => {
    expiryTimer = null;
    cleanup();
    scheduleCleanup();
  }, delay);
  expiryTimer.unref?.();
}

/** Guarda un buffer de imagen y devuelve `{ id, mime }`. */
function save(buffer, mime) {
  cleanup();
  const id = crypto.randomBytes(9).toString('hex');
  store.set(id, { buffer, mime: mime || 'image/jpeg', at: Date.now(), hits: 0 });
  cleanup();
  scheduleCleanup();
  return { id, mime: mime || 'image/jpeg' };
}

/** Devuelve la imagen guardada o `null` si no existe / expiró. */
function get(id) {
  const key = String(id || '');
  const item = store.get(key);
  if (!item) return null;
  if (Date.now() - item.at >= TTL_MS) {
    store.delete(key);
    return null;
  }
  item.hits += 1;
  return item;
}

const count = () => store.size;
const clear = () => {
  store.clear();
  if (expiryTimer) clearTimeout(expiryTimer);
  expiryTimer = null;
};

module.exports = { save, get, count, clear, TTL_MS, MAX_ITEMS };
