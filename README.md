# Pulse API

REST API pública, **sin token**, hecha con Express. La web (`/home`) es un dashboard
de carpetas tipo Drive: cada carpeta es una categoría y dentro están sus endpoints con
un probador (`Test`) que ejecuta la petición desde el navegador.

> **Estado actual:** 9 routers montados. Sólo **CANVAS** publica endpoints
> (`brat` y `bratvideo`). Las otras 8 categorías existen, se ven en la web y en
> `/docs`, pero todavía no tienen endpoints — están listas para llenarlas.

```
GET /home                      → dashboard con las carpetas
GET /docs                      → catálogo JSON completo
GET /ping                      → salud + contadores
GET /information               → monitor del sistema
GET /<categoría>               → página de la categoría (con probador)
GET /<categoría>/<endpoint>    → el endpoint
```

## Formato de respuesta

Todos los endpoints JSON responden con el mismo sobre:

```json
{
  "creator": "Pulse",
  "status": true,
  "result": { }
}
```

- Error: `{ "creator": "Pulse", "status": false, "error": { "message": "...", "hint": "..." } }`
- Cualquier endpoint JSON acepta `?format=text` para devolver sólo el texto.
- Los canvas devuelven la imagen (`image/png`) o el video (`video/mp4`) directamente.
- CORS abierto (`*`), sin claves ni tokens.

## Las 9 categorías

| Carpeta | Ruta | Endpoints hoy | Para qué |
|---|---|---|---|
| `anime` | `/anime` | — | Waifus, personajes y búsqueda de anime |
| `canvas` | `/canvas` | **2** | Memes e imágenes generadas al vuelo |
| `ia` | `/ia` | — | Modelos y utilidades de inteligencia artificial |
| `descargas` | `/descargas` | — | Videos y música de redes sociales |
| `busquedas` | `/busquedas` | — | Buscadores: YouTube, Spotify, TikTok y más |
| `imagenes` | `/imagenes` | — | Imágenes, stickers y fondos |
| `herramientas` | `/herramientas` | — | Utilidades: QR, hash, base64, texto |
| `juegos` | `/juegos` | — | Juegos rápidos por chat |
| `audios` | `/audios` | — | Efectos de sonido, TTS y letras |

Rutas viejas que siguen funcionando como redirección:
`/tools` → `/herramientas`, `/downloader` y `/download` → `/descargas`,
`/searcher` y `/search` → `/busquedas`, `/reactions` → `/imagenes`.

## 🎨 Canvas — 2

| Endpoint | Qué hace | Media |
|---|---|---|
| `GET /canvas/brat` | Sticker brat como el de Drive: texto grande y condensado, fondo blanco y emojis a color. | `image/png` |
| `GET /canvas/bratvideo` | El mismo diseño en video MP4: las palabras aparecen una por una. | `video/mp4` |

### Parámetros

Sólo cuatro (cinco en el video), para que el probador quede corto:

| Parámetro | Ejemplo | Qué hace |
|---|---|---|
| `text` *(requerido)* | `Hehe this is brat 💸` | Texto del sticker |
| `bg` | `ffffff` | Fondo hex sin `#` |
| `color` | `ff2d55` | Color del texto hex (vacío = negro) |
| `canvas.size` | `736` (imagen) / `512` (video) | Lado en px (200 - 2000; en video se redondea a par) |
| `words` | `5` | **Sólo `bratvideo`**: cuántas palabras entran por pantalla (1 - 8) |

El motor además acepta overrides finos por URL — `size`, `font`, `uppercase`,
`x`, `y`, `rotate`, `spacing`, `text.align`, `text.weight` — documentados por
completitud pero **no** en la web, para no llenar el probador.

### Ejemplos

```bash
# PNG
curl -o brat.png "http://localhost:3000/canvas/brat?text=hehe%20this%20is%20brat%20%F0%9F%92%B8"

# PNG con estilo
curl -o brat.png "http://localhost:3000/canvas/brat?text=hola&bg=8ace00&color=ff2d55"

# Video MP4 (3 palabras por pantalla)
curl -o brat.mp4 "http://localhost:3000/canvas/bratvideo?text=welcome%20to%20pulse&words=3"

# POST: el texto va en el cuerpo, sin límite de URL
curl -X POST http://localhost:3000/canvas/brat \
  -H 'Content-Type: application/json' \
  -d '{"text":"hola 💚","canvas.size":1024}' -o brat.png
```

El video y el PNG comparten el mismo motor de dibujo: a igual tamaño y opciones,
el frame del video y el PNG se ven exactamente igual. La tipografía y los emojis
salen del repo (`assets/fonts`, `assets/emoji`), así que no hay cuadrados `▯▯▯`
ni fuentes remotas en tiempo de ejecución.

## Estructura del repo

