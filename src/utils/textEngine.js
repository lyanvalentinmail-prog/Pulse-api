// src/utils/textEngine.js — Motor de texto 100% vectorial para los Canvas.
//
// ¿Por qué no <text> + font-family en el SVG? Porque librsvg (sharp) resuelve las
// fuentes con fontconfig: si el host no tiene la tipografía instalada (Vercel,
// Render, Alpine, contenedores mínimos) el resultado son cuadrados ▯▯▯ (tofu) o
// texto invisible. Aquí las tipografías van empaquetadas en assets/fonts y cada
// letra se convierte en un <path>, así el render es idéntico en cualquier host.
//
// Los emojis y símbolos que no existen en la fuente principal se dibujan con
// NotoEmoji (también empaquetada), de modo que nunca aparecen cuadrados.
const fs = require('fs');
const path = require('path');
const opentype = require('opentype.js');

const FONTS_DIR = path.join(__dirname, '..', '..', 'assets', 'fonts');

const FAMILIES = {
  sans: { 400: 'Inter-Regular.ttf', 500: 'Inter-Regular.ttf', 600: 'Inter-Bold.ttf', 700: 'Inter-Bold.ttf', 800: 'Inter-Black.ttf', 900: 'Inter-Black.ttf' },
  // Letra a mano del cartel de `bratcoyote` (Caveat Brush, OFL). Tiene un solo peso:
  // pedir 700 u 800 devuelve la misma fuente, así el estilo no salta entre canvas.
  hand: { 400: 'CaveatBrush-Regular.ttf', 500: 'CaveatBrush-Regular.ttf', 600: 'CaveatBrush-Regular.ttf', 700: 'CaveatBrush-Regular.ttf', 800: 'CaveatBrush-Regular.ttf', 900: 'CaveatBrush-Regular.ttf' },
  serif: { 400: 'Playfair-Regular.ttf', 500: 'Playfair-Regular.ttf', 600: 'Playfair-Bold.ttf', 700: 'Playfair-Bold.ttf', 800: 'Playfair-Black.ttf', 900: 'Playfair-Black.ttf' },
  mono: { 400: 'JetBrainsMono-Regular.ttf', 500: 'JetBrainsMono-Regular.ttf', 600: 'JetBrainsMono-Bold.ttf', 700: 'JetBrainsMono-Bold.ttf', 800: 'JetBrainsMono-Bold.ttf', 900: 'JetBrainsMono-Bold.ttf' }
};
const FALLBACK_FILES = ['NotoEmoji-Regular.ttf', 'Inter-Regular.ttf'];

const cache = new Map();

function loadFontFile(file) {
  if (cache.has(file)) return cache.get(file);
  const buf = fs.readFileSync(path.join(FONTS_DIR, file));
  const font = opentype.parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
  cache.set(file, font);
  return font;
}

function resolveFamily(name) {
  const key = String(name || '').toLowerCase();
  if (FAMILIES[key]) return key;
  if (key === 'monoespaciada' || key === 'monospace') return 'mono';
  if (key === 'serif' || key === 'serifada') return 'serif';
  // alias de la letra a mano: ?font=hand | manuscrita | caveat | brush
  if (key === 'manuscrita' || key === 'caveat' || key === 'brush' || key === 'handwriting') return 'hand';
  return 'sans';
}

function fontFor(family, weight = 700) {
  const fam = FAMILIES[resolveFamily(family)];
  const w = [900, 800, 700, 600, 500, 400].find(x => x <= (Number(weight) || 700)) || 400;
  return loadFontFile(fam[w] || fam[700] || fam[400]);
}

const emojiFont = () => loadFontFile(FALLBACK_FILES[0]);

/** ¿La fuente tiene un glifo real (no .notdef) para este carácter? */
function hasGlyph(font, ch) {
  try {
    const g = font.charToGlyph(ch);
    return !!g && g.index !== 0;
  } catch (_) { return false; }
}

/** Elige la fuente concreta para un carácter: principal → emoji → principal (o null). */
function pickFont(char, primary) {
  if (char === ' ' || char === '\t') return primary;
  if (hasGlyph(primary, char)) return primary;
  const emo = emojiFont();
  if (hasGlyph(emo, char)) return emo;
  return null; // sin glifo en ninguna fuente: se omite (nunca un cuadrado)
}

