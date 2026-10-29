// src/canvas/generators/_helpers.js — Piezas compartidas por los generadores.
//
// Los archivos que empiezan con "_" NO son endpoints: son apoyo. Todo lo que
// varios canvas necesitan (recortes, carteles, huecos, medidores) se define acá
// una sola vez y cada generador lo recibe desde `./_helpers`.
const C = require('../core');
const P = require('../parts');
const L = require('../layouts');

const {
  sharp, loadImageBuffer, txt, imgParam, imageList, parsePercent, normColor, styleOf,
  circleImage, heartImage, textLayer, twemoji, svgPng, chromaInsert, faceCanvas,
  signCanvas, fitLines, gridCollage
} = C;

/**
 * Carga TODAS las imágenes del pedido (1 → la de siempre, N → todas).
 * Si no hay ninguna devuelve `[]` y cada canvas usa su foto predeterminada.
 */
async function loadImages(q, fallbackFile, max = 10) {
  const urls = imageList(q, max);
  const bufs = [];
  for (const url of urls) bufs.push(await loadImageBuffer(url, fallbackFile));
  return bufs;
}

const partsOf = id => L.get(id).parts;

/** Área de una parte de layouts.js ya con los overrides de la query. */
const boxOf = (id, part, q) => P.area(q, part, partsOf(id)[part].box);

/** Color de una parte: override de query > layouts.js. */
const fillOf = (id, part, q, ov) => (ov.fill || P.color(q, part, 'fill', partsOf(id)[part].fill));

/**
 * Cartel con personaje: la zona del cartel y la tipografía vienen de layouts.js.
 * La tipografía se pasa COMPLETA (familia, peso, interlineado, espaciado y
 * minúsculas), así un canvas puede usar exactamente la misma que `brat`.
 */
function signPart(id, q, opts = {}) {
  const parts = partsOf(id);
  const area = P.area(q, 'sign', parts.sign.box);
  const t = P.style(q, 'text', parts.text.font);
  const ov = C.styleOf(q);
  const padFrac = t.pad > 0 ? t.pad : (parts.text.pad ?? 0.06);
  // Mayúsculas: `?uppercase=` manda si viene (así funciona el campo de la web);
  // si no, lo que diga el layout del cartel.
  const upperRaw = q && q.uppercase !== undefined && q.uppercase !== '' ? q.uppercase : null;
  const upper = upperRaw !== null
    ? C.flag(upperRaw)
    : Boolean(parts.text.font.uppercase ?? parts.text.uppercase ?? t.uppercase);
  return C.signCanvas(parts.template, area, q, {
    defaultText: opts.defaultText || 'Welcome to Velirius API',
    imageRadius: parts.sign.radius || 0,
    textOpts: {
      family: t.family,
      weight: t.weight,
      fill: t.fill || opts.fill,
      maxFont: Math.round(parts.text.font.maxFont * t.size),
      maxLines: parts.text.font.maxLines || 4,
      lineHeight: t.lineHeight,
      letterSpacing: t.spacing,
      align: parts.text.font.align || t.align,
      rotate: t.rotate,
      uppercase: upper,
      // posición vertical dentro del cartel (el original no está centrado)
      offsetY: parts.text.offsetY ?? 0,
      // minúsculas por defecto (brat): `?uppercase=true` las desactiva
      lowercase: Boolean(parts.text.lowercase) && !upper,
      padFrac,
      cover: opts.cover === false ? false : parts.text.cover !== false
    }
  });
}

/**
 * Capa de foto para un área de la plantilla: una imagen = recorte normal
 * (cover), varias = grilla con todas (2 arriba / 2 abajo…). Es el atajo para
 * los canvas que colocan la foto con `placeImageArea`.
 */
async function areaLayer(id, part, q, W, H, fotos, opts = {}) {
  const area = boxOf(id, part, q);
  if (!Array.isArray(fotos) || fotos.length < 2) {
    const user = Array.isArray(fotos) ? fotos[0] : fotos;
    return C.placeImageArea(W, H, area, user, opts);
  }
  const w = Math.round((area.x1 - area.x0) * W);
  const h = Math.round((area.y1 - area.y0) * H);
  let collage = await gridCollage(fotos, w, h, { radius: opts.radius ?? 0.02, grayscale: opts.grayscale, zoom: opts.zoom });
  collage = await sharp(collage).flatten({ background: opts.background || '#ffffff' }).png().toBuffer();
  return { input: collage, left: Math.round(area.x0 * W), top: Math.round(area.y0 * H) };
}

