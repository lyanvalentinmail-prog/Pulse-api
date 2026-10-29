// src/catalog/canvas.js — Endpoints de la categoría **CANVAS**.
//
// ▸ AGREGAR un endpoint: copiá una entrada de la lista y cambiá `id`, `desc` y `params`.
// ▸ EDITAR uno: cambiá su `desc`, el orden en la lista o cualquiera de sus `params`.
// ▸ BORRAR uno: quitá la entrada (y su ruta en src/routes/canvas.js).
// ▸ CANVAS nuevo: además hace falta src/canvas/generators/<id>.js y un bloque en
//   src/canvas/layouts.js. Guía completa: CONTRIBUTING.md.
//
// Formato de una entrada:
//
//   {
//     id: 'miEndpoint',          // = la ruta: GET /canvas/miEndpoint  (minúsculas, sin espacios)
//     desc: 'Qué hace',          // se ve en la web, en /docs y en el README
//     media: 'image',            // opcional: 'image' | 'video' | 'audio' (vista previa en la web)
//     params: [
//       P('text', 'hola', 'Texto principal'),   // requerido
//       O('size', '1', 'Escala (0.5 - 2)')      // opcional
//     ]
//   }
//
// Ayudas (src/catalog/helpers.js): P, O, S, AV, AV2, textStyle(), photoStyle().
//
// `group` = la carpeta de Drive a la que pertenece (src/catalog/canvas.js → GROUPS).
// Este campo y las carpetas correspondientes se incluyen en /docs.
const { P, O, S, AV, AV2, textStyle, photoStyle } = require('./helpers');

// Las carpetas de Drive (`CategoriaCanvas/<nombre>`), conservadas en el catálogo.
const GROUPS = [
  { id: 'textos', name: 'Textos', desc: 'Stickers y capturas de chat' },
  { id: 'brats', name: 'Brats', desc: 'La familia brat: stickers, videos y carteles' },
  { id: 'efectos', name: 'Efectos', desc: 'Tu foto con algo encima: lentes, caras, rejas' },
  { id: 'porcentajes', name: 'Porcentajes', desc: 'Medidores, cartas y porcentajes' },
  { id: 'imagenes', name: 'Imágenes', desc: 'Tu foto o tu texto dentro de un meme' },
  { id: 'filtros', name: 'Filtros', desc: 'Efectos sobre tu foto' },
  { id: 'personajes', name: 'Personajes', desc: 'Tu cara en un personaje' }
];

