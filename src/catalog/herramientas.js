// src/catalog/herramientas.js — Ficha de la categoría **HERRAMIENTAS**.
//
// El router /herramientas (src/routes/herramientas.js) está montado pero todavía no publica
// endpoints: `endpoints: []`. La web, /docs y el probador salen vacíos hasta que
// agregues la primera ficha.
//
// ▸ AGREGAR un endpoint (2 pasos):
//   1) la ruta que responde → src/routes/herramientas.js
//   2) la ficha (desc + params) → acá, copiando una entrada de src/catalog/canvas.js
//
// Formato de una entrada:
//
//   {
//     id: 'miEndpoint',          // = la ruta: GET /herramientas/miEndpoint (minúsculas, sin espacios)
//     desc: 'Qué hace',          // se ve en la web, en /docs y en el README
//     media: 'image',            // opcional: 'image' | 'video' | 'audio' | 'json'
//     params: [
//       P('text', 'hola', 'Texto principal'),   // requerido
//       O('size', '1', 'Escala (0.5 - 2)')      // opcional
//     ]
//   }
//
// Ayudas (src/catalog/helpers.js): P, O, S, AV, AV2, textStyle(), photoStyle().
module.exports = {
  id: 'herramientas',
  name: 'HERRAMIENTAS',
  desc: 'Utilidades: QR, hash, base64, texto',
  endpoints: []
};
