// src/canvas/core.js — Motor compartido de los canvas.
// Aquí viven los helpers de parámetros y las piezas reutilizables (texto, foto,
// chroma-key, huecos de las plantillas, borrado del texto de ejemplo…).
// Los canvas concretos viven en src/canvas/generators/<id>.js (un archivo por
// canvas) y sus medidas en src/canvas/layouts.js.
//
// ➕ Guía para agregar un canvas: CONTRIBUTING.md → "Agregar un canvas nuevo".
const {
  sharp, loadImageBuffer, templateMeta, shapedImage, circleImage, heartImage
} = require('../utils/image');
const { textLayer, measure, wrapLines } = require('../utils/textEngine');
const { fetchBuffer } = require('../utils/http');

// ---------- helpers de parámetros ----------
const txt = (q, fallback) => {
  const v = String(q.text ?? q.txt ?? '').trim();
  return v || fallback;
};
const imgParam = (q, ...names) => {
  for (const n of names) {
    const value = q[n];
    if (Array.isArray(value)) {
      const values = value.map(v => String(v ?? '').trim()).filter(Boolean);
      if (values.length) return values;
    } else {
      const v = String(value ?? '').trim();
      if (v) return v;
    }
  }
  return '';
};
/**
 * Todas las imágenes del pedido, en orden y sin repetir.
 *
 * Acepta `image`, `url`, `img`, `avatar` (si vienen repetidos en la query
 * Express los entrega como array), los numerados `image1…image9` / `url1…` /
 * `avatar1…`, y las listas `images`, `urls` o `imagenes` separadas por coma,
 * punto y coma, barra vertical o salto de línea.
 *
 *   /canvas/canvaimagen?images=https://a.jpg,https://b.jpg
 *   /canvas/pov?image=https://a.jpg&image=https://b.jpg&image=https://c.jpg
 *
 * Con una sola imagen todo funciona igual que siempre.
 */
function imageList(q = {}, max = 10) {
  const out = [];
  const push = v => {
    if (v === undefined || v === null) return;
    if (Array.isArray(v)) return v.forEach(push);
    if (typeof v === 'object') return;
    // Ojo: una imagen de la galería (`data:image/png;base64,AAA…`) lleva comas
    // y punto y coma dentro, así que nunca se parte.
    String(v).split(/[\n\r|]+/).forEach(trozo => {
      const partes = /^\s*data:/i.test(trozo) ? [trozo] : trozo.split(/[,;]+/);
      partes.forEach(pieza => {
        const url = pieza.trim();
        if (url) out.push(url);
      });
    });
  };
  for (const key of ['image', 'url', 'img', 'avatar', 'images', 'urls', 'imagenes']) push(q[key]);
  for (const base of ['image', 'url', 'img', 'avatar']) {
    for (let i = 1; i <= 9; i++) push(q[`${base}${i}`]);
  }
  // `photos=3` (o cualquier lista repetida) también vale.
  const unicas = [];
  for (const url of out) if (!unicas.includes(url)) unicas.push(url);
  return unicas.slice(0, max);
}

const numberIn = (v, def, min, max) => {
  const n = parseFloat(v);
  if (!Number.isFinite(n)) return def;
  return Math.max(min, Math.min(max, n));
};
const flag = v => ['true', '1', 'yes', 'si', 'sí', 'on'].includes(String(v ?? '').toLowerCase());
const parsePercent = v => {
  if (v === undefined || v === null || String(v).trim() === '') return Math.floor(Math.random() * 101);
  const n = parseInt(v, 10);
  return Number.isNaN(n) ? Math.floor(Math.random() * 101) : Math.max(0, Math.min(100, n));
};

const NAMED_COLORS = ['white', 'black', 'red', 'green', 'blue', 'yellow', 'pink', 'purple', 'orange', 'gray', 'grey', 'gold', 'cyan', 'magenta', 'brown', 'navy', 'teal', 'lime', 'silver', 'maroon', 'olive', 'transparent'];
function normColor(value, fallback = null) {
  const raw = String(value ?? '').trim();
  if (!raw) return fallback;
  const lower = raw.toLowerCase();
  if (NAMED_COLORS.includes(lower)) return lower;
  let hex = lower.replace(/^#/, '');
  if (/^[0-9a-f]{3}$/.test(hex)) hex = hex.split('').map(c => c + c).join('');
  if (/^[0-9a-f]{6}$/.test(hex)) return `#${hex}`;
  if (/^[0-9a-f]{8}$/.test(hex)) return `#${hex.slice(0, 6)}`;
  return fallback;
}

/** Lee todos los overrides de estilo del query string. */
function styleOf(q = {}) {
  return {
    fill: normColor(q.color ?? q.fill ?? q.textcolor ?? q.fontcolor, null),
    bg: normColor(q.bg ?? q.background, null),
    scale: numberIn(q.size ?? q.scale ?? q.fontsize, 1, 0.2, 3),
    dx: numberIn(q.x, 0, -100, 100) / 100,
    dy: numberIn(q.y, 0, -100, 100) / 100,
    rotate: numberIn(q.rotate ?? q.rot, 0, -180, 180),
    font: String(q.font ?? '').toLowerCase(),
    uppercase: flag(q.uppercase ?? q.mayusculas),
    spacing: numberIn(q.spacing ?? q.letterspacing ?? q.tracking, 0, -50, 200),
    zoom: numberIn(q.zoom, 1, 0.2, 4),
    grayscale: flag(q.grayscale ?? q.blanconegro),
    opacity: numberIn(q.opacity, 0.45, 0, 1),
    shadow: flag(q.shadow ?? q.sombra)
  };
}

// ---------- piezas de imagen ----------

/** Sombra interior suave para que la foto se integre en la plantilla. */
function innerShade(w, h, shape = 'ellipse') {
  const W = Math.max(2, Math.round(w));
  const H = Math.max(2, Math.round(h));
  const blur = Math.max(1.5, Math.min(W, H) * 0.05);
  const stroke = Math.max(2, Math.min(W, H) * 0.09);
  const el = shape === 'rect'
    ? `<rect x="0" y="0" width="${W}" height="${H}" fill="none" stroke="#000000" stroke-opacity="0.5" stroke-width="${stroke}" filter="url(#b)"/>`
    : `<ellipse cx="${W / 2}" cy="${H / 2}" rx="${W / 2 - stroke / 3}" ry="${H / 2 - stroke / 3}" fill="none" stroke="#000000" stroke-opacity="0.5" stroke-width="${stroke}" filter="url(#b)"/>`;
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">` +
    `<defs><filter id="b" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="${blur.toFixed(2)}"/></filter></defs>` +
    el + `</svg>`
  );
}

