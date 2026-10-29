# Cómo agregar o editar un endpoint

Guía corta y directa. **No hace falta clonar el repo**: casi todo se puede editar desde GitHub
(`✏️ Edit file` → *Commit changes* → *Propose changes* → *Create pull request*).

> 🔗 Versión **solo navegador**, con capturas del flujo de GitHub (ramas, PR, checks, merge y
> cómo revertir): **[GUIA-ENDPOINTS-GITHUB.md](GUIA-ENDPOINTS-GITHUB.md)**.

---

## 1. Los 3 archivos (y para qué sirve cada uno)

| Archivo | Qué se toca ahí | ¿Obligatorio? |
|---|---|---|
| `src/catalog/<categoría>.js` | La **ficha** del endpoint: `id`, `desc` y `params` (`P`, `O`, `S`). De acá salen `/docs`, la web, el probador **TEST** y el README. | ✅ Siempre |
| `src/routes/<categoría>.js` | El **código** que responde `GET /<categoría>/:id`. | Solo si el endpoint es nuevo |
| `src/canvas/generators/<id>.js` | El **dibujo** (PNG) de un canvas. | Solo en canvas |

Categorías: `anime`, `canvas`, `tools`, `downloader`, `searcher`, `reactions`.

> Los canvas con video (`bratvideo`, `attp`) no viven en `src/canvas/generators/`: se resuelven en
> `src/routes/canvas.js` con `src/utils/video.js`.

---

## 2. Editar un endpoint que ya existe

### Cambiar la descripción, el ejemplo o los parámetros (lo más común)

Abrí `src/catalog/<categoría>.js`, buscá la entrada y editá el texto. Nada más: la web y `/docs` se
actualizan solas.

```js
{ id: 'iqc', desc: 'Genera una captura estilo WhatsApp iOS en modo oscuro…', params: [
  P('text', 'Yo siempre te voy a amar', 'Mensaje principal de la burbuja'),
  O('time', '7:32 p. m.', 'Hora mostrada en la burbuja')
] },
```

- `P(nombre, ejemplo, descripción)` → **requerido** (chip `REQUERIDO`).
- `O(nombre, ejemplo, descripción)` → **opcional** (chip `OPCIONAL`).
- `S(nombre, ejemplo, descripción, [opciones])` → opcional con **lista desplegable**.
- `AV` / `AV2` como ejemplo → la web los cambia por los avatares por defecto.
- `...textStyle()` y `...photoStyle()` → los 8 parámetros de estilo (`color`, `size`, `font`…).

### Cambiar los valores por defecto de un canvas (sin tocar código)

Las medidas y estilos viven en `src/canvas/layouts.js`, en bloques con nombre (`text`, `photo`,
`bubble`, `msg`, `time`, `bar`, `title`…). Cada clave de cada parte se puede pisar desde la URL:

```
/canvas/iqc?msg.size=1.3&msg.color=ffe066&bubble.width=0.6&time.color=9ad0ff
/canvas/brat?text.size=1.2&text.fill=ff0044&canvas.bg=8ACE00
```

`layout → parte → clave`:

| Clave | Qué hace |
|---|---|
| `x0, y0, x1, y1` | Área en fracciones (0–1) de la plantilla o del lienzo |
| `color` / `fill` | Color de texto o de relleno (`ff2d55`, `white`, `#000`) |
| `bg` | Color de fondo de la parte |
| `size` | Escala tipográfica (0.5 – 2) |
| `font` (`sans`\|`hand`\|`serif`\|`mono`), `weight`, `align`, `uppercase`, `spacing`, `lineHeight`, `rotate` | Tipografía |
| `radius`, `pad`, `zoom`, `opacity` | Formas, márgenes y fotos |

---

## 3. Agregar un endpoint JSON nuevo (4 pasos)

### Paso 1 — la ruta (`src/routes/<categoría>.js`)