module.exports = {
  id: 'canvas',
  name: 'CANVAS',
  groups: GROUPS,
  endpoints: [
    { id: 'quotly', group: 'textos', desc: 'Genera un sticker PNG transparente estilo Quotly con avatar circular y burbuja de chat.', params: [
      P('text', 'Welcome to Velirius Api', 'Mensaje del sticker'),
      O('username', 'Velirius Api', 'Nombre del usuario'),
      O('image', AV, 'Avatar opcional (URL o imagen de tu galería)'),
      O('bg', '000000', 'Color hexadecimal de la burbuja'),
      ...textStyle()
    ] },
    { id: 'brat', group: 'brats', desc: 'Sticker brat como el de Drive: texto grande y condensado, fondo blanco y emojis a color.', params: [
      P('text', 'Welcome to Velirius API 💚✨', 'Texto del sticker'),
      O('bg', 'ffffff', 'Fondo hex sin #'),
      O('canvas.size', '736', 'Lado del PNG en píxeles (200 - 2000)'),
      ...textStyle(),
      S('text.align', 'start', 'Alineación del texto', ['start', 'middle', 'end']),
      O('text.weight', '400', 'Grosor de la tipografía (400 - 900)')
    ] },
    { id: 'bratvideo', group: 'brats', desc: 'Video MP4 como el de Drive: palabras que aparecen progresivamente y emojis a color.', media: 'video', params: [
      P('text', 'Welcome to Velirius API 💚🔥', 'Frase animada palabra por palabra (admite emojis)'),
      O('words', '5', 'Cuántas palabras entran como máximo en cada pantalla (1 - 8)'),
      O('bg', 'ffffff', 'Color de fondo hex (ej. 8ACE00 o ffffff)'),
      O('canvas.size', '512', 'Lado del video en píxeles (200 - 2000; se redondea a par)'),
      ...textStyle(),
      S('text.align', 'start', 'Alineación del texto', ['start', 'middle', 'end']),
      O('text.weight', '400', 'Grosor de la tipografía (400 - 900)')
    ] },
    { id: 'bratestirado', group: 'brats', desc: 'Genera el cartel Brat con estiramiento esférico: las letras se curvan alrededor de un bulto 3D.', params: [
      P('text', 'i <3 money', 'Texto a estirar'),
      O('bg', 'ffffff', 'Color de fondo hex (ej. ffffff o 8ACE00)'),
      O('color', '000000', 'Color del texto hex'),
      O('size', '1', 'Escala del texto (0.5 - 2)'),
      O('lens.stretch', '1.55', 'Cuánto se agranda el centro de la esfera (1 = plano, 3 = máximo)'),
      O('lens.aspect', '1.35', 'Estirón vertical del texto (1 = normal, 1.6 = letras más altas)'),
      O('lens.radius', '1', 'Tamaño del bulto: 0.6 = esfera chica y marcada, 1 = llena el lienzo'),
      O('lens.y', '0.5', 'Altura del centro de la esfera (0 - 1)')
    ] },
    { id: 'bratanime', group: 'brats', desc: 'Maid de anime sosteniendo tu texto', params: [
      P('text', 'Welcome to Velirius API', 'Texto del cartel'),
      ...textStyle()
    ] },
    { id: 'bratcoyote', group: 'brats', desc: 'El Coyote sosteniendo tu cartel (letra a mano, igual que la plantilla)', params: [
      P('text', 'Welcome to Velirius API', 'Texto del cartel (sale en MAYÚSCULAS, como la plantilla)'),
      ...textStyle()
    ] },
    { id: 'bratpinguino', group: 'brats', desc: 'Gunter (pingüino) con cartel: texto o imagen', params: [
      O('text', 'Welcome to Velirius API', 'Texto del cartel'),
      O('image', '', 'URL de imagen para el cartel (reemplaza el texto)'),
      S('mode', '', 'auto = decide por parámetros', ['', 'text', 'image']),
      ...textStyle()
    ] },
    { id: 'ttp', group: 'textos', desc: 'Texto a sticker con letras espaciadas', params: [
      P('text', 'Hola', 'Texto del sticker'),
      S('color', 'white', 'Color de las letras', ['white', 'black', 'red', 'green', 'blue', 'yellow', 'pink', 'purple', 'orange']),
      O('bg', 'transparent', 'Fondo hex sin # o "transparent"'),
      O('size', '1', 'Escala del texto (0.5 - 2)')
    ] },
    { id: 'attp', group: 'textos', desc: 'Texto animado arcoíris (WebM sticker)', media: 'video', params: [
      P('text', 'Welcome to Velirius', 'Texto animado'),
      O('size', '1', 'Escala del texto (0.5 - 2)')
    ] },
    { id: 'iqc', group: 'textos', desc: 'Genera una captura estilo WhatsApp iOS en modo oscuro con barra de reacciones y menú contextual.', params: [
      P('text', 'Yo siempre te voy a amar', 'Mensaje principal de la burbuja'),
      O('replyText', 'vooooss seguro', 'Texto del mensaje citado (dejar vacío para ocultar)'),
      O('replyName', 'Tú', 'Autor del mensaje citado'),
      O('time', '7:32 p. m.', 'Hora mostrada en la burbuja'),
      ...textStyle()
    ] },
    { id: 'iqcblue', group: 'textos', desc: 'Captura de iMessage (fondo azul): globo que crece, barra de reacciones y menú Reply / Copy / Report.', params: [
      P('text', 'what if I’m in love with you?', 'Mensaje del globo'),
      ...textStyle()
    ] },
    { id: 'iqcpink', group: 'textos', desc: 'Captura de iMessage en rosa: globo que crece, reacciones con corazones y menú contextual.', params: [
      P('text', 'Ur so pretty!!💗', 'Mensaje del globo'),
      ...textStyle()
    ] },
    { id: 'messengerquote', group: 'textos', desc: 'Captura de Messenger: globo que crece, barra de reacciones (❤ 👍 👎 HAHA !!) y menú Reply / Copy / Translate / Speak.', params: [
      P('text', 'You are literally the most unique item in this universe', 'Mensaje del globo'),
      ...textStyle()
    ] },
    { id: 'profilenote', group: 'textos', desc: 'Nota de perfil de WhatsApp ("Tu nota"): globo oscuro que crece, avatar circular y etiqueta.', params: [
      P('text', 'Welcome to Velirius API', 'Texto de la nota'),
      O('image', AV, 'Foto del avatar (URL o imagen de tu galería)'),
      O('label', 'Tu nota', 'Etiqueta de abajo'),
      ...textStyle()
    ] },
    { id: 'pov', group: 'textos', desc: 'Meme POV: tu texto aparece como "pov: …" sobre tu imagen.', params: [
      P('text', 'cuando abres la api y ya funciona todo', 'Lo que va después de "pov:"'),
      O('image', AV, 'Imagen de fondo (URL o imagen de tu galería)'),
      O('color', 'ffffff', 'Color del texto hex sin #'),
      O('size', '1', 'Escala del texto (0.5 - 2)')
    ] },
    { id: 'x', group: 'textos', desc: 'Meme X: tu texto aparece como "x: …" sobre tu imagen.', params: [
      P('text', 'nadie: absolutamente nadie\nla api: funciona sola', 'Lo que va después de "x:"'),
      O('image', AV, 'Imagen de fondo (URL o imagen de tu galería)'),
      O('color', 'ffffff', 'Color del texto hex sin #'),
      O('size', '1', 'Escala del texto (0.5 - 2)')
    ] },
    { id: 'cuentatiktok', group: 'textos', desc: 'Menú falso de TikTok "Account not found"', params: [
      O('username', 'Account not found', 'Nombre de la cuenta'),
      O('image', AV, 'Avatar de la cuenta'),
      O('status', 'Sent', 'Texto bajo el nombre')
    ] },
    { id: 'storyreply', group: 'textos', desc: '"Replied to your story" con tu foto y mensaje', params: [
      P('url', AV, 'Foto de la historia'),
      P('text', 'jajaja total', 'Respuesta'),
      O('color', 'ffffff', 'Color del texto hex sin #'),
      O('size', '1', 'Escala del texto (0.5 - 2)'),
      O('zoom', '1', 'Zoom de la foto'),
      O('shadow', 'false', 'true = sombra suave bajo el texto')
    ] },
    { id: 'absolutecinema', group: 'textos', desc: 'Meme ABSOLUTE CINEMA con tu texto', params: [
      O('text', 'CINEMA', 'Palabra grande'),
      O('subtext', 'ABSOLUTE', 'Palabra chica'),
      O('url', '', 'Foto opcional (se pasa a blanco y negro)'),
      O('size', '1', 'Escala del texto (0.5 - 2)'),
      O('color', 'ffffff', 'Color del texto hex sin #')
    ] },
    { id: 'bobesponja', group: 'brats', desc: 'Bob Esponja muestra una hoja: texto o imagen', params: [
      O('text', 'Welcome to Velirius API', 'Texto en la hoja'),
      O('url', '', 'Imagen para la hoja (reemplaza el texto)'),
      S('mode', '', 'auto = decide por parámetros', ['', 'text', 'image']),
      ...textStyle()
    ] },
    { id: 'bobesponja2', group: 'brats', desc: 'Cómic de 4 viñetas: texto o imagen en la hoja', params: [
      O('text', 'mi tarea', 'Texto en la hoja'),
      O('url', '', 'Imagen para la hoja (reemplaza el texto)'),
      S('mode', '', 'auto = decide por parámetros', ['', 'text', 'image']),
      ...textStyle()
    ] },
    { id: 'bobesponja3', group: 'brats', desc: 'Bob Esponja con cartel: texto o imagen', params: [
      O('text', 'tu texto aquí', 'Texto del cartel'),
      O('url', '', 'Imagen para el cartel (reemplaza el texto)'),
      S('mode', '', 'auto = decide por parámetros', ['', 'text', 'image']),
      ...textStyle()
    ] },
    { id: 'cartelboy', group: 'brats', desc: 'Muñeco 3D con cartel en blanco', params: [
      O('text', 'tu texto aquí', 'Texto del cartel'),
      O('url', '', 'Imagen para el cartel (reemplaza el texto)'),
      S('mode', '', 'auto = decide por parámetros', ['', 'text', 'image']),
      ...textStyle()
    ] },
    { id: 'pcquote', group: 'imagenes', desc: 'Tu imagen o tu texto dibujados en el MS Paint', params: [
      O('url', AV, 'Imagen dentro del lienzo'),
      O('text', '', 'Texto dentro del lienzo (reemplaza la imagen)'),
      S('mode', '', 'auto = decide por parámetros', ['', 'text', 'image']),
      O('color', '111111', 'Color del texto hex sin #'),
      O('size', '1', 'Escala del texto (0.5 - 2)'),
      O('zoom', '1', 'Zoom de la imagen')
    ] },
    { id: 'emojimix', group: 'imagenes', desc: 'Emojimix: mezcla dos emojis en un sticker (Emoji Kitchen)', params: [
      P('emoji1', '🐱', 'Primer emoji (o su código: 1f431)'),
      O('emoji2', '🐶', 'Segundo emoji (o su código: 1f436)'),
      O('size', '512', 'Tamaño del sticker en px (16-1024)')
    ] },
    { id: 'canvaimagen', group: 'imagenes', desc: 'Wojaks señalando tu imagen (pantalla verde)', params: [
      P('url', AV, 'Tu imagen'),
      ...photoStyle()
    ] },
    { id: 'laptop', group: 'imagenes', desc: 'Tu imagen en la pantalla de la laptop', params: [
      P('url', AV, 'Tu imagen'),
      ...photoStyle()
    ] },
    { id: 'pc', group: 'imagenes', desc: 'Tu imagen en el monitor de la PC', params: [
      P('url', AV, 'Tu imagen'),
      ...photoStyle()
    ] },
    { id: 'google', group: 'imagenes', desc: 'Búsqueda de imágenes de Google con tus fotos en los resultados', params: [
      O('url', AV, 'Imagen que se repite en los 5 resultados'),
      O('url2', AV, 'Solo el segundo resultado (opcional)'),
      O('url3', AV, 'Solo el tercer resultado (opcional)'),
      O('url4', AV, 'Solo el cuarto resultado (opcional)'),
      O('url5', AV, 'Solo el quinto resultado (opcional)'),
      O('avatar', AV, 'Foto del círculo de la cuenta (arriba a la derecha)'),
      ...photoStyle()
    ] },
    { id: 'searched', group: 'imagenes', desc: 'Cartel SE BUSCA vivo o muerto', params: [
      P('url', AV, 'Foto del buscado'),
      O('name', 'EL MAS BUSCADO', 'Apodo bajo la foto'),
      O('zoom', '1', 'Zoom de la foto')
    ] },
    { id: 'pokemoncard', group: 'imagenes', desc: 'Carta Pokémon personalizada', params: [
      P('name', 'Velirius', 'Nombre de la carta'),
      O('hp', '120', 'Puntos de salud'),
      P('url', AV, 'Arte de la carta'),
      O('type', 'Legendario', 'Tipo'),
      O('attack', 'Golpe API', 'Nombre del ataque'),
      O('damage', '90', 'Daño del ataque'),
      O('description', 'Una carta creada con Velirius API.', 'Descripción')
    ] },
    { id: 'ship', group: 'porcentajes', desc: 'Genera una tarjeta de medidor de compatibilidad con avatares recortados en corazón.', params: [
      P('name1', 'Velirius', 'Primer nombre'),
      P('name2', 'dls', 'Segundo nombre'),
      O('percentage', '85', 'Porcentaje opcional (0-100)'),
      O('text', 'Best Friends', 'Etiqueta personalizada (ej. Best Friends)'),
      O('image1', AV, 'Primer avatar (URL o imagen de tu galería)'),
      O('image2', AV2, 'Segundo avatar (URL o imagen de tu galería)')
    ] },
    { id: 'friendship', group: 'porcentajes', desc: 'Genera una tarjeta de medidor de amistad con avatares circulares y porcentaje.', params: [
      P('name1', 'Velirius', 'Primer nombre'),
      P('name2', 'dls', 'Segundo nombre'),
      O('percentage', '85', 'Porcentaje opcional (0-100)'),
      O('text', 'Best Friends', 'Etiqueta personalizada (ej. Best Friends)'),
      O('image1', AV, 'Primer avatar (URL o imagen de tu galería)'),
      O('image2', AV2, 'Segundo avatar (URL o imagen de tu galería)')
    ] },
    { id: 'gaycard', group: 'porcentajes', desc: 'Tarjeta GAY PERCENTAGE', params: [
      P('url', AV, 'Foto'),
      O('name', 'Velirius', 'Nombre'),
      O('percentage', '12', 'Porcentaje opcional (0-100)')
    ] },
    { id: 'gay', group: 'filtros', desc: 'Filtro arcoíris sobre tu foto', params: [
      P('url', AV, 'Tu foto'),
      O('opacity', '0.45', 'Intensidad del filtro 0-1')
    ] },
    { id: 'invert', group: 'filtros', desc: 'Invierte los colores de tu foto', params: [
      P('url', AV, 'Tu foto')
    ] },
    { id: 'grayscale', group: 'filtros', desc: 'Blanco y negro con intensidad regulable (y tintes sepia/frío/cálido).', params: [
      P('url', AV, 'Tu foto'),
      O('amount', '1', 'Cuánto blanco y negro se ve: 1 = todo gris, 0.5 = mitad y mitad (0-1)'),
      S('tone', '', 'Tinte opcional sobre el gris', ['', 'sepia', 'cold', 'warm'])
    ] },
    { id: 'blur', group: 'filtros', desc: 'Desenfoque gaussiano de tu foto', params: [
      P('url', AV, 'Tu foto'),
      O('amount', '8', 'Radio del desenfoque en píxeles (0.3 - 100)'),
      O('tint', '', 'Color opcional encima (hex, ej. ff2d55)')
    ] },
    { id: 'pixel', group: 'filtros', desc: 'Pixelado tipo mosaico (bloques duros)', params: [
      P('url', AV, 'Tu foto'),
      O('size', '12', 'Lado del bloque en píxeles (2 - 200)'),
      O('colors', '0', 'Reducir la paleta a N colores (0 = sin límite)')
    ] },
    { id: 'deepfry', group: 'filtros', desc: 'Deep fried: saturación, contraste y artefactos JPEG al máximo', params: [
      P('url', AV, 'Tu foto'),
      O('amount', '1', 'Intensidad del efecto (0 - 1)'),
      S('noise', 'false', 'Agregar grano de colores encima', ['false', 'true'])
    ] },
    { id: 'sketch', group: 'filtros', desc: 'Tu foto dibujada a lápiz sobre papel', params: [
      P('url', AV, 'Tu foto'),
      O('amount', '1', 'Cuánto lápiz se ve (0 = sólo papel, 1 = todo lápiz)'),
      O('detail', '8', 'Grosor del trazo: bajo = más detalle (0.5 - 40)'),
      O('paper', 'fffdf5', 'Color del papel (hex sin #)')
    ] },
    { id: 'swirl', group: 'filtros', desc: 'Remolino: gira la foto alrededor de un punto, con el giro apagándose hacia los bordes', params: [
      P('url', AV, 'Tu foto'),
      O('amount', '190', 'Grados de giro en el centro (-1080 a 1080)'),
      O('radius', '0.62', 'Tamaño del remolino (0.15 - 2)'),
      O('cx', '0.5', 'Centro horizontal del remolino (0 - 1)'),
      O('cy', '0.5', 'Centro vertical del remolino (0 - 1)')
    ] },
    { id: 'liquify', group: 'filtros', desc: 'Liquify: infla, aspira o derrite la foto alrededor de un punto', params: [
      P('url', AV, 'Tu foto'),
      O('amount', '65', 'Fuerza del efecto (-100 a 100)'),
      S('mode', 'bulge', 'Qué le hace al centro', ['bulge', 'pinch', 'melt']),
      O('radius', '0.7', 'Tamaño de la zona afectada (0.15 - 2)'),
      O('cx', '0.5', 'Centro horizontal (0 - 1)'),
      O('cy', '0.5', 'Centro vertical (0 - 1)')
    ] },
    { id: 'glitch', group: 'filtros', desc: 'Glitch: separación RGB, franjas corridas y líneas de barrido', params: [
      P('url', AV, 'Tu foto'),
      O('amount', '0.7', 'Fuerza del fallo (0 - 1)'),
      O('slices', '14', 'Cuántas franjas se corren (0 - 80)'),
      O('seed', '7', 'Semilla: el mismo número da siempre el mismo glitch'),
      O('scanlines', '0.6', 'Intensidad de las líneas de barrido (0 - 1)')
    ] },
    { id: 'carcel', group: 'efectos', desc: 'Rejas de cárcel encima de tu foto', params: [
      P('url', AV, 'Tu foto (queda detrás de las rejas)'),
      ...photoStyle()
    ] },
    { id: 'sunglass', group: 'efectos', desc: 'Lentes de píxeles encima de tu foto', params: [
      P('url', AV, 'Tu foto (los lentes van arriba)'),
      ...photoStyle()
    ] },
    { id: 'trollface', group: 'efectos', desc: 'TrollFace encima de tu foto', params: [
      P('url', AV, 'Tu foto de fondo'),
      ...photoStyle()
    ] },
    { id: 'badface', group: 'efectos', desc: 'Cara de asco (megusta) encima de tu foto', params: [
      P('url', AV, 'Tu foto de fondo'),
      ...photoStyle()
    ] },
    { id: 'rata', group: 'personajes', desc: 'Tu cara en la rata', params: [
      P('url', AV, 'Tu foto o cara'),
      ...photoStyle()
    ] },
    { id: 'banana', group: 'personajes', desc: 'Tu cara en la banana', params: [
      P('url', AV, 'Tu foto o cara'),
      ...photoStyle()
    ] },
    { id: 'arandano', group: 'personajes', desc: 'Tu cara en el arándano', params: [
      P('url', AV, 'Tu foto o cara'),
      ...photoStyle()
    ] },
    { id: 'pan', group: 'personajes', desc: 'Tu cara en el pan', params: [
      P('url', AV, 'Tu foto o cara'),
      ...photoStyle()
    ] },
    { id: 'galletita', group: 'personajes', desc: 'Tu cara en la galletita', params: [
      P('url', AV, 'Tu foto o cara'),
      ...photoStyle()
    ] },
    { id: 'minions', group: 'personajes', desc: 'Tus caras en los 3 Minions', params: [
      P('url', AV, 'Cara izquierda'),
      O('url2', AV2, 'Cara del medio'),
      O('url3', AV, 'Cara de la derecha'),
      O('zoom', '1', 'Zoom de las caras')
    ] }
  ]
};
