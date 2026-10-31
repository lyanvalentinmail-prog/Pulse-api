# Pulse API

Dashboard con el estilo **NOVA / Delirius** de las capturas de Drive (*Shots.zip* y *Pulse api*), con los
**104 endpoints REST de Pulse** en **6 categorías**, listo para **Vercel** o **Render**.

- **Dashboard:** `/` o `/home` · **Portada:** `/welcome` · **Catálogo JSON:** `/docs` · **Info:** `/information`.
- Estética de papel y tinta: fondo de puntos, tarjeta con borde negro y sombra desplazada, tipografías
  **Share Tech Mono** y **JetBrains Mono** incluidas localmente, barra de estado negra y filas de carpetas
  con icono, descripción y botón `VIEW` ordenadas por nombre.
- Las páginas `/anime`, `/canvas`, `/downloader`, `/reactions`, `/searcher` y `/tools` conservan sus
  endpoints y un probador desplegable con la ficha del endpoint: barra `GET`, parámetros con chip
  requerido, botón `EJECUTAR`, copiar URL / cURL / rellenar ejemplo y resultado con `200 OK` + ms.
  Los alias `/download` y `/search` redirigen a `/downloader` y `/searcher`.
- Las opciones de estilo adicionales se pueden desplegar dentro del probador. Los canvas y
  `/tools/resize` admiten imágenes desde la galería; se muestran las imágenes, videos o JSON obtenidos.
- La portada `/welcome` muestra chips por categoría con su conteo, aviso y accesos al dashboard.
  Los grupos de Canvas se conservan en `/docs`.
- La mayoría de endpoints no necesitan claves y usan fuentes públicas. La transcripción STT requiere
  configurar una clave de proveedor. No hay generación con IA ni contenido NSFW en Anime y Reactions.
- **¿Agregar o editar un endpoint?** Consultá [CONTRIBUTING.md](CONTRIBUTING.md).

---

## Formato de respuesta

```json
{ "creator": "Pulse", "status": true, "result": { } }
```

- `?format=text` en cualquier endpoint JSON → texto plano (útil para bots).
- `?download=true` en **cualquier** endpoint que devuelva un archivo → lo baja como adjunto
  (`Content-Disposition: attachment`). Sirve para canvas (PNG/MP4), anime, reactions, uploads,
  TikTok/Facebook/Instagram y los MP4/MP3 del downloader. En los endpoints que tienen `direct`,
  `download=true` ya implica devolver el archivo.
- En **Downloader**, `?direct=` devuelve el archivo en streaming con `Range 206`
  (`mp4`, `mp3`, `true` según el endpoint).
- **Canvas** devuelve la imagen (PNG) o el video (MP4/WebM) directamente.
- Errores: `{ "creator", "status": false, "error", "hint" }`.

---

## ⛩️ Anime — 4 (proveedores de imágenes)

| Endpoint | Proveedores (en orden) | Parámetros |
|---|---|---|
| `GET /anime/neko` | `nekos.best` · `purrbot` · `danbooru` · `safebooru` · `konachan` · `yande.re` | `provider`, `amount`, `direct` |
| `GET /anime/waifu` | `nekos.best` · `danbooru` · `pic.re` · `safebooru` · `konachan` · `yande.re` | `provider`, `amount`, `direct` |
| `GET /anime/maid` | `danbooru` · `safebooru` · `konachan` · `yande.re` | `provider`, `amount`, `direct` |
| `GET /anime/pokemon` | PokeAPI | `query`, `shiny`, `direct` |

- `provider` fuerza una fuente; si se deja vacío se prueban **todas a la vez** (`firstFast`, 8 s de
  presupuesto) y gana la primera que conteste. Antes iban una por una y una fuente muerta agotaba el
  tiempo de la función en Vercel (10 s) → el endpoint parecía roto.
- `amount` (1-10) devuelve varias imágenes: `result.images[]` además de `result.image`.
- Cada imagen trae `url` (versión liviana), `full` (original), `artist`, `source`, `width`, `height` y `tags`.
- `direct=true` entrega la imagen/GIF en vez del JSON.

**Todo SFW, filtrado en la propia consulta**: `danbooru` pide `rating:g`, `safebooru` es la copia
segura de danbooru (`rating:general`), `konachan` usa el espejo `.net` (`rating:safe`) y `yande.re`
filtra con `rating:s`. `pic.re` sólo devuelve elementos con clasificación explícitamente segura y sin tags inseguros; si no puede comprobarlo, se descarta el resultado.

> Fuentes retiradas: `waifu.pics` (servicio apagado), `waifu.im` (cierre definitivo el 17/10/2026) y
> `nekos.life` (Cloudflare bloquea las peticiones del servidor). `nekos.best` no tiene categoría
> `maid`, por eso `maid` arranca con los boorus.

```bash
curl "https://<host>/anime/neko?amount=3"
curl "https://<host>/anime/maid?provider=safebooru&direct=true" -o maid.jpg
curl "https://<host>/anime/pokemon?query=charizard&shiny=true"
```

## 🎨 Canvas — 54 (plantillas de la carpeta `CategoriaCanvas` de Drive)

Todas las plantillas están en `assets/templates` (mismos archivos de Drive) y **todos los parámetros son
modificables por query**. Sin parámetros usan los valores de ejemplo y el avatar por defecto.

### Cada canvas está dividido en **partes**

Las medidas de cada canvas viven en `src/canvas/layouts.js`, separadas por partes con nombre
(`canvas`, `text`, `photo`, `sign`, `bubble`, `quote`, `name`, `hole1`…). El generador sólo dibuja:
no tiene números clavados. Así se cambia un canvas sin tocar el motor y **cualquier valor se puede
pisar desde la URL** con `<parte>.<clave>`:

```bash
/canvas/bobesponja?sign.x1=0.80&sign.y0=0.30      # agrandar el cartel
/canvas/iqc?quote.size=1.15&msg.y=0.55            # cita más grande, mensaje más abajo
/canvas/bratestirado?lens.stretch=1.6&lens.aspect=1.5   # lente más marcada
/canvas/searched?photo.zoom=1.3&name.size=1.2      # acerca la foto y agranda el nombre
```

Las fotos del usuario **siempre llenan su hueco** (recorte centrado tipo *cover*, sin deformar):
`zoom=1` es el encuadre justo y de ahí para arriba sólo acerca.

### Varias imágenes en un mismo canvas

Cuando el canvas tiene un hueco de foto podés mandar **más de una imagen** y aparecen todas: se
acomodan en grilla dentro del hueco (2 arriba / 2 abajo, y así). Se aceptan todas estas formas:

```bash
/canvas/canvaimagen?images=<url1>,<url2>,<url3>     # lista separada por comas
/canvas/canvaimagen?image=<url1>&image2=<url2>      # numeradas (image1…image9, url1…url9)
/canvas/pov?image=<url1>&image=<url2>               # el mismo parámetro repetido
```

En los canvas con **varios huecos** (personajes, ship, friendship) cada imagen va a un hueco
distinto, en orden. En la web, el botón **Galería** acepta varias fotos a la vez y las acumula.

### Tipografías: nunca más cuadrados ▯▯▯

El texto **no** se dibuja con `<text font-family="…">`. Cada letra se traduce a un **path vectorial**
(`src/utils/textEngine.js` + `opentype.js`) usando las fuentes empaquetadas en `assets/fonts`:

| Familia (`font=`) | Fuente incluida | Pesos |
|---|---|---|
| `sans` (por defecto) | Inter | 400 / 700 / 900 |
| `hand` | Caveat Brush (letra a mano) | 400 (es la única que tiene) |
| `serif` | Playfair Display | 400 / 700 / 900 |
| `mono` | JetBrains Mono | 400 / 700 |

`hand` es la tipografía del cartel de **`bratcoyote`**: el original de Drive está escrito a mano, así que
la canvas usa exactamente esa letra (y `?font=` sigue funcionando para cambiarla). Revisá las licencias correspondientes antes de redistribuir las fuentes; en el repositorio sólo se incluye el texto OFL de Caveat Brush.