const advanceOf = (font, ch, size) => {
  const glyph = font.charToGlyph(ch);
  const w = glyph && glyph.advanceWidth ? glyph.advanceWidth : font.unitsPerEm * 0.5;
  return (w / font.unitsPerEm) * size;
};

const kerningOf = (font, a, b) => {
  try {
    if (!font.kerningPairs || !hasGlyph(font, a) || !hasGlyph(font, b)) return 0;
    return (font.getKerningValue(font.charToGlyph(a), font.charToGlyph(b)) / font.unitsPerEm);
  } catch (_) { return 0; }
};

// ---- emojis ----
// Los emojis se tratan como UN bloque (👨‍👩‍👧 no se parte por dentro) y se
// miden con la fuente de emojis. Si el generador pasa `emojiImages` (ver
// src/utils/emoji.js) además se dibujan a COLOR como PNG en línea.
const EMOJI_RE = /\p{Extended_Pictographic}|\p{Regional_Indicator}|\u20E3/u;
const ASCII_RE = /^[\x20-\x7e\n\t]*$/;
const segmenter = (typeof Intl !== 'undefined' && Intl.Segmenter)
  ? new Intl.Segmenter('es', { granularity: 'grapheme' })
  : null;

/** Separa el texto en "caracteres visibles" (un emoji compuesto = uno). */
function graphemes(text) {
  const value = String(text ?? '');
  if (ASCII_RE.test(value) || !segmenter) return Array.from(value);
  return Array.from(segmenter.segment(value), s => s.segment);
}

/**
 * Convierte el texto en piezas dibujables: cada una con su fuente.
 * Los emojis salen como una sola pieza ({ emoji: true }) para poder pintarlos
 * como imagen; el resto son caracteres normales, igual que antes.
 */
function tokensOf(text, primary) {
  const out = [];
  for (const g of graphemes(text)) {
    const isEmoji = EMOJI_RE.test(g) && (g.length > 1 || !hasGlyph(primary, g));
    if (isEmoji) {
      const emo = emojiFont();
      const font = hasGlyph(emo, g) ? emo : (hasGlyph(primary, g) ? primary : null);
      out.push({ text: g, font, emoji: true });
      continue;
    }
    for (const ch of g) out.push({ text: ch, font: pickFont(ch, primary) });
  }
  return out;
}

// Los emojis compuestos ocupan un solo bloque, incluso si la fuente no tiene
// el glifo: puede existir una imagen a color para él en la hoja de sprites.
const EMOJI_RATIO = 1.2;
const advanceFor = (font, token, size, horizontalScale = 1, emojiScale = EMOJI_RATIO) => {
  if (token.emoji) return size * emojiScale;
  return font ? advanceOf(font, token.text, size) * horizontalScale : 0;
};

/** Ancho real (en px) de una línea de texto, con letter-spacing y kerning. */
function measure(text, { family = 'sans', weight = 700, size = 48, letterSpacing = 0,
  horizontalScale = 1, emojiScale = EMOJI_RATIO } = {}) {
  const primary = fontFor(family, weight);
  const tokens = tokensOf(text, primary);
  let width = 0;
  let prev = null;
  for (const token of tokens) {
    const font = token.font;
    if (!font && !token.emoji) continue;
    if (font && prev && !prev.emoji && !token.emoji && font === prev.font) {
      width += kerningOf(font, prev.text, token.text) * size * horizontalScale;
    }
    width += advanceFor(font, token, size, horizontalScale, emojiScale) + letterSpacing;
    prev = token;
  }
  return Math.max(0, width - (tokens.length ? letterSpacing : 0));
}

/** Parte el texto en líneas que caben en maxWidth (por palabras, y por letras si hace falta). */
function wrapLines(text, maxWidth, opts = {}) {
  const { maxLines = 6 } = opts;
  const paragraphs = String(text ?? '').replace(/\r/g, '').split('\n');
  let lines = [];
  for (const paragraph of paragraphs) {
    const words = paragraph.split(/\s+/).filter(Boolean);
    if (!words.length) continue;
    let line = '';
    for (let word of words) {
      const candidate = line ? `${line} ${word}` : word;
      if (measure(candidate, opts) <= maxWidth) { line = candidate; continue; }
      if (line) { lines.push(line); line = ''; }
      // palabra más ancha que el área: cortar por caracteres
      if (measure(word, opts) > maxWidth) {
        let piece = '';
        for (const ch of graphemes(word)) {
          if (measure(piece + ch, opts) > maxWidth && piece) { lines.push(piece); piece = ch; }
          else piece += ch;
        }
        line = piece;
      } else {
        line = word;
      }
    }
    if (line) lines.push(line);
  }
  if (!lines.length) lines = [''];
  if (lines.length > maxLines) {
    const kept = lines.slice(0, maxLines);
    kept[kept.length - 1] = `${kept[kept.length - 1].replace(/\s+\S*$/, '')}…`;
    return kept;
  }
  return lines;
}

