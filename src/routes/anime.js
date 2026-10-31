// src/routes/anime.js — Router de la categoría **ANIME**.
//
// Montado en src/server.js como /anime. Está vacío a propósito: todavía no
// publica ningún endpoint, así que cualquier /anime/... cae en el 404 general.
//
// ➕ AGREGAR un endpoint (3 pasos):
//   1) escribí el handler acá abajo          → router.get('/<id>', ...)
//   2) agregá la ficha en src/catalog/anime.js
//   3) corré `npm run check`
//
// Forma de un handler JSON (todos los endpoints usan el mismo sobre de respuesta):
//
//   const config = require('../config');
//   const { sendError } = require('../utils/response');
//
//   router.get('/hola', (req, res) => {
//     const { text } = req.query;
//     if (!text) return sendError(res, 400, 'Falta el parámetro text');
//     return res.json({ creator: config.creator, status: true, result: { text } });
//   });
const express = require('express');

const router = express.Router();

module.exports = router;