/** Foto dentro de un hueco con chroma (arándano, pan, PC, pantalla verde…). */
async function chromaPart(id, q) {
  const parts = partsOf(id);
  const ov = C.styleOf(q);
  // Una o varias fotos: con más de una se arman en grilla dentro del hueco.
  const fotos = await loadImages(q, 'avatar1.jpg');
  const user = fotos.length > 1 ? fotos : (fotos[0] || await C.loadImageBuffer(C.imgParam(q, 'url', 'image', 'img')));
  return C.chromaInsert(parts.template, user, boxOf(id, 'photo', q), {
    zoom: ov.zoom, grayscale: ov.grayscale, rotate: ov.rotate,
    radius: P.num(q, 'photo', 'radius', parts.photo.radius || 0)
  });
}

/** Cara dentro de los huecos de un personaje (rata, banana, minions…). */
async function facePart(id, q) {
  const parts = partsOf(id);
  const holes = Object.keys(parts)
    .filter(k => k.startsWith('hole'))
    .sort()
    .map(k => ({
      cx: P.num(q, k, 'cx', parts[k].cx, 0, 1),
      cy: P.num(q, k, 'cy', parts[k].cy, 0, 1),
      rx: P.num(q, k, 'rx', parts[k].rx, 0.01, 1),
      ry: P.num(q, k, 'ry', parts[k].ry, 0.01, 1)
    }));
  return C.faceCanvas(parts.template, holes, q);
}

