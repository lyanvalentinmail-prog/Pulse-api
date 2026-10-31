// src/config.js — Configuración central de Pulse API
module.exports = {
  name: 'Pulse API',
  brand: 'PULSE',
  creator: 'Pulse',
  storeFooter: 'PULSE STORE',
  version: '1.0.0',
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
};