/**
 * Reemplazo por chroma-key: pinta la foto del usuario SOLO donde la plantilla es verde
 * (pantallas verdes y círculos verde/lima). Pixel-perfect con la forma original.
 */
/**
 * Varias fotos en un mismo hueco: se arma una grilla (cover, con un pequeño
 * margen) para que **todas** aparezcan. Con una sola imagen devuelve null y el
 * llamador sigue con el recorte normal.
 */
async function gridCollage(bufs, w, h, opts = {}) {
  const lista = (bufs || []).filter(Boolean);
  if (lista.length < 2) return null;
  const W = Math.max(2, Math.round(w)), H = Math.max(2, Math.round(h));
  const n = lista.length;
  // Columnas: cuadradas para 2-4 fotos; en tiras largas manda el aspecto.
  const cols = n <= 4 ? Math.ceil(Math.sqrt(n)) : Math.max(1, Math.min(n, Math.ceil(Math.sqrt(n * (W / H)))));
  const filas = [];
  for (let i = 0; i < n; i += cols) filas.push(Math.min(cols, n - i));
  const gap = Math.max(0, Math.round(Math.min(W, H) * (opts.gap ?? 0.02)));
  const alto = Math.floor((H - gap * (filas.length + 1)) / filas.length);
  const piezas = [];
  let y = gap;
  for (let r = 0; r < filas.length; r++) {
    const cuantas = filas[r];
    // La última fila se reparte a lo ancho: nunca queda un hueco vacío.
    const cw = Math.floor((W - gap * (cuantas + 1)) / cuantas);
    const radius = Math.round(Math.min(cw, alto) * (opts.radius ?? 0.06));
    for (let c = 0; c < cuantas; c++) {
      const idx = r * cols + c;
      const piece = await shapedImage(lista[idx], cw, alto, {
        zoom: opts.zoom ?? 1,
        rotate: opts.rotate ?? 0,
        grayscale: !!opts.grayscale,
        radius
      });
      piezas.push({ input: piece, left: gap + c * (cw + gap), top: y });
    }
    y += alto + gap;
  }
  const fondo = await sharp({ create: { width: W, height: H, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .png().toBuffer();
  return sharp(fondo).composite(piezas).png().toBuffer();
}

async function chromaInsert(file, userBuf, bbox = { x0: 0, y0: 0, x1: 1, y1: 1 }, opts = {}) {
  // Varias fotos → grilla dentro del mismo hueco (todas aparecen).
  const varias = Array.isArray(userBuf);
  const { buf, width: W, height: H } = await templateMeta(file);
  const { data, info } = await sharp(buf).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const x0 = Math.round(bbox.x0 * W), y0 = Math.round(bbox.y0 * H);
  const x1 = Math.round(bbox.x1 * W), y1 = Math.round(bbox.y1 * H);
  const bw = Math.max(2, x1 - x0), bh = Math.max(2, y1 - y0);
  const maskRaw = Buffer.alloc(bw * bh * 4);
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const i = (y * info.width + x) * info.channels;
      const r = data[i], g = data[i + 1], b = data[i + 2];
      const o = ((y - y0) * bw + (x - x0)) * 4;
      maskRaw[o] = 255; maskRaw[o + 1] = 255; maskRaw[o + 2] = 255;
      maskRaw[o + 3] = (g > 135 && g > r * 1.22 && g > b * 1.22) ? 255 : 0;
    }
  }
  // Suaviza el borde y refuerza el alfa para tapar el filo verde del JPEG
  const mask = await sharp(maskRaw, { raw: { width: bw, height: bh, channels: 4 } })
    .blur(1).linear([1, 1, 1, 1.7], [0, 0, 0, 8]).png().toBuffer();
  const radius = opts.radius ? Math.round(bw * Number(opts.radius)) : 0;
  // En el hueco con chroma la grilla va a sangre (sin separación): cualquier
  // borde dejaría ver el verde de la plantilla por detrás.
  let userPiece = varias
    ? await gridCollage(userBuf, bw, bh, { radius: 0, gap: 0, grayscale: opts.grayscale, zoom: opts.zoom })
    : await shapedImage(userBuf, bw, bh, {
      zoom: opts.zoom ?? 1,
      rotate: opts.rotate ?? 0,
      grayscale: !!opts.grayscale,
      radius
    });
  userPiece = await sharp(userPiece)
    .composite([{ input: innerShade(bw, bh, radius ? 'rect' : 'ellipse'), blend: 'atop' }])
    .png().toBuffer();
  const masked = await sharp(userPiece).composite([{ input: mask, blend: 'dest-in' }]).png().toBuffer();
  return sharp(buf).composite([{ input: masked, left: x0, top: y0 }]).png().toBuffer();
}

async function ellipseImage(userBuf, w, h, opts = {}) {
  const W = Math.max(2, Math.round(w)), H = Math.max(2, Math.round(h));
  let piece = await shapedImage(userBuf, W, H, {
    zoom: opts.zoom ?? 1,
    rotate: opts.rotate ?? 0,
    grayscale: !!opts.grayscale
  });
  piece = await sharp(piece)
    .composite([{ input: innerShade(W, H, 'ellipse'), blend: 'atop' }])
    .png().toBuffer();
  const mask = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><ellipse cx="${W / 2}" cy="${H / 2}" rx="${W / 2}" ry="${H / 2}" fill="#fff"/></svg>`);
  return sharp(piece).composite([{ input: mask, blend: 'dest-in' }]).png().toBuffer();
}

/** Coloca imagen (cover) en un área fraccional de la plantilla. */
async function placeImageArea(W, H, area, userBuf, opts = {}) {
  const w = (area.x1 - area.x0) * W, h = (area.y1 - area.y0) * H;
  const piece = await shapedImage(userBuf, w, h, {
    radius: opts.radius ?? 0,
    rotate: opts.rotate ?? 0,
    grayscale: !!opts.grayscale,
    zoom: opts.zoom ?? 1
  });
  const meta = await sharp(piece).metadata();
  const left = Math.round(area.x0 * W + (w - meta.width) / 2);
  const top = Math.round(area.y0 * H + (h - meta.height) / 2);
  return { input: piece, left, top };
}


/**
 * Inserta la foto del usuario **con la forma exacta del hueco** de la plantilla.
 * Detecta las zonas blancas encerradas (el face-swap de los originales), arma una
 * máscara suavizada y coloca la foto solo ahí: la forma queda idéntica al dibujo
 * (orejas, pelos, contornos) en vez de una elipse aproximada.
 */
async function holeMask(file, bbox, opts = {}) {
  const { buf, width: W, height: H } = await templateMeta(file);
  const clampX = value => Math.max(0, Math.min(W, Math.round(value * W)));
  const clampY = value => Math.max(0, Math.min(H, Math.round(value * H)));
  const x0 = clampX(bbox.x0), y0 = clampY(bbox.y0);
  const x1 = clampX(bbox.x1), y1 = clampY(bbox.y1);
  const bw = x1 - x0, bh = y1 - y0;
  // Un desplazamiento puede sacar completamente el hueco de la plantilla.
  if (bw < 4 || bh < 4) return null;
  const N = bw * bh;

  // 1) Se difumina el recorte: los hilos de pelo / brillos de 1-2 px dejan de
  //    comunicar el hueco con el fondo blanco de la plantilla.
  const soft = await sharp(buf)
    .extract({ left: x0, top: y0, width: bw, height: bh })
    .blur(Math.max(2, Math.min(bw, bh) * 0.02))
    .ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const C = soft.info.channels;
  const px = soft.data;

  const white = new Uint8Array(N);
  for (let i = 0, p = 0; i < N; i++, p += C) {
    const r = px[p], g = px[p + 1], b = px[p + 2];
    const mn = Math.min(r, g, b), mx = Math.max(r, g, b);
    white[i] = (mn > (opts.whiteMin ?? 232) && mx - mn < (opts.whiteTol ?? 16)) ? 1 : 0;
  }

  // 2) Blanco conectado al borde del recorte = fondo de la plantilla
  const bg = new Uint8Array(N);
  const stack = [];
  for (let x = 0; x < bw; x++) { stack.push(x, (bh - 1) * bw + x); }
  for (let y = 0; y < bh; y++) { stack.push(y * bw, y * bw + bw - 1); }
  while (stack.length) {
    const p = stack.pop();
    if (bg[p] || !white[p]) continue;
    bg[p] = 1;
    const x = p % bw, y = (p - x) / bw;
    if (x > 0) stack.push(p - 1);
    if (x < bw - 1) stack.push(p + 1);
    if (y > 0) stack.push(p - bw);
    if (y < bh - 1) stack.push(p + bw);
  }

  // 3) Componentes blancas interiores. Con elipse guía se suman TODAS las que caen
  //    dentro (recoge los restos que deja el pelo); sin guía, solo la mayor.
  const label = new Int32Array(N);
  const comps = [];
  let cur = 0;
  for (let idx = 0; idx < N; idx++) {
    if (!white[idx] || bg[idx] || label[idx]) continue;
    cur++;
    const st = [idx]; label[idx] = cur;
    const cells = [];
    while (st.length) {
      const p = st.pop(); cells.push(p);
      const x = p % bw, y = (p - x) / bw;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= bw || ny >= bh) continue;
        const ni = ny * bw + nx;
        if (white[ni] && !bg[ni] && !label[ni]) { label[ni] = cur; st.push(ni); }
      }
    }
    comps.push(cells);
  }
  const e = opts.ellipse;
  const cx = e ? e.cx * W - x0 : 0;
  const cy = e ? e.cy * H - y0 : 0;
  const rx = e ? e.rx * W * (opts.ellipseGrow ?? 1.45) : 0;
  const ry = e ? e.ry * H * (opts.ellipseGrow ?? 1.45) : 0;
  const inGuide = p => {
    if (!e) return true;
    const x = p % bw, y = (p - x) / bw;
    const dx = (x - cx) / rx, dy = (y - cy) / ry;
    return dx * dx + dy * dy <= 1;
  };
  let cells = [];
  if (e && opts.clipWhite) {
    // Blanco contenido en la elipse guía: cuando el hueco toca el fondo de la
    // plantilla (minions), el relleno por borde no sirve y la forma del blanco
    // dentro de la elipse es la más fiel.
    for (let i = 0; i < N; i++) if (white[i] && !bg[i] && inGuide(i)) cells.push(i);
  } else if (e) {
    for (const c of comps) {
      if (c.length < N * 0.0005) continue;
      if (c.some(inGuide)) cells = cells.concat(c);
    }
  } else {
    const biggest = comps.sort((a, b) => b.length - a.length)[0];
    if (biggest && biggest.length >= N * 0.004) cells = biggest;
  }
  if (!cells.length || cells.length < N * 0.004) return null;

  // 4) Recorte final a la elipse: la máscara nunca invade el resto de la plantilla.
  if (e) cells = cells.filter(inGuide);
  const inside = new Uint8Array(N);
  for (const p of cells) inside[p] = 255;

  // 4) Máscara: expansión (recupera lo que comió el difuminado) + borde suave
  const R = Math.max(2, Math.round(Math.min(bw, bh) * 0.012));
  const mask = Buffer.alloc(N * 4);
  for (let y = 0; y < bh; y++) {
    for (let x = 0; x < bw; x++) {
      const i = y * bw + x;
      let v = inside[i] ? 255 : 0;
      if (!v) {
        for (let dy = -R; dy <= R && !v; dy++) {
          const ny = y + dy;
          if (ny < 0 || ny >= bh) continue;
          for (let dx = -R; dx <= R; dx++) {
            const nx = x + dx;
            if (nx < 0 || nx >= bw) continue;
            if (inside[ny * bw + nx]) { v = 255; break; }
          }
        }
      }
      const o = i * 4;
      mask[o] = 255; mask[o + 1] = 255; mask[o + 2] = 255; mask[o + 3] = v;
    }
  }
  const maskPng = await sharp(mask, { raw: { width: bw, height: bh, channels: 4 } })
    .blur(0.8).png().toBuffer();
  return { mask: maskPng, width: bw, height: bh, left: x0, top: y0 };
}

/** Capa de foto recortada con la forma del hueco (o null si no hay hueco). */
async function holeLayer(file, userBuf, bbox, opts = {}) {
  // 1) Si el generador dio la elipse del hueco, esa es la guía fiable.
  // 2) Si no, se autodetecta el blanco encerrado; el bbox crece hasta contenerlo.
  let m = null;
  if (opts.guide && opts.ellipse) {
    m = await holeMask(file, bbox, { ...opts, clipWhite: true });
  }
  if (!m) {
    for (const grow of [0.02, 0.1, 0.2, 0.32]) {
      const pad = { x: (bbox.x1 - bbox.x0) * grow, y: (bbox.y1 - bbox.y0) * grow };
      m = await holeMask(file, {
        x0: Math.max(0, bbox.x0 - pad.x), y0: Math.max(0, bbox.y0 - pad.y),
        x1: Math.min(1, bbox.x1 + pad.x), y1: Math.min(1, bbox.y1 + pad.y)
      }, { ...opts, ellipse: null });
      if (m) break;
    }
  }
  if (!m) return null;
  let piece = await shapedImage(userBuf, m.width, m.height, {
    zoom: opts.zoom ?? 1.06, rotate: opts.rotate ?? 0, grayscale: !!opts.grayscale
  });
  piece = await sharp(piece)
    .composite([{ input: innerShade(m.width, m.height, 'ellipse'), blend: 'atop' }])
    .composite([{ input: m.mask, blend: 'dest-in' }])
    .png().toBuffer();
  return { input: piece, left: m.left, top: m.top };
}

/** Inserta una sola foto con la forma exacta del hueco de la plantilla. */
async function holeInsert(file, userBuf, bbox, opts = {}) {
  const layer = await holeLayer(file, userBuf, bbox, opts);
  if (!layer) return null;
  const { buf } = await templateMeta(file);
  return sharp(buf).composite([layer]).png().toBuffer();
}

/** Inserta varias fotos (una por hueco) en una misma plantilla. */
async function holeInsertMany(file, bboxes, bufOrBufs, opts = {}) {
  const buffers = Array.isArray(bufOrBufs) ? bufOrBufs : [bufOrBufs];
  const layers = [];
  for (let i = 0; i < bboxes.length; i++) {
    const layer = await holeLayer(file, buffers[i] || buffers[0], bboxes[i], opts);
    if (layer) layers.push(layer);
  }
  if (!layers.length) return null;
  const { buf } = await templateMeta(file);
  return sharp(buf).composite(layers).png().toBuffer();
}

/**
 * Coloca texto (en vectores) dentro de un área fraccional, con cobertura opcional.
 * Respeta color, tamaño, tipografía, mayúsculas, spacing, sombra y desplazamientos.
 */
function placeTextArea(W, H, area, text, opts = {}) {
  const ov = opts.ov || {};
  const shiftX = Math.round((ov.dx || 0) * W);
  const shiftY = Math.round((ov.dy || 0) * H);
  const x0 = Math.round(area.x0 * W) + shiftX;
  const y0 = Math.round(area.y0 * H) + shiftY;
  const w = Math.max(8, Math.round((area.x1 - area.x0) * W));
  const h = Math.max(8, Math.round((area.y1 - area.y0) * H));
  const pad = opts.pad ?? Math.round(Math.min(w, h) * (opts.padFrac ?? 0.06));
  // `lowercase` = mismo criterio que /canvas/brat (minúsculas salvo ?uppercase=true)
  const upper = Boolean(opts.uppercase || ov.uppercase);
  const body = opts.lowercase && !upper ? String(text).toLowerCase() : text;

  const layer = textLayer({
    text: body,
    width: w,
    height: h,
    family: ov.font || opts.family || 'sans',
    weight: opts.weight ?? 700,
    maxFont: Math.round((opts.maxFont ?? 72) * (ov.scale || 1)),
    minFont: Math.max(6, Math.round((opts.minFont ?? 14) * Math.min(ov.scale || 1, 1.4))),
    maxLines: opts.maxLines ?? 6,
    lineHeight: opts.lineHeight ?? 1.16,
    letterSpacing: (opts.letterSpacing ?? 0) + (ov.spacing || 0),
    fill: ov.fill || opts.fill || '#111111',
    align: opts.align || 'middle',
    uppercase: upper,
    italic: !!opts.italic,
    padding: pad,
    rotate: ov.rotate || opts.rotate || 0,
    stroke: opts.stroke || null,
    strokeWidth: opts.strokeWidth || 0,
    // `offsetY` (fracción del alto del área) baja/sube el bloque sin mover la caja
    offsetY: Math.round((opts.offsetY ?? 0) * h)
  });

  const cover = opts.cover
    ? Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><rect width="${w}" height="${h}" rx="${opts.coverRadius ?? 0}" fill="${opts.cover}"/></svg>`)
    : null;

  const shade = opts.shadow
    ? Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><defs><filter id="s" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="${Math.max(1.5, (layer.fontSize || 24) * 0.06)}"/></filter></defs><g filter="url(#s)" opacity="0.55" transform="translate(0 ${Math.max(1, (layer.fontSize || 24) * 0.045)})">${layer.svg.toString().replace(/^[\s\S]*?<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '')}</g></svg>`)
    : null;

  return {
    inputs: [cover, layer.svg, shade].filter(Boolean),
    left: x0,
    top: y0
  };
}

/** Expande una capa (que puede traer varias piezas) a entradas de composite. */
function expandLayer(layer) {
  if (!layer) return [];
  if (Array.isArray(layer)) return layer.flatMap(expandLayer);
  if (Array.isArray(layer.inputs)) return layer.inputs.map(input => ({ input, left: layer.left, top: layer.top }));
  return [layer];
}
const flat = layers => layers.flatMap(expandLayer);

/** Inserta `rows` filas de fondo (foto estirada) en `cut`, empujando lo de abajo. */
async function insertRows(buf, W, H, rows, cut) {
  const extra = Math.max(0, Math.round(rows));
  if (!extra) return buf;
  const newH = H + extra;
  const stripTop = Math.max(0, Math.min(H - 12, cut + 10));
  const stripH = Math.max(6, Math.min(64, H - stripTop));
  const backdrop = await sharp(buf)
    .extract({ left: 0, top: stripTop, width: W, height: stripH })
    .resize(W, newH, { fit: 'fill' })
    .blur(Math.max(4, Math.round(W * 0.01)))
    .png().toBuffer();
  const top = await sharp(buf).extract({ left: 0, top: 0, width: W, height: cut }).png().toBuffer();
  const bottom = await sharp(buf).extract({ left: 0, top: cut, width: W, height: H - cut }).png().toBuffer();
  return sharp(backdrop).composite([
    { input: top, left: 0, top: 0 },
    { input: bottom, left: 0, top: cut + extra }
  ]).png().toBuffer();
}

async function renderTemplate(file, composites) {
  const { buf, width, height } = await templateMeta(file);
  const layers = [];
  for (const c of composites) layers.push(typeof c === 'function' ? await c(width, height) : c);
  return sharp(buf).composite(flat(layers)).png().toBuffer();
}


/**
 * Borra el texto de ejemplo de una plantilla SIN dejar un recuadro visible:
 * detecta la caja del texto (píxeles claramente más oscuros que el fondo),
 * toma el color mediano del propio fondo y repinta solo esa caja con bordes
 * difuminados. Así el texto nuevo se apoya directo sobre el cartel/papel.
 */
async function eraseSampleText(buf, W, H, area, opts = {}) {
  const inset = opts.inset ?? 0.08;
  const ax = Math.round(area.x0 * W), ay = Math.round(area.y0 * H);
  const aw = Math.round((area.x1 - area.x0) * W), ah = Math.round((area.y1 - area.y0) * H);
  if (aw < 8 || ah < 8) return null;
  const ix = Math.round(aw * inset), iy = Math.round(ah * inset);
  const x = ax + ix, y = ay + iy;
  const w = Math.max(8, aw - ix * 2), h = Math.max(8, ah - iy * 2);
  const { data, info } = await sharp(buf)
    .extract({ left: x, top: y, width: w, height: h })
    .raw().toBuffer({ resolveWithObject: true });
  const C = info.channels;
  const lum = i => 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
  const samples = [];
  for (let i = 0; i < data.length; i += C) samples.push(lum(i));
  samples.sort((a, b) => a - b);
  const median = samples[Math.floor(samples.length * 0.5)];
  const thr = median * 0.66;
  // Solo las letras: se descartan las manchas oscuras enormes o pegadas al borde
  // del recorte (fondo de la escena, ropa del personaje). Así el borrado nunca
  // pinta un rectángulo fuera del cartel.
  const dark = new Uint8Array(w * h);
  for (let p = 0; p < w * h; p++) dark[p] = lum(p * C) < thr ? 1 : 0;
  const seen = new Uint8Array(w * h);
  const keep = new Uint8Array(w * h);
  let bx0 = 1e9, by0 = 1e9, bx1 = -1, by1 = -1;
  for (let p0 = 0; p0 < w * h; p0++) {
    if (!dark[p0] || seen[p0]) continue;
    const st = [p0]; seen[p0] = 1;
    const cells = [];
    let border = false;
    while (st.length) {
      const p = st.pop(); cells.push(p);
      const x = p % w, y = (p - x) / w;
      if (x === 0 || y === 0 || x === w - 1 || y === h - 1) border = true;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const ni = ny * w + nx;
        if (dark[ni] && !seen[ni]) { seen[ni] = 1; st.push(ni); }
      }
    }
    if (border || cells.length > w * h * 0.22) continue;
    for (const p of cells) {
      keep[p] = 1;
      const x = p % w, y = (p - x) / w;
      if (x < bx0) bx0 = x; if (x > bx1) bx1 = x;
      if (y < by0) by0 = y; if (y > by1) by1 = y;
    }
  }
  if (bx1 < 0 || (bx1 - bx0 + 1) * (by1 - by0 + 1) > w * h * 0.92) return null;
  // Borrado por difuminado local: se sustituyen SOLO los píxeles del texto de
  // ejemplo por una versión muy difuminada del cartel. Así no aparece ningún
  // rectángulo de relleno (el cartel conserva sus bordes, sombras y degradados).
  const R = Math.max(2, Math.round(Math.min(w, h) * 0.018));
  const grown = new Uint8Array(w * h);
  for (let p = 0; p < w * h; p++) {
    if (!keep[p]) continue;
    const x = p % w, y = (p - x) / w;
    for (let dy = -R; dy <= R; dy++) {
      const ny = y + dy;
      if (ny < 0 || ny >= h) continue;
      for (let dx = -R; dx <= R; dx++) {
        const nx = x + dx;
        if (nx < 0 || nx >= w) continue;
        if (dx * dx + dy * dy > R * R) continue;
        grown[ny * w + nx] = 255;
      }
    }
  }
  const maskPng = await sharp(Buffer.from(grown.reduce((acc, v, i) => {
    acc.push(v, v, v, 255); return acc;
  }, [])), { raw: { width: w, height: h, channels: 4 } })
    .blur(0.7).png().toBuffer();
  // color del fondo del cartel = mediana por canal de los píxeles que no son letra
  const bg = [0, 1, 2].map(c => {
    const arr = [];
    for (let i = 0; i < data.length; i += C) if (lum(i) >= thr) arr.push(data[i + c]);
    arr.sort((a, b) => a - b);
    return arr.length ? arr[Math.floor(arr.length / 2)] : 255;
  });
  const solid = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">` +
    `<rect width="${w}" height="${h}" fill="rgb(${bg[0]},${bg[1]},${bg[2]})"/></svg>`
  );
  const patch = await sharp(solid)
    .composite([{ input: maskPng, blend: 'dest-in' }])
    .png().toBuffer();
  return { input: patch, left: x, top: y };
}