Los emojis y símbolos que no están en esas fuentes se dibujan con **NotoEmoji** (también incluida), así que
tampoco aparecen cuadrados en textos como `hola 🐱🔥`. Todo el render es idéntico en local, Render o Vercel
porque **no depende de las tipografías del sistema** (fontconfig).

En los canvas que muestran un chat (`iqc`) los emojis salen **a color**, como en WhatsApp: van empaquetados
como imágenes (hoja de sprites `assets/emoji/twitter-64.png`, Twemoji CC-BY 4.0 → ver
`assets/emoji/LICENSE.txt`) y el generador las pide con `src/utils/emoji.js`:
`const emojis = await emojiImages(texto)` y después `textLayer({ text, emojiImages: emojis })`. Si el set no
tuviera algún emoji, se dibuja el glifo de NotoEmoji: **nunca** un cuadrado.

**Parámetros de estilo válidos en cualquier canvas**

| Parámetro | Qué hace |
|---|---|
| `color` | color del texto (hex `ff2d55`, `#ff2d55` o nombre: `white`, `black`, `red`…) |
| `bg` | fondo (canvas generados: `brat`, `ttp`, `quotly`, `ship`…) |
| `size` | escala del texto (`0.5` = mitad, `2` = doble) |
| `font` | `sans` · `serif` · `mono` |
| `uppercase` | `true` = MAYÚSCULAS |
| `x`, `y` | desplazamiento en % (-50 … 50) |
| `rotate` | rotación en grados (-180 … 180) |
| `spacing` | espacio extra entre letras en px |
| `zoom` | zoom de la foto del usuario (1 = llena el hueco justo, 2 … 4 = más de cerca) |
| `grayscale` | `true` = foto en blanco y negro |
| `shadow` | `true` = sombra suave bajo el texto (mejor lectura sobre fotos) |

El catálogo conserva las carpetas de Drive `CategoriaCanvas`: **Textos**, **Brats**, **Efectos**,
**Porcentajes**, **Imágenes**, **Filtros** y **Personajes**. Los nombres viven en
`src/catalog/canvas.js` → `GROUPS`, y cada endpoint declara su carpeta mediante `group`.
Los grupos se incluyen en `/docs`; la página `/canvas` muestra la lista de endpoints.

Los canvas con plantilla de Drive están **calibrados con las coordenadas reales de cada imagen**
(burbuja de cita de `iqc`, fila de `cuentatiktok`, cartel del pingüino, hoja de Bob Esponja, marco de
`searched`…).

**El texto nunca lleva una caja de fondo.** El texto de ejemplo de la plantilla se borra detectando su
caja real y repintando esa zona con el color mediano del propio fondo, con bordes difuminados; después
se escribe el texto nuevo encima. Resultado: la letra se apoya directo sobre el cartel, el papel o la
foto, sin el recuadro que se notaba antes.

### Chat con burbuja que crece (`iqc`)

`iqc` está armado **por partes**: bloque de cita (nombre + texto citado), bloque de mensaje y hora.

- El mensaje se mide con las fuentes del repo y se parte en líneas como WhatsApp.
- Si el mensaje es largo se agregan líneas y la **burbuja crece** como en WhatsApp.
- El menú de abajo (Conservar / Responder / …) **baja** lo necesario y el alto de la imagen se ajusta.
- La hora queda abajo a la derecha, igual que en la app.
- La cita se recorta con `…` en una sola línea, como el reply real.

### Globos de chat nuevos (`iqcblue`, `iqcpink`, `messengerquote`, `profilenote`)

Las cuatro salen de las capturas nuevas de Drive (`IqcBlue.jpg`, `IqcPink.jpg`, `MessengerQuote.jpg`,
`ProfileNote.jpg`) y comparten motor (`src/canvas/generators/_chat.js`):

- La barra de reacciones y el menú (Reply / Copy / Report…) **ya vienen en la plantilla**: no se dibujan,
  así el resultado es idéntico a la captura.
- El globo se **redibuja del color medido** y se estira hacia abajo todo lo que pida el texto: los
  mensajes largos **nunca se cortan**.
- Al crecer, el menú de abajo **baja** y la imagen se alarga, igual que en la app.
- `profilenote` además cambia el avatar (`?image=`) y la etiqueta (`?label=Mi nota`); si no mandás foto
  queda el círculo verde de la plantilla.

```bash
/canvas/iqcblue?text=hola%20🐱
/canvas/messengerquote?text=te%20quiero%20mucho&size=1.2
/canvas/profilenote?text=disponible%20💚&image=<url>&label=Mi nota
```

### Estiramiento esférico (`bratestirado`)

El cartel se dibuja plano y después pasa por una **lente esférica** (`lensWarp`): la distancia al centro
se normaliza igual en X y en Y, así el bulto es un **círculo** y las letras se curvan alrededor del
centro en vez de estirarse en franjas.

- `lens.stretch` — cuánto se agranda el centro (`1` = plano, `1.55` por defecto, hasta `3`).
- `lens.aspect` — estirón vertical del texto (`1` = normal, `1.35` por defecto): letras más altas.
- `lens.radius` — tamaño del bulto (`1` = llega a los bordes del lado corto, `0.6` = esfera chica y marcada).
- `lens.y` — altura del centro de la lente (`0.5` = medio del lienzo).

El texto se maqueta más chico de lo que se ve (`fitLines` + el margen que la lente se va a comer), así
que la deformación **nunca recorta** ni deja el texto pegado al borde, y con `lens.stretch=1&lens.aspect=1`
queda el brat normal, plano.

### Brat y bratvideo (palabras por pantalla)

`brat` y `bratvideo` comparten el diseño de las referencias de Drive: texto negro, regular y
condensado, alineado a la izquierda y centrado verticalmente sobre fondo blanco, con emojis Twemoji
**a color** y un desenfoque suave. El texto se ajusta al espacio sin cortar las palabras. El PNG mide
736 × 736 y el MP4 512 × 512 por defecto; `canvas.size` cambia el lado de ambos (en el video se
redondea hacia arriba si es impar para mantener compatibilidad con H.264).

- `text` — la frase (en el video, palabra por palabra).
- `bg`, `color`, `size`, `uppercase`, `spacing`, `font`, `rotate`, `x`, `y`, `canvas.size`.
- También se pueden ajustar partes como `text.align`, `text.weight`, `text.size` y `text.fill`.
  La escala es un máximo: si el texto ya llena el área, se reduce lo necesario para que entre.

`bratvideo` además pagina el texto:

- **Máximo 5 palabras por pantalla** (`?words=1..8` para cambiarlo).
- Aparece una palabra cada **0,4 s**. Al completar la página, permanece visible **1,2 s** antes de
  pasar a la siguiente; se aceptan hasta ocho páginas y los primeros 200 grafemas del texto.
- El tamaño y el salto de línea se recalculan en cada aparición, como en el video de referencia.

