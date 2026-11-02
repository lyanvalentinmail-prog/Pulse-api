// src/catalog/imagenes.js — Ficha de la categoría **IMAGENES**.
//
// ▸ AGREGAR un endpoint (2 pasos):
//   1) el efecto que procesa la imagen → src/utils/effects.js (mapa EFFECTS)
//      y el handler en src/routes/imagenes.js (conjunto ALLOWED)
//   2) la ficha (desc + params) → acá
//
// Todos comparten `url` (link directo, `/upload/…` o `data:`) y `format`.
const { P, O, S } = require('./helpers');

// `url` acepta un enlace o la foto que sube la Galería del probador.
const url = () => P('url', 'https://picsum.photos/800/600', 'Enlace directo a la imagen (o subila con Galería)');
const format = () => S('format', 'jpeg', 'Formato de salida (jpeg no guarda transparencia)', ['jpeg', 'png', 'webp']);

module.exports = {
  id: 'imagenes',
  name: 'IMAGENES',
  desc: 'Efectos de imagen: filtros y overlays sobre una foto',
  endpoints: [
    { id: 'grayscale', desc: 'Convierte la foto a blanco y negro.', media: 'image', params: [url(), format()] },
    { id: 'pixel', desc: 'Pixelado: agrupa la imagen en bloques cuadrados.', media: 'image', params: [
      url(),
      O('size', '12', 'Tamaño de cada bloque en px (1 - 100; más grande = más pixelado)'),
      format()
    ] },
    { id: 'sepia', desc: 'Aplica el tono sepia clásico de las fotos antiguas.', media: 'image', params: [url(), format()] },
    { id: 'blur', desc: 'Desenfoque gaussiano de toda la imagen.', media: 'image', params: [
      url(),
      O('blur', '8', 'Intensidad del desenfoque (0.3 - 100)'),
      format()
    ] },
    { id: 'invert', desc: 'Invierte los colores (negativo).', media: 'image', params: [url(), format()] },
    { id: 'darkness', desc: 'Oscurece la foto; con level negativo la aclara.', media: 'image', params: [
      url(),
      O('level', '40', 'Cuánto oscurecer en % (1 - 95; negativo aclara)'),
      format()
    ] },
    { id: 'gay', desc: 'Pone un overlay con la bandera arcoíris (franjas o degradé) sobre la foto.', media: 'image', params: [
      url(),
      O('opacity', '55', 'Opacidad del overlay en % (0 - 100)'),
      S('mode', 'flag', 'Estilo del overlay: franjas de la bandera o degradé', ['flag', 'glow']),
      S('direction', 'horizontal', 'Dirección de las franjas (sólo mode=flag)', ['horizontal', 'vertical', 'diagonal']),
      format()
    ] }
  ]
};