/** Plantilla de cartel: texto por defecto; imagen si viene `image/url` sin `text` (o mode=image). */
async function signCanvas(file, area, q, opts = {}) {
  const { buf, width: W, height: H } = await templateMeta(file);
  const ov = styleOf(q);
  const mode = String(q.mode || '').toLowerCase();
  const imageUrls = imageList(q);
  const imageUrl = imageUrls[0] || imgParam(q, 'url', 'image', 'img');
  const text = String(q.text ?? '').trim();
  const useImage = mode === 'image' || (mode !== 'text' && imageUrl && !text) || (opts.preferImage && !text && imageUrl);
  const layers = [];
  if (useImage) {
    if (imageUrls.length > 1) {
      // Varias fotos en el mismo cartel: grilla del tamaño del área.
      const w = Math.round((area.x1 - area.x0) * W), h = Math.round((area.y1 - area.y0) * H);
      const bufs = [];
      for (const u of imageUrls) bufs.push(await loadImageBuffer(u));
      const collage = await gridCollage(bufs, w, h, { radius: 0.05, grayscale: ov.grayscale, zoom: ov.zoom });
      layers.push({
        input: collage,
        left: Math.round(area.x0 * W + (w - w) / 2),
        top: Math.round(area.y0 * H + (h - h) / 2)
      });
    } else {
      const user = await loadImageBuffer(imageUrl);
      layers.push(await placeImageArea(W, H, area, user, {
        zoom: ov.zoom, rotate: ov.rotate, grayscale: ov.grayscale, radius: opts.imageRadius ?? 0
      }));
    }
  } else {
    const textOpts = opts.textOpts || {};
    // sin recuadro de fondo: se borra el texto de ejemplo y se escribe encima
    if (textOpts.cover !== false) {
      const erase = await eraseSampleText(buf, W, H, area, { inset: textOpts.eraseInset ?? 0.08 });
      if (erase) layers.push(erase);
    }
    layers.push(placeTextArea(W, H, area, text || opts.defaultText || 'Welcome to Velirius API', {
      ...textOpts, cover: null, ov
    }));
  }
  return sharp(buf).composite(flat(layers)).png().toBuffer();
}

