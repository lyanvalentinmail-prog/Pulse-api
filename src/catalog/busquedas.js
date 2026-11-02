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
  desc: 'Buscadores: Pinterest, TikTok, YouTube, fondos, Wikipedia, tiendas de apps y música',
  endpoints: [
    { id: 'pinterest', desc: 'Busca pines (imágenes y videos) en Pinterest.', media: 'image', params: params('anime', 'Qué buscar en Pinterest') },
    { id: 'tiktok', desc: 'Busca videos de TikTok con título, autor, portada y enlace MP4.', media: 'video', params: params('gatos', 'Qué buscar en TikTok') },
    { id: 'youtube', desc: 'Busca videos de YouTube: título, canal, duración, vistas y miniatura.', media: 'video', params: params('lofi hip hop', 'Qué buscar en YouTube') },
    { id: 'wallpapers', desc: 'Fondos de pantalla de BestHDWallpapers (imagen original + página).', media: 'image', params: params('naruto', 'Qué fondo buscar (mejor en inglés)', 'Cuántos fondos devolver (1 - 30)') },
    { id: 'wallpapersv2', desc: 'Fondos de pantalla en movimiento de MotionBGs (video o preview).', media: 'video', params: params('rain', 'Qué fondo animado buscar (mejor en inglés)', 'Cuántos fondos devolver (1 - 30)') },
    { id: 'stickerly', desc: 'Stickers y vistas previas de packs públicos de Sticker.ly por nombre o personaje.', media: 'image', params: params('gatitos', 'Qué sticker buscar') },
    { id: 'wiki', desc: 'Artículos de Wikipedia: título, resumen, miniatura y enlace.', media: 'image', params: [
      P('q', 'Eniac', 'Qué buscar en la enciclopedia'),
      O('lang', 'es', 'Idioma de Wikipedia (es, en, pt, pt-br…)'),
      O('limit', '10', 'Cuántos artículos devolver (1 - 30)')
    ] },
    { id: 'playstore', desc: 'Apps de Google Play: nombre, desarrollador, icono, nota y enlace a la ficha.', media: 'image', params: [
      P('q', 'whatsapp', 'Nombre de la app a buscar'),
      O('limit', '10', 'Cuántas apps devolver (1 - 30)'),
      O('country', 'us', 'País de la tienda (us, es, ar, mx…)'),
      O('lang', 'en', 'Idioma del listado (en, es…)')
    ] },
    { id: 'aptoide', desc: 'Apps de Aptoide con versión, tamaño, descargas y enlace APK directo.', media: 'image', params: params('whatsapp', 'Nombre o package de la app') },
    { id: 'appstore', desc: 'Apps de la App Store de Apple: nombre, desarrollador, icono, precio y enlace.', media: 'image', params: [
      P('q', 'whatsapp', 'Nombre de la app a buscar'),
      O('limit', '10', 'Cuántas apps devolver (1 - 30)'),
      O('country', 'us', 'País de la tienda (us, es, ar, mx…)')
    ] },
    { id: 'play', desc: 'Busca una canción por nombre (y autor opcional) y devuelve el audio para reproducir.', media: 'audio', params: [
      P('name', 'Bohemian Rhapsody', 'Nombre de la canción'),
      O('author', 'Queen', 'Autor o artista (opcional)'),
      O('limit', '5', 'Cuántas canciones devolver (1 - 30)')
    ] }
  ]
};
