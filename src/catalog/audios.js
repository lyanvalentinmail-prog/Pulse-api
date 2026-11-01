// src/catalog/audios.js — Efectos de audio. Devuelven MP3; ?download=true lo descarga.
const { P, O } = require('./helpers');

const url = (example, desc) => P('url', example, desc);

module.exports = {
  id: 'audios',
  name: 'AUDIOS',
  desc: 'Efectos de audio en MP3 (máximo 10 MB y 60 segundos)',
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
      desc: 'Reproduce el audio al revés.',
      media: 'audio',
      params: [
        url('https://example.com/sample.mp3', 'URL del archivo de audio (requerido)'),
        O('speed', '1.0', 'Velocidad de reproducción (0.5 - 2.0)')
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
