// src/utils/image.js — Utilidades de imagen (sharp + SVG) para los Canvas
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const { fetchBuffer } = require('./http');
const { currentRequest } = require('./requestContext');

const ROOT = path.join(__dirname, '..', '..');
const TEMPLATES_DIR = path.join(ROOT, 'assets', 'templates');
const DEFAULTS_DIR = path.join(ROOT, 'assets', 'defaults');

const imageCache = new Map();
const MAX_CACHE = 30;
const CACHE_TTL = 5 * 60 * 1000;

function escapeXml(s = '') {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

function wrapText(text, maxChars = 18, maxLines = 4) {
  const words = String(text || '').replace(/\s+/g, ' ').trim().split(' ').filter(Boolean);
  if (!words.length) return [''];
  const lines = [];
  let line = '';
  for (const w of words) {
    const word = w.length > maxChars ? w.slice(0, maxChars) : w;
    const test = line ? `${line} ${word}` : word;
    if (test.length <= maxChars) line = test;
    else { if (line) lines.push(line); line = word; if (lines.length >= maxLines) break; }
  }
  if (line && lines.length < maxLines) lines.push(line);
  if (lines.length > maxLines) lines.length = maxLines;
  if (words.join(' ').length > lines.join(' ').length && lines.length) {
    lines[lines.length - 1] = lines[lines.length - 1].replace(/…?$/, '…');
  }
  return lines;
}

const MAX_IMAGE_BYTES = 15 * 1024 * 1024;
const MAX_IMAGE_PIXELS = 40 * 1000 * 1000;
const IMAGE_FORMATS = new Set(['jpeg', 'png', 'webp', 'gif', 'heif', 'tiff']);

async function validateImageBuffer(buffer) {
  if (!buffer?.length || buffer.length > MAX_IMAGE_BYTES) throw imagenError('Imagen vacía o demasiado grande', 'Máximo 15 MB');
  try {
    const img = sharp(buffer, { limitInputPixels: MAX_IMAGE_PIXELS, failOn: 'error' });
    const meta = await img.metadata();
    if (!IMAGE_FORMATS.has(meta.format) || !meta.width || !meta.height || meta.width * meta.height > MAX_IMAGE_PIXELS ||
        (meta.format === 'heif' && meta.compression !== 'av1')) throw new Error('formato o dimensiones no permitidos');
    // metadata() sólo lee la cabecera; stats() también detecta archivos truncados.
    await img.stats();
    return meta;
  } catch (_) {
    throw imagenError('El archivo no es una imagen válida o supera el límite de dimensiones', 'Usá JPEG, PNG, WebP, GIF, AVIF o TIFF (máx. 40 megapíxeles)');
  }
}

function localImage(raw) {
  const ctx = currentRequest();
  if (!ctx) return null;
  let url;
  try { url = new URL(raw); } catch (_) { return null; }
  if (!ctx.hosts.includes(url.host.toLowerCase())) return null;
  const upload = url.pathname.match(/^\/upload\/([a-f0-9]+)\/?$/i);
  if (upload) {
    const file = require('./uploadStore').get(upload[1]);
    if (!file) throw imagenError('Esa imagen ya no está disponible', 'Las subidas duran 30 minutos: vuelve a subirla');
    return file.buffer;
  }
  if (['/img/default-avatar.jpg', '/img/default-avatar2.jpg'].includes(url.pathname)) {
    return fs.readFileSync(path.join(ROOT, 'public', url.pathname.slice(1)));
  }
  return null;
}

async function loadImageBuffer(url, fallbackFile = 'avatar1.jpg') {
  // Algunos generadores usan una sola ranura. Si se mandan varias fotos,
  // también reciben una grilla en lugar de concatenar URLs inválidas.
  const inputs = Array.isArray(url) ? url : (typeof url === 'string' && !/^\s*data:/i.test(url) ? url.split(/[,;|\r\n]+/) : [url]);
  const images = inputs.map(v => String(v ?? '').trim()).filter(Boolean).slice(0, 10);
  if (images.length > 1) {
    const buffers = await Promise.all(images.map(value => loadImageBuffer(value, fallbackFile)));
    const cols = Math.ceil(Math.sqrt(buffers.length));
    const rows = Math.ceil(buffers.length / cols);
    const width = 1024, height = 1024;
    const pieces = await Promise.all(buffers.map(async (buffer, i) => {
      const left = Math.floor((i % cols) * width / cols), top = Math.floor(Math.floor(i / cols) * height / rows);
      const right = Math.floor(((i % cols) + 1) * width / cols), bottom = Math.floor((Math.floor(i / cols) + 1) * height / rows);
      return { input: await sharp(buffer).rotate().resize(right - left, bottom - top, { fit: 'cover' }).png().toBuffer(), left, top };
    }));
    return sharp({ create: { width, height, channels: 4, background: '#ffffff' } }).composite(pieces).png().toBuffer();
  }
  const raw = normalizeImageUrl(images[0] || '');
  // Sin imagen elegida → foto predeterminada (comportamiento normal del canvas).
  if (!raw) return fs.readFileSync(path.join(DEFAULTS_DIR, fallbackFile));
  if (/^data:/i.test(raw)) {
    const match = /^data:image\/[\w.+-]+;base64,([\s\S]+)$/i.exec(raw);
    if (!match) throw imagenError('La imagen enviada no es un data URL válido', 'Usá data:image/…;base64,…');
    const encoded = match[1].replace(/\s+/g, '');
    if (!/^[a-z0-9+/]*={0,2}$/i.test(encoded) || encoded.length % 4 === 1) {
      throw imagenError('La imagen no es base64 válido', 'Revisá el archivo o volvé a subirlo');
    }
    const buf = Buffer.from(encoded, 'base64');
    await validateImageBuffer(buf);
    return buf;
  }
  if (!/^https?:\/\//i.test(raw)) {
    // Se pidió una imagen pero no es una URL válida: antes caía en silencio a la
    // foto predeterminada y parecía que el parámetro no hacía nada.
    throw imagenError(
      `La imagen no es una URL válida: "${raw.slice(0, 60)}"`,
      'Usa un link que empiece con http:// o https://, o sube la foto desde Galería'
    );
  }
  const own = localImage(raw);
  if (own) return own;
  // Las subidas caducan a los 30 minutos: nunca conservar una copia de ellas.
  const isUpload = /^\/upload\/[a-f0-9]+\/?$/i.test(new URL(raw).pathname);
  const cached = !isUpload && imageCache.get(raw);
  if (cached && Date.now() - cached.at < CACHE_TTL) return cached.buffer;
  imageCache.delete(raw);
  let buf;
  try {
    buf = await fetchBuffer(raw, { timeoutMs: 15000, maxBytes: 15 * 1024 * 1024, publicOnly: true });
  } catch (e) {
    throw imagenError(
      `No se pudo descargar la imagen (${e.message})`,
      'Revisa que el link sea público y directo a la imagen (.jpg, .png…)'
    );
  }
  await validateImageBuffer(buf);
  if (!isUpload) imageCache.set(raw, { buffer: buf, at: Date.now() });
  while (imageCache.size > MAX_CACHE) imageCache.delete(imageCache.keys().next().value);
  return buf;
}

/** Limpia el valor y completa el esquema cuando pegan `ejemplo.com/foto.jpg`. */
function normalizeImageUrl(value) {
  let raw = String(value ?? '').trim();
  if (!raw) return '';
  // Comillas o paréntesis que se cuelan al copiar y pegar.
  raw = raw.replace(/^[<("'\s]+|[>"')\s]+$/g, '');
  if (/^data:/i.test(raw)) return raw;
  if (raw.startsWith('//')) return `https:${raw}`;
  if (/^https?:\/\//i.test(raw)) return raw;
  // Sin esquema pero con pinta de dominio o host:puerto → http para hosts locales,
  // https para todo lo demás. Así `ejemplo.com/foto.jpg` también funciona.
  if (/^[\w.-]+(:\d+)?(\/|$|\?)/.test(raw) && /[./:]/.test(raw)) {
    const host = raw.split('/')[0].split(':')[0].toLowerCase();
    const local = host === 'localhost' || host === '127.0.0.1' || host === '0.0.0.0' || host.endsWith('.local');
    return `${local ? 'http' : 'https'}://${raw}`;
  }
  return raw;
}

/** Error "de usuario" (400) con pista, para no confundirlo con una falla del server. */
function imagenError(message, hint) {
  const err = new Error(message);
  err.status = 400;
  err.hint = hint;
  return err;
}

function templateBuffer(name) {
  return fs.readFileSync(path.join(TEMPLATES_DIR, name));
}

async function templateMeta(name) {
  const buf = templateBuffer(name);
  const meta = await sharp(buf).metadata();
  return { buf, width: meta.width, height: meta.height };
}

/** SVG de texto centrado multilinea. Devuelve buffer SVG listo para composite/raster. */
function textSvg({ width, height, lines, fontSize = 48, fill = '#111111', fontFamily = 'DejaVu Sans, Arial, sans-serif', fontWeight = '700', lineHeight = 1.15, anchor = 'middle', x = null, startY = null, stroke = null, strokeWidth = 0, letterSpacing = 0, uppercase = false }) {
  const cx = x === null ? width / 2 : x;
  const totalH = lines.length * fontSize * lineHeight;
  const y0 = startY === null ? (height - totalH) / 2 + fontSize * 0.85 : startY;
  const tspans = lines.map((ln, i) =>
    `<text x="${cx}" y="${Math.round(y0 + i * fontSize * lineHeight)}" text-anchor="${anchor}" font-family="${fontFamily}" font-weight="${fontWeight}" font-size="${fontSize}" letter-spacing="${letterSpacing}" fill="${fill}"${stroke ? ` stroke="${stroke}" stroke-width="${strokeWidth}" paint-order="stroke"` : ''}>${escapeXml(uppercase ? String(ln).toUpperCase() : ln)}</text>`
  ).join('');
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${tspans}</svg>`);
}

function svgBuffer(svg) { return Buffer.from(svg); }

async function svgToPng(svgBuf, width) {
  let pipe = sharp(svgBuf);
  if (width) pipe = pipe.resize(width);
  return pipe.png().toBuffer();
}

/** Imagen de usuario recortada cover a w×h (PNG). Opciones: circle, radius, rotate, grayscale, negate. */
async function shapedImage(userBuf, w, h, { circle = false, radius = 0, rotate = 0, grayscale = false, zoom = 1 } = {}) {
  let img = sharp(userBuf).rotate();
  if (grayscale) img = img.grayscale();
  const W = Math.max(2, Math.round(w));
  const H = Math.max(2, Math.round(h));
  // zoom 1 = la foto llena el hueco (recorte centrado). Arriba de 1 acerca.
  // Menos de 1 dejaría huecos transparentes dentro del marco, así que se limita.
  const z = Math.max(1, Math.min(4, Number(zoom) || 1));
  if (rotate) img = sharp(await img.png().toBuffer()).rotate(rotate, { background: { r: 0, g: 0, b: 0, alpha: 0 } });
  let resized = await img.resize(Math.max(2, Math.round(W * z)), Math.max(2, Math.round(H * z)), { fit: 'cover', position: 'centre' }).png().toBuffer();
  if (Math.abs(z - 1) > 0.001) {
    const meta = await sharp(resized).metadata();
    const cw = Math.min(W, meta.width), ch = Math.min(H, meta.height);
    resized = await sharp(resized)
      .extract({ left: Math.round((meta.width - cw) / 2), top: Math.round((meta.height - ch) / 2), width: cw, height: ch })
      .png().toBuffer();
  }
  if (circle || radius > 0) {
    const meta = await sharp(resized).metadata();
    const W = meta.width, H = meta.height;
    const rx = circle ? Math.min(W, H) / 2 : radius;
    const mask = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><rect x="0" y="0" width="${W}" height="${H}" rx="${rx}" ry="${rx}" fill="#fff"/></svg>`);
    resized = await sharp(resized).composite([{ input: mask, blend: 'dest-in' }]).png().toBuffer();
  }
  return resized;
}

async function circleImage(userBuf, size) {
  return shapedImage(userBuf, size, size, { circle: true });
}

async function heartImage(userBuf, w, h) {
  const resized = await sharp(userBuf).rotate().resize(Math.round(w), Math.round(h), { fit: 'cover' }).png().toBuffer();
  const heart = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${Math.round(w)}" height="${Math.round(h)}" viewBox="0 0 100 92"><path d="M50 86 C20 62 4 44 4 28 C4 13 15 4 27 4 C37 4 46 10 50 19 C54 10 63 4 73 4 C85 4 96 13 96 28 C96 44 80 62 50 86Z" fill="#fff"/></svg>`
  );
  return sharp(resized).composite([{ input: heart, blend: 'dest-in' }]).png().toBuffer();
}

/** Texto ajustado a un área: reduce fuente hasta que entran las líneas (sin cortar palabras). */
function fitTextLines(text, areaW, areaH, { maxFont = 64, minFont = 16, maxLines = 5, charWidthRatio = 0.58 } = {}) {
  const longestWord = String(text || '').split(/\s+/).reduce((m, w) => Math.max(m, w.length), 1);
  let font = maxFont;
  while (font > minFont) {
    const maxChars = Math.max(4, Math.floor(areaW / (font * charWidthRatio)));
    if (maxChars < longestWord) { font -= 4; continue; }
    const lines = wrapText(text, maxChars, maxLines + 2);
    if (lines.length <= maxLines && lines.length * font * 1.18 <= areaH) return { lines, fontSize: font };
    font -= 4;
  }
  const maxChars = Math.max(4, Math.floor(areaW / (minFont * charWidthRatio)));
  return { lines: wrapText(text, maxChars, maxLines), fontSize: minFont };
}

function hexToRgb(hex, fallback = '#ffffff') {
  let h = String(hex || fallback).replace('#', '').trim();
  if (/^[0-9a-fA-F]{3}$/.test(h)) h = h.split('').map(c => c + c).join('');
  if (!/^[0-9a-fA-F]{6}$/.test(h)) h = String(fallback).replace('#', '');
  return { r: parseInt(h.slice(0, 2), 16), g: parseInt(h.slice(2, 4), 16), b: parseInt(h.slice(4, 6), 16) };
}

module.exports = {
  sharp, escapeXml, wrapText, loadImageBuffer, validateImageBuffer, templateBuffer, templateMeta,
  textSvg, svgBuffer, svgToPng, shapedImage, circleImage, heartImage, fitTextLines, hexToRgb,
  TEMPLATES_DIR, DEFAULTS_DIR
};
