// src/catalog/helpers.js — Azúcar para declarar parámetros de un endpoint.
//
// Cada parámetro es un objeto { name, example, desc, required, options? }.
// La web usa `example` para rellenar el probador, `desc` como ayuda y `required`
// para el chip REQUERIDO/OPCIONAL. `options` (S) lo convierte en un <select>.
//
//   P(nombre, ejemplo, descripción)            → parámetro REQUERIDO
//   O(nombre, ejemplo, descripción)            → parámetro OPCIONAL
//   S(nombre, ejemplo, descripción, opciones[]) → OPCIONAL con lista desplegable
//
// Ejemplos:
//   P('text', 'Hola', 'Texto del sticker')
//   O('size', '1', 'Escala del texto (0.5 - 2)')
//   S('mode', 'encode', 'encode o decode', ['encode', 'decode'])
const P = (name, example, desc = '') => ({ name, example, desc, required: true });
const O = (name, example, desc = '') => ({ name, example, desc, required: false });
const S = (name, example, desc, options) => ({ name, example, desc, required: false, options });

// Valores especiales: la web los cambia por la URL absoluta de los avatares por
// defecto (/img/default-avatar.jpg y /img/default-avatar2.jpg).
const AV = '__AVATAR__';
const AV2 = '__AVATAR2__';

// ---------- Grupos de parámetros reutilizables (Canvas) ----------
const textStyle = () => [
  O('color', '', 'Color del texto (hex, ej. ff2d55, o nombre: white, black…)'),
  O('size', '1', 'Escala del texto: 0.5 = mitad, 2 = doble'),
  S('font', 'sans', 'Tipografía incluida en el repo (sin cuadrados)', ['sans', 'serif', 'mono', 'hand']),
  O('uppercase', 'false', 'true = texto en MAYÚSCULAS'),
  O('x', '0', 'Mover el texto en horizontal (-50 a 50)'),
  O('y', '0', 'Mover el texto en vertical (-50 a 50)'),
  O('rotate', '0', 'Rotar el texto en grados (-180 a 180)'),
  O('spacing', '0', 'Espacio extra entre letras en px')
];

const photoStyle = () => [
  // Varias fotos en un mismo hueco: se acomodan en grilla y aparecen todas.
  O('images', '', 'Más fotos separadas por coma (ej. url1,url2): se acomodan en grilla y aparecen todas'),
  O('zoom', '1', 'Zoom de la foto: 1 = llena el hueco justo, 2 = el doble de cerca'),
  O('grayscale', 'false', 'true = foto en blanco y negro'),
  O('rotate', '0', 'Rotar la foto en grados (-180 a 180)')
];

module.exports = { P, O, S, AV, AV2, textStyle, photoStyle };