| Endpoint | Plantilla (Drive) | Parámetros propios |
|---|---|---|
| `/canvas/quotly` | `quotly.png` | `image`, `username`, `text`, `bg` + estilo |
| `/canvas/brat` | `brat.png` (referencia) | `text`, `bg`, `color`, `size`, `rotate`, `uppercase` + tipografía (`text.*`) |
| `/canvas/bratvideo` | `BratVideo.mp4` (referencia) | `text`, `words` (5 por pantalla), `size`, `bg`, `color`, `uppercase` + tipografía (`text.*`) |
| `/canvas/bratestirado` | (generado) | `text`, `color`, `size` + lente esférica (`lens.stretch`, `lens.aspect`, `lens.radius`, `lens.y`) |
| `/canvas/bratanime` | `bratanime.png` | `text` + estilo |
| `/canvas/bratcoyote` | `bratcoyote.png` | `text` en letra a mano (familia `hand`) + estilo (`font=sans` para cambiarla) |
| `/canvas/bratpinguino` | `BratPinguino.jpg` | `text` o `image`, `mode` + estilo |
| `/canvas/ttp` | (generado) | `text`, `color`, `bg`, `size` |
| `/canvas/attp` | (generado, WebM) | `text`, `size` |
| `/canvas/pov` | (generado) | `text` (se muestra como `pov: …`), `image`/`url`, `color`, `size` |
| `/canvas/x` | (generado) | `text` (se muestra como `x: …`), `image`/`url`, `color`, `size` |
| `/canvas/iqc` | `iqc.jpg` | `text` (la burbuja crece), `quote`, `username`, `time` + estilo |
| `/canvas/iqcblue` | `IqcBlue.jpg` | `text` (la burbuja crece) + estilo |
| `/canvas/iqcpink` | `IqcPink.jpg` | `text` (la burbuja crece) + estilo |
| `/canvas/messengerquote` | `MessengerQuote.jpg` | `text` (la burbuja crece) + estilo |
| `/canvas/profilenote` | `ProfileNote.jpg` | `text` (la burbuja crece), `image`, `label` + estilo |
| `/canvas/cuentatiktok` | `CuentaTiktok.jpg` | `username`, `image`, `status` |
| `/canvas/storyreply` | `StoryReply.jpg` | `url`, `text`, `color`, `size`, `zoom` |
| `/canvas/absolutecinema` | `AbsoluteCinema.jpg` | `text`, `subtext`, `url`, `color`, `size` |
| `/canvas/bobesponja` | `BobEsponja.jpg` | `text` o `url`, `mode` + estilo |
| `/canvas/bobesponja2` | `BobEsponjaBratV2` (736x904) | `text` o `url`, `mode` + estilo |
| `/canvas/bobesponja3` | `BobEsponjaBratV3` (1457x1079) | `text` o `url`, `mode` + estilo |
| `/canvas/cartelboy` | `CartelBoy.jpg` | `text` o `url`, `mode` + estilo |
| `/canvas/pcquote` | `PcQuote.jpg` | `url` o `text`, `mode`, `zoom` + estilo |
| `/canvas/canvaimagen` | `CanvaImagen.jpg` | `url`, `zoom`, `grayscale`, `rotate` |
| `/canvas/laptop` | `Laptop.jpg` | `url`, `zoom`, `grayscale`, `rotate` |
| `/canvas/searched` | `Searched.jpg` | `url`, `name`, `reward`, `zoom` |
| `/canvas/pc` | `Pc.jpg` | `url` (chroma-key del monitor) + estilo |
| `/canvas/google` | `Google.jpg` | `url` (los 5 resultados), `url2`…`url5`, `avatar` |
| `/canvas/carcel` | `Carcel.jpg` | `url` (chroma-key: quedás detrás de las rejas) + estilo |
| `/canvas/sunglass` | `SunGlass.jpg` | `url` (chroma-key: los lentes van encima) + estilo |
| `/canvas/trollface` | `TrollFace.jpg` | `url` (chroma-key: la cara va encima) + estilo |
| `/canvas/badface` | `BadFace.jpg` | `url` (chroma-key: la cara va encima) + estilo |
| `/canvas/pokemoncard` | `PokemonCard.jpg` | `name`, `hp`, `url`, `type`, `attack`, `damage`, `description` |
| `/canvas/emojimix` | Emoji Kitchen de Google | `emoji1`, `emoji2`, `size` — mezcla dos emojis en un sticker |
| `/canvas/ship` | `ship.png` | `image1`, `name1`, `image2`, `name2`, `percentage`, `text`, `color` |
| `/canvas/friendship` | `friendship.png` | igual que `ship` (círculos + 👍) |
| `/canvas/gaycard` | `gaycard.png` | `url`, `name`, `rank` |
| `/canvas/gay` | `gay.png` | `url`, `opacity` |
| `/canvas/invert` | `invert.png` | `url` |
| `/canvas/grayscale` | foto | `url`, `amount` (0-1), `tone` (`sepia` / `cold` / `warm`) |
| `/canvas/blur` | foto | `url`, `amount` (radio 0.3-100), `tint` |
| `/canvas/pixel` | foto | `url`, `size` (bloque 2-200), `colors` (paleta) |
| `/canvas/deepfry` | foto | `url`, `amount` (0-1), `noise` |
| `/canvas/sketch` | foto | `url`, `amount`, `detail`, `paper` (color del papel) |
| `/canvas/swirl` | foto | `url`, `amount` (grados), `radius`, `cx`, `cy` |
| `/canvas/liquify` | foto | `url`, `amount`, `mode` (`bulge` / `pinch` / `melt`), `radius`, `cx`, `cy` |
| `/canvas/glitch` | foto | `url`, `amount`, `slices`, `seed`, `scanlines` |
| `/canvas/rata` | `Canvas Personajes/Rata.jpg` | `url`, `zoom`, `rotate`, `grayscale` |
| `/canvas/banana` | `Canvas Personajes/Banana.jpg` | `url`, `zoom`, `rotate`, `grayscale` |
| `/canvas/arandano` | `Canvas Personajes/Arandano.jpg` | `url` (chroma-key) |
| `/canvas/pan` | `Canvas Personajes/Pan.jpg` | `url` (chroma-key) |
| `/canvas/galletita` | `Canvas Personajes/Galletita.jpg` | `url`, `zoom`, `rotate` |
| `/canvas/minions` | `Canvas Personajes/Minions.jpg` | `url`, `url2`, `url3`, `zoom` |

Cada `id` es el **nombre del archivo de Drive** en minúsculas (`CartelBoy.jpg` → `cartelboy`,
`Laptop.jpg` → `laptop`, `Searched.jpg` → `searched`, `PcQuote.jpg` → `pcquote`). Los nombres viejos
siguen funcionando como alias: `canvatextoxd`, `fotopc`, `sebusca` e `imagencanba`.

En los carteles con texto **o** imagen: deja `text` vacío y envía `url`/`image` (o `mode=image`)
para pegar la foto en el cartel.

### Imágenes: `url` o **galería**

Todos los canvas aceptan la foto de dos maneras:

| Cómo | Ejemplo |
|---|---|
| **URL** (http/https, o `dominio.com/foto.jpg` sin esquema) | `/canvas/searched?url=https://i.imgur.com/x.jpg` |
| **Galería** (imagen `data:` en el cuerpo del POST) | `POST /canvas/searched` con `{ "url": "data:image/jpeg;base64,..." }` |
| **Subida con URL corta** (lo que hace la web) | `POST /upload` → `{ "result": { "url": "…/upload/abc123" } }` → usá esa URL en cualquier canvas |

- Si **no mandás** imagen, se usa la foto predeterminada (`assets/defaults/`) — es a propósito.
- Si mandás una imagen y **no se puede usar**, la API responde **400** con el motivo
  (antes caía sin avisar a la foto predeterminada y parecía que el parámetro no hacía nada).
- `/upload` guarda la imagen **30 minutos** en memoria: sirve para probar, no como hosting.

```bash
curl "https://<host>/canvas/brat?text=hola%20mundo&color=ff2d55&size=1.4&rotate=-6" -o brat.png
curl "https://<host>/canvas/bratvideo?text=uno%20dos%20tres%20cuatro%20cinco%20seis&words=5" -o brat.mp4
curl "https://<host>/canvas/bratanime?text=Pulse%20API&uppercase=true&font=serif" -o anime.png
```

## 🛠️ Tools — 6

| Endpoint | Parámetros |
|---|---|
| `GET /tools/calculator` | `expr` (`+ - * / % ^ ( ) sqrt() cbrt() sin() cos() tan() ln() log() abs() fact() pi e tau phi`), `degrees` |
| `GET /tools/translator` | `text`, `to` (en, es, pt…), `from` (auto) |
| `GET /tools/morse` | `text`, `mode` (`encode` / `decode`), `separator` |
| `GET /tools/resize` / `POST /tools/resize` | `url`, `width`, `height`, `scale` (%), `fit` (`cover`/`contain`/`fill`/`inside`/`outside`), `format` (`png`/`jpg`/`webp`/`avif`), `quality`, `bg` — **Rezize**: cambia el alto y el ancho de una imagen |
| `GET /tools/tts` | `text`, `lang` (es, en…), `engine` (`auto`/`google`/`streamelements`), `voice`, `slow`, `direct` — **TextToSpeech**: texto → MP3 |
| `GET /tools/stt` / `POST /tools/stt` | `url` del audio (mp3/ogg/wav/m4a/webm), `lang`, `mime` — **SpeechToText**: audio → texto |

