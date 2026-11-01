// src/routes/ia.js — Router de la categoría **IA**.
//
//   GET|POST /ia/gemini?prompt=…&model=gemini-2.0-flash&temperature=0.7
//   GET|POST /ia/image?prompt=…&style=anime&resolution=768x768&seed=42
//
// Gemini necesita clave y vive FUERA del repo: `GEMINI_API_KEY` (entorno) o
// `secrets.local.json`. Sin clave responde 503 explicando cómo cargarla; nunca
// se filtra el valor de la clave en la respuesta ni en los logs.
//
// /ia/image intenta generar con la API interna de Perchance y, en modo auto,
// prueba Pollinations si falla. Ninguno garantiza acceso desde el servidor.
// Devuelve la imagen (JPEG) directamente; con ?format=json devuelve los datos
// en el sobre JSON de siempre, con la imagen embebida en base64.
const express = require('express');
const config = require('../config');
const { sendSuccess, sendError, sendMedia } = require('../utils/response');
const { networkMessage } = require('../utils/http');
const { generateImage, applyStyle } = require('../utils/perchance');

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
  const requestedTemperature = q.temperature === undefined || q.temperature === '' ? 0.7 : Number(q.temperature);
  if (!Number.isFinite(requestedTemperature) || requestedTemperature < 0 || requestedTemperature > 2) {
    return sendError(res, 400, 'temperature debe estar entre 0 y 2');
  }
  const temperature = requestedTemperature;

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

  let raw;
  try { raw = await upstream.text(); } catch (e) {
    return sendError(res, /abort|timeout/i.test(`${e.name} ${e.message}`) ? 504 : 502, 'No se pudo leer la respuesta de Gemini');
  }
  let json = null;
  try { json = JSON.parse(raw); } catch (_) { /* respuesta no-JSON */ }

  if (!upstream.ok) {
    const apiMessage = json && json.error && json.error.message ? json.error.message : `HTTP ${upstream.status}`;
    // Nunca reenviar la clave: sólo el mensaje de Google.
    return sendError(res, upstream.status === 429 ? 429 : 502, `Gemini: ${String(apiMessage).split(config.geminiKey).join('[clave oculta]')}`,
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

/** ¿El cliente quiere el sobre JSON (con la imagen en base64) en vez del archivo? */
function wantsJson(q) {
  const said = String(q.format || q.json || q.raw || '').toLowerCase();
  return said === 'json' || said === 'true' || said === '1';
}

async function image(req, res, q) {
  const prompt = String(q.prompt || q.q || q.text || '').trim();
  if (!prompt) return sendError(res, 400, 'Falta el parámetro prompt', 'Ejemplo: /ia/image?prompt=un gato astronauta');
  if (prompt.length > 1000) return sendError(res, 400, 'El prompt es demasiado largo (máx. 1000 caracteres)');

  // El estilo se suma al prompt (y a los negativos) antes de generar.
  const styled = applyStyle(prompt, q.style, String(q.negativePrompt || q.negative || ''));

  let result;
  try {
    result = await generateImage({
      prompt: styled.prompt,
      // Sin negativos propios se usa la lista por defecto (incluye NSFW).
      negativePrompt: styled.negative ? styled.negative : undefined,
      resolution: q.resolution || q.size || q.aspect,
      seed: q.seed,
      guidanceScale: q.guidance || q.guidanceScale,
      provider: q.provider,
      timeoutMs: q.timeout ? Number(q.timeout) * 1000 : undefined
    });
  } catch (e) {
    const status = Number(e.status) || 502;
    console.warn('[ia/image]', e.message, e.details && e.details.length ? `· ${e.details.join(' · ')}` : '');
    return sendError(res, status, e.message || 'No se pudo generar la imagen',
      e.hint || (networkMessage(e) || 'Probá de nuevo en unos segundos'));
  }

  const meta = {
    provider: result.provider,
    prompt: styled.prompt,
    negativePrompt: styled.negative || null,
    resolution: result.resolution,
    seed: result.seed,
    width: result.width,
    height: result.height,
    mime: result.mime,
    bytes: result.buffer.length,
    cached: !!result.cached,
    ms: result.ms
  };

  if (wantsJson(q)) {
    // La web muestra `image` igual que cualquier otro endpoint con foto.
    return sendSuccess(res, { ...meta, image: `data:${result.mime};base64,${result.buffer.toString('base64')}` });
  }

  // Por defecto: el archivo, listo para <img src="…/ia/image?prompt=…"> o para
  // guardarlo con ?download=true (lo resuelve sendMedia).
  return sendMedia(res, result.buffer, result.mime, `pulse-image-${result.seed || Date.now()}.${result.extension}`);
}

async function handle(req, res) {
  const id = String(req.params.id || '').toLowerCase();
  try {
    if (id === 'gemini') return await gemini(req, res, params(req));
    if (id === 'image') return await image(req, res, params(req));
    return sendError(res, 404, `Modelo "${id}" no existe`, 'Los modelos de IA son gemini e image — mirá /ia');
  } catch (e) {
    console.warn(`[ia/${id}]`, e.message);
    return sendError(res, 500, 'No se pudo consultar el modelo', e.message);
  }
}

router.get('/:id', handle);
router.post('/:id', jsonBody, handle);

module.exports = router;
module.exports.parseGemini = parseGemini;
module.exports.MODELS = MODELS;
