// src/catalog/tools.js — Endpoints de la categoría **TOOLS**.
//
// ▸ AGREGAR un endpoint: copiá una entrada de la lista y cambiá `id`, `desc` y `params`.
// ▸ EDITAR uno: cambiá su `desc`, el orden en la lista o cualquiera de sus `params`.
// ▸ BORRAR uno: quitá la entrada (y su ruta en src/routes/tools.js).
//
// Formato de una entrada:
//
//   {
//     id: 'miEndpoint',          // = la ruta: GET /tools/miEndpoint  (minúsculas, sin espacios)
//     desc: 'Qué hace',          // se ve en la web, en /docs y en el README
//     media: 'image',            // opcional: 'image' | 'video' | 'audio' (vista previa en la web)
//     params: [
//       P('text', 'hola', 'Texto principal'),   // requerido
//       O('size', '1', 'Escala (0.5 - 2)')      // opcional
//     ]
//   }
//
// Ayudas (src/catalog/helpers.js): P, O, S, AV, AV2, textStyle(), photoStyle().
const { P, O, S, AV } = require('./helpers');

module.exports = {
  id: 'tools',
  name: 'TOOLS',
  endpoints: [
    { id: 'calculator', desc: 'Calculadora scientific: resuelve expresiones matemáticas', params: [
      P('expr', '(2+3)*4^2 + sqrt(81)', 'Expresión: + - * / % ^ ( ) sqrt() sin() cos() pi e…'),
      O('degrees', 'false', 'true = trigonometría en grados')
    ] },
    { id: 'translator', desc: 'Traduce texto entre idiomas (Google + MyMemory)', params: [
      P('text', 'Hola, bienvenido a Velirius API', 'Texto a traducir'),
      O('to', 'en', 'Idioma destino (en, es, pt, fr, ja…)'),
      O('from', 'auto', 'Idioma origen o auto')
    ] },
    { id: 'resize', desc: 'Rezize: cambia el alto y el ancho de una imagen', media: 'image', params: [
      P('url', AV, 'Imagen a redimensionar'),
      O('width', '512', 'Ancho final en px'),
      O('height', '', 'Alto final en px (si falta, se calcula solo)'),
      O('scale', '', 'O el porcentaje: 50 = mitad de tamaño'),
      S('fit', 'cover', 'Cómo encaja en el nuevo tamaño', ['cover', 'contain', 'fill', 'inside', 'outside']),
      S('format', 'png', 'Formato de salida', ['png', 'jpg', 'webp', 'avif']),
      O('quality', '90', 'Calidad (1-100) para jpg/webp/avif'),
      O('bg', '', 'Color de fondo para los bordes (ej. ffffff)'),
      O('json', 'false', 'true = metadatos y URL de la imagen'),
      O('download', 'false', 'true = baja el archivo como adjunto')
    ] },
    { id: 'tts', desc: 'TextToSpeech: convierte texto en un MP3 de voz', media: 'audio', params: [
      P('text', 'Hola, soy Velirius API', 'Texto a leer (máx. 3000 caracteres)'),
      O('lang', 'es', 'Idioma de la voz (es, en, pt, fr, ja…)'),
      O('voice', '', 'Voz de StreamElements (ej. Brian) si hace falta el respaldo'),
      S('engine', 'auto', 'Motor: auto = Google y después StreamElements', ['auto', 'google', 'streamelements']),
      O('slow', 'false', 'true = habla más lento'),
      O('direct', 'false', 'true = devuelve el MP3 directo')
    ] },
    { id: 'stt', desc: 'SpeechToText: transcribe un audio a texto (necesita GROQ_API_KEY u otra clave)', media: 'audio', params: [
      P('url', '', 'Link del audio (mp3, ogg, wav, m4a, webm)'),
      O('lang', '', 'Idioma del audio (es, en…) o vacío para detectarlo'),
      O('mime', '', 'Tipo del audio si el link no lo dice (ej. audio/ogg)')
    ] },
    { id: 'morse', desc: 'Código Morse: codifica o decodifica texto', params: [
      P('text', 'SOS', 'Texto o código morse'),
      S('mode', 'encode', 'encode = texto → morse, decode = morse → texto', ['encode', 'decode']),
      O('separator', '/', 'Separador entre palabras al codificar')
    ] }
  ]
};