/**
 * Busca el tamaño de fuente más grande con el que el texto entra en el área.
 * Devuelve { fontSize, lines }.
 */
function fitText(text, { width, height, maxFont = 72, minFont = 14, maxLines = 6, lineHeight = 1.18,
  letterSpacing = 0, family = 'sans', weight = 700, horizontalScale = 1, emojiScale = EMOJI_RATIO } = {}) {
  const opts = { family, weight, letterSpacing, horizontalScale, emojiScale };
  // las palabras no deben partirse: si la más larga no cabe, hay que reducir
  const words = String(text).split(/\s+/).filter(Boolean);
  let best = { fontSize: minFont, lines: wrapLines(text, width, { ...opts, size: minFont, maxLines }) };
  for (let size = Math.round(maxFont); size >= minFont; size -= 1) {
    const lines = wrapLines(text, width, { ...opts, size, maxLines });
    const wordTooWide = words.some(w => measure(w, { ...opts, size }) > width + 0.5);
    const tooWide = wordTooWide || lines.some(l => measure(l, { ...opts, size }) > width + 0.5);
    const totalH = lines.length * size * lineHeight;
    const ellipsized = lines.length && /…$/.test(lines[lines.length - 1]) && lines.length === maxLines;
    if (!tooWide && totalH <= height && !ellipsized) {
      return { fontSize: size, lines };
    }
  }
  return best;
}

/**
 * Construye el atributo `d` (path) de una línea de texto, en coordenadas
 * absolutas. Si la línea tiene emojis y se recibió `emojiImages`, esos emojis
 * salen como imágenes a color en `images` (en vez de un path monocromo).
 */
function lineToPath(line, { family, weight, size, x, baselineY, letterSpacing = 0, emojiImages = null,
  horizontalScale = 1, emojiScale = EMOJI_RATIO, emojiImageScale = emojiScale, emojiOffsetX = 0, emojiOffsetY = emojiScale * 0.87 }) {
  const primary = fontFor(family, weight);
  const tokens = tokensOf(line, primary);
  const parts = [];
  const images = [];
  let cursor = x;
  let prev = null;
  let missing = 0;
  for (const token of tokens) {
    const font = token.font;
    if (!font && !token.emoji) { missing++; continue; }
    if (font && prev && !prev.emoji && !token.emoji && font === prev.font) {
      cursor += kerningOf(font, prev.text, token.text) * size * horizontalScale;
    }
    const advance = advanceFor(font, token, size, horizontalScale, emojiScale);
    if (token.emoji) {
      const href = emojiImages && (emojiImages.get(token.text) || emojiImages.get(token.text.replace(/\uFE0F/g, '')));
      if (href) {
        // La imagen conserva sus proporciones aunque las letras sean condensadas.
        const imageSize = size * emojiImageScale;
        images.push({ href, x: cursor + size * emojiOffsetX, y: baselineY - size * emojiOffsetY, w: imageSize, h: imageSize });
      } else if (font) {
        // Sin imagen: se dibuja el glifo monocromo de NotoEmoji.
        try {
          const d = font.getPath(token.text, cursor, baselineY, size).toPathData(2);
          if (d) parts.push(d);
        } catch (_) { missing++; }
      } else {
        missing++;
      }
    } else if (token.text !== ' ') {
      try {
        const opts = horizontalScale === 1 ? undefined : { xScale: (size / font.unitsPerEm) * horizontalScale };
        const p = font.getPath(token.text, cursor, baselineY, size, opts);
        const d = p.toPathData(2);
        if (d) parts.push(d);
      } catch (_) { /* glifo problemático: se omite */ }
    }
    cursor += advance + letterSpacing;
    prev = token;
  }
  return { d: parts.join(' '), images, advance: cursor - x - letterSpacing, missing };
}