// ======================= MEDIDOR (ship / friendship) =======================
// Partes: canvas (lienzo) · title · avatar1/avatar2 · heart · percentage ·
// phrase · name1/name2. Ninguna medida está clavada en el código.
async function meter(kind, q) {
  const ov = styleOf(q);
  const isShip = kind === 'ship';
  const parts = partsOf(kind);
  const W = Math.round(P.num(q, 'canvas', 'width', parts.canvas.width, 200, 3000));
  const H = Math.round(P.num(q, 'canvas', 'height', parts.canvas.height, 200, 3000));
  const bg = ov.bg || P.bg(q, 'canvas', parts.canvas.bg);

  const name1 = String(q.name1 || 'Velirius').slice(0, 20);
  const name2 = String(q.name2 || 'dls').slice(0, 20);
  const pct = parsePercent(q.percentage ?? q.percent ?? q.rank);
  const phrase = String(q.text || 'Best Friends').slice(0, 26);
  const title = String(q.title || (isShip ? 'Medidor de compatibilidad' : 'Medidor de amistad'));
  const accent = ov.fill || parts.title.fill;
  const titleFill = P.color(q, 'title', 'fill', parts.title.fill);
  const scoreFill = P.color(q, 'percentage', 'fill', parts.percentage.fill);
  const phraseFill = P.color(q, 'phrase', 'fill', parts.phrase.fill);

  // Dos fotos: `image1`/`image2`, o la lista (`?images=a,b`) en orden.
  const urls = C.imageList(q);
  const img1 = await loadImageBuffer(imgParam(q, 'image1', 'url1') || urls[0] || '', 'avatar1.jpg');
  const img2 = await loadImageBuffer(imgParam(q, 'image2', 'url2') || urls[1] || '', 'avatar2.jpg');

  const a1 = boxOf(kind, 'avatar1', q);
  const a2 = boxOf(kind, 'avatar2', q);
  const s1 = Math.round(P.num(q, 'avatar1', 'size', parts.avatar1.size) * Math.min(ov.zoom, 1.6));
  const s2 = Math.round(P.num(q, 'avatar2', 'size', parts.avatar2.size) * Math.min(ov.zoom, 1.6));
  const piece1 = isShip ? await heartImage(img1, s1, Math.round(s1 * 0.92)) : await circleImage(img1, s1);
  const piece2 = isShip ? await heartImage(img2, s2, Math.round(s2 * 0.92)) : await circleImage(img2, s2);

  // fondo + adorno (corazón o estrella dibujados con paths, nunca con <text>)
  const hb = boxOf(kind, 'heart', q);
  const hx = (hb.x0 + hb.x1) / 2 * W;
  const hy = (hb.y0 + hb.y1) / 2 * H;
  const hs = Math.min((hb.x1 - hb.x0) * W, (hb.y1 - hb.y0) * H) * 0.5;
  const heartColor = P.color(q, 'heart', 'fill', parts.heart.fill);
  const heartPath = `M${hx} ${hy + hs * 0.55} C${hx - hs * 1.5} ${hy - hs * 0.2} ${hx - hs * 0.75} ${hy - hs * 1.15} ${hx} ${hy - hs * 0.35} C${hx + hs * 0.75} ${hy - hs * 1.15} ${hx + hs * 1.5} ${hy - hs * 0.2} ${hx} ${hy + hs * 0.55}Z`;
  const starPath = (() => {
    const pts = [];
    for (let i = 0; i < 10; i++) {
      const r = i % 2 ? hs * 0.45 : hs;
      const a = -Math.PI / 2 + (i * Math.PI) / 5;
      pts.push(`${(hx + Math.cos(a) * r).toFixed(1)},${(hy + Math.sin(a) * r).toFixed(1)}`);
    }
    return `M${pts.join('L')}Z`;
  })();
  const base = await svgPng(Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">` +
    `<rect width="${W}" height="${H}" fill="${bg}"/>` +
    `<path d="${isShip ? heartPath : starPath}" fill="${heartColor}"/>` +
    `</svg>`
  ));

  const textAt = (text, part, extra = {}) => {
    const a = boxOf(kind, part, q);
    const t = P.style(q, part, parts[part].font);
    const x = Math.round(a.x0 * W);
    const y = Math.round(a.y0 * H);
    const w = Math.max(20, Math.round((a.x1 - a.x0) * W));
    const h = Math.max(14, Math.round((a.y1 - a.y0) * H));
    const size = Math.round(parts[part].font.maxFont * t.size * ov.scale);
    return {
      input: textLayer({
        text, width: w, height: h, family: t.family, weight: t.weight,
        maxFont: size, minFont: Math.max(8, Math.round(size * 0.4)),
        maxLines: parts[part].font.maxLines || 1,
        letterSpacing: t.spacing + (ov.spacing || 0),
        fill: extra.fill || P.color(q, part, 'fill', parts[part].fill),
        align: extra.align || parts[part].align || 'middle',
        uppercase: t.uppercase, rotate: t.rotate
      }).svg,
      left: x, top: y
    };
  };

  const layers = [
    { input: piece1, left: Math.round(((a1.x0 + a1.x1) / 2) * W - s1 / 2), top: Math.round(((a1.y0 + a1.y1) / 2) * H - s1 / 2) },
    { input: piece2, left: Math.round(((a2.x0 + a2.x1) / 2) * W - s2 / 2), top: Math.round(((a2.y0 + a2.y1) / 2) * H - s2 / 2) },
    textAt(title, 'title', { fill: titleFill }),
    textAt(`~${pct}%~`, 'percentage', { fill: scoreFill }),
    textAt(phrase, 'phrase', { fill: phraseFill }),
    textAt(name1, 'name1'),
    textAt(name2, 'name2')
  ];
  if (!isShip) {
    const thumb = await twemoji('1f44d');
    if (thumb) layers.push({ input: await sharp(thumb).resize(Math.round(hs * 0.9), Math.round(hs * 0.9)).png().toBuffer(), left: Math.round(hx - hs * 0.45), top: Math.round(hy - hs * 0.55) });
  }
  void accent;
  return sharp(base).composite(layers).png().toBuffer();
}