// Recorta una capa que sale de los bordes antes de entregarla a Sharp. Una
// imagen totalmente fuera del lienzo no necesita componer nada.
async function clipLayerToCanvas(input, left, top, W, H) {
  const meta = await sharp(input).metadata();
  const srcLeft = Math.max(0, -left), srcTop = Math.max(0, -top);
  const destLeft = Math.max(0, left), destTop = Math.max(0, top);
  const width = Math.min(meta.width - srcLeft, W - destLeft);
  const height = Math.min(meta.height - srcTop, H - destTop);
  if (width < 1 || height < 1) return null;
  const cropped = srcLeft || srcTop || width !== meta.width || height !== meta.height
    ? await sharp(input).extract({ left: srcLeft, top: srcTop, width, height }).png().toBuffer()
    : input;
  return { input: cropped, left: destLeft, top: destTop };
}

/**
 * Plantilla de personajes: la foto entra **con la forma exacta del hueco** que dejó
 * el original (detección de la zona blanca encerrada). Si una plantilla no tiene un
 * hueco detectable se cae al recorte elíptico de antes.
 */
async function faceCanvas(file, holes, q) {
  const ov = styleOf(q);
  // Todas las imágenes del pedido, en orden: el hueco 1 usa la primera, el 2 la
  // segunda… Si hay menos fotos que huecos, los que sobran repiten la primera.
  const urls = imageList(q);
  if (!urls.length) {
    const uno = imgParam(q, 'url1', 'image1');
    const dos = imgParam(q, 'url2', 'image2');
    const tres = imgParam(q, 'url3', 'image3');
    if (uno) urls.push(uno);
    if (dos) urls.push(dos);
    if (tres) urls.push(tres);
  }
  const users = [];
  for (let i = 0; i < holes.length; i++) {
    users.push(await loadImageBuffer(urls[i] || urls[0] || '', i === 1 ? 'avatar2.jpg' : 'avatar1.jpg'));
  }
  const bboxes = holes.map(h => ({
    x0: Math.max(0, h.cx + ov.dx - h.rx * 1.04),
    y0: Math.max(0, h.cy + ov.dy - h.ry * 1.04),
    x1: Math.min(1, h.cx + ov.dx + h.rx * 1.04),
    y1: Math.min(1, h.cy + ov.dy + h.ry * 1.04)
  }));
  // Hueco real cuando se puede detectar; elipse exacta cuando el blanco del hueco
  // está pegado al fondo de la plantilla (p. ej. la cabeza izquierda de minions).
  let { buf, width: W, height: H } = await templateMeta(file);
  const upscale = W < 500 ? 3 : 1;
  if (upscale > 1) {
    buf = await sharp(buf).resize(W * upscale, H * upscale, { kernel: 'lanczos3' }).png().toBuffer();
    W *= upscale; H *= upscale;
  }
  const layers = [];
  for (let i = 0; i < holes.length; i++) {
    const hole = holes[i];
    const layer = hole.plain ? null : await holeLayer(file, users[i], bboxes[i], {
      zoom: ov.zoom, rotate: ov.rotate, grayscale: ov.grayscale,
      ellipse: { cx: hole.cx + ov.dx, cy: hole.cy + ov.dy, rx: hole.rx, ry: hole.ry },
      ellipseGrow: file.startsWith('minions') ? 1.06 : 1.45,
      guide: file.startsWith('minions')
    });
    if (layer) {
      if (upscale === 1) layers.push(layer);
      else {
        const scaled = await sharp(buf).metadata();
        const piece = await sharp(layer.input).resize(
          Math.round((await sharp(layer.input).metadata()).width * upscale),
          Math.round((await sharp(layer.input).metadata()).height * upscale),
          { kernel: 'lanczos3' }).png().toBuffer();
        layers.push({ input: piece, left: layer.left * upscale, top: layer.top * upscale });
        void scaled;
      }
      continue;
    }
    const w = hole.rx * 2 * W * ov.zoom, h = hole.ry * 2 * H * ov.zoom;
    const piece = await ellipseImage(users[i], w, h, { zoom: ov.zoom, rotate: ov.rotate, grayscale: ov.grayscale });
    const cx = (hole.cx + ov.dx) * W, cy = (hole.cy + ov.dy) * H;
    const clipped = await clipLayerToCanvas(piece, Math.round(cx - w / 2), Math.round(cy - h / 2), W, H);
    if (clipped) layers.push(clipped);
  }
  return layers.length ? sharp(buf).composite(flat(layers)).png().toBuffer() : buf;
}