/**
 * Crea una capa SVG (transparente) con el texto ya convertido a paths.
 *
 * @returns {{ svg: Buffer, width: number, height: number, fontSize: number, lines: string[], missing: number }}
 */
function textLayer({
  text = '',
  width,
  height,
  maxFont = 72,
  minFont = 14,
  maxLines = 6,
  family = 'sans',
  weight = 700,
  fill = '#111111',
  lineHeight = 1.18,
  letterSpacing = 0,
  align = 'middle',
  uppercase = false,
  italic = false,
  stroke = null,
  strokeWidth = 0,
  padding = 0,
  offsetX = 0,
  offsetY = 0,
  rotate = 0,
  opacity = 1,
  autoFit = true,
  emojiImages = null,
  horizontalScale = 1,
  emojiScale = EMOJI_RATIO,
  emojiImageScale = emojiScale,
  emojiOffsetX = 0,
  emojiOffsetY = emojiScale * 0.87,
  fontSize: fixedSize = null
}) {
  const W = Math.max(2, Math.round(width));
  const H = Math.max(2, Math.round(height));
  const value = uppercase ? String(text ?? '').toUpperCase() : String(text ?? '');
  const availW = Math.max(8, W - padding * 2);
  const availH = Math.max(8, H - padding * 2);
  const opts = { family, weight, letterSpacing, horizontalScale, emojiScale };

  const fitted = autoFit
    ? fitText(value.trim() ? value : ' ', { ...opts, width: availW, height: availH, maxFont, minFont, maxLines, lineHeight })
    : { fontSize: fixedSize || maxFont, lines: String(value).split('\n') };
  const { fontSize, lines } = fitted;

  const totalH = lines.length * fontSize * lineHeight;
  const firstBaseline = padding + (availH - totalH) / 2 + fontSize * 0.84 + offsetY;

  const paths = [];
  const images = [];
  let missing = 0;
  lines.forEach((line, i) => {
    const lineW = measure(line, { ...opts, size: fontSize });
    let x = padding;
    if (align === 'middle' || align === 'center') x = padding + (availW - lineW) / 2;
    else if (align === 'end' || align === 'right') x = padding + (availW - lineW);
    x += offsetX;
    const res = lineToPath(line, { ...opts, size: fontSize, x, baselineY: firstBaseline + i * fontSize * lineHeight,
      emojiImages, emojiImageScale, emojiOffsetX, emojiOffsetY });
    missing += res.missing;
    if (res.d) paths.push(res.d);
    if (res.images && res.images.length) images.push(...res.images);
  });

  const transform = rotate ? ` transform="rotate(${rotate} ${W / 2} ${H / 2})"` : '';
  const style = [
    `fill="${fill}"`,
    italic ? 'font-style="italic"' : '',
    stroke ? `stroke="${stroke}" stroke-width="${strokeWidth}" paint-order="stroke" stroke-linejoin="round"` : '',
    opacity < 1 ? `opacity="${opacity}"` : ''
  ].filter(Boolean).join(' ');

  const emojiTag = img => `<image x="${img.x.toFixed(2)}" y="${img.y.toFixed(2)}" width="${img.w.toFixed(2)}" height="${img.h.toFixed(2)}" xlink:href="${img.href}"/>`;
  const body = (paths.length ? `<g${transform}><path ${style} d="${paths.join(' ')}"/></g>` : '') +
    (images.length
      ? `<g${transform} opacity="${opacity}">${images.map(emojiTag).join('')}</g>`
      : '');
  const svg = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">` +
    body +
    `</svg>`
  );

  return { svg, width: W, height: H, fontSize, lines, missing };
}

/** Fuentes disponibles (para /docs o depuración). */
function fontInfo() {
  return {
    families: Object.keys(FAMILIES).map(name => ({
      name,
      weights: Object.keys(FAMILIES[name]).map(Number).filter((w, i, arr) => arr.indexOf(w) === i)
    })),
    fallback: FALLBACK_FILES,
    bundled: true
  };
}

module.exports = {
  FAMILIES, FONTS_DIR, resolveFamily, fontFor, fontInfo,
  measure, wrapLines, fitText, textLayer, hasGlyph
};
