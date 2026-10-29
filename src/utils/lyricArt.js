// src/utils/lyricArt.js — La letra de una canción como sticker BRAT.
//
// Un brat normal es cuadrado, pero una canción no entra en un cuadrado: acá el
// lienzo **crece hacia abajo** (como el chat de `iqc`) hasta que entra la letra
// completa. Conserva su diseño largo propio (layouts.js → `bratlyrics`),
// independientemente de los cambios al sticker cuadrado y al video.
const { sharp } = require('./image');
const { textLayer, wrapLines, measure } = require('./textEngine');
const L = require('../canvas/layouts');

/** Grano sutil del brat real (el sticker no es un plano perfecto). */
function grainSvg(w, h) {
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">` +
    `<filter id="n"><feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" stitchTiles="stitch"/>` +
    `<feColorMatrix type="saturate" values="0"/></filter>` +
    `<rect width="${w}" height="${h}" filter="url(#n)" opacity="0.035"/></svg>`
  );
}

/** Envuelve el texto respetando las líneas en blanco (separan estrofas). */
function wrapKeepBlank(text, width, opts) {
  const out = [];
  for (const block of String(text).split(/\n{2,}/)) {
    const trimmed = block.trim();
    if (!trimmed) continue;
    if (out.length) out.push('');
    out.push(...wrapLines(trimmed, width, opts));
  }
  return out.length ? out : [''];
}

/** Saca las marcas de tiempo del LRC y deja sólo las letras. */
function plainLyricsOf(song = {}) {
  const raw = String(song.plainLyrics || song.syncedLyrics || '')
    .replace(/\r/g, '')
    .split('\n')
    .map(line => line.replace(/^\[[^\]]*\]\s*/, '').trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return raw;
}

/**
 * Sticker brat con la letra completa de una canción.
 *
 * @param {{title?:string, artist?:string, plainLyrics?:string, syncedLyrics?:string}} song
 * @param {{width?:number, bg?:string, color?:string, size?:number, includeHeader?:boolean,
 *          uppercase?:boolean, maxHeight?:number, minFont?:number}} opts
 * @returns {Promise<{buffer:Buffer, width:number, height:number, fontSize:number, lines:number}>}
 */
async function bratFromLyrics(song = {}, opts = {}) {
  const parts = L.get('bratlyrics').parts;
  const font = parts.text.font;
  const W = Math.round(Math.max(220, Math.min(1600, Number(opts.width) || parts.canvas.width)));
  const bg = opts.bg || parts.canvas.bg;
  const fill = opts.color || parts.text.fill;
  const scale = Math.max(0.4, Math.min(3, Number(opts.size) || 1));
  const maxHeight = Math.round(Math.max(100, Math.min(12000, Number(opts.maxHeight) || 6000)));
  const pad = Math.round(W * (parts.text.pad ?? 0.06));

  const header = opts.includeHeader === false
    ? ''
    : [song.title, song.artist].filter(Boolean).join(' — ');
  let body = plainLyricsOf(song);
  if (!body) body = header || 'Sin letra disponible';
  let text = header ? `${header}\n\n${body}` : body;
  if (opts.uppercase) text = text.toUpperCase();
  else text = text.toLowerCase(); // el brat real va en minúsculas

  // El tamaño baja hasta que la letra completa entra en el alto máximo.
  const inner = W - pad * 2;
  const maxFont = Math.round(font.maxFont * scale * (W / parts.canvas.width));
  let size = Math.max(14, maxFont);
  let lines = [];
  for (; size >= 12; size -= 1) {
    lines = wrapKeepBlank(text, inner, {
      family: font.family, weight: font.weight, size,
      letterSpacing: font.spacing || 0, maxLines: 100000
    });
    const alto = lines.length * size * font.lineHeight + pad * 2;
    if (alto <= maxHeight) break;
  }
  if (size < 12) size = 12;
  lines = wrapKeepBlank(text, inner, {
    family: font.family, weight: font.weight, size,
    letterSpacing: font.spacing || 0, maxLines: 100000
  });
  // Alto exacto del texto (sin aire de más) para que el PNG no quede con cola.
  const widest = lines.reduce((max, line) => Math.max(max, measure(line, { family: font.family, weight: font.weight, size, letterSpacing: font.spacing || 0 })), 0);
  const H = Math.ceil(lines.length * size * font.lineHeight + pad * 2);
  if (H > maxHeight) {
    const err = new Error('La letra no cabe completa en la altura máxima solicitada');
    err.status = 400;
    err.hint = 'Aumentá maxHeight o width, o pedí format=txt';
    throw err;
  }

  const layer = textLayer({
    text: lines.join('\n'),
    width: W,
    height: H,
    family: font.family,
    weight: font.weight,
    fontSize: size,
    autoFit: false,
    lineHeight: font.lineHeight,
    letterSpacing: font.spacing || 0,
    fill,
    align: 'start',
    padding: pad,
    maxLines: lines.length
  });

  const base = await sharp({ create: { width: W, height: H, channels: 4, background: bg } })
    .composite([{ input: await sharp(layer.svg).blur(0.7).png().toBuffer(), left: 0, top: 0 }])
    .png()
    .toBuffer();
  const buffer = await sharp(base).composite([{ input: grainSvg(W, H) }]).png().toBuffer();
  return { buffer, width: W, height: H, fontSize: size, lines: lines.length, widest };
}

module.exports = { bratFromLyrics, plainLyricsOf };
