// Brat esférico: todo el texto se dibuja de nuevo, sin partes fijas de la referencia.
const { txt } = require('./_helpers');
const { sharp } = require('../../utils/image');
const { bratSpec, renderBrat } = require('../../utils/brat');

// Proyecta la capa rectangular sobre una superficie abombada. Muestreo bilineal
// en alfa premultiplicado para evitar bordes dentados o halos alrededor del texto.
function sphere(data, size) {
  const out = Buffer.alloc(data.length);
  const center = (size - 1) / 2;
  const radius = size * 0.48;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const nx = (x - center) / radius, ny = (y - center) / radius;
    if (Math.abs(nx) > 1 || Math.abs(ny) > 1) continue;
    const sx = (nx / Math.sqrt(1 - 0.56 * ny * ny) + 1) * center;
    const sy = (ny / Math.sqrt(1 - 0.56 * nx * nx) + 1) * center;
    if (sx < 0 || sy < 0 || sx >= size - 1 || sy >= size - 1) continue;
    const ix = Math.floor(sx), iy = Math.floor(sy), fx = sx - ix, fy = sy - iy;
    const dst = (y * size + x) * 4;
    const positions = [iy * size + ix, iy * size + ix + 1, (iy + 1) * size + ix, (iy + 1) * size + ix + 1];
    const weights = [(1 - fx) * (1 - fy), fx * (1 - fy), (1 - fx) * fy, fx * fy];
    let alpha = 0, red = 0, green = 0, blue = 0;
    for (let i = 0; i < 4; i++) {
      const src = positions[i] * 4, a = data[src + 3] * weights[i];
      alpha += a;
      red += data[src] * a; green += data[src + 1] * a; blue += data[src + 2] * a;
    }
    if (alpha > 0) {
      out[dst] = Math.round(red / alpha);
      out[dst + 1] = Math.round(green / alpha);
      out[dst + 2] = Math.round(blue / alpha);
      out[dst + 3] = Math.round(alpha);
    }
  }
  return out;
}

module.exports = async function bratv2(q = {}) {
  const text = txt(q, 'i <3\nmoney');
  if (text.length > 2000) {
    const error = new Error('El texto es demasiado largo (máx. 2000 caracteres)');
    error.status = 400;
    throw error;
  }
  const spec = bratSpec(q);
  const background = spec.bg;
  // El estilo negro y grueso se inspira en la referencia. La capa completa se
  // ajusta antes de deformarla; ningún símbolo o palabra queda preimpreso.
  Object.assign(spec, {
    left: Math.round(spec.S * 0.05), top: Math.round(spec.S * 0.05),
    width: Math.round(spec.S * 0.9), height: Math.round(spec.S * 0.9),
    bg: '#00000000', weight: 900, align: 'middle', lineHeight: 1.05,
    horizontalScale: 0.85, offsetX: 0, offsetY: 0, rotate: 0,
    maxFont: Math.round(spec.S * 0.68)
  });
  const layer = await renderBrat(text, spec, { preserveCase: true });
  const inner = Math.round(spec.S * 0.92);
  const offset = Math.floor((spec.S - inner) / 2);
  const resized = await sharp(layer).trim({ background: '#00000000' })
    .resize(inner, inner, { fit: 'fill' }).png().toBuffer();
  const { data } = await sharp({ create: { width: spec.S, height: spec.S, channels: 4, background: '#00000000' } })
    .composite([{ input: resized, left: offset, top: offset }]).raw().toBuffer({ resolveWithObject: true });
  return sharp({ create: { width: spec.S, height: spec.S, channels: 4, background } })
    .composite([{ input: sphere(data, spec.S), raw: { width: spec.S, height: spec.S, channels: 4 } }])
    .png().toBuffer();
};