```bash
curl "https://<host>/tools/calculator?expr=(2+3)*4^2%2Bsqrt(81)"
curl "https://<host>/tools/translator?text=Hola&to=en"
curl "https://<host>/tools/morse?text=SOS"                 # → "... --- ..."
curl "https://<host>/tools/morse?text=...%20---%20...&mode=decode"
curl "https://<host>/tools/resize?url=https://…/foto.jpg&width=512&height=512" -o 512.png
curl "https://<host>/tools/tts?text=Hola%20Pulse&lang=es&direct=true" -o voz.mp3
curl "https://<host>/tools/stt?url=https://…/nota-de-voz.ogg"
```

**TextToSpeech no necesita claves**: usa el endpoint público de Google Translate (el mismo de
gTTS) y, si falla, StreamElements. El texto largo se parte en trozos y los MP3 se pegan en un
solo archivo. Para voces de Google Cloud alcanza con `GOOGLE_TTS_KEY`.

**SpeechToText sí necesita una clave** (no existe un servicio anónimo y estable que transcriba):
configurá `GROQ_API_KEY` (capa gratis, Whisper), `OPENAI_API_KEY`, `DEEPGRAM_API_KEY` o
`ASSEMBLYAI_API_KEY`. Sin ninguna, el endpoint responde `501` explicando qué falta; con la clave,
acepta `?url=` o `POST {"audio":"data:audio/mpeg;base64,…"}`.

**Imágenes y seguridad:** `POST /canvas/:id` y `POST /tools/resize` aceptan imágenes
`data:image/...;base64,...` en el JSON. El resize también admite `json=true`: devuelve metadatos
y una URL a la imagen. Las imágenes admitidas se validan y se limitan a 15 MB y 40 megapíxeles.
Las URLs de imágenes, audio STT y multimedia servido por proxy deben ser públicas: se rechazan
redes privadas, localhost y redirecciones hacia ellas.
Las subidas `/upload` duran 30 minutos, se guardan en memoria por proceso y no se comparten entre
instancias serverless; el probador envía la foto por POST para evitar esa dependencia.

> La API es pública y no tiene autenticación ni límites de frecuencia incorporados. Si habilitás
> un proveedor STT de pago o exponés procesamiento de archivos, añadí autenticación, cuotas,
> límites de concurrencia y restricciones de red saliente en el proxy/despliegue.

## 📥 Downloader — 9

| Endpoint | Parámetros |
|---|---|
| `GET /downloader/tiktok` | `url`, `direct` (`mp4` / `mp3`) — sin marca de agua |
| `GET /downloader/youtube` | `url` o `query`, `quality` (`auto` por defecto), `direct` (`mp4` / `mp3`) |
| `GET /downloader/facebook` | `url`, `direct` (`mp4`), `quality` (`hd` / `sd`) |
| `GET /downloader/instagram` | `url`, `direct` — reels, videos y fotos (carrusel completo) |
| `GET /downloader/pinterest` | `url` (pin), `direct` — imagen, GIF o video en tamaño original |
| `GET /downloader/mp3` | `url` o `query`, `direct`, `download` — MP3 real (ffmpeg) |
| `GET /downloader/mp4` | `url` o `query`, `quality` (`auto` por defecto), `direct` |
| `GET /downloader/play` | `query`, `direct`, `download`, `tries` — busca y devuelve la **canción completa** en MP3 |
| `GET /downloader/lyric` | `query`, `format` (`json` / `txt` / `lrc` / `brat`) — `brat` = PNG con **toda la letra** en estilo brat |

**`/downloader/play` y `/downloader/mp3` devuelven un MP3 de verdad.** YouTube sólo publica
audio en AAC/Opus dentro de un contenedor DASH (y con enlaces que caducan), así que el servidor
lo baja y lo convierte con ffmpeg (`libmp3lame`, 160 kbps). El MP3 queda cacheado una hora en
`os.tmpdir()/pulse-audio`: suena en cualquier navegador, se puede buscar dentro y se descarga
como `.mp3`. Si la conversión falla, se manda el stream original del proveedor, y si YouTube no
responde, `/downloader/play` prueba con los siguientes resultados de YouTube (`?tries=1…5`, 3 por
defecto) antes de rendirse, porque un video con el audio bloqueado no sirve. La idea es que `play`
suene **entera**, no un pedazo: si aun así todo YouTube falla, devuelve un **preview real de 30 s**
de Deezer (o iTunes) y el JSON lo marca con `preview: true` / `fullSong: false`.

**Video con sonido:** en modo automático (`quality=auto`) se elige la mejor resolución
que pueda reproducirse con audio. Si una pista DASH mejora la calidad, el servidor la une con
el audio mediante ffmpeg (`-c copy`); si el pegado falla, intenta un progresivo de menor calidad.
Si no hay video con sonido disponible, devuelve un error en lugar de servir video mudo.
El JSON indica el resultado en `hasAudio` y `video.mergedWithFfmpeg`.

- `quality` acepta `auto` (mejor disponible), `360`, `480`, `720`, `1080`, o `hd`/`fhd`.
- YouTube se resuelve con `youtubei.js` (InnerTube al día: firmas y `n`-token); los
  respaldos viejos (InnerTube crudo, Invidious, Piped) siguen ahí por si acaso.
- `direct=mp4` reproduce/descarga en streaming con `Range 206`; si el archivo se pegó con
  ffmpeg también acepta `Range`, así que se puede buscar dentro del video.

```bash
curl "https://<host>/downloader/tiktok?url=https://vt.tiktok.com/ZS43DntHW/"          # JSON
curl "https://<host>/downloader/tiktok?url=https://vt.tiktok.com/ZS43DntHW/&direct=mp4" -o video.mp4
curl "https://<host>/downloader/mp3?query=Twice%20I%20Cant%20Stop%20Me&direct=true"   -o cancion.mp3
curl "https://<host>/downloader/play?query=Twice%20Feel%20Special"              # JSON con playUrl
curl "https://<host>/downloader/play?query=Twice%20Feel%20Special&download=true" -o cancion.mp3
curl "https://<host>/canvas/brat?text=hola&download=true" -o brat.png
curl "https://<host>/downloader/lyric?query=Kendrick%20Lamar%20Humble&format=lrc"
```

### Cuando YouTube/Instagram/Facebook bloquean al servidor (cobalt)

YouTube (y cada vez más Instagram y Facebook) bloquean por **IP** a los servidores de las APIs
públicas: no es un error del código, es el mismo motivo por el que la instancia pública de
cobalt dejó de servir YouTube en 2025. Por eso todos los caminos tienen respaldos:

- **YouTube / MP3 / MP4 / Play**: `youtubei.js` (InnerTube con firmas y `n`-token) → InnerTube
  crudo → Invidious → Piped → **cobalt**.
- **Instagram**: 11 mirrors de embeds (InstaFix y sus forks mantenidos: `oginstagram`,
  `kkinstagram`, `instagramez`, `vxinstagram`, `kirkstagram`…) → embed oficial → **cobalt**.
- **Facebook**: móvil → embed → watch → mbasic → **cobalt** (y resuelve los enlaces `fb.watch`).
- **Pinterest**: API interna (`BaseSearchResource` / `PinResource`) → HTML del pin → **cobalt**.