```js
// GET /tools/emoji  →  { creator: 'Velirius', status: true, result: { … } }
router.get('/emoji', async (req, res) => {
  try {
    const text = String(req.query.text || 'hola').slice(0, 100);
    return sendSuccess(res, { text, length: text.length });
  } catch (e) {
    return sendError(res, 500, 'No se pudo procesar el texto', e.message);
  }
});
```

Usá siempre `sendSuccess` / `sendError` (ya agregan `creator` y `status`) y devolvé un `hint`
cuando el error sea culpa de los parámetros.

> El router se monta una sola vez en `src/server.js` (`app.use('/tools', tools)`): **no** hay que
> registrarlo por endpoint.

### Paso 2 — la ficha (`src/catalog/<categoría>.js`)

```js
{ id: 'emoji', desc: 'Cuenta las letras de un texto', params: [
  P('text', 'hola', 'Texto a medir'),
  O('upper', 'false', 'true = devolver en MAYÚSCULAS')
] },
```

### Paso 3 — validar

```bash
npm run check   # catálogo: ids, desc, parámetros, routers, canvas ↔ catálogo
```

### Paso 4 — probar

```bash
npm start
# http://localhost:3000/home          → tarjeta con el contador actualizado
# http://localhost:3000/docs          → el JSON del catálogo
# http://localhost:3000/tools/emoji?text=hola
```

---

## 4. Agregar un canvas nuevo (imagen)

Un canvas es un generador que devuelve un `Buffer` PNG y se registra **solo**: el archivo
`src/canvas/generators/index.js` carga automáticamente todo `src/canvas/generators/*.js`.

### Paso 1 — el dibujo: `src/canvas/generators/<id>.js`

```js
// src/canvas/generators/ejemplo.js — descripción de una línea
const { sharp, P, partsOf, boxOf, txt, textLayer, templateMeta, styleOf } = require('./_helpers');

module.exports = async function ejemplo(q) {
  const parts = partsOf('ejemplo');          // ← medidas de layouts.js
  const ov = styleOf(q);                     // ← color, size, font, rotate, x, y…
  const { buf, width: W, height: H } = await templateMeta(parts.template);
  const box = boxOf('ejemplo', 'text', q);   // ← área ya con overrides de la URL
  const text = txt(q, 'Mi texto');           // ← query.text o el default

  const layer = textLayer({
    text, width: Math.round((box.x1 - box.x0) * W), height: Math.round((box.y1 - box.y0) * H),
    family: 'sans', weight: 700, maxFont: 64, maxLines: 3,
    fill: ov.fill || '#ffffff', align: 'middle'
  });

  return sharp(buf).composite([{
    input: layer.svg, left: Math.round(box.x0 * W), top: Math.round(box.y0 * H)
  }]).png().toBuffer();
};
```

Reglas de oro:

- **Nunca** `<text>` dentro de un SVG: usá `textLayer()` (fuentes empaquetadas → nunca ▯▯▯).
  Familias disponibles: `sans` (Inter), `hand` (Caveat Brush, la letra a mano de `bratcoyote`),
  `serif` (Playfair) y `mono` (JetBrains Mono). Para sumar otra: copiá el `.ttf` a `assets/fonts`
  (con su licencia OFL al lado) y agregala a `FAMILIES` en `src/utils/textEngine.js`.
- Los textos **crecen** hacia abajo (más líneas, no letra más chica): `textLayer` + `fitLines`.
- Nada de medidas clavadas en el código: van en `layouts.js` y se leen con `P` / `boxOf`.
- La imagen sale **sin marco** y el fondo respeta `?bg=` / `canvas.bg`.

### Paso 2 — las medidas: `src/canvas/layouts.js`

```js
ejemplo: {
  label: 'Ejemplo',
  parts: {
    template: 'ejemplo.jpg',                                         // assets/templates/
    text: { box: { x0: 0.08, y0: 0.55, x1: 0.92, y1: 0.80 },
            font: { family: 'sans', weight: 700, maxFont: 64, maxLines: 3 },
            fill: '#ffffff' }
  }
},
```

