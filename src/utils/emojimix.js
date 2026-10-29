// src/utils/emojimix.js — Mezcla de dos emojis (estilo **Emoji Kitchen** de Gboard).
//
// Google publica cada mezcla como un PNG en su CDN (gstatic) y hay wrappers
// públicos que resuelven la combinación por codepoints. Acá se prueba:
//
//   1. emojik.vercel.app  → wrapper del catálogo de Emoji Kitchen (rápido)
//   2. gstatic            → el PNG original de Google, probando las fechas del
//                           catálogo (cada tanda de stickers vive en su carpeta)
//   3. local              → si no hay red, se arma un sticker con los dos emojis
//                           de la hoja de sprites del repo (nunca falla)
//
// Los emojis llegan como texto (`🐱`) o como codepoint (`1f431`).
const { fetchBuffer, firstFast, UA_DESKTOP } = require('./http');
const { emojiPng } = require('./emoji');
const sharp = require('sharp');

// Carpetas de gstatic donde fueron apareciendo las mezclas (las más usadas).
const FECHAS = [
  '20201001', '20210221', '20210521', '20220101',
  '20220425', '20220823', '20230101', '20230301', '20231113', '20240201'
];

/** `🐱` → `1f431` (o `1f468-200d-1f469` si el emoji tiene varios codepoints). */
function codepoint(emoji) {
  const txt = String(emoji ?? '').trim();
  if (!txt) return '';
  // Ya viene como codepoint hexadecimal: 1f431 / 1f468-200d-1f469
  if (/^[0-9a-f]{1,6}(?:[-_]?[0-9a-f]{1,6})*$/i.test(txt)) {
    return txt.toLowerCase().replace(/_/g, '-');
  }
  return Array.from(txt).map(ch => ch.codePointAt(0).toString(16)).join('-');
}

/** El primer "emoji visible" del texto (para no mezclar palabras enteras). */
function primerEmoji(texto) {
  const t = String(texto ?? '').trim();
  if (!t) return '';
  // Vino como codepoint (`1f431`): se convierte al emoji de verdad.
  if (/^[0-9a-f]{1,6}(?:[-_][0-9a-f]{1,6})*$/i.test(t)) {
    const puntos = t.toLowerCase().split(/[-_]/).map(h => parseInt(h, 16)).filter(n => Number.isFinite(n) && n > 0);
    try { return String.fromCodePoint(...puntos); } catch (_) { return ''; }
  }
  const m = t.match(/\p{Extended_Pictographic}(?:\uFE0F|\u20E3)?(?:\u200D\p{Extended_Pictographic}(?:\uFE0F)?)*/u);
  if (m) return m[0];
  return Array.from(t)[0] || '';
}

const esPng = buf => buf && buf.length > 100 && buf[0] === 0x89 && buf[1] === 0x50;

/** Pide una URL y devuelve el PNG (o falla). */
async function pedirPng(url) {
  const buf = await fetchBuffer(url, {
    headers: { 'User-Agent': UA_DESKTOP, Accept: 'image/png,image/*;q=0.8' },
    timeoutMs: 12000
  });
  if (!esPng(buf)) throw new Error('no es un PNG');
  return buf;
}

/** Sticker armado en casa con los dos emojis (respaldo sin red). */
async function mezclaLocal(a, b, size = 512) {
  const uno = await emojiPng(a);
  const dos = await emojiPng(b);
  if (!uno && !dos) throw new Error('El set de emojis del repo no tiene esos emojis');
  const S = Math.max(64, Math.min(1024, Number(size) || 512));
  const gordo = Math.round(S * 0.74);
  const chico = Math.round(S * 0.46);
  const capa = [];
  if (uno) {
    capa.push({
      input: await sharp(uno).resize(gordo, gordo, { kernel: 'lanczos3' }).png().toBuffer(),
      left: Math.round(S * 0.06),
      top: Math.round(S * 0.10)
    });
  }
  if (dos) {
    capa.push({
      input: await sharp(dos).resize(chico, chico, { kernel: 'lanczos3' }).png().toBuffer(),
      left: Math.round(S * 0.50),
      top: Math.round(S * 0.48)
    });
  }
  const base = await sharp({
    create: { width: S, height: S, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } }
  }).png().toBuffer();
  return sharp(base).composite(capa).png().toBuffer();
}

/**
 * Devuelve el sticker de la mezcla.
 * @param {string} a  primer emoji (texto o codepoint)
 * @param {string} b  segundo emoji
 * @param {{size?:number}} opts
 * @returns {Promise<{buffer:Buffer, source:string, emoji1:string, emoji2:string, codepoint1:string, codepoint2:string}>}
 */
async function emojiMix(a, b, opts = {}) {
  const e1 = primerEmoji(a);
  const e2 = primerEmoji(b);
  const cp1 = codepoint(e1 || a);
  const cp2 = codepoint(e2 || b);
  if (!cp1 || !cp2) throw new Error('Faltan los dos emojis (emoji1 y emoji2)');
  const size = Math.max(16, Math.min(1024, parseInt(opts.size, 10) || 512));

  let buffer = null;
  let source = 'local';
  // 1) Wrapper del catálogo (una sola petición, responde rápido).
  for (const url of [
    `https://emojik.vercel.app/s/${cp1}_${cp2}?size=${size}`,
    `https://emojik.vercel.app/s/${cp2}_${cp1}?size=${size}`
  ]) {
    try {
      buffer = await pedirPng(url);
      source = 'emojikit';
      break;
    } catch (_) { /* siguiente */ }
  }
  // 2) El PNG original de Google: se prueban todas las carpetas por fecha en
  //    paralelo y gana la primera que exista (si no, corta a los 6 s).
  if (!buffer) {
    const sondas = FECHAS.flatMap(fecha => ([
      [`gstatic-${fecha}`, () => pedirPng(`https://www.gstatic.com/android/keyboard/emojikitchen/${fecha}/u${cp1}/u${cp1}_u${cp2}.png`)],
      [`gstatic-${fecha}`, () => pedirPng(`https://www.gstatic.com/android/keyboard/emojikitchen/${fecha}/u${cp2}/u${cp2}_u${cp1}.png`)]
    ]));
    try {
      const { value } = await firstFast(sondas, { timeoutMs: 6000 });
      buffer = value;
      source = 'emoji-kitchen';
    } catch (_) { /* sigue el respaldo local */ }
  }
  // 3) Sin red: sticker armado con los dos emojis del repo (siempre devuelve algo).
  if (!buffer) {
    buffer = await mezclaLocal(e1 || a, e2 || b, size);
    source = 'local';
  }

  return { buffer, source, emoji1: e1 || null, emoji2: e2 || null, codepoint1: cp1, codepoint2: cp2 };
}

module.exports = { emojiMix, codepoint, primerEmoji, mezclaLocal, FECHAS };
