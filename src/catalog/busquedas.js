// src/catalog/busquedas.js — Ficha de la categoría **BUSQUEDAS**.
//
// ▸ AGREGAR un buscador: la fuente va en src/utils/search.js, el handler en
//   src/routes/busquedas.js (mapa SOURCES) y la ficha acá.
const { P, O } = require('./helpers');

// Todos comparten los mismos dos parámetros.
const params = (example, desc, hint = 'Cuántos resultados devolver (1 - 30)') => [
  P('q', example, desc),
  O('limit', '10', hint)
];

module.exports = {
  id: 'busquedas',
  name: 'BUSQUEDAS',
  desc: 'Buscadores: Pinterest, TikTok, YouTube y fondos de pantalla',
  endpoints: [
    { id: 'pinterest', desc: 'Busca pines (imágenes y videos) en Pinterest.', media: 'image', params: params('anime', 'Qué buscar en Pinterest') },
    { id: 'tiktok', desc: 'Busca videos de TikTok con título, autor, portada y enlace MP4.', media: 'video', params: params('gatos', 'Qué buscar en TikTok') },
    { id: 'youtube', desc: 'Busca videos de YouTube: título, canal, duración, vistas y miniatura.', media: 'video', params: params('lofi hip hop', 'Qué buscar en YouTube') },
    { id: 'wallpapers', desc: 'Fondos de pantalla de BestHDWallpapers (imagen original + página).', media: 'image', params: params('naruto', 'Qué fondo buscar (mejor en inglés)', 'Cuántos fondos devolver (1 - 30)') },
    { id: 'wallpapersv2', desc: 'Fondos de pantalla en movimiento de MotionBGs (video o preview).', media: 'video', params: params('rain', 'Qué fondo animado buscar (mejor en inglés)', 'Cuántos fondos devolver (1 - 30)') },
    { id: 'stickerly', desc: 'Stickers de Stickerly por nombre de pack o personaje.', media: 'image', params: params('gatitos', 'Qué sticker buscar') }
  ]
};
