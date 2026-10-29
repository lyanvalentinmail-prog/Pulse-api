// src/catalog/searcher.js — Endpoints de la categoría **SEARCHER**.
//
// ▸ AGREGAR un endpoint: copiá una entrada de la lista y cambiá `id`, `desc` y `params`.
// ▸ EDITAR uno: cambiá su `desc`, el orden en la lista o cualquiera de sus `params`.
// ▸ BORRAR uno: quitá la entrada (y su ruta en src/routes/searcher.js).
//
// Formato de una entrada:
//
//   {
//     id: 'miEndpoint',          // = la ruta: GET /searcher/miEndpoint  (minúsculas, sin espacios)
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
  id: 'searcher',
  name: 'SEARCHER',
  endpoints: [
    { id: 'tiktok', desc: 'Busca videos en TikTok con portada, autor y estadísticas (TikWM)', media: 'image', params: [
      P('query', 'anime edit', 'Palabra clave'),
      O('limit', '10', 'Cantidad de resultados (1-30)')
    ] },
    { id: 'youtube', desc: 'Busca videos en YouTube (título, canal, duración y vistas)', media: 'image', params: [
      P('query', 'Twice', 'Palabra clave'),
      O('limit', '10', 'Cantidad de resultados (1-30)')
    ] },
    { id: 'google', desc: 'Busca en la web (Google → DuckDuckGo → Bing, el primero que responda)', params: [
      P('query', 'Velirius API', 'Qué quieres buscar'),
      O('limit', '10', 'Cantidad de resultados (1-20)'),
      O('lang', 'es', 'Idioma de la búsqueda (es, en, pt…)')
    ] },
    { id: 'pinterest', desc: 'Busca pines en Pinterest (imagen o video) con el link de descarga', media: 'image', params: [
      P('query', 'gatos aesthetic', 'Qué buscar en Pinterest'),
      O('limit', '20', 'Cantidad de pines (1-50)'),
      O('page', '1', 'Página de resultados')
    ] },
    { id: 'wikipedia', desc: 'Busca artículos en Wikipedia con extracto e imagen (cualquier idioma)', media: 'image', params: [
      P('query', 'One Piece', 'Tema a buscar'),
      O('limit', '8', 'Cantidad de artículos (1-20)'),
      O('lang', 'es', 'Idioma de Wikipedia (es, en, pt…)')
    ] }
  ]
};
