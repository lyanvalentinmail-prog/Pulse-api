// src/catalog/audios.js — Ficha de la categoría **AUDIOS**.
//
// El router /audios (src/routes/audios.js) está montado pero todavía no publica
// endpoints: `endpoints: []`. La web, /docs y el probador salen vacíos hasta que
// agregues la primera ficha.
//
// ▸ AGREGAR un endpoint (2 pasos):
//   1) la ruta que responde → src/routes/audios.js
//   2) la ficha (desc + params) → acá, copiando una entrada de src/catalog/canvas.js
//
// Formato de una entrada:
//
//   {\n//     id: 'miEndpoint',          // = la ruta: GET /audios/miEndpoint (minúsculas, sin espacios)\\\\n//     desc: 'Qué hace',          // se ve en la web, en /docs y en el README\\\\n//     media: 'image',            // opcional: 'image' | 'video' | 'audio' | 'json'\\\\n//     params: [\\\\n//       P('text', 'hola', 'Texto principal'),   // requerido\\\\n//       O('size', '1', 'Escala (0.5 - 2)')      // opcional\\\\n//     ]\\\\n//   }\\\\n//
// Ayudas (src/catalog/helpers.js): P, O, S, AV, AV2, textStyle(), photoStyle().
const { P, O, S, AV, AV2, textStyle, photoStyle } = require('./helpers');

const url = (example, desc) => P('url', example, desc);
const direct = () => O('direct', 'false', 'true = devuelve el archivo (MP4/MP3/JPG) en lugar del JSON');

module.exports = {
  id: 'audios',
  name: 'AUDIOS',
  desc: 'Efectos de sonido, TTS y letras',
  endpoints: [
    {
      id: 'robot',
      desc: 'Efecto de voz robot (modulación metálica).',
      media: 'audio',
      params: [
        url('https://example.com/sample.mp3', 'URL del archivo de audio (requerido)'),
        O('pitch', '1.0', 'Tono (0.5 - 2.0)')
      ]
    },
    {
      id: 'reverse',
      desc: 'Reproduce el audio o texto al revés.',
      media: 'audio',
      params: [
        url('https://example.com/sample.mp3', 'URL del archivo de audio (requerido)'),
        O('speed', '1.0', 'Velocidad de reproducción')
      ]
    },
    {
      id: 'demon',
      desc: 'Efecto de voz demoníaca (grave y distorsionada).',
      media: 'audio',
      params: [
        url('https://example.com/sample.mp3', 'URL del archivo de audio (requerido)'),
        O('intensity', '1.0', 'Intensidad del efecto (0.0 - 1.0)')
      ]
    },
    {
      id: 'bass',
      desc: 'Efecto de graves profundos (sub-bass boost).',
      media: 'audio',
      params: [
        url('https://example.com/sample.mp3', 'URL del archivo de audio (requerido)'),
        O('gain', '1.0', 'Ganancia de graves (0.5 - 3.0)')
      ]
    },
    {
      id: 'underwater',
      desc: 'Efecto de sonido sumergido bajo el agua.',
      media: 'audio',
      params: [
        url('https://example.com/sample.mp3', 'URL del archivo de audio (requerido)'),
        O('depth', '1.0', 'Profundidad (0.0 - 1.0)')
      ]
    },
    {
      id: 'echo',
      desc: 'Efecto de eco (reverberación repetitiva).',
      media: 'audio',
      params: [
        url('https://example.com/sample.mp3', 'URL del archivo de audio (requerido)'),
        O('delay', '0.5', 'Retraso entre ecos (0.1 - 2.0)'),
        O('decay', '0.5', 'Decaimiento (0.0 - 1.0)')
      ]
    },
    {
      id: 'chipmunk',
      desc: 'Efecto de voz agudizada (estilo ardilla).',
      media: 'audio',
      params: [
        url('https://example.com/sample.mp3', 'URL del archivo de audio (requerido)'),
        O('pitch', '2.0', 'Tono (1.5 - 3.0)')
      ]
    },
    {
      id: 'distortion',
      desc: 'Efecto de distorsión (estilo saturado o fuzz).',
      media: 'audio',
      params: [
        url('https://example.com/sample.mp3', 'URL del archivo de audio (requerido)'),
        O('level', '0.5', 'Nivel de distorsión (0.0 - 1.0)')
      ]
    }
  ]
};