// ---------- utilidades ----------
/**
 * Lente ESFÉRICA sobre una imagen ya renderizada.
 *
 * Remapea píxel a píxel con interpolación bilineal usando un perfil radial: la
 * distancia al centro se normaliza igual en X y en Y, así el bulto es un
 * **círculo** (no una franja) y las letras se curvan alrededor del centro como
 * si estuvieran sobre una esfera. Sin costuras, sin copias fantasma y sin
 * píxeles de borde estirados.
 *
 *   stretch   cuánto se agranda el centro (1 = sin efecto, 1.6 = +60 %)
 *   aspect    estirón vertical del texto (>1 = letras más altas y finas)
 *   radius    tamaño de la lente: 1 = toca los bordes del lado corto,
 *             0.6 = esfera más chica y marcada, 1.4 = lente que llena todo
 *   centerY   altura del centro de la lente (0-1)
 *
 * El perfil es `mag(r) = 1 / (1 - k·(1 - r²))` con `k = 1 - 1/stretch`: vale
 * exactamente `stretch` en el centro, 1 en el borde y su derivada es 0 en el
 * borde (por eso no se nota ningún salto).
 */
async function lensWarp(buf, { stretch = 1.4, aspect = 1, radius = 1, centerY = 0.5, bulge } = {}) {
  const s = Math.max(1, Math.min(3, Number(stretch) || 1));
  // `bulge` es la clave vieja (estirado horizontal): se traduce a `aspect`
  let a = Number(aspect);
  if (!Number.isFinite(a) || a <= 0) a = 1 + Math.max(0, Math.min(1, Number(bulge) || 0)) * 0.5;
  a = Math.max(0.5, Math.min(2.5, a));
  const R = Math.max(0.2, Math.min(2, Number(radius) || 1));
  if (s <= 1.001 && Math.abs(a - 1) < 0.001) return sharp(buf).png().toBuffer();

  const k = 1 - 1 / s;
  const { data, info } = await sharp(buf).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const W = info.width, H = info.height, ch = info.channels;
  const out = Buffer.allocUnsafe(W * H * ch);
  const cx = W / 2, cy = centerY * H;
  const scale = Math.min(W, H) / 2 * R;

  const sample = (x, y, o) => {
    const x0 = x | 0, y0 = y | 0;
    const x1 = x0 + 1 < W ? x0 + 1 : W - 1;
    const y1 = y0 + 1 < H ? y0 + 1 : H - 1;
    const fx = x - x0, fy = y - y0;
    const i00 = (y0 * W + x0) * ch, i10 = (y0 * W + x1) * ch;
    const i01 = (y1 * W + x0) * ch, i11 = (y1 * W + x1) * ch;
    for (let c = 0; c < ch; c++) {
      const top = data[i00 + c] * (1 - fx) + data[i10 + c] * fx;
      const bot = data[i01 + c] * (1 - fx) + data[i11 + c] * fx;
      out[o + c] = (top * (1 - fy) + bot * fy + 0.5) | 0;
    }
  };

  for (let y = 0; y < H; y++) {
    const py = y - cy;
    for (let x = 0; x < W; x++) {
      const px = x - cx;
      // distancia radial normalizada: mismo peso en X y en Y → bulto circular
      const r = Math.sqrt(px * px + py * py) / scale;
      const u = r >= 1 ? 1 : r;
      const mag = 1 / (1 - k * (1 - u * u));
      const sx = cx + px / mag;
      const sy = cy + (py / mag) / a;
      sample(
        sx < 0 ? 0 : sx > W - 1 ? W - 1 : sx,
        sy < 0 ? 0 : sy > H - 1 ? H - 1 : sy,
        (y * W + x) * ch
      );
    }
  }
  return sharp(out, { raw: { width: W, height: H, channels: ch } }).png().toBuffer();
}

