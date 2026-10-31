# Cómo agregar o editar un endpoint

Pulse API tiene **9 categorías** y hoy sólo `canvas` publica endpoints
(`brat` y `bratvideo`). Las otras ocho ya tienen su router montado y sólo les
falta el código y su ficha.

## 1. Los 3 archivos (y para qué sirve cada uno)

| Archivo | Qué contiene |
|---|---|
| `src/routes/<categoría>.js` | el **código** que responde (una función por endpoint) |
| `src/catalog/<categoría>.js` | la **ficha**: id, descripción y parámetros |
| `src/catalog/helpers.js` | `P()`, `O()`, `S()`, `textStyle()`, `photoStyle()` |

`src/routes/pages.js` arma solo la web (`/home`, `/<categoría>`, `/docs`) a partir
del catálogo: si la ficha existe, la fila y el probador aparecen sin tocar la web.

## 2. Editar un endpoint que ya existe

### Cambiar la descripción, el ejemplo o los parámetros

Todo está en `src/catalog/<categoría>.js`:

```js
{ id: 'brat', desc: 'Nueva descripción', media: 'image', params: [
  P('text', 'nuevo ejemplo', 'Nueva ayuda del parámetro'),
  O('bg', '8ace00', 'Color de fondo hex sin #')
] }
```

`npm run check` avisa si un parámetro quedó sin descripción o repetido.

### Cambiar los valores por defecto de un canvas

`src/canvas/layouts.js` (medidas) y `src/utils/brat.js` (colores y tipografía).
Nada de eso toca las URL: los overrides siguen entrando por query string.

## 3. Agregar un endpoint JSON (3 pasos)

### Paso 1 — la ruta (`src/routes/<categoría>.js`)

```js
const express = require('express');
const config = require('../config');
const { sendError } = require('../utils/response');

const router = express.Router();

router.get('/miEndpoint', (req, res) => {
  const { text } = req.query;
  if (!text) return sendError(res, 400, 'Falta el parámetro text', 'Prueba ?text=hola');
  return res.json({
    creator: config.creator,
    status: true,
    result: { text, largo: text.length }
  });
});

module.exports = router;
```

- El router **ya está montado** en `src/server.js` como `/<categoría>`.
- Para devolver una imagen: `sendPng(res, buffer, 'archivo.png')`.
- Para devolver un video/archivo: `sendMedia(res, buffer, 'video/mp4', 'archivo.mp4')`.
- Todo lo que sale de la red del usuario debe pasar por `src/utils/publicFetch.js`.

### Paso 2 — la ficha (`src/catalog/<categoría>.js`)

```js
const { P, O } = require('./helpers');

module.exports = {
  id: 'herramientas',
  name: 'HERRAMIENTAS',
  desc: 'Utilidades: QR, hash, base64, texto',
  endpoints: [
    { id: 'miEndpoint', desc: 'Devuelve el texto y su largo', params: [
      P('text', 'hola mundo', 'Texto a analizar'),
      O('size', '1', 'Escala (0.5 - 2)')
    ] }
  ]
};
```

### Paso 3 — validar

```bash
npm run check     # ids, descripciones, params, canvas ↔ catálogo
npm run lint
```

### Paso 4 — probar

```bash
npm start
# http://localhost:3000/home          → tarjeta con el contador actualizado
# http://localhost:3000/docs          → el JSON del catálogo
# http://localhost:3000/herramientas  → la fila nueva con su botón Test
```

## 4. Agregar un canvas nuevo (imagen)

### Paso 1 — el dibujo: `src/canvas/generators/<id>.js`

```js
// Recibe la query ya validada y devuelve un Buffer PNG.
const { txt } = require('./_helpers');
const C = require('../core');
const P = require('../parts');
const L = require('../layouts');

module.exports = async function miCanvas(q = {}) {
  const parts = L.get('miCanvas').parts;
  const svg = C.textLayer({
    text: txt(q, 'Hola'),
    width: parts.canvas.width,
    height: parts.canvas.height,
    family: 'sans'
  });
  return C.toPng(svg);
};
```

- El archivo se registra solo: `src/canvas/generators/index.js` lee la carpeta.
- Los archivos que empiezan con `_` son de apoyo y no se publican.

### Paso 2 — las medidas: `src/canvas/layouts.js`

```js
miCanvas: {
  label: 'Mi canvas',
  parts: {
    canvas: { width: 736, height: 736, bg: '#ffffff' },
    text: { box: { x0: 0.05, y0: 0.05, x1: 0.95, y1: 0.95 }, fill: '#000000' }
  }
}
```

### Paso 3 — la ficha: `src/catalog/canvas.js`

```js
{ id: 'miCanvas', group: 'brats', desc: 'Qué hace mi canvas', media: 'image', params: [
  P('text', 'Hola', 'Texto principal')
] }
```

### Paso 4 — habilitarlo y mirar

Sumá el id a `ALLOWED` en `src/routes/canvas.js`, corré `npm run check` y abrí
`http://localhost:3000/canvas` → `Test`.

## 5. Agregar una categoría nueva (poco frecuente)

1. `src/catalog/<id>.js` con `{ id, name, desc, endpoints: [] }`.
2. `src/routes/<id>.js` copiando uno de los routers vacíos.
3. Importarla en `src/catalog/index.js` y sumarla a `CATEGORIES`.
4. Montarla en `src/server.js`: `app.use('/<id>', require('./routes/<id>'))`.
5. Sumarla al mapa `ROUTES` de `scripts/validate-catalog.js`.
6. `npm run check && npm test`.

## 6. Checklist antes de abrir el Pull Request

- [ ] `npm run check` sin errores y `npm run lint` sin errores
- [ ] `npm test` en verde
- [ ] Probado en la web (`/home` → categoría → `Test`) o con `curl`
- [ ] Texto largo probado (crece, no se corta, sin `▯▯▯`)
- [ ] README actualizado si cambió la lista de endpoints
- [ ] Sin claves de IA ni contenido NSFW
