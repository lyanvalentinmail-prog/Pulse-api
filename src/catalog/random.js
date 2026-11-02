// src/catalog/random.js — Ficha de la categoría **RANDOM**.
//
// ▸ AGREGAR un animal (2 pasos):
//   1) el animal y sus fuentes en src/utils/random.js (ANIMALS y producersFor)
//   2) la ficha (desc + params) acá
//
// Todos comparten `count` (cuántas imágenes) y devuelven la imagen original.
const { O } = require('./helpers');

const count = () => O('count', '1', 'Cuántas imágenes devolver (1 - 10)');

const animal = (id, desc) => ({ id, desc, media: 'image', params: [count()] });

module.exports = {
  id: 'random',
  name: 'RANDOM',
  desc: 'Imágenes aleatorias de animales, sin clave',
  endpoints: [
    animal('duck', 'Pato al azar (random-d.uk, con respaldo en Wikimedia Commons).'),
    animal('dog', 'Perro al azar con su raza (dog.ceo).'),
    animal('cat', 'Gato al azar (The Cat API).'),
    animal('rabbit', 'Conejo al azar, en GIF cuando la fuente lo permite (bunnies.io).'),
    animal('squirrel', 'Ardilla al azar (fotos de Wikimedia Commons).'),
    animal('panda', 'Panda gigante al azar, con un dato curioso (some-random-api).'),
    animal('koala', 'Koala al azar (some-random-api y Wikimedia Commons).'),
    animal('babyowl', 'Bebé búho (polluelo) al azar, de Wikimedia Commons.'),
    animal('capybara', 'Carpincho al azar, de Wikimedia Commons.'),
    animal('babybear', 'Osito (cría de oso) al azar, de Wikimedia Commons.'),
    animal('baby', 'Una cría al azar: cachorro, gatito, patito, conejito, potrillo, ternero, corderito…')
  ]
};
