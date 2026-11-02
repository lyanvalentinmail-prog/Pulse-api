// src/catalog/anime.js — Ficha de la categoría **ANIME**.
//
// ▸ AGREGAR un endpoint (2 pasos):
//   1) la lógica en src/utils/anime.js y el handler en src/routes/anime.js
//   2) la ficha (desc + params) acá
//
// ⚠️ El filtro NSFW está siempre activo: las búsquedas usan `sfw=true` y se
// descartan las fichas con rating «Rx» o géneros Hentai/Erotica. Las imágenes
// salen sólo de las categorías SFW de nekos.best y waifu.pics.
const { P, O, S } = require('./helpers');

module.exports = {
  id: 'anime',
  name: 'ANIME',
  desc: 'Anime, manga, Pokémon y personajes (siempre sin NSFW)',
  endpoints: [
    { id: 'animeinfo', desc: 'Ficha de anime de MyAnimeList: sinopsis, nota, episodios, estudios y portada.', media: 'image', params: [
      P('q', 'naruto', 'Título a buscar o ID de MyAnimeList'),
      O('limit', '5', 'Cuántos resultados devolver (1 - 20)')
    ] },
    { id: 'mangainfo', desc: 'Ficha de manga de MyAnimeList: sinopsis, tomos, capítulos, autores y portada.', media: 'image', params: [
      P('q', 'berserk', 'Título a buscar o ID de MyAnimeList'),
      O('limit', '5', 'Cuántos resultados devolver (1 - 20)')
    ] },
    { id: 'gacha', desc: 'Tirada de gacha: una imagen SFW de personaje con rareza, estrellas y poder.', media: 'image', params: [
      S('kind', '', 'Categoría de la carta (vacío = al azar)', ['', 'waifu', 'maid', 'neko'])
    ] },
    { id: 'pokemon', desc: 'Datos de un Pokémon: tipos, habilidades, stats, altura, peso, imagen y descripción de la Pokédex.', media: 'image', params: [
      O('name', 'pikachu', 'Nombre en inglés o número de Pokédex (vacío = al azar)')
    ] },
    { id: 'waifu', desc: 'Imagen aleatoria de waifu (nekos.best o waifu.pics, sólo SFW).', media: 'image', params: [
      O('count', '1', 'Cuántas imágenes devolver (1 - 10)')
    ] },
    { id: 'maid', desc: 'Imagen aleatoria de maid (sólo SFW).', media: 'image', params: [
      O('count', '1', 'Cuántas imágenes devolver (1 - 10)')
    ] },
    { id: 'neko', desc: 'Imagen aleatoria de neko (sólo SFW).', media: 'image', params: [
      O('count', '1', 'Cuántas imágenes devolver (1 - 10)')
    ] }
  ]
};
