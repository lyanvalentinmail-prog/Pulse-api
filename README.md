# Pulse API

REST API pública, **sin token**, hecha con Express. La web (`/home`) es un dashboard
de carpetas tipo Drive: cada carpeta es una categoría y dentro están sus endpoints con
un probador (`Test`) que ejecuta la petición desde el navegador.

> **Estado actual:** 9 routers montados y **17 endpoints** publicados:
> Canvas (2), IA (1), Descargas (8) y Búsquedas (6). Anime, Imágenes,
> Herramientas, Juegos y Audios siguen vacías, listas para llenar.

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
| `ia` | `/ia` | **1** | Modelos y utilidades de inteligencia artificial |
| `descargas` | `/descargas` | **8** | Videos y música de redes sociales |
| `busquedas` | `/busquedas` | **6** | Buscadores: Pinterest, TikTok, YouTube, fondos |
| `imagenes` | `/imagenes` | — | Imágenes, stickers y fondos |
| `herramientas` | `/herramientas` | — | Utilidades: QR, hash, base64, texto |
| `juegos` | `/juegos` | — | Juegos rápidos por chat |
| `audios` | `/audios` | — | Efectos de sonido, TTS y letras |

Rutas viejas que siguen funcionando como redirección:
`/tools` → `/herramientas`, `/downloader` y `/download` → `/descargas`,
`/searcher` y `/search` → `/busquedas`, `/reactions` → `/imagenes`.

## 🤖 IA — 1

| Endpoint | Qué hace |
|---|---|
| `GET|POST /ia/gemini` | Pregunta al modelo Gemini de Google. La clave es del servidor: el usuario no manda token. |

```
GET /ia/gemini?prompt=hola&model=gemini-1.5-flash&temperature=0.4
POST /ia/gemini        { "prompt": "resume este texto…", "maxTokens": 512 }
```

Parámetros: `prompt` (requerido), `model` (`gemini-2.0-flash`, `gemini-1.5-flash`,
`gemini-1.5-pro`), `temperature` (0-2), `maxTokens` (64-4096).

Sin clave configurada responde **503** con la pista; la clave **nunca** se escribe
en el repo:

```bash
GEMINI_API_KEY=…          # variable de entorno (Render/Vercel)
# o, en local, secrets.local.json  { "GEMINI_API_KEY": "…" }  (gitignored)
```

## 📥 Descargas — 8

| Endpoint | Qué hace |
|---|---|
| `GET /descargas/tiktok` | MP4 sin marca de agua + MP3 del audio, portada y autor. |
| `GET /descargas/pinterest` | Video o imagen del pin en calidad original. |
| `GET /descargas/instagram` | Video o foto de un post/reel. |
| `GET /descargas/facebook` | Video en HD (cae a SD). |
| `GET /descargas/spotify` | Metadatos + preview MP3 de 30 s. |
| `GET /descargas/youtubemp4` | Video de YouTube en MP4. |
| `GET /descargas/youtubemp3` | Audio de YouTube en MP3. |
| `GET /descargas/audio` | Extrae el audio de cualquier archivo remoto a MP3 (ffmpeg). |

Todos reciben `?url=…` y aceptan `?direct=true` para bajar el archivo
(con `Range`, así el reproductor puede buscar dentro del video):

```bash
curl -o video.mp4 "http://localhost:3000/descargas/tiktok?url=…&direct=true"
curl "http://localhost:3000/descargas/pinterest?url=https://www.pinterest.com/pin/123/"
```

Fuentes: tikwm (TikTok), HTML público (Pinterest/Instagram/Facebook), oEmbed +
embed (Spotify), **cobalt** o instancias Piped (YouTube). Para YouTube conviene
tener tu propia instancia:

```bash
COBALT_API_URL=https://cobalt.tu-dominio.com
```

## 🔎 Busquedas — 6

| Endpoint | Fuente | Devuelve |
|---|---|---|
| `GET /busquedas/pinterest` | Pinterest | pines (imagen o video) |
| `GET /busquedas/tiktok` | tikwm | videos con MP4 y portada |
| `GET /busquedas/youtube` | Piped / Invidious | título, canal, duración, vistas |
| `GET /busquedas/wallpapers` | besthdwallpapers.org | fondos en tamaño original |
| `GET /busquedas/wallpapersv2` | motionbgs.com | fondos en movimiento |
| `GET /busquedas/stickerly` | api.sticker.ly | stickers de WhatsApp |

Todas usan `?q=` (obligatorio) y `&limit=` (1-30):

```bash
curl "http://localhost:3000/busquedas/wallpapers?q=naruto&limit=5"
curl "http://localhost:3000/busquedas/stickerly?q=gatitos"
```

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

## 🎬 Portada (`/welcome`)

La página previa al dashboard replica la portada de referencia: hoja de papel,
título con sello `V. 1.0.0 // Status: online`, **video del hero**, dos párrafos,
aviso de seguridad, chips de categorías y acceso al dashboard.

```
public/welcome.html        estructura de la portada (marcadores __WELCOME_*__)
public/media/welcome.mp4   video del hero (vertical, cuadrada o 16:9: el marco
                           toma la proporción real del archivo)
public/img/welcome-poster.jpg   (opcional) primer frame mientras carga
```

El video se reproduce en silencio, en bucle y sin controles; si el navegador no
lo puede cargar queda el póster sobre fondo negro.

### Cambiar el video

1. **Archivo local** (recomendado): reemplazá `public/media/welcome.mp4`
   (H.264 + AAC, ≤ 5 MB para que cargue rápido en móvil).
2. **URL externa**, sin tocar el repo:

```bash
WELCOME_VIDEO_URL=https://cdn.tu-dominio/video.mp4 npm start
```

También podés fijar el póster con `WELCOME_POSTER_URL=https://…/frame.jpg`.
En Render/Vercel se configuran como variables de entorno (`render.yaml`).

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
    extract.js         resolvedores de Descargas (tiktok, pinterest, ig, fb…)
    search.js          buscadores (pinterest, tiktok, youtube, wallpapers…)
    http.js publicFetch.js  fetch con timeout / sólo IP públicas
    textEngine.js      tipografías + medición + SVG
    emoji.js           emojis a color desde assets/emoji
    image.js http.js publicFetch.js response.js requestContext.js uploadStore.js
public/                la web (home, welcome, css, js del probador)
assets/                fonts, emoji, templates, defaults
scripts/               smoke, test-extract (parsers sin red), test-brat, validate-catalog
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
