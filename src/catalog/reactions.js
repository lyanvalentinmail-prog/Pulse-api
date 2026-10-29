// src/catalog/reactions.js — Endpoints de la categoría **REACTIONS**.
//
// ▸ AGREGAR un endpoint: copiá una entrada de la lista y cambiá `id`, `desc` y `params`.
// ▸ EDITAR uno: cambiá su `desc`, el orden en la lista o cualquiera de sus `params`.
// ▸ BORRAR uno: quitá la entrada (y su ruta en src/routes/reactions.js).
//
// Formato de una entrada:
//
//   {
//     id: 'miEndpoint',          // = la ruta: GET /reactions/miEndpoint  (minúsculas, sin espacios)
//     desc: 'Qué hace',          // se ve en la web, en /docs y en el README
//     media: 'image',            // opcional: 'image' | 'video' | 'audio' (vista previa en la web)
//     params: [
//       P('text', 'hola', 'Texto principal'),   // requerido
//       O('size', '1', 'Escala (0.5 - 2)')      // opcional
//     ]
//   }
//
// Ayudas (src/catalog/helpers.js): P, O, S, AV, AV2, textStyle(), photoStyle().
const { O, S } = require('./helpers');

module.exports = {
  id: 'reactions',
  name: 'REACTIONS',
  endpoints: Object.entries(require('../utils/providers').REACTIONS).map(([id, label]) => ({
    id,
    desc: `GIF de ${label.toLowerCase()} (nekos.best · purrbot · otakugifs)`,
    media: 'image',
    params: [
      S('provider', '', 'Forzar proveedor (vacío = automático)', ['', 'nekos.best', 'purrbot', 'otakugifs']),
      O('direct', 'false', 'true = devuelve el GIF directamente'),
      O('download', 'false', 'true = descarga el GIF como archivo')
    ]
  }))
};
