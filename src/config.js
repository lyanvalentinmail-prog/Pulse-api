// src/config.js — Configuración central de Pulse API
const fs = require('fs');
const path = require('path');

// Claves privadas: NUNCA se suben al repo (están en .gitignore).
// Se leen de variables de entorno o, en local, de `secrets.local.json`.
//   { "GEMINI_API_KEY": "…", "COBALT_API_URL": "https://…" }
function localSecrets() {
  try {
    const file = path.join(__dirname, '..', 'secrets.local.json');
    if (!fs.existsSync(file)) return {};
    const json = JSON.parse(fs.readFileSync(file, 'utf-8'));
    return json && typeof json === 'object' ? json : {};
  } catch (_) {
    return {};
  }
}
const secrets = localSecrets();
const secret = name => String(process.env[name] || secrets[name] || '').trim();

module.exports = {
  name: 'Pulse API',
  brand: 'PULSE',
  creator: 'Pulse',
  storeFooter: 'PULSE STORE',
  version: '1.1.0',
  githubUrl: 'https://github.com/lyanvalentinmail-prog',
  repoUrl: 'https://github.com/lyanvalentinmail-prog/Pulse-api',
  mainWebsite: '/',
  supportUrl: 'https://github.com/lyanvalentinmail-prog/Pulse-api',
  port: process.env.PORT || 3000,
  // Imagen de ejemplo pública usada en las pruebas de Canvas (avatar por defecto del repo)
  defaultAvatarPath: '/img/default-avatar.jpg',
  // Portada (/welcome): video del hero.
  //   · por defecto sirve public/media/welcome.mp4
  //   · con WELCOME_VIDEO_URL=https://…/video.mp4 se usa ese archivo remoto
  //   · el póster (primer frame mientras carga) sale de public/img/welcome-poster.jpg
  //     si existe; si no hay póster se ve el fondo negro del marco.
  welcomeVideo: process.env.WELCOME_VIDEO_URL || '/media/welcome.mp4',
  welcomePoster: process.env.WELCOME_POSTER_URL || '',
  // ---------- Servicios con clave (nunca dentro del repo) ----------
  // IA → /ia/gemini. Sin clave el endpoint responde 503 con la pista de cómo cargarla.
  geminiKey: secret('GEMINI_API_KEY'),
  geminiModel: process.env.GEMINI_MODEL || 'gemini-2.0-flash',
  // Descargas de YouTube → instancia de cobalt (https://github.com/imputnet/cobalt).
  // Si está vacío se intentan las instancias públicas.
  cobaltUrl: secret('COBALT_API_URL'),
};
