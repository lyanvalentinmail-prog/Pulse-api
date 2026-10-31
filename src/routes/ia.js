// src/routes/ia.js — Router de la categoría **IA**.
//
// Montado en src/server.js como /ia. Está vacío a propósito: todavía no
// publica ningún endpoint, así que cualquier /ia/... cae en el 404 general.
//
// ➕ AGREGAR un endpoint (3 pasos):
//   1) escribí el handler acá abajo          → router.get('/<id>', ...)
//   2) agregá la ficha en src/catalog/ia.js
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