```
src/
  server.js            Express: CORS, estáticos, páginas y los 9 routers
  config.js            nombre, marca, repo, puerto…
  catalog/             fichas de cada categoría (desc + params) → web, /docs
    index.js           junta los 9 archivos y expone totals()/findEndpoint()
    helpers.js         P(), O(), S(), AV, AV2, textStyle(), photoStyle()
    canvas.js          ← los 2 endpoints publicados
    anime.js ia.js descargas.js busquedas.js imagenes.js herramientas.js juegos.js audios.js
  routes/              un router por categoría (los 8 vacíos son de 3 líneas)
    pages.js           /home, /information, /docs, página de cada categoría
    canvas.js          GET/POST /canvas/:id
  canvas/              motor de dibujo
    core.js parts.js   helpers de render
    layouts.js         medidas de brat (parte por parte)
    generators/        un archivo por canvas (hoy sólo brat.js)
  utils/
    brat.js            diseño brat compartido por PNG y video
    video.js           bratvideo (ffmpeg)
    textEngine.js      tipografías + medición + SVG
    emoji.js           emojis a color desde assets/emoji
    image.js http.js publicFetch.js response.js requestContext.js uploadStore.js
public/                la web (home, welcome, css, js del probador)
assets/                fonts, emoji, templates, defaults
scripts/               smoke, test-brat, validate-catalog
```

## Desarrollo

```bash
npm install
npm start          # http://localhost:3000/home
npm run dev        # con --watch
npm run check      # valida el catálogo (ids, params, canvas ↔ catálogo)
npm run lint       # eslint
npm test           # smoke + pruebas de brat/bratvideo
```

## 🧩 Cómo agregar un endpoint JSON (3 pasos)

Las 8 categorías vacías ya tienen su router montado: no hace falta tocar
`src/server.js` ni `src/catalog/index.js`.

**1. La ruta** — `src/routes/<categoría>.js`

```js
const express = require('express');
const config = require('../config');
const { sendError } = require('../utils/response');

const router = express.Router();

router.get('/hola', (req, res) => {
  const { text } = req.query;
  if (!text) return sendError(res, 400, 'Falta el parámetro text', 'Prueba ?text=hola');
  return res.json({ creator: config.creator, status: true, result: { text } });
});

module.exports = router;
```

**2. La ficha** — `src/catalog/<categoría>.js` (dentro de `endpoints: []`)

```js
const { P, O } = require('./helpers');

endpoints: [
  { id: 'hola', desc: 'Devuelve el texto que le mandes', params: [
    P('text', 'hola mundo', 'Texto a devolver'),
    O('size', '1', 'Escala (0.5 - 2)')
  ] }
]
```

**3. Validar y mirar**

```bash
npm run check
# http://localhost:3000/herramientas        → la fila nueva con su botón Test
# http://localhost:3000/docs                → la ficha en el catálogo JSON
```

Guía extendida con plantillas: [CONTRIBUTING.md](CONTRIBUTING.md) y
[GUIA-ENDPOINTS-GITHUB.md](GUIA-ENDPOINTS-GITHUB.md).

## 🖼️ Cómo volver a publicar un canvas

Un canvas nuevo (o que se quiera recuperar del historial de Git) necesita 4 cosas:

1. **El dibujo** — `src/canvas/generators/<id>.js`
   ```js
   const { txt } = require('./_helpers');
   module.exports = async function miCanvas(q = {}) {
     // devuelve un Buffer PNG
   };
   ```
2. **Las medidas** — un bloque en `src/canvas/layouts.js`.
3. **La ficha** — una entrada en `src/catalog/canvas.js`.
4. **Habilitarlo** — sumar el id a `ALLOWED` en `src/routes/canvas.js`.

`bratvideo` es el caso especial: no vive en `generators/` sino en
`src/utils/video.js`, porque es un MP4 armado con ffmpeg.

## Cómo se declaran los parámetros

`src/catalog/helpers.js`:

| Helper | Qué genera |
|---|---|
| `P(nombre, ejemplo, desc)` | parámetro **requerido** |
| `O(nombre, ejemplo, desc)` | parámetro **opcional** (input de texto) |
| `S(nombre, ejemplo, desc, opciones[])` | opcional con **lista desplegable** |
| `textStyle()` | bloque completo de estilo de texto (8 opciones; los canvas de hoy **no** lo usan) |
| `photoStyle()` | bloque de foto (`images`, `zoom`, `grayscale`, `rotate`) |
| `AV` / `AV2` | la web los cambia por los avatares por defecto |

Los nombres listados en `ADVANCED_PARAMS` (`src/catalog/index.js`) se pliegan en
**Opciones avanzadas** dentro del probador.

## Cómo eliminar un endpoint

1. Borrar la entrada del catálogo (`src/catalog/<categoría>.js`).
2. Borrar su handler (`src/routes/<categoría>.js`) o, si es un canvas, su
   generador + su ficha + el id de `ALLOWED` en `src/routes/canvas.js`.
3. `npm run check && npm test`.

Una categoría puede quedar con `endpoints: []`: la web muestra
"SIN ENDPOINTS TODAVÍA" y `/docs` la sigue listando.

## Checklist antes de abrir un Pull Request

- [ ] `npm run check` sin errores
- [ ] `npm run lint` sin errores
- [ ] `npm test` en verde
- [ ] Probado en la web (`/home` → categoría → `Test`) o con `curl`
- [ ] Sin claves de IA ni NSFW
- [ ] README actualizado si cambió la lista de endpoints

## Despliegue

- **Render**: `render.yaml` (`npm install` + `npm start`, Node 24).
- **Vercel**: `vercel.json` manda todo a `api/index.js` (serverless, `maxDuration` 60 s).
  El video necesita ffmpeg, que ya viene incluido en `assets`/`node_modules` vía
  `@ffmpeg-installer/ffmpeg`.

## Créditos

Hecho por [lyanvalentinmail-prog](https://github.com/lyanvalentinmail-prog).
Sin token, sin registro, sin NSFW.

## Licencia

MIT.
