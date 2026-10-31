// src/canvas/layouts.js — TODAS las medidas del canvas, parte por parte.
// Aquí se cambia cualquier número sin tocar el motor.
//
// Convención de las áreas: fracciones (0-1) del ancho/alto de la plantilla.
// Desde la URL se puede sobreescribir cualquier valor con `<parte>.<clave>`:
//   /canvas/brat?text.x=0.08&text.size=1.2
//
// Hoy sólo queda **brat** (usado por /canvas/brat y /canvas/bratvideo).
//
// ➕ AGREGAR UN CANVAS: 1) src/canvas/generators/<id>.js  2) un bloque acá con sus
//    medidas  3) la ficha en src/catalog/canvas.js. Guía: CONTRIBUTING.md.

const LAYOUTS = {
  brat: {
    label: 'Brat',
    parts: {
      // Medidas y proporciones de la imagen de referencia; el video usa 512 px.
      canvas: { width: 736, height: 736, bg: '#ffffff' },
      text: {
        box: { x0: 0.055, y0: 0.055, x1: 0.995, y1: 0.945 },
        font: {
          family: 'sans', weight: 400, maxFont: 368, lineHeight: 1.07,
          spacing: 0, align: 'start', uppercase: false,
          horizontalScale: 0.74, emojiScale: 0.93, emojiImageScale: 0.87, emojiOffsetX: -0.02, emojiOffsetY: 0.72
        },
        fill: '#000000',
        offsetY: 0.016
      }
    }
  }
};

const get = id => LAYOUTS[String(id || '').toLowerCase()] || null;

module.exports = { LAYOUTS, get };
