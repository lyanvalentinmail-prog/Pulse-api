// src/catalog/canvas.js — Ficha de la categoría **CANVAS**.
//
// Las referencias están organizadas en grupos de brats, carteles, chats y tipografía.
// Los generadores nuevos viven en src/canvas/generators/ y el catálogo aquí.
//
// `group` = la carpeta de Drive a la que pertenece (ver GROUPS).
const { P, O, S } = require('./helpers');

// Carpetas de Drive (`CategoriaCanvas/<nombre>`), conservadas en el catálogo.
const GROUPS = [
  { id: 'brats', name: 'Brats', desc: 'La familia brat: stickers y videos' },
  { id: 'carteles', name: 'Carteles', desc: 'Personajes con carteles personalizables' },
  { id: 'chats', name: 'Chats', desc: 'Diseños inspirados en aplicaciones de mensajería' },
  { id: 'tipografia', name: 'Tipografía', desc: 'Diseños de texto' }
];

module.exports = {
  id: 'canvas',
  name: 'CANVAS',
  desc: 'Memes e imágenes generadas al vuelo',
  groups: GROUPS,
  endpoints: [
    { id: 'cartelanime1', group: 'carteles', desc: 'Cartel Anime 1: añade texto o una imagen.', media: 'image', params: [O('text', 'Hola Pulse', 'Texto del cartel'), O('image', '', 'Imagen opcional para el cartel'), S('mode', 'text', 'Mostrar texto o imagen', ['text', 'image']), O('color', '', 'Color del texto'), O('size', '1', 'Escala del texto')] },
    { id: 'cartelanime2', group: 'carteles', desc: 'Cartel Anime 2: añade texto o una imagen.', media: 'image', params: [O('text', 'Hola Pulse', 'Texto del cartel'), O('image', '', 'Imagen opcional para el cartel'), S('mode', 'text', 'Mostrar texto o imagen', ['text', 'image']), O('color', '', 'Color del texto'), O('size', '1', 'Escala del texto')] },
    { id: 'cartelanime3', group: 'carteles', desc: 'Cartel Anime 3: añade texto o una imagen.', media: 'image', params: [O('text', 'Hola Pulse', 'Texto del cartel'), O('image', '', 'Imagen opcional para el cartel'), S('mode', 'text', 'Mostrar texto o imagen', ['text', 'image']), O('color', '', 'Color del texto'), O('size', '1', 'Escala del texto')] },
    { id: 'cartelanime4', group: 'carteles', desc: 'Cartel Anime 4: añade texto o una imagen.', media: 'image', params: [O('text', 'Hola Pulse', 'Texto del cartel'), O('image', '', 'Imagen opcional para el cartel'), S('mode', 'text', 'Mostrar texto o imagen', ['text', 'image']), O('color', '', 'Color del texto'), O('size', '1', 'Escala del texto')] },
    { id: 'cartelbob', group: 'carteles', desc: 'Cartel Bob: añade texto o una imagen.', media: 'image', params: [O('text', 'Hola Pulse', 'Texto del cartel'), O('image', '', 'Imagen opcional para el cartel'), S('mode', 'text', 'Mostrar texto o imagen', ['text', 'image']), O('color', '', 'Color del texto'), O('size', '1', 'Escala del texto')] },
    { id: 'whatsappquote', group: 'chats', desc: 'Mensaje de WhatsApp con menú de reacciones; admite cita y hora.', media: 'image', params: [
      P('text', 'Hola Pulse', 'Mensaje principal'), O('quote', '', 'Mensaje citado; al completarlo se usa la variante con cita'),
      O('author', 'Tú', 'Autor de la cita'), O('time', '', 'Hora del mensaje'),
      S('variant', 'simple', 'Variante de la referencia', ['simple', 'cita']), O('color', '', 'Color del mensaje, hex sin #')
    ] },
    { id: 'imessagequote', group: 'chats', desc: 'Mensaje de iMessage con reacciones y menú.', media: 'image', params: [
      P('text', 'Hola Pulse', 'Mensaje'), O('color', '', 'Color del mensaje, hex sin #')
    ] },
    { id: 'imessagetyping', group: 'chats', desc: 'Conversación con teclado de iMessage.', media: 'image', params: [
      P('text', '¿Qué quieres?', 'Mensaje recibido'), O('reply', 'Tú', 'Texto escrito'),
      O('suggestion', '', 'Segunda sugerencia del teclado'), O('time', 'Yesterday 8:11 PM', 'Fecha y hora'), O('color', '', 'Color de los mensajes')
    ] },
    { id: 'perfilchat', group: 'chats', desc: 'Perfil de chat con foto y campos editables, sin datos personales de la referencia.', media: 'image', params: [
      O('name', 'Pulse', 'Nombre'), O('text', 'Hola, uso Pulse', 'Información'), O('image', '', 'Foto de perfil'),
      O('username', '', 'Nombre de usuario'), O('phone', '', 'Teléfono'), O('link', '', 'Texto de enlaces')
    ] },
    { id: 'ilove', group: 'tipografia', desc: 'Diseño i <3 con palabra curvada personalizable.', media: 'image', params: [P('text', 'money', 'Palabra o frase')] },
    { id: 'brat', group: 'brats', desc: 'Sticker brat como el de Drive: texto grande y condensado, fondo blanco y emojis a color.', media: 'image', params: [
      P('text', 'Hehe this is brat 💸', 'Texto del sticker'),
      O('bg', 'ffffff', 'Color de fondo hex sin #'),
      O('color', '', 'Color del texto hex (vacío = negro)'),
      O('canvas.size', '736', 'Lado del PNG en píxeles (200 - 2000)')
    ] },
    { id: 'bratvideo', group: 'brats', desc: 'Video MP4 como el de Drive: palabras que aparecen progresivamente y emojis a color.', media: 'video', params: [
      P('text', 'Welcome to Pulse API 💚🔥', 'Frase animada palabra por palabra (admite emojis)'),
      O('bg', 'ffffff', 'Color de fondo hex (ej. 8ACE00 o ffffff)'),
      O('color', '', 'Color del texto hex (vacío = negro)'),
      O('words', '5', 'Cuántas palabras entran por pantalla (1 - 8)'),
      O('canvas.size', '512', 'Lado del video en píxeles (200 - 2000; se redondea a par)')
    ] }
  ]
};