// ======================= CAPTION (pov: / x:) =======================
/**
 * Texto tipo meme sobre una imagen: `pov: …` o `x: …`.
 *
 * La imagen (o la foto por defecto) se escala sin recortar y el texto se dibuja
 * arriba, centrado, con contorno negro para que se lea sobre cualquier foto.
 * Todo sale de layouts.js: `canvas` (tamaño máximo) y `text` (caja, tipografía,
 * color y grosor del contorno).
 */
async function captionPart(id, q, prefix) {
  const parts = partsOf(id);
  const ov = styleOf(q);
  const maxW = Math.round(P.num(q, 'canvas', 'width', parts.canvas.maxWidth, 200, 2048));
  const maxH = Math.round(P.num(q, 'canvas', 'height', parts.canvas.maxHeight, 200, 2600));
  const fotos = await loadImages(q, 'avatar1.jpg');
  // Con varias fotos se arma una grilla (2 arriba, 2 abajo…) antes del texto.
  let raw;
  if (fotos.length > 1) {
    raw = await gridCollage(fotos, maxW, Math.round(maxW * 0.75), { radius: 0.02 });
    raw = await sharp(raw).flatten({ background: '#ffffff' }).png().toBuffer();
  } else {
    raw = fotos[0] || await loadImageBuffer(imgParam(q, 'image', 'url', 'img'));
  }
  const base = await sharp(raw)
    .rotate()
    .resize({ width: maxW, height: maxH, fit: 'inside', withoutEnlargement: false })
    .png()
    .toBuffer();
  const meta = await sharp(base).metadata();
  const W = meta.width || maxW;
  const H = meta.height || maxH;

  const box = boxOf(id, 'text', q);
  const t = P.style(q, 'text', parts.text.font);
  const fill = ov.fill || P.color(q, 'text', 'fill', parts.text.fill);
  const strokeColor = P.color(q, 'text', 'stroke', parts.text.stroke.color);
  const strokeW = P.num(q, 'text', 'stroke', parts.text.stroke.width, 0, 0.2);
  const pad = Math.round(Math.min(W, H) * 0.045);

  // El texto puede traer saltos de línea (`\n` reales o literales): se respetan,
  // así los memes tipo "x:" quedan en varias líneas como se escribieron.
  const srcLines = String(txt(q, '') || '')
    .replace(/\\n/g, '\n')
    .split('\n')
    .map(l => l.replace(/\s+/g, ' ').trim());
  while (srcLines.length > 1 && !srcLines[srcLines.length - 1]) srcLines.pop();
  const body = [`${prefix} ${srcLines[0] || ''}`.trim(), ...srcLines.slice(1)].join('\n');
  const boxW = Math.round((box.x1 - box.x0) * W);
  const boxH = Math.round((box.y1 - box.y0) * H);

  const fit = fitLines(body, {
    width: boxW - pad * 2,
    height: boxH - pad * 2,
    maxFont: Math.round(parts.text.font.maxFont * t.size * ov.scale),
    minFont: 14,
    lineHeight: t.lineHeight,
    family: ov.font || t.family,
    weight: t.weight,
    letterSpacing: t.spacing + (ov.spacing || 0),
    maxLines: parts.text.font.maxLines || 5
  });

  const layer = textLayer({
    text: fit.lines.join('\n'),
    width: boxW,
    height: boxH,
    family: ov.font || t.family,
    weight: t.weight,
    fontSize: fit.size,
    autoFit: false,
    maxFont: fit.size,
    minFont: 14,
    maxLines: fit.lines.length,
    lineHeight: t.lineHeight,
    letterSpacing: t.spacing + (ov.spacing || 0),
    fill,
    align: 'middle',
    padding: 0,
    stroke: strokeColor,
    strokeWidth: Math.max(2, Math.round(fit.size * strokeW)),
    rotate: t.rotate + (ov.rotate || 0),
    offsetX: Math.round(ov.dx * W),
    offsetY: Math.round(ov.dy * H)
  });

  return sharp(base)
    .composite([{
      input: layer.svg,
      left: Math.round(box.x0 * W),
      top: Math.round(box.y0 * H)
    }])
    .png()
    .toBuffer();
}

module.exports = {
  ...C,
  P, L, partsOf, boxOf, fillOf, signPart, chromaPart, facePart, meter, captionPart,
  loadImages, areaLayer
};
