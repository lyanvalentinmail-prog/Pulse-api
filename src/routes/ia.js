// src/routes/ia.js — Router de la categoría **IA**.
//
//   GET|POST /ia/gemini?prompt=…&model=gemini-2.0-flash&temperature=0.7
//
// La clave vive FUERA del repo: `GEMINI_API_KEY` (entorno) o `secrets.local.json`.
// Sin clave el endpoint responde 503 explicando cómo cargarla; nunca se filtra
// el valor de la clave en la respuesta ni en los logs.
const express = require('express');
const config = require('../config');
const { sendSuccess, sendError } = require('../utils/response');
const { networkMessage } = require('../utils/http');

const router = express.Router();
const jsonBody = express.json({ limit: '1mb' });

const MODELS = ['gemini-2.0-flash', 'gemini-1.5-flash', 'gemini-1.5-pro'];
const ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models';

function params(req) {
  const body = req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body : {};
  return { ...req.query, ...body };
}

/** Respuesta de generateContent → texto plano + uso de tokens. */
function parseGemini(json) {
  const candidate = (json.candidates || [])[0] || {};
  const parts = (candidate.content && candidate.content.parts) || [];
  const text = parts.map(p => p.text || '').join('').trim();
  const usage = json.usageMetadata || {};
  return {
    text,
    finishReason: candidate.finishReason || null,
    model: String(json.modelVersion || ''),
    usage: {
      promptTokens: usage.promptTokenCount || 0,
      responseTokens: usage.candidatesTokenCount || 0,
      totalTokens: usage.totalTokenCount || 0
    }
  };
}

async function gemini(req, res, q) {
  if (!config.geminiKey) {
    return sendError(res, 503, 'Falta la clave de Gemini',
      'Definí GEMINI_API_KEY en el entorno (o en secrets.local.json) y reiniciá el servidor');
  }
  const prompt = String(q.prompt || q.q || q.text || '').trim();
  if (!prompt) return sendError(res, 400, 'Falta el parámetro prompt', 'Ejemplo: /ia/gemini?prompt=hola');
  if (prompt.length > 8000) return sendError(res, 400, 'El prompt es demasiado largo (máx. 8000 caracteres)');

  const model = MODELS.includes(String(q.model)) ? String(q.model) : config.geminiModel;
  const temperature = Math.min(2, Math.max(0, Number(q.temperature))) || 0.7;

  const body = {
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: { temperature, maxOutputTokens: Math.min(4096, Math.max(64, Number(q.maxTokens) || 1024)) }
  };

  const started = Date.now();
  let upstream;
  try {
    upstream = await fetch(`${ENDPOINT}/${model}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': config.geminiKey },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(30000)
    });
  } catch (e) {
    const timedOut = /abort|timeout/i.test(String(e.name || e.message));
    return sendError(res, timedOut ? 504 : 502,
      timedOut ? 'Gemini no respondió a tiempo' : 'No se pudo conectar con Gemini',
      networkMessage(e) || 'Revisá la conexión del servidor con generativelanguage.googleapis.com');
  }

  const raw = await upstream.text();
  let json = null;
  try { json = JSON.parse(raw); } catch (_) { /* respuesta no-JSON */ }

  if (!upstream.ok) {
    const apiMessage = json && json.error && json.error.message ? json.error.message : `HTTP ${upstream.status}`;
    // Nunca reenviar la clave: sólo el mensaje de Google.
    return sendError(res, upstream.status === 429 ? 429 : 502, `Gemini: ${apiMessage}`,
      upstream.status === 400 || upstream.status === 403 ? 'Revisá que la clave sea válida y que la API esté habilitada' : undefined);
  }

  const data = parseGemini(json || {});
  if (!data.text) return sendError(res, 502, 'Gemini devolvió una respuesta vacía');

  return sendSuccess(res, {
    provider: 'google',
    model,
    prompt: prompt.length > 200 ? `${prompt.slice(0, 200)}…` : prompt,
    text: data.text,
    finishReason: data.finishReason,
    usage: data.usage,
    ms: Date.now() - started
  });
}

async function handle(req, res) {
  const id = String(req.params.id || '').toLowerCase();
  if (id !== 'gemini') {
    return sendError(res, 404, `Modelo "${id}" no existe`, 'Por ahora sólo está disponible gemini — mirá /ia');
  }
  try {
    return await gemini(req, res, params(req));
  } catch (e) {
    console.warn('[ia/gemini]', e.message);
    return sendError(res, 500, 'No se pudo consultar el modelo', e.message);
  }
}

router.get('/:id', handle);
router.post('/:id', jsonBody, handle);

module.exports = router;
module.exports.parseGemini = parseGemini;
module.exports.MODELS = MODELS;