### Paso 3 — la ficha: `src/catalog/canvas.js`

```js
{ id: 'ejemplo', desc: 'Plantilla de ejemplo con tu texto', params: [
  P('text', 'Mi texto', 'Texto del cartel'),
  O('bg', 'transparent', 'Fondo hex sin # o "transparent"'),
  ...textStyle()
] },
```

### Paso 4 — validar y mirar

```bash
npm run check
npm test                                   # renderiza los 31 canvas
curl "http://localhost:3000/canvas/ejemplo?text=hola" -o ejemplo.png
```

Para empezar copiá el canvas más parecido:

| Querés… | Copiá de |
|---|---|
| Texto sobre una plantilla fija | `generators/bratanime.js` (cartel) o `generators/absolutecinema.js` |
| Foto del usuario dentro de un hueco/recorte | `generators/rata.js` (`facePart`) o `generators/pan.js` (`chromaPart`) |
| Lienzo propio (sin plantilla), fondo y texto | `generators/brat.js` o `generators/gaycard.js` |
| Chat / burbuja que crece | `generators/iqc.js` |

---

## 4-bis. De dónde salen los datos (`src/utils/providers.js`)

Cada endpoint arma una lista de **proveedores en orden** y usa el primero que responda
(`firstSuccess`). Si un servicio se cae se agrega otro a la lista, no se toca la ruta.

| Qué | Fuentes (en orden) |
|---|---|
| YouTube (búsqueda y formatos) | `youtubei.js` → InnerTube → Invidious → Piped — en `src/utils/youtube.js` |
| Buscar en la web | Google → DuckDuckGo lite → DuckDuckGo → Bing |
| Audio de una canción (`/downloader/play`) | MP3 con ffmpeg desde YouTube → preview de Deezer → preview de iTunes |
| Anime (`neko`/`waifu`/`maid`) | nekos.best · danbooru · safebooru · konachan · purrbot · pic.re |

**Video con audio (Downloader).** YouTube casi siempre publica el video y el audio por
separado (DASH). En modo automático (`quality=auto`):

1. se usa el formato **progresivo** (video + audio en el mismo archivo) si existe;
2. si no existe, `src/utils/youtube.js` baja las dos pistas y las pega con **ffmpeg**
   (`-c copy`, sin recodificar) en un MP4 temporal, que se sirve con `Range` (`sendFile`).

Los MP4 pegados viven en `os.tmpdir()/velirius-yt` y se borran solos a los 15 minutos.

## 5. Agregar una categoría nueva (poco frecuente)

1. `src/catalog/<id>.js` copiando otro (`id`, `name`, `endpoints`).
2. Sumala a `CATEGORIES` en `src/catalog/index.js` (en `/home` se muestran por nombre).
3. `src/routes/<id>.js` con su `express.Router()`.
4. Montala en `src/server.js`: `app.use('/<id>', require('./routes/<id>'));`
5. Agregá la categoría a `ROUTES` en `scripts/validate-catalog.js`.

`npm run check` avisa si falta el router o si el catálogo y el motor no coinciden.

---

## 6. Checklist antes de abrir el Pull Request

- [ ] `npm run check` sin errores (los `⚠️` son avisos: revisalos igual).
- [ ] `npm test` en verde (incluye los 31 canvas).
- [ ] Si agregaste un canvas: se ve bien en `/canvas/<id>` y responde a `?text=`, `?color=`, `?size=`.
- [ ] Texto largo probado (3–4 líneas): no se corta, no se achica de más.
- [ ] Sin `▯▯▯`: todo texto pasa por `textLayer`.
- [ ] Sin claves de IA ni contenido NSFW (fuentes `/sfw/`).
- [ ] Si agregaste o borraste un endpoint, actualizá su tabla en el README
      (sección de la categoría) y el contador del título (`80 endpoints`).

Con eso, el Pull Request se revisa y se mergea. La CI de GitHub corre `npm run check` y `npm test`
en cada PR.
