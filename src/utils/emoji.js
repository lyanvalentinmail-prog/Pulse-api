// src/utils/emoji.js — Emojis A COLOR para los canvas.
//
// ¿Por qué no usar la fuente de emojis? NotoEmoji (la que va empaquetada para
// que nunca aparezcan cuadrados) es MONOCROMA: los emojis salen en contorno
// gris. WhatsApp los muestra a color, así que acá los emojis se dibujan como
// imágenes PNG (el set de Twemoji, CC-BY 4.0) que van empaquetadas en una sola
// hoja de sprites dentro del repo: no hay red, no hay dependencias externas y
// el render es igual en cualquier host.
//
// assets/emoji/twitter-64.png  → hoja de sprites (todos los emojis, 64x64 c/u)
// assets/emoji/index.json      → nombres en orden de la grilla (fila por fila)
//
// Uso desde un generador:
//   const { emojiImages } = require('../../utils/emoji');
//   const emojis = await emojiImages(texto);   // Map<emoji, dataURI>
//   textLayer({ text: texto, emojiImages: emojis, ... });
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const DIR = path.join(__dirname, '..', '..', 'assets', 'emoji');
const SPRITE = path.join(DIR, 'twitter-64.png');
const INDEX = path.join(DIR, 'index.json');

// Mismo criterio que textEngine: pictográficos, banderas y teclas (1️⃣).
const EMOJI_RE = /\p{Extended_Pictographic}|\p{Regional_Indicator}|\u20E3/u;

/** ¿Este texto tiene algún emoji? (chequeo barato para el camino rápido) */
const hasEmoji = text => EMOJI_RE.test(String(text ?? ''));

let sheet = null;
/** Índice de la hoja de sprites, cargado una sola vez. */
function sheetIndex() {
  if (sheet) return sheet;
  const raw = JSON.parse(fs.readFileSync(INDEX, 'utf8'));
  const map = new Map();
  raw.names.forEach((name, i) => {
    const pos = { x: (i % raw.cols) * raw.tile, y: Math.floor(i / raw.cols) * raw.tile };
    map.set(name, pos);
    // El set guarda "2764-fe0f" pero el texto suele traer sólo "2764".
    const slim = name.split('-').filter(c => c !== 'fe0f').join('-');
    if (!map.has(slim)) map.set(slim, pos);
  });
  sheet = { tile: raw.tile, map };
  return sheet;
}

/** Clave de un emoji: sus códigos en hexadecimal con 4 dígitos, como en el set. */
const keyOf = emoji => Array.from(String(emoji))
  .map(ch => ch.codePointAt(0).toString(16).padStart(4, '0'))
  .join('-');

const pngCache = new Map();
/** PNG (64x64) de un emoji, o null si el set no lo tiene. */
async function emojiPng(emoji) {
  if (pngCache.has(emoji)) return pngCache.get(emoji);
  const idx = sheetIndex();
  const pos = idx.map.get(keyOf(emoji)) || idx.map.get(keyOf(emoji).split('-').filter(c => c !== 'fe0f').join('-'));
  let buf = null;
  if (pos) {
    buf = await sharp(SPRITE)
      .extract({ left: pos.x, top: pos.y, width: idx.tile, height: idx.tile })
      .png()
      .toBuffer();
  }
  pngCache.set(emoji, buf);
  return buf;
}

/** Emojis sueltos del texto, en orden de aparición y sin repetir. */
function emojisIn(text) {
  const value = String(text ?? '');
  if (!hasEmoji(value)) return [];
  const found = new Map();
  const segmenter = (typeof Intl !== 'undefined' && Intl.Segmenter)
    ? new Intl.Segmenter('es', { granularity: 'grapheme' })
    : null;
  const groups = segmenter ? Array.from(segmenter.segment(value), s => s.segment) : Array.from(value);
  for (const g of groups) if (EMOJI_RE.test(g) && !found.has(g)) found.set(g, true);
  return [...found.keys()];
}

/**
 * Prepara las imágenes de todos los emojis del texto.
 * @returns {Promise<Map<string, string>>} emoji → data URI (PNG en base64)
 */
async function emojiImages(text) {
  const list = emojisIn(text);
  const out = new Map();
  if (!list.length) return out;
  const pngs = await Promise.all(list.map(e => emojiPng(e)));
  list.forEach((emoji, i) => {
    const png = pngs[i];
    if (png) out.set(emoji, `data:image/png;base64,${png.toString('base64')}`);
  });
  return out;
}

module.exports = { hasEmoji, emojiPng, emojiImages, emojisIn, keyOf };