/**
 * Elige el tamaño de letra más grande que entra en un área SIN partir palabras
 * ni recortar líneas. Devuelve { size, lines }.
 */
function fitLines(text, { width, height, maxFont = 120, minFont = 12, lineHeight = 1.15,
  family = 'sans', weight = 700, letterSpacing = 0, maxLines = 8 } = {}) {
  const words = String(text).split(/\s+/).filter(Boolean);
  const wrap = size => wrapLines(text, width, { family, weight, size, letterSpacing, maxLines });
  // una palabra partida ("mone" + "y") es un error de maquetado: se detecta
  // comprobando que CADA palabra aparezca entera en alguna línea.
  const splitsWords = lines => {
    const tokens = new Set(lines.join(' ').split(/\s+/).filter(Boolean));
    return words.some(w => !tokens.has(w));
  };
  for (let size = Math.round(maxFont); size >= minFont; size -= 1) {
    const lines = wrap(size);
    const wordTooWide = words.some(w => measure(w, { family, weight, size, letterSpacing }) > width - 1);
    const tooTall = lines.length * size * lineHeight > height + 1;
    const clipped = /…$/.test(lines[lines.length - 1] || '');
    if (!wordTooWide && !tooTall && !clipped && !splitsWords(lines)) return { size, lines };
  }
  const size = minFont;
  return { size, lines: wrap(size) };
}

const twemojiCache = new Map();
async function twemoji(code) {
  if (twemojiCache.has(code)) return twemojiCache.get(code);
  try {
    const buf = await fetchBuffer(`https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/72x72/${code}.png`, { timeoutMs: 8000 });
    twemojiCache.set(code, buf);
    return buf;
  } catch (_) { return null; }
}

const svgPng = async (svg, density = 1) => sharp(svg, { density: 72 * density }).png().toBuffer();


module.exports = {
  sharp, loadImageBuffer, templateMeta, shapedImage, circleImage, heartImage,
  textLayer, measure, wrapLines, fetchBuffer,
  txt, imgParam, imageList, numberIn, flag, parsePercent, normColor, styleOf,
  flat, expandLayer, innerShade, gridCollage, chromaInsert, ellipseImage, insertRows,
  placeImageArea, placeTextArea, eraseSampleText, signCanvas,
  holeMask, holeLayer, holeInsert, holeInsertMany, faceCanvas,
  twemoji, svgPng, lensWarp, fitLines
};
