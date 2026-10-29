# 🧩 Guía: agregar o editar un endpoint **desde GitHub**

Esta guía es para hacerlo **todo desde el navegador**, sin instalar nada: entrás al repo en
GitHub, editás el archivo, guardás en una rama nueva, abrís el Pull Request y lo mergeás.
Vercel publica el cambio solo.

> ¿Preferís trabajar en tu compu con `npm test`? Mirá [`CONTRIBUTING.md`](CONTRIBUTING.md),
> que es la versión paso a paso con la terminal. Los archivos y ejemplos son los mismos.

---

## 1. Lo que necesitás

- Una cuenta de GitHub con permiso de escritura en
  [`lyanvalentinmail-prog/Velirius-api`](https://github.com/lyanvalentinmail-prog/Velirius-api)
  (owner, colaborador o miembro de la organización).
- Nada más. No hace falta clonar, ni Node, ni VS Code.

---

## 2. Mapa rápido: dónde está cada cosa

| Quiero cambiar… | Archivo |
|---|---|
| La **descripción**, los **parámetros** o el **ejemplo** de un endpoint | `src/catalog/<categoría>.js` |
| Lo que **responde** un endpoint de texto/JSON | `src/routes/<categoría>.js` |
| **Cómo se ve** una canvas (foto, coordenadas, tipografía) | `src/canvas/layouts.js` |
| **El dibujo** de una canvas (código que compone la imagen) | `src/canvas/generators/<id>.js` |
| La **foto/plantilla** de una canvas | `assets/templates/` |
| Las **fotos por defecto** (cuando no mandás `url`) | `assets/defaults/` |
| El **orden de las carpetas** del home | `src/catalog/index.js` → `CATEGORIES` |
| El **texto de las páginas** (títulos, intro, botones) | `src/routes/pages.js` |
| Los **estilos** de la web | `public/css/style.css` |

Las categorías son `anime`, `canvas`, `tools`, `downloader`, `searcher` y `reactions`.
Cada una tiene **dos** archivos con su nombre: la ficha (`src/catalog/…`) y el router
(`src/routes/…`).

---

## 3. Regla de oro

> **El catálogo manda.** `src/catalog/<categoría>.js` es lo que alimenta el home, la página de
> la categoría, el probador **TEST** y `/docs`. Si agregás algo en el código pero no en el
> catálogo, no aparece en la web; si lo agregás solo en el catálogo, aparece pero puede dar 404.

Y el flujo de trabajo siempre es el mismo:

```
rama nueva → editás → Pull Request → esperás los checks → Merge → Vercel publica
```

No se edita `main` directamente salvo cambios de **textos** (una coma, una descripción).

---

## 4. Receta A — Editar un endpoint que ya existe

Ejemplo real: cambiar la descripción del endpoint `/tools/morse` y su ejemplo.

1. Abrí el archivo:
   [`src/catalog/tools.js`](https://github.com/lyanvalentinmail-prog/Velirius-api/blob/main/src/catalog/tools.js)
2. Arriba a la derecha del recuadro del código, tocá el **lápiz ✏️** (*Edit this file*).
3. Buscá la entrada y cambiala. Antes:

   ```js
   { id: 'morse', desc: 'Código Morse: codifica o decodifica texto', params: [
   ```

   Después:

   ```js
   { id: 'morse', desc: 'Código Morse: pasa texto a puntos y rayas (y al revés)', params: [
   ```

4. Tocá **Commit changes…**
5. En el diálogo:
   - Mensaje: `docs(morse): descripción más clara`
   - Elegí **Create a new branch for this commit and start a pull request**
   - Nombre de rama: `docs/morse`
   - **Propose changes**
6. Se abre el Pull Request → **Create pull request** → esperá los checks (2–3 min) →
   **Merge pull request** → **Confirm merge**.

Listo: el cambio se ve en `/tools`, en `/docs` y en el home en cuanto Vercel termina el deploy
(unos 2 minutos). El botón **Revert** del PR deshace todo si algo salió mal.

**Qué NO hace falta tocar** para editar una ficha: el router, el motor, ni la web. Los chips
`REQUERIDO`/`OPCIONAL`, el formulario del probador TEST y el JSON de `/docs` se generan solos
desde `params`.

### Cambiar el ejemplo que aparece en el probador

El segundo argumento de `P()`, `O()` y `S()` es el valor de ejemplo. Si lo cambiás, cambia el
placeholder de la web y la URL que muestra “Cómo usar el endpoint”.

```js
O('to', 'en', 'Idioma destino (en, es, pt, fr, ja…)')   // 'en' es el ejemplo
```

---

## 5. Receta B — Publicar un endpoint que ya tiene código

A veces el endpoint ya responde (existe en `src/routes/…`) pero no está en el catálogo. Se
agrega **solo** la ficha:

```js
{ id: 'morse', desc: 'Código Morse: codifica o decodifica texto', params: [
  P('text', 'SOS', 'Texto o código morse'),
  S('mode', 'encode', 'encode = texto → morse, decode = morse → texto', ['encode', 'decode']),
  O('separator', '/', 'Separador entre palabras al codificar')
] }
```

Cada ficha tiene siempre esta forma:

| Campo | Obligatorio | Para qué |
|---|---|---|
| `id` | sí | La ruta: `GET /<categoría>/<id>`. Minúsculas, números y guiones |
| `desc` | sí | Lo que se lee en la web, `/docs` y el README |
| `params` | sí | Lista de parámetros (puede ser `[]`) |
| `media` | no | `'image'`, `'video'` o `'audio'` → la web muestra la vista previa correcta |
| `group` | solo canvas | La sección donde se agrupa (**Textos**, **Brats**, **Porcentajes**…) |

---

## 6. Receta C — Agregar un endpoint nuevo (texto/JSON)

Son **dos** ediciones: el código que responde y la ficha.

### 6.1 El código (`src/routes/…`)

Abrí el router de la categoría y agregá el handler **antes** de `module.exports = router;`:

```js
// src/routes/tools.js
router.get('/palabras', (req, res) => {
  const text = String(req.query.text || '').trim();
  if (!text) return sendError(res, 400, 'Falta el parámetro text', 'Ejemplo: /tools/palabras?text=hola mundo');
  const words = text.split(/\s+/).filter(Boolean);
  return sendSuccess(res, { words: words.length, characters: text.length });
});
```

- `sendSuccess(res, objeto)` → `{ creator, status: true, result: … }`.
- `sendError(res, código, mensaje, pista)` → `{ creator, status: false, error, hint }`.
- Lo que el usuario manda por URL está en `req.query`.
- Los parámetros se pueden llamar como quieras, pero **los nombres del catálogo tienen que
  coincidir** con los que leés en `req.query`.

El router ya está montado en `src/server.js`, así que no hay nada más que enganchar.

### 6.2 La ficha (`src/catalog/…`)

```js
{ id: 'palabras', desc: 'Cuenta palabras y caracteres de un texto', params: [
  P('text', 'hola mundo', 'Texto a analizar')
] }
```

### 6.3 Probalo

- Directo: `https://TU-DOMINIO/tools/palabras?text=hola%20mundo`
- En la web: `/tools` → **Test** en la fila *PALABRAS*
- En el catálogo: `/docs` → `tags.tools` → la entrada nueva

---

## 7. Receta D — Agregar una canvas nueva (imagen)

Son **tres** ediciones + la plantilla. El motor carga los generadores solo: no hay que
registrar nada.

### 7.1 La plantilla

- **Add file → Upload files** en `assets/templates/` y arrastrá la imagen
  (`.jpg`/`.png`, idealmente ≤ 1500 px de ancho).
- Si el canvas no usa plantilla (dibuja todo por código), saltá este paso.

### 7.2 El generador — `src/canvas/generators/<id>.js`

**Add file → Create new file**, nombre `src/canvas/generators/miCanvas.js`:

```js
// src/canvas/generators/miCanvas.js — canvas nuevo
const { sharp, templateMeta, loadImageBuffer, partsOf, boxOf, txt, imgParam, placeTextArea } = require('../core');

module.exports = async function miCanvas(q) {
  const parts = partsOf('miCanvas');                 // medidas de layouts.js
  const { buf, width, height } = await templateMeta(parts.template); // plantilla

  // Traer la foto del usuario (o la predeterminada si no manda nada)
  const user = await loadImageBuffer(imgParam(q, 'url', 'image', 'img'));

  // …componer con sharp…
  return sharp(buf).png().toBuffer();
};
```

Los helpers disponibles están en `src/canvas/core.js` (`photoPart`, `facePart`, `textPart`,
`signPart`, `meter`, `styleOf`, `numberIn`, `flag`…). Copiar un generador parecido es la vía
más rápida: están todos en
[`src/canvas/generators/`](https://github.com/lyanvalentinmail-prog/Velirius-api/tree/main/src/canvas/generators).

### 7.3 Las medidas — `src/canvas/layouts.js`

Agregá un bloque con el mismo `id`. Las coordenadas son **fracciones (0–1)** del ancho/alto de
la plantilla, y cualquier valor se puede pisar desde la URL:

```js
  miCanvas: {
    label: 'Mi canvas',
    parts: {
      template: 'MiPlantilla.jpg',
      photo: { box: { x0: 0.20, y0: 0.18, x1: 0.62, y1: 0.62 } },
      text: {
        box: { x0: 0.10, y0: 0.66, x1: 0.90, y1: 0.86 },
        font: { family: 'sans', weight: 700, maxFont: 64, lineHeight: 1.15, maxLines: 3 },
        fill: '#111111'
      }
    }
  },
```

Overrides en vivo: `/canvas/miCanvas?photo.y1=0.60&text.size=1.2&text.color=ff2d55`.

Tipografías disponibles sin instalar nada: `sans` (Inter), `hand` (Caveat Brush, la letra a mano de
`bratcoyote`), `serif` (Playfair) y `mono` (JetBrains Mono). Se cambian con `?font=hand`, por ejemplo.

### 7.4 La ficha — `src/catalog/canvas.js`

```js
{ id: 'miCanvas', group: 'imagenes', desc: 'Tu foto dentro de Mi Plantilla', params: [
  P('url', AV, 'Tu foto (URL o galería)'),
  ...photoStyle()
] }
```

`group` es la sección de la web (ver `GROUPS` arriba del archivo): `textos`, `brats`,
`porcentajes`, `imagenes`, `filtros` o `personajes`.

### 7.5 Probalo

`/canvas/miCanvas?url=https://…/foto.jpg` → tiene que devolver un PNG.

---

## 8. Cómo se declaran los parámetros

Todo sale de `src/catalog/helpers.js`:

| Helper | Qué hace |
|---|---|
| `P(nombre, ejemplo, desc)` | Parámetro **requerido** |
| `O(nombre, ejemplo, desc)` | Parámetro **opcional** |
| `S(nombre, ejemplo, desc, [opciones])` | Opcional con **lista desplegable** |
| `AV` / `AV2` | Ejemplo especial: la web lo reemplaza por el avatar por defecto |
| `...textStyle()` | Agrega `color`, `size`, `font`, `uppercase`, `x`, `y`, `rotate`, `spacing` |
| `...photoStyle()` | Agrega `zoom`, `grayscale`, `rotate` |

Reglas que verifica `npm run check` (y el CI):

- `id` en minúsculas, sin espacios (letras, números y guiones).
- No puede haber dos endpoints con el mismo `id` **dentro de la misma categoría**.
- No puede haber dos parámetros con el mismo nombre en un endpoint.
- `desc` en todos los endpoints y en todos los parámetros.
- `media`, si está, tiene que ser `image`, `video` o `audio`.

---

## 9. Probar antes de mergear

| Qué | Cómo |
|---|---|
| La URL responde | `https://TU-DOMINIO/<categoría>/<id>?param=valor` |
| La web lo muestra | Preview de Vercel del PR (comentario *Visit Preview*), o `/` y `/canvas` |
| El catálogo | `/docs` → `tags.<categoría>` |
| Imagen que se ve | Abrí la URL en una pestaña: si es un PNG, se ve la imagen |

Desde el PR, GitHub corre los checks en cada push:

- **Vercel** → compila y deja una preview para abrir la web con los cambios.
- **check / test** → valida el catálogo y renderiza todas las canvas.

Si un check queda en rojo, entrá a *Details*: dice el archivo y la línea.

> ¿Tocaste un canvas y la imagen sale mal? Compará con la plantilla de
> `assets/templates/`: casi siempre es una coordenada en `layouts.js` o un texto que no
> entra en su caja (`maxFont`/`maxLines`).

---

## 10. Abrir, revisar y mergear el Pull Request

1. Título claro: `feat(canvas): endpoint miCanvas` · `fix(tools): morse con acentos`.
2. En **Files changed** revisá el diff: tiene que estar **solo** lo que querías cambiar.
3. Esperá a que los checks estén en verde ✅.
4. **Merge pull request** → **Confirm merge**.
5. Borrá la rama con **Delete branch** (el PR ya quedó mergeado).
6. En ~2 minutos el cambio está en producción.

**Si algo salió mal:** abrí el PR mergeado → **Revert** → se crea un PR de reversión → mergeá
ese. También podés volver a editar el archivo y hacer otro PR (es lo más rápido).

---

## 11. Checklist antes de guardar

- [ ] ¿El `id` está en minúsculas y coincide con la ruta real?
- [ ] ¿Agregué la ficha en `src/catalog/…` (y la `desc` de cada parámetro)?
- [ ] ¿Los nombres de los parámetros coinciden con los que lee el código?
- [ ] Si es canvas: ¿está el bloque en `layouts.js` y la plantilla en `assets/templates/`?
- [ ] Si es canvas: ¿elegí el `group` correcto (Textos, Brats, Imágenes…)?
- [ ] ¿Probé la URL con un valor real antes de pedir el merge?
- [ ] ¿El mensaje del commit explica **qué** y **por qué**?

---

## 12. Errores frecuentes

| Síntoma | Causa | Solución |
|---|---|---|
| El endpoint aparece en la web pero da **404** | Está en el catálogo y no en las rutas | Agregá el handler en `src/routes/…` |
| La URL responde pero **no aparece** en la web | Falta la ficha | Agregalo en `src/catalog/…` |
| El check falla con *“el id debe ser minúsculas”* | `PascalCase` o espacios | `miCanvas` → `micanvas` |
| El canvas devuelve la **foto predeterminada** | La imagen llegó con un nombre de parámetro que el generador no lee, o la URL no es válida | Usá `url`/`image` tal como figura en la ficha; si la URL es inválida responde **400** con el motivo |
| El texto se sale del cartel | `maxFont` muy grande para la caja | Bajá `maxFont` o achicá `maxLines` en `layouts.js` |
| La web muestra un **cuadrado vacío** en vez de la imagen | La plantilla no existe en `assets/templates/` | Subila con *Add file → Upload files* |
| El PR dice *“This branch has conflicts”* | Alguien tocó la misma línea en `main` | **Resolve conflicts** en GitHub y elegí la versión correcta |

---

## 13. Atajos útiles

- Editar cualquier archivo rápido: abrí el repo y apretá **`.`** (punto) → se abre
  github.dev, un editor completo en el navegador, con búsqueda y vista de diff.
- Ver qué cambió en producción: pestaña **Actions** y **Deployments** del repo.
- Buscar un parámetro en todo el repo: en GitHub, `/` y escribís (ej. `reward`).
- Agregar una plantilla: `assets/templates` → **Add file → Upload files** → arrastrar → Commit.
