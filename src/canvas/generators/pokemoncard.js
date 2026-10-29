// src/canvas/generators/pokemoncard.js — pokemoncard
// Partes: photo (arte) · name · hp · type · attack · damage · description.

// Guía: README.md → "Cómo agregar o editar un endpoint".
const {
  sharp, loadImageBuffer, templateMeta, textLayer, wrapLines, imgParam, styleOf, flat,
  placeImageArea, P, partsOf, boxOf
} = require('./_helpers');

module.exports = async function pokemoncard(q) {
  const ov = styleOf(q);
  const parts = partsOf('pokemoncard');
  const { buf, width: W, height: H } = await templateMeta(parts.template);
  const user = await loadImageBuffer(imgParam(q, 'url', 'image', 'img'));
  const clip = (v, fb, n) => String(v ?? fb).trim().slice(0, n) || fb;
  const name = clip(q.name, 'Velirius', 20);
  const hp = clip(String(q.hp || '120').replace(/[^0-9]/g, ''), '120', 4);
  const type = clip(q.type, 'Legendario', 22);
  const attack = clip(q.attack, 'Golpe API', 26);
  const damage = clip(String(q.damage || '90').replace(/[^0-9+]/g, ''), '90', 5);
  const description = clip(q.description ?? q.desc, 'Una carta creada con Velirius API.', 220);

  const layers = [
    await placeImageArea(W, H, boxOf('pokemoncard', 'photo', q), user, {
      zoom: ov.zoom, grayscale: ov.grayscale, rotate: ov.rotate,
      radius: P.num(q, 'photo', 'radius', parts.photo.radius)
    })
  ];

  // cada texto toma su caja y su tipografía de layouts.js
  const put = (text, part, extra = {}) => {
    const t = P.style(q, part, parts[part].font);
    const area = boxOf('pokemoncard', part, q);
    const x = Math.round(area.x0 * W);
    const y = Math.round(area.y0 * H);
    const width = Math.max(20, Math.round((area.x1 - area.x0) * W));
    const height = Math.max(16, Math.round((area.y1 - area.y0) * H));
    const size = Math.round(parts[part].font.maxFont * t.size);
    const maxLines = parts[part].font.maxLines || 1;
    const body = maxLines > 1 && !text.includes('\n')
      ? wrapLines(text, width, { family: t.family, weight: t.weight, size, maxLines, letterSpacing: t.spacing }).join('\n')
      : text;
    const layer = textLayer({
      text: body, width, height, family: t.family, weight: t.weight,
      maxFont: size, minFont: Math.max(8, Math.round(size * 0.55)),
      maxLines: parts[part].font.maxLines || 1,
      lineHeight: parts[part].font.lineHeight || 1.2,
      letterSpacing: t.spacing + (ov.spacing || 0),
      fill: ov.fill || P.color(q, part, 'fill', parts[part].fill),
      align: parts[part].align || 'start',
      autoFit: false, fontSize: size, ...extra
    });
    return { input: layer.svg, left: x, top: y };
  };

  layers.push(put(name, 'name'));
  layers.push(put(hp, 'hp'));
  layers.push(put(type, 'type'));
  layers.push(put(attack, 'attack'));
  layers.push(put(damage, 'damage'));
  layers.push(put(description, 'description'));
  return sharp(buf).composite(flat(layers)).png().toBuffer();
};