Para mejorar la disponibilidad, podés apuntar la API a **tu propia instancia de cobalt** (
Docker o Railway: <https://github.com/imputnet/cobalt>). Se configura con variables de entorno,
sin tocar código:

| Variable | Ejemplo | Para qué |
|---|---|---|
| `COBALT_API_URL` | `https://cobalt-mi-api.up.railway.app` | instancia propia: se usa **primero** |
| `COBALT_API_URLS` | `https://a.midominio,https://b.midominio` | varias, separadas por coma |
| `COBALT_API_KEY` | `mi-clave` | se envía sólo a las instancias configuradas explícitamente |
| `COBALT_DISABLE` | `true` | apaga el respaldo (sólo las fuentes públicas) |

Sin configurar nada se prueban instancias comunitarias; si todas fallan, el endpoint responde
con el error de la fuente y `hint` (nunca un 500 sin explicación).

## 🔎 Searcher — 5

| Endpoint | Parámetros |
|---|---|
| `GET /searcher/tiktok` | `query`, `limit` (TikWM: portada, autor, estadísticas) |
| `GET /searcher/youtube` | `query`, `limit` (youtubei.js → InnerTube → Invidious → Piped) |
| `GET /searcher/google` | `query`, `limit`, `lang` (Google → DuckDuckGo lite → DuckDuckGo → Bing) |
| `GET /searcher/wikipedia` | `query`, `limit`, `lang` (extracto + imagen + URL) |
| `GET /searcher/pinterest` | `query`, `limit`, `page` — pines (imagen o video) con `downloadUrl` |

Cada buscador prueba sus motores en orden y devuelve `source`/`engine` con el que respondió,
así que si uno bloquea las peticiones los demás siguen funcionando.

```bash
curl "https://<host>/searcher/tiktok?query=anime%20edit&limit=5"
curl "https://<host>/searcher/youtube?query=Twice&limit=5"
curl "https://<host>/searcher/google?query=Pulse%20API&lang=es"
curl "https://<host>/searcher/wikipedia?query=One%20Piece&lang=es"
curl "https://<host>/searcher/pinterest?query=gatos%20aesthetic&limit=10"
curl "https://<host>/downloader/pinterest?url=https://www.pinterest.com/pin/1234567890/&direct=true" -o pin.jpg
curl "https://<host>/downloader/lyric?query=Twice%20Feel%20Special&format=brat" -o letra.png
```

## 💞 Reactions — 26 (proveedores de GIFs)

`hug`, `kiss`, `pat`, `slap`, `cuddle`, `wave`, `wink`, `blush`, `smile`, `happy`, `dance`, `cry`, `poke`,
`tickle`, `highfive`, `handhold`, `nom`, `bite`, `bonk`, `baka`, `smug`, `laugh`, `shrug`, `sleep`, `think`,
`thumbsup`.

- `GET /reactions/<reaccion>` → `{ reaction, label, provider, gif }`
- Parámetros: `provider` (`nekos.best` · `purrbot` · `otakugifs`), `direct=true` para el GIF. Los tres se
  prueban en paralelo (8 s), igual que anime.
- `GET /reactions/list` → catálogo de reacciones y proveedores.

```bash
curl "https://<host>/reactions/hug"
curl "https://<host>/reactions/pat?provider=purrbot&direct=true" -o pat.gif
```

---

## 🧩 Cómo agregar o editar un endpoint

Todo se toca, como mucho, en **3 archivos** y **sin clonar el repo**: en GitHub, abrí el archivo y
tocá el lápiz (**Edit file**) → *Commit changes* → *Propose changes* → *Create pull request*.

| Archivo | Qué se edita ahí | ¿Obligatorio? |
|---|---|---|
| [`src/catalog/<categoría>.js`](src/catalog) | La **ficha**: `id`, `desc` y `params`. Alimenta `/docs`, la web y el probador TEST. | ✅ Siempre |
| [`src/routes/<categoría>.js`](src/routes) | El **código** que responde `GET /<categoría>/:id`. | Solo si es nuevo |
| [`src/canvas/generators/<id>.js`](src/canvas/generators) | El **dibujo** (PNG) de un canvas. | Solo en canvas |

Guías: **[GUIA-ENDPOINTS-GITHUB.md](GUIA-ENDPOINTS-GITHUB.md)** (todo desde el navegador, sin instalar nada)
y **[CONTRIBUTING.md](CONTRIBUTING.md)** (guía completa con plantillas para copiar).

Atajos para editar directo en GitHub (`✏️`):

| Categoría | Ficha (parámetros y textos) | Código (respuesta) |
|---|---|---|
| **Anime** | [`src/catalog/anime.js`](https://github.com/lyanvalentinmail-prog/Pulse-api/edit/main/src/catalog/anime.js) | [`src/routes/anime.js`](https://github.com/lyanvalentinmail-prog/Pulse-api/edit/main/src/routes/anime.js) |
| **Canvas** | [`src/catalog/canvas.js`](https://github.com/lyanvalentinmail-prog/Pulse-api/edit/main/src/catalog/canvas.js) | [`src/routes/canvas.js`](https://github.com/lyanvalentinmail-prog/Pulse-api/edit/main/src/routes/canvas.js) |
| **Tools** | [`src/catalog/tools.js`](https://github.com/lyanvalentinmail-prog/Pulse-api/edit/main/src/catalog/tools.js) | [`src/routes/tools.js`](https://github.com/lyanvalentinmail-prog/Pulse-api/edit/main/src/routes/tools.js) |
| **Downloader** | [`src/catalog/downloader.js`](https://github.com/lyanvalentinmail-prog/Pulse-api/edit/main/src/catalog/downloader.js) | [`src/routes/download.js`](https://github.com/lyanvalentinmail-prog/Pulse-api/edit/main/src/routes/download.js) |
| **Searcher** | [`src/catalog/searcher.js`](https://github.com/lyanvalentinmail-prog/Pulse-api/edit/main/src/catalog/searcher.js) | [`src/routes/searcher.js`](https://github.com/lyanvalentinmail-prog/Pulse-api/edit/main/src/routes/searcher.js) |
| **Reactions** | [`src/catalog/reactions.js`](https://github.com/lyanvalentinmail-prog/Pulse-api/edit/main/src/catalog/reactions.js) | [`src/routes/reactions.js`](https://github.com/lyanvalentinmail-prog/Pulse-api/edit/main/src/routes/reactions.js) |
| **Canvas: medidas** | [`src/canvas/layouts.js`](https://github.com/lyanvalentinmail-prog/Pulse-api/edit/main/src/canvas/layouts.js) | [`src/canvas/generators/`](https://github.com/lyanvalentinmail-prog/Pulse-api/tree/main/src/canvas/generators) |

### Editar algo que ya existe

- **Descripción, ejemplo o parámetros** → `src/catalog/<categoría>.js`. Es texto: cambiá lo que
  quieras y listo (la web y `/docs` lo leen de ahí).
- **Valores por defecto de un canvas** (posición, color, tamaño) → `src/canvas/layouts.js`, en el
  bloque del canvas (`text`, `photo`, `bubble`, `msg`, `time`…).
- **El dibujo de un canvas** → `src/canvas/generators/<id>.js`. Cada canvas es **un archivo suelto**
  con una sola función.
- **Una fuente nueva para Downloader/Reactions** → `src/utils/providers.js` (primero
  [`assets/defaults/`](assets/defaults) y luego el `try/catch` de fuentes ya existente).

### Agregar un endpoint de texto/JSON (3 pasos)

1. **La ruta** — `src/routes/tools.js`:

   ```js
   router.get('/emoji', (req, res) => {
     const text = String(req.query.text || 'hola').slice(0, 100);
     return sendSuccess(res, { text, length: text.length });
   });
   ```

2. **La ficha** — `src/catalog/tools.js`:

   ```js
   { id: 'emoji', desc: 'Cuenta las letras de un texto', params: [
     P('text', 'hola', 'Texto a medir'),
     O('upper', 'false', 'true = devolver en MAYÚSCULAS')
   ] },
   ```

3. **Validar** — `npm run check` y `npm test`. La ruta aparece sola en `/home`, `/docs` y la web
   (los routers se montan una sola vez en `src/server.js`).

Parámetros: `P()` requerido · `O()` opcional · `S()` opcional con lista desplegable ·
`AV`/`AV2` avatar por defecto · `...textStyle()` / `...photoStyle()` estilos de texto y foto.

### Agregar un canvas (imagen) (4 pasos)

1. **El generador** — creá `src/canvas/generators/<id>.js` (se registra solo, no hay índice que
   tocar):

   ```js
   // src/canvas/generators/ejemplo.js
   const { sharp, P, partsOf, boxOf, txt, textLayer, templateMeta } = require('./_helpers');

   module.exports = async function ejemplo(q) {
     const parts = partsOf('ejemplo');
     const { buf, width: W, height: H } = await templateMeta(parts.template);
     const box = boxOf('ejemplo', 'text', q);
     const layer = textLayer({
       text: txt(q, 'Mi texto'), width: Math.round((box.x1 - box.x0) * W),
       height: Math.round((box.y1 - box.y0) * H), family: 'sans', weight: 700,
       maxFont: 64, maxLines: 3, align: 'middle', fill: '#ffffff'
     });
     return sharp(buf).composite([{
       input: layer.svg, left: Math.round(box.x0 * W), top: Math.round(box.y0 * H)
     }]).png().toBuffer();
   };
   ```

2. **Las medidas** — `src/canvas/layouts.js`:

   ```js
   ejemplo: {
     label: 'Ejemplo',
     parts: {
       template: 'ejemplo.jpg',                    // assets/templates/
       text: { box: { x0: 0.08, y0: 0.55, x1: 0.92, y1: 0.8 },
               font: { family: 'sans', weight: 700, maxFont: 64 }, fill: '#ffffff' }
     }
   },
   ```

3. **La ficha** — `src/catalog/canvas.js`:

   ```js
   { id: 'ejemplo', desc: 'Plantilla de ejemplo con tu texto', params: [
     P('text', 'Mi texto', 'Texto del cartel'), ...textStyle()
   ] },
   ```

4. **Validar** — `npm run check` + `npm test`, y mirá `GET /canvas/ejemplo?text=hola`.

**Reglas de oro de los canvas** (para no romper la fidelidad):

- Nada de `<text>` en SVG: siempre `textLayer()` (fuentes empaquetadas → nunca `▯▯▯`).
- El texto **crece** hacia abajo (más líneas, no letra más chica) y nunca se corta.
- Sin medidas clavadas en el código: van en `layouts.js` y se leen con `P`/`boxOf`.
- Todo parámetro nuevo tiene que poder pisarse por query (`<parte>.<clave>=valor`).

### Editar sin tocar código

Cada clave de `layouts.js` se puede pisar por URL:

```bash
curl "http://localhost:3000/canvas/iqc?msg.size=1.3&msg.color=ffe066&time.color=9ad0ff"
curl "http://localhost:3000/canvas/brat?text.size=1.2&text.fill=ff0044&canvas.bg=8ACE00"
```

| Clave | Qué controla |
|---|---|
| `x0, y0, x1, y1` | Área en fracciones (0–1) del lienzo/plantilla |
| `fill` / `color` / `bg` | Colores (hex sin `#`, o `white`, `black`…) |
| `size`, `font`, `weight`, `align`, `spacing`, `lineHeight`, `uppercase`, `rotate` | Tipografía |
| `radius`, `pad`, `zoom`, `opacity` | Formas, márgenes y foto |

### Antes de abrir el Pull Request

```bash
npm run check   # catálogo: ids, desc, parámetros, routers y canvas ↔ catálogo
npm run lint    # variables indefinidas, claves duplicadas y código inalcanzable
npm test        # smoke + 104 rutas HTTP + proveedores simulados
```

La CI (`.github/workflows/ci.yml`) corre validación, lint y pruebas en cada PR. Las pruebas de proveedores usan respuestas simuladas y no garantizan su disponibilidad real. Hay además una plantilla de
PR con el checklist y un formulario de *issue* para pedir endpoints nuevos.

## Desarrollo

```bash
npm install
npm start        # http://localhost:3000/home
npm run dev      # con --watch
npm run check    # valida el catálogo (ids, parámetros, canvas ↔ catálogo)
npm run lint     # análisis estático
npm test         # smoke + rutas HTTP + proveedores simulados
npm run test:endpoints  # todos los endpoints del catálogo
npm run test:integrations # rutas + proveedores reales, HTTP externo simulado
npm run test:providers  # lógica de proveedores y respaldos
```

Estructura:

```
src/
  catalog/                → el catálogo (home, categorías, /docs y probador TEST)
    index.js              → junta las categorías del catálogo
    helpers.js            → P(), O(), S(), AV, AV2, textStyle(), photoStyle()
    anime.js canvas.js tools.js downloader.js searcher.js reactions.js
  server.js               → Express + CORS abierto + páginas + routers
  routes/
    anime.js canvas.js tools.js download.js searcher.js reactions.js pages.js
  canvas/                 → motor de los canvas
    generators/           → un archivo por canvas (se cargan solos)
      _helpers.js         → piezas compartidas (carteles, huecos, medidores)
    layouts.js            → medidas y estilos por defecto de cada canvas
    parts.js              → overrides por query (<parte>.<clave>=valor)
    core.js               → sharp, texto, máscaras, lente…
  utils/
    providers.js          → todas las fuentes públicas (SFW)
    textEngine.js         → texto vectorial con fuentes empaquetadas (sin tofu)
    emoji.js              → emojis a color (recorta la hoja de sprites)
    canvasEngine.js       → fachada de src/canvas
    video.js              → bratvideo (MP4) y attp (WebM)
    image.js              → helpers de sharp/SVG
assets/
  templates/              → plantillas de la carpeta CategoriaCanvas de Drive
  fonts/                  → Inter, Playfair Display, JetBrains Mono y NotoEmoji
  emoji/                  → hoja de sprites de emojis a color + índice (Twemoji)
scripts/
  smoke.js                → render y pruebas generales
  test-endpoints.js       → todas las rutas del catálogo por HTTP
  test-integrations.js    → routers y proveedores con HTTP externo simulado
  test-providers.js       → proveedores y respaldos simulados
  validate-catalog.js     → npm run check
.github/workflows/ci.yml  → corre check + lint + test en cada PR
```

### Despliegue

**Render** (`render.yaml`): build `npm install`, start `npm start`. Es la opción recomendada para los
endpoints de descarga (sin límite de tamaño de respuesta).

**Vercel**: `vercel.json` ya declara `"framework": null` para que Vercel **no** intente usar el preset de
Next.js (`NEXT_NO_VERSION`), empaqueta `assets/**` (plantillas de Canvas), `public/**` y el binario de
ffmpeg, y enruta todo a la función `api/index.js`.

1. Importa el repo en Vercel y elige **Framework Preset: Other**.
2. En *Settings → Git → Production Branch* selecciona **`main`** (no una rama de `arena/…`).
3. Redeploy.

> En Vercel las peticiones y respuestas de funciones tienen un tope de ~4.5 MB. Para fotos de
> galería y archivos grandes de canvas o `/downloader/*?direct=…`, conviene usar Render u otro servidor.

---

## 📘 Apéndice — Cómo editar y agregar TODO en esta API (canvas, API, endpoints y más)

Esta sección es la guía completa de "aquí se toca todo". **No borra ni cambia nada de lo anterior**: solo agrega el paso a paso para editar lo que ya existe y para agregar cosas nuevas (endpoints de texto/JSON, canvas de imagen, categorías nuevas, plantillas, fuentes de datos…).

Si querés hacer los cambios **sin instalar nada**, leé también **[GUIA-ENDPOINTS-GITHUB.md](GUIA-ENDPOINTS-GITHUB.md)** (todo desde el navegador de GitHub). Esta versión es la de terminal/local.

---

### 1. Las 3 capas del proyecto (dónde está cada cosa)

Pensá la API en 3 capas que se leen entre sí:

| Capa | Archivos | Para qué sirve |
|------|----------|----------------|
| **Catálogo** | `src/catalog/<categoría>.js` | La ficha de cada endpoint: `id`, `desc`, `params`. De acá salen `/docs`, el home, la página de cada categoría y el probador **TEST** de la web. |
| **Rutas** | `src/routes/<categoría>.js` | El código que responde `GET /<categoría>/:id` (o `POST`). |
| **Generadores (canvas)** | `src/canvas/generators/<id>.js` + `src/canvas/layouts.js` | El dibujo de cada canvas (PNG/MP4/WebM) y sus medidas/estilos por defecto. |

**Regla de oro:** el catálogo manda. Si agregás un endpoint en el código pero no en el catálogo, responde pero no aparece en la web ni en `/docs`. Si lo agregás solo en el catálogo, aparece en la web pero puede dar 404.

Categorías actuales: `anime`, `canvas`, `tools`, `downloader`, `searcher`, `reactions`.

---

### 2. Cómo editar un endpoint que ya existe

#### 2.1 Descripción, ejemplo o parámetros (lo más común)

Editá `src/catalog/<categoría>.js`, buscá la entrada y cambiá el texto. Nada más: la web y `/docs` se actualizan solas.

```js
{ id: 'morse', desc: 'Código Morse: pasa texto a puntos y rayas (y al revés)', params: [
  P('text', 'SOS', 'Texto o código morse'),
  S('mode', 'encode', 'encode = texto → morse, decode = morse → texto', ['encode', 'decode']),
  O('separator', '/', 'Separador entre palabras al codificar')
] }
```

- `P(nombre, ejemplo, desc)` → parámetro **requerido** (chip `REQUERIDO`).
- `O(nombre, ejemplo, desc)` → parámetro **opcional** (chip `OPCIONAL`).
- `S(nombre, ejemplo, desc, [opciones])` → opcional con **lista desplegable**.
- `AV` / `AV2` como ejemplo → la web los reemplaza por los avatares por defecto.
- `...textStyle()` y `...photoStyle()` → los 8 parámetros de estilo (`color`, `size`, `font`…).

#### 2.2 Valores por defecto de un canvas (sin tocar código)

Las medidas y estilos viven en `src/canvas/layouts.js`, en bloques con nombre (`text`, `photo`, `bubble`, `msg`, `time`, `bar`, `title`…). Cada clave se puede pisar desde la URL:

```
/canvas/iqc?msg.size=1.3&msg.color=ffe066&bubble.width=0.6&time.color=9ad0ff
/canvas/brat?text.size=1.2&text.fill=ff0044&canvas.bg=8ACE00
```

| Clave | Qué controla |
|-------|--------------|
| `x0, y0, x1, y1` | Área en fracciones (0–1) de la plantilla o del lienzo |
| `color` / `fill` / `bg` | Colores (hex sin `#`, o `white`, `black`…) |
| `size` | Escala tipográfica (`0.5` = mitad, `2` = doble) |
| `font` (`sans`, `hand`, `serif`, `mono`), `weight`, `align`, `uppercase`, `spacing`, `lineHeight`, `rotate` | Tipografía |
| `radius`, `pad`, `zoom`, `opacity` | Formas, márgenes y fotos |

#### 2.3 El dibujo de un canvas

Editá `src/canvas/generators/<id>.js`. Cada canvas es un archivo suelto con una sola función que devuelve un `Buffer`.

#### 2.4 Fuentes de datos (Downloader, Reactions, Anime)

Editá `src/utils/providers.js` (orden de proveedores, respaldos, `firstSuccess`). Si un servicio se cae, se agrega otro a la lista: no se toca la ruta.

---

### 3. Cómo agregar un endpoint de texto/JSON nuevo (4 pasos)

#### Paso 1 — la ruta (`src/routes/<categoría>.js`)

Abrí el router de la categoría y agregá el handler **antes** de `module.exports = router;`:

```js
// GET /tools/palabras  →  { creator: 'Pulse', status: true, result: { … } }
router.get('/palabras', async (req, res) => {
  try {
    const text = String(req.query.text || '').trim();
    if (!text) return sendError(res, 400, 'Falta el parámetro text', 'Ejemplo: /tools/palabras?text=hola mundo');
    const words = text.split(/\s+/).filter(Boolean);
    return sendSuccess(res, { words: words.length, characters: text.length });
  } catch (e) {
    return sendError(res, 500, 'No se pudo procesar el texto', e.message);
  }
});
```

- Usá siempre `sendSuccess(res, objeto)` y `sendError(res, código, mensaje, pista)` (ya agregan `creator` y `status`).
- Lo que manda el usuario por URL está en `req.query`.
- Los nombres de los parámetros del catálogo tienen que coincidir con los que leés en `req.query`.
- El router ya está montado en `src/server.js` (`app.use('/tools', tools)`): no hay que registrar endpoint por endpoint.

#### Paso 2 — la ficha (`src/catalog/<categoría>.js`)

```js
{ id: 'palabras', desc: 'Cuenta palabras y caracteres de un texto', params: [
  P('text', 'hola mundo', 'Texto a analizar')
] }
```

#### Paso 3 — validar

```bash
npm run check   # valida ids, desc, parámetros, routers y canvas ↔ catálogo
```

#### Paso 4 — probar

```bash
npm start
# http://localhost:3000/home          → tarjeta con el contador actualizado
# http://localhost:3000/docs          → JSON del catálogo
# http://localhost:3000/tools/palabras?text=hola%20mundo
```

La ruta aparece sola en `/home`, `/docs` y la web.

---

### 4. Cómo agregar un canvas nuevo (imagen / PNG)

Un canvas es un generador que devuelve un `Buffer` y se **registra solo**: `src/canvas/generators/index.js` carga automáticamente todo `src/canvas/generators/*.js`. No hay índice que tocar.

#### Paso 1 — la plantilla (opcional)

- Si el canvas usa una imagen de fondo, subila a `assets/templates/` (Add file → Upload files en GitHub, o copiála localmente). JPG/PNG, idealmente ≤ 1500 px de ancho.
- Si el canvas dibuja todo por código (fondo generado), saltá este paso.

#### Paso 2 — el generador (`src/canvas/generators/<id>.js`)

Creá el archivo (nombre en minúsculas, sin espacios):

```js
// src/canvas/generators/miCanvas.js — canvas nuevo
const { sharp, templateMeta, partsOf, boxOf, txt, textLayer, styleOf } = require('./_helpers');

module.exports = async function miCanvas(q) {
  const parts = partsOf('miCanvas');                 // medidas de layouts.js
  const ov = styleOf(q);                             // color, size, font, rotate, x, y…
  const { buf, width: W, height: H } = await templateMeta(parts.template);
  const box = boxOf('miCanvas', 'text', q);          // área con overrides de la URL
  const text = txt(q, 'Mi texto');                   // query.text o el valor por defecto

  const layer = textLayer({
    text, width: Math.round((box.x1 - box.x0) * W), height: Math.round((box.y1 - box.y0) * H),
    family: 'sans', weight: 700, maxFont: 64, maxLines: 3, align: 'middle',
    fill: ov.fill || '#ffffff'
  });

  return sharp(buf).composite([{
    input: layer.svg, left: Math.round(box.x0 * W), top: Math.round(box.y0 * H)
  }]).png().toBuffer();
};
```

**Reglas de oro de los canvas:**

- **Nunca** `<text>` dentro de un SVG: usá `textLayer()` (fuentes empaquetadas → nunca `▯▯▯`).
  Familias: `sans` (Inter), `hand` (Caveat Brush, letra a mano de `bratcoyote`), `serif` (Playfair Display), `mono` (JetBrains Mono). Para sumar otra: copiá el `.ttf` a `assets/fonts` (con su licencia OFL al lado) y agregala a `FAMILIES` en `src/utils/textEngine.js`.
- Los textos **crecen hacia abajo** (más líneas, no letra más chica): `textLayer` + `fitLines`.
- Nada de medidas clavadas en el código: van en `layouts.js` y se leen con `P` / `boxOf`.
- Todo parámetro nuevo tiene que poder pisarse por query: `<parte>.<clave>=valor`.
- La imagen sale sin marco y el fondo respeta `?bg=` / `canvas.bg`.

#### Paso 3 — las medidas (`src/canvas/layouts.js`)

Agregá un bloque con el mismo `id`. Coordenadas en fracciones (0–1) del ancho/alto de la plantilla:

```js
miCanvas: {
  label: 'Mi canvas',
  parts: {
    template: 'MiPlantilla.jpg',                       // assets/templates/
    text: {
      box: { x0: 0.08, y0: 0.55, x1: 0.92, y1: 0.80 },
      font: { family: 'sans', weight: 700, maxFont: 64, maxLines: 3 },
      fill: '#ffffff'
    }
  }
},
```

Overrides en vivo: `/canvas/miCanvas?text.size=1.2&text.color=ff2d55&photo.y1=0.60`.

#### Paso 4 — la ficha (`src/catalog/canvas.js`)

```js
{ id: 'miCanvas', group: 'imagenes', desc: 'Tu foto dentro de Mi Plantilla', params: [
  P('url', AV, 'Tu foto (URL o galería)'),
  ...photoStyle()
] }
```

- `group`: sección de la web (`textos`, `brats`, `porcentajes`, `imagenes`, `filtros`, `personajes`). Ver `GROUPS` arriba de `src/catalog/canvas.js`.
- `media` (opcional): `'image'`, `'video'` o `'audio'` → la web muestra la vista previa correcta.

#### Paso 5 — validar y probar

```bash
npm run check
npm test                                   # renderiza todos los canvas
curl "http://localhost:3000/canvas/miCanvas?url=https://…/foto.jpg&text=hola" -o miCanvas.png
```

Para empezar, copiá el canvas más parecido:

| Querés… | Copiá de |
|---------|----------|
| Texto sobre plantilla fija | `generators/bratanime.js` o `generators/absolutecinema.js` |
| Foto del usuario en un hueco/recorte | `generators/rata.js` (`facePart`) o `generators/pan.js` (`chromaPart`) |
| Lienzo propio con fondo y texto | `generators/brat.js` o `generators/gaycard.js` |
| Chat / burbuja que crece | `generators/iqc.js` |
| Video | `bratvideo` y `attp` se resuelven en `src/routes/canvas.js` con `src/utils/video.js` |

---

### 5. Cómo se declaran los parámetros (`P`, `O`, `S`, `AV`, `AV2`…)

Todo sale de `src/catalog/helpers.js`:

| Helper | Qué hace |
|--------|----------|
| `P(nombre, ejemplo, desc)` | Parámetro **requerido** |
| `O(nombre, ejemplo, desc)` | Parámetro **opcional** |
| `S(nombre, ejemplo, desc, [opciones])` | Opcional con **lista desplegable** (`<select>`) |
| `AV` / `AV2` | Ejemplo especial: la web lo reemplaza por el avatar por defecto |
| `...textStyle()` | Agrega `color`, `size`, `font`, `uppercase`, `x`, `y`, `rotate`, `spacing` |
| `...photoStyle()` | Agrega `images` (varias fotos), `zoom`, `grayscale`, `rotate` |

Lo que verifica `npm run check` (y la CI en cada PR):

- `id` en minúsculas, sin espacios (letras, números y guiones).
- No dos endpoints con el mismo `id` dentro de la misma categoría.
- No dos parámetros con el mismo nombre en un endpoint.
- `desc` en todos los endpoints y en todos los parámetros.
- `media`, si está, tiene que ser `image`, `video` o `audio`.

---

### 6. Cómo agregar una categoría nueva (poco frecuente)

1. Creá `src/catalog/<id>.js` copiando otra (`id`, `name`, `endpoints`).
2. Sumala a `CATEGORIES` en `src/catalog/index.js` (el home las muestra por nombre).
3. Creá `src/routes/<id>.js` con su `express.Router()`.
4. Montala en `src/server.js`: `app.use('/<id>', require('./routes/<id>'))`.
5. Agregá la categoría a `ROUTES` en `scripts/validate-catalog.js`.

`npm run check` avisa si falta el router o si el catálogo y el motor no coinciden.

---

### 7. Cómo probar todo en local

```bash
npm install           # dependencias (Node 24.x)
npm start             # http://localhost:3000/home
npm run dev           # con --watch (se reinicia solo al guardar)
npm run check         # valida el catálogo
npm run lint          # análisis estático (eslint)
npm test              # smoke + 104 rutas HTTP + proveedores simulados + canvas
npm run test:endpoints   # todas las rutas del catálogo por HTTP
npm run test:integrations# routers y proveedores con HTTP externo simulado
npm run test:providers   # lógica de proveedores y respaldos simulados
```

URLs útiles de prueba:
- `http://localhost:3000/home` — dashboard con todas las tarjetas.
- `http://localhost:3000/docs` — catálogo JSON completo.
- `http://localhost:3000/canvas/<id>?text=hola` — probá cada canvas.
- `http://localhost:3000/<categoría>/<id>?param=valor` — probá cada endpoint.

---

### 8. Cómo subir los cambios (desde GitHub, sin clonar el repo)

1. Entrá al repo en GitHub y abrí el archivo que querés cambiar.
2. Tocá el lápiz ✏️ (*Edit this file*). Con la tecla **`.`** se abre github.dev, un editor completo en el navegador.
3. Hacé el cambio y tocá **Commit changes…**.
4. Elegí **Create a new branch for this commit and start a pull request**, ponle nombre a la rama (ej. `feat/micanvas`) y dale a **Propose changes**.
5. Se abre el Pull Request: poné un título claro (`feat(canvas): endpoint miCanvas` / `fix(tools): morse con acentos`).
6. Esperá a que los checks estén en verde ✅ (Vercel preview + check + test).
7. En **Files changed** revisá que el diff tenga **solo** lo que querías cambiar.
8. **Merge pull request** → **Confirm merge**. En ~2 minutos está en producción.
9. Borrá la rama con **Delete branch**.

**Si algo salió mal:** abrí el PR mergeado → **Revert** → se crea un PR de reversión → mergeá ese. También podés editar el archivo y hacer otro PR (es lo más rápido).

No se edita `main` directamente salvo cambios de textos (una coma, una descripción).

---

### 9. Checklist antes de abrir el Pull Request

- [ ] `npm run check` sin errores (los `⚠️` son avisos: revisalos igual).
- [ ] `npm test` en verde (incluye todos los canvas).
- [ ] Si agregaste un canvas: se ve bien en `/canvas/<id>` y responde a `?text=`, `?color=`, `?size=`.
- [ ] Texto largo probado (3–4 líneas): no se corta, no se achica de más.
- [ ] Sin `▯▯▯`: todo texto pasa por `textLayer`.
- [ ] Si es canvas nuevo: ¿tiene plantilla en `assets/templates/`, bloque en `layouts.js`, generador en `src/canvas/generators/` y ficha en `src/catalog/canvas.js` con `group`?
- [ ] Sin claves de IA ni contenido NSFW (fuentes SFW).
- [ ] Si agregaste o borraste un endpoint, actualizá su tabla en el README y el contador del título de la categoría.

---

### 10. Errores frecuentes y cómo solucionarlos

| Síntoma | Causa probable | Solución |
|---------|---------------|----------|
| Aparece en la web pero da **404** | Está en el catálogo y no en las rutas | Agregá el handler en `src/routes/<categoría>.js` |
| Responde pero **no aparece** en la web | Falta la ficha | Agregalo en `src/catalog/<categoría>.js` |
| Check falla: *"el id debe ser minúsculas"* | `PascalCase` o espacios | `miCanvas` → `micanvas` |
| Canvas devuelve la **foto predeterminada** | Nombre de parámetro que el generador no lee, o URL inválida | Usá `url`/`image` como figura en la ficha; si la URL es inválida responde **400** con el motivo |
| Texto se sale del cartel | `maxFont` muy grande para la caja | Bajá `maxFont` o achicá `maxLines` en `layouts.js` |
| Web muestra **cuadrado vacío** en vez de imagen | La plantilla no existe en `assets/templates/` | Subila con *Add file → Upload files* |
| PR dice *"This branch has conflicts"* | Alguien tocó la misma línea en `main` | **Resolve conflicts** en GitHub y elegí la versión correcta |
| Emoji/seña muestra `▯` | Se usó `<text>` en SVG en vez de `textLayer` | Reescribí esa parte con `textLayer()` y fuentes empaquetadas |

---

### 11. Despliegue (recordatorio)

**Render** (`render.yaml`): build `npm install`, start `npm start`. Recomendado para los endpoints de descarga (sin límite de tamaño de respuesta).

**Vercel** (`vercel.json`): declara `"framework": null` para que Vercel no use el preset de Next.js, empaqueta `assets/**` (plantillas de Canvas), `public/**` y el binario de ffmpeg, y enruta todo a `api/index.js`.

1. Importá el repo en Vercel y elegí **Framework Preset: Other**.
2. En *Settings → Git → Production Branch* seleccioná **`main`** (no una rama de `arena/…`).
3. Redeploy.

> En Vercel las peticiones y respuestas de funciones tienen un tope de ~4.5 MB. Para fotos de galería y archivos grandes de canvas o `/downloader/*?direct=…`, conviene usar Render u otro servidor.

---

Con esto tenés el mapa completo: **catálogo → rutas → generadores → pruebas → PR → producción**. Cualquier cosa nueva (canvas, API, endpoint, categoría) pasa por esos mismos pasos.

