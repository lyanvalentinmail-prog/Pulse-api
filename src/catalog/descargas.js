// src/catalog/descargas.js — Ficha de la categoría **DESCARGAS**.
//
// ▸ AGREGAR un endpoint: la ruta va en src/routes/descargas.js (mapa HANDLERS)
//   y la ficha acá. Los params se declaran con P()/O()/S() de ./helpers.
const { P, O } = require('./helpers');

// `direct=true` es común a todos: devuelve el archivo en vez del JSON.
const direct = () => O('direct', 'false', 'true = devuelve el archivo (MP4/MP3/JPG) en lugar del JSON');
const url = (example, desc) => P('url', example, desc);

module.exports = {
  id: 'descargas',
  name: 'DESCARGAS',
  desc: 'Videos y música de redes sociales, sin marca de agua',
  endpoints: [
    { id: 'tiktok', desc: 'Video de TikTok sin marca de agua (MP4 + MP3 del audio).', media: 'video', params: [
      url('https://www.tiktok.com/@nasa/video/7300000000000000000', 'Enlace del video'),
      direct()
    ] },
    { id: 'pinterest', desc: 'Video o imagen de un pin de Pinterest en su calidad original.', media: 'video', params: [
      url('https://www.pinterest.com/pin/902338475390432363/', 'Enlace del pin'),
      direct()
    ] },
    { id: 'instagram', desc: 'Video o foto de un post o reel de Instagram.', media: 'video', params: [
      url('https://www.instagram.com/reel/Cxxxxxxxxxx/', 'Enlace del post o reel'),
      direct()
    ] },
    { id: 'facebook', desc: 'Video de Facebook en HD (cae a SD si el HD no está disponible).', media: 'video', params: [
      url('https://www.facebook.com/watch/?v=1234567890', 'Enlace del video'),
      direct()
    ] },
    { id: 'spotify', desc: 'Metadatos de Spotify (título, autor, portada) y preview MP3 de 30 s cuando existe.', media: 'audio', params: [
      url('https://open.spotify.com/track/4cOdK2wGLETKBW3PvgPWqT', 'Enlace de track, álbum o playlist'),
      direct()
    ] },
    { id: 'youtubemp4', desc: 'Video de YouTube en MP4 (cobalt si está configurado; si no, instancias Piped).', media: 'video', params: [
      url('https://www.youtube.com/watch?v=dQw4w9WgXcQ', 'Enlace del video'),
      direct()
    ] },
    { id: 'youtubemp3', desc: 'Audio de YouTube convertido a MP3.', media: 'audio', params: [
      url('https://www.youtube.com/watch?v=dQw4w9WgXcQ', 'Enlace del video'),
      direct()
    ] },
    { id: 'audio', desc: 'Extrae el audio de cualquier archivo remoto y lo devuelve en MP3 (ffmpeg).', media: 'audio', params: [
      P('url', 'https://ejemplo.com/video.mp4', 'Enlace directo al archivo de video o audio'),
      direct()
    ] }
  ]
};
