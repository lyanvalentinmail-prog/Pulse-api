// src/canvas/generators/bratestirado.js — bratestirado (brat con lente esférico)
//
// El texto va grande y centrado, y después se le aplica la lente esférica
// (`lensWarp`): el centro se agranda `lens.stretch` veces y las letras se curvan
// alrededor de un bulto circular, como si estuvieran sobre una esfera. Además
// `lens.aspect` estira el texto en vertical (letras más altas), que es lo que
// termina de dar el "estirado" del sticker original.
//
// Todo se puede cambiar por query:
//   /canvas/bratestirado?text=hola&text.size=1.2&text.fill=ff0044
//   /canvas/bratestirado?canvas.size=1024&bg=8ACE00
//   /canvas/bratestirado?lens.stretch=1.8&lens.radius=0.8&lens.aspect=1.4
const {
  sharp, textLayer, txt, styleOf, lensWarp, fitLines, P, partsOf
} = require('./_helpers');

module.exports = async function bratestirado(q) {
  const ov = styleOf(q);
  const parts = partsOf('bratestirado');

  // ---- lienzo ----
  const S = Math.round(P.num(q, 'canvas', 'size', parts.canvas.width, 200, 2000));
  const bg = ov.bg || P.bg(q, 'canvas', parts.canvas.bg);

  // ---- tipografía ----
  const t = P.style(q, 'text', parts.text.font);
  const fill = ov.fill || P.color(q, 'text', 'fill', parts.text.fill);
  const family = ov.font || t.family;
  const spacing = t.spacing + (ov.spacing || 0);
  const text = txt(q, 'i <3 money');

  // ---- lente esférica ----
  const stretch = P.num(q, 'lens', 'stretch', parts.lens.stretch, 1, 3);
  // `aspect` = cuánto se estira el texto en vertical; `bulge` es la clave vieja
  const aspect = P.num(q, 'lens', 'aspect', parts.lens.aspect ?? (1 + (parts.lens.bulge || 0) * 0.5), 0.7, 2.5);
  const radius = P.num(q, 'lens', 'radius', parts.lens.radius ?? 1, 0.2, 2);
  const centerY = P.num(q, 'lens', 'y', parts.lens.y, 0.1, 0.9);
  const k = 1 - 1 / Math.max(1, stretch);
  // Cuánto crece el centro de la lente sobre la zona donde está el texto: se usa
  // para maquetar más chico y que la deformación nunca recorte nada.
  const growth = 1 + 0.5 * k;

  // ---- área de texto ----
  // Se maqueta en el espacio "sin deformar": la lente agranda el centro `growth`
  // veces y el estirón vertical ocupa `aspect`, así que el bloque de texto se
  // achica proporcionalmente para no salirse del lienzo.
  const box = P.area(q, 'text', parts.text.box);
  const pad = Math.round(P.num(q, 'text', 'pad', parts.text.pad ?? 0.04, 0, 0.2) * S);
  const inset = P.num(q, 'text', 'inset', parts.text.inset ?? 0.94, 0.5, 1);
  const availW = ((box.x1 - box.x0) * S) / growth - pad * 2;
  const availH = ((box.y1 - box.y0) * S) / (growth * aspect) - pad * 2;

  // Elige el tamaño más grande que entra partiendo por palabras (nunca corta ni
  // parte una palabra) y deja crecer el bloque hacia abajo si hay más líneas.
  const fit = fitLines(text, {
    width: Math.round(availW),
    height: Math.round(availH * inset), // un poco de aire: el texto no toca el borde
    // `?size=` (escala global) y `?text.size=` se multiplican
    maxFont: Math.round(parts.text.font.maxFont * t.size * ov.scale),
    minFont: 12,
    lineHeight: t.lineHeight,
    family,
    weight: t.weight,
    letterSpacing: spacing,
    maxLines: parts.text.maxLines || 6
  });

  const size = fit.size;
  const lines = fit.lines;
  const lineH = Math.round(size * t.lineHeight);
  const blockH = lines.length * lineH;
  const left = Math.round((S - availW) / 2 + (ov.dx || 0) * S);
  const top = Math.round(((box.y0 + box.y1) / 2) * S - blockH / 2 + (ov.dy || 0) * S);

  const layers = lines.map((line, i) => ({
    input: textLayer({
      text: line,
      width: Math.round(availW),
      height: lineH,
      family,
      weight: t.weight,
      maxFont: size,
      minFont: 8,
      maxLines: 1,
      fill,
      align: 'middle',
      letterSpacing: spacing,
      rotate: t.rotate + (ov.rotate || 0),
      uppercase: t.uppercase || ov.uppercase
    }).svg,
    left,
    top: top + i * lineH
  }));

  const flatImg = await sharp({ create: { width: S, height: S, channels: 4, background: bg } })
    .composite(layers)
    .png()
    .toBuffer();

  // Con stretch = 1 y aspect = 1 la lente no hace nada (queda el brat normal).
  if (stretch > 1.001 || Math.abs(aspect - 1) > 0.001) {
    return lensWarp(flatImg, { stretch, aspect, radius, centerY });
  }
  return flatImg;
};
