// src/catalog/downloader.js — Endpoints de la categoría **DOWNLOADER**.
//
// ▸ AGREGAR un endpoint: copiá una entrada de la lista y cambiá `id`, `desc` y `params`.
// ▸ EDITAR uno: cambiá su `desc`, el orden en la lista o cualquiera de sus `params`.
// ▸ BORRAR uno: quitá la entrada (y su ruta en src/routes/download.js).
//
// Formato de una entrada:
//
//   {
//     id: 'miEndpoint',          // = la ruta: GET /downloader/miEndpoint  (minúsculas, sin espacios)
//     desc: 'Qué hace',          // se ve en la web, en /docs y en el README
//     media: 'image',            // opcional: 'image' | 'video' | 'audio' (vista previa en la web)
//     params: [
//       P('text', 'hola', 'Texto principal'),   // requerido
//       O('size', '1', 'Escala (0.5 - 2)')      // opcional
//     ]
//   }
//
// Ayudas (src/catalog/helpers.js): P, O, S, AV, AV2, textStyle(), photoStyle().
const { P, O, S } = require('./helpers');

module.exports = {
  id: 'downloader',
  name: 'DOWNLOADER',
  endpoints: [
    { id: 'tiktok', desc: 'TikTok SIN marca de agua (video HD + audio MP3)', params: [
      P('url', 'https://vt.tiktok.com/ZS43DntHW/', 'URL del TikTok'),
      S('direct', '', 'Devuelve el archivo en vez de JSON', ['', 'mp4', 'mp3'])
    ] },
    { id: 'youtube', desc: 'Info y formatos de un video de YouTube (siempre con audio; youtubei.js → InnerTube → Invidious → Piped → cobalt)', media: 'video', params: [
      O('url', 'https://www.youtube.com/watch?v=5M_n2UCe7DQ', 'URL del video'),
      O('query', '', 'O busca por nombre'),
      S('quality', 'auto', 'Calidad preferida (auto = la mejor que traiga audio)', ['auto', '360', '480', '720', '1080']),
      S('direct', '', 'Devuelve el archivo en vez de JSON', ['', 'mp4', 'mp3'])
    ] },
    { id: 'facebook', desc: 'Descarga videos públicos de Facebook (HD/SD; resuelve fb.watch y cae a cobalt si Meta bloquea)', media: 'video', params: [
      P('url', 'https://www.facebook.com/watch/?v=10153231379946729', 'URL del video o reel público'),
      S('direct', '', 'Devuelve el archivo en vez de JSON', ['', 'mp4']),
      S('quality', '', 'Preferencia de calidad', ['', 'hd', 'sd'])
    ] },
    { id: 'instagram', desc: 'Reels, videos y fotos de Instagram', params: [
      P('url', 'https://www.instagram.com/reel/C7cVzn2yzXB/', 'URL del post/reel'),
      O('direct', 'false', 'true = media directa')
    ] },
    { id: 'pinterest', desc: 'Descarga un pin de Pinterest (imagen, GIF o video) en su tamaño original', media: 'image', params: [
      P('url', 'https://www.pinterest.com/pin/1234567890/', 'URL del pin (o sólo el número)'),
      O('direct', 'true', 'true = devuelve el archivo; false = JSON con links')
    ] },
    { id: 'mp3', desc: 'Audio MP3 real desde YouTube por URL o búsqueda (ffmpeg; si YouTube bloquea, audio directo de cobalt)', media: 'audio', params: [
      O('url', 'https://www.youtube.com/watch?v=5M_n2UCe7DQ', 'URL de YouTube'),
      O('query', 'Twice I Cant Stop Me', 'O busca por nombre'),
      O('direct', 'true', 'true = audio directo en streaming'),
      O('download', 'false', 'true = descarga el MP3 como archivo'),
      O('tries', '3', 'Cuántos resultados de YouTube se prueban para la canción COMPLETA (1-5)')
    ] },
    { id: 'mp4', desc: 'Video MP4 con audio desde YouTube por URL o búsqueda (pega las pistas con ffmpeg; respaldo cobalt)', media: 'video', params: [
      O('url', 'https://www.youtube.com/watch?v=5M_n2UCe7DQ', 'URL de YouTube'),
      O('query', 'Twice', 'O busca por nombre'),
      S('quality', 'auto', 'Calidad: auto = la mejor con audio', ['auto', '360', '480', '720', '1080']),
      O('direct', 'true', 'true = video directo en streaming')
    ] },
    { id: 'play', desc: 'Busca una canción y devuelve la CANCIÓN COMPLETA en MP3 (prueba varios resultados de YouTube; si todos fallan, preview de 30 s de Deezer/iTunes)', media: 'audio', params: [
      P('query', 'Lisa Money', 'Canción o artista'),
      O('direct', 'true', 'true = audio directo en streaming'),
      O('download', 'false', 'true = descarga el MP3 como archivo'),
      O('tries', '3', 'Cuántos resultados de YouTube se prueban antes de rendirse (1-5)')
    ] },
    { id: 'lyric', desc: 'Letra de una canción (JSON, .txt, .lrc sincronizada o sticker brat con la letra completa)', params: [
      P('query', 'Kendrick Lamar Humble', 'Artista + canción'),
      S('format', 'json', 'Formato de salida: JSON, txt, lrc o brat (PNG con la letra completa)', ['json', 'txt', 'lrc', 'brat']),
      O('bg', '', 'Sólo brat: color de fondo hex (ej. ffffff)'),
      O('color', '', 'Sólo brat: color del texto hex (ej. 000000)'),
      O('size', '1', 'Sólo brat: escala del texto (0.5 - 2)'),
      O('width', '512', 'Sólo brat: ancho del PNG en píxeles'),
      O('maxHeight', '6000', 'Sólo brat: alto máximo del PNG (100-12000 px)')
    ] }
  ]
};
