# 🧩 Guía: agregar o editar un endpoint **desde GitHub** (sin clonar el repo)

Todo se puede hacer desde el navegador: abrís el archivo, lo editás y GitHub te
ofrece el Pull Request.

## 1. Lo que necesitás

- Cuenta de GitHub con permiso de escritura en `lyanvalentinmail-prog/Pulse-api`.
- Nada más: la web de GitHub tiene editor, vista previa y creación de PR.

## 2. Mapa rápido: dónde está cada cosa

| Quiero… | Archivo |
|---|---|
| ver qué endpoints hay | `src/catalog/<categoría>.js` |
| cambiar una descripción, ejemplo o parámetro | `src/catalog/<categoría>.js` |
| cambiar el código que responde | `src/routes/<categoría>.js` |
| cambiar el dibujo de un canvas | `src/canvas/generators/<id>.js` |
| cambiar medidas de un canvas | `src/canvas/layouts.js` |
| agregar un canvas nuevo | generador + `layouts.js` + `src/catalog/canvas.js` + `ALLOWED` en `src/routes/canvas.js` |
| cambiar la web | `public/` (`home.html`, `css/style.css`, `js/`) |

Las categorías son: `anime`, `canvas`, `ia`, `descargas`, `busquedas`,
`imagenes`, `herramientas`, `juegos`, `audios`. Hoy sólo **canvas** tiene
endpoints (`brat`, `bratvideo`); las demás están vacías y listas.

## 3. Regla de oro

Un endpoint publicado necesita **dos** piezas:

1. la ruta en `src/routes/<categoría>.js` (el código);
2. la ficha en `src/catalog/<categoría>.js` (lo que se ve en la web y en `/docs`).

Si falta la ficha, el endpoint existe en la API pero no aparece en la web.
Si falta la ruta, la web muestra un 404 al probarlo.

## 4. Receta A — Editar un endpoint que ya existe

1. Abrí `src/catalog/canvas.js`.
2. Buscá el `id` (por ejemplo `brat`) y cambiá `desc` o cualquiera de sus `params`.
3. Abajo, `Commit changes` → nombre claro (`brat: aclara el parámetro words`).
4. GitHub abre el PR: revisá el diff y `Create pull request`.

### Cambiar el ejemplo que aparece en el probador

Es el segundo valor del parámetro:

```js
P('text', 'Hehe this is brat 💸', 'Texto del sticker')
//         ^^^^^ este es el ejemplo que se precarga en la web
```

## 5. Receta B — Publicar un endpoint que ya tiene código

1. Abrí `src/routes/<categoría>.js` y copiá el `id` de la ruta:
   `router.get('/hola', …)` → `hola`.
2. Abrí `src/catalog/<categoría>.js` y agregá la ficha dentro de `endpoints: []`:

```js
{ id: 'hola', desc: 'Qué hace', params: [
  P('text', 'hola', 'Texto principal')
] }
```

3. Commit + PR. En el PR, revisá que la pestaña **Checks** quede verde
   (`npm run check`, `lint` y `npm test` corren solos en CI).

## 6. Receta C — Agregar un endpoint nuevo (texto/JSON)

### 6.1 El código (`src/routes/<categoría>.js`)

```js
const { sendError } = require('../utils/response');

router.get('/morse', (req, res) => {
  const { text, mode } = req.query;
  if (!text) return sendError(res, 400, 'Falta el parámetro text');
  const result = { text, mode: mode || 'encode' };
  return res.json({ creator: config.creator, status: true, result });
});
```

El router ya está montado en `src/server.js`: no hay que tocar ese archivo.

### 6.2 La ficha (`src/catalog/<categoría>.js`)

```js
{ id: 'morse', desc: 'Texto a morse y viceversa', params: [
  P('text', 'hola', 'Texto a convertir'),
  S('mode', 'encode', 'encode o decode', ['encode', 'decode'])
] }
```

### 6.3 Probalo

- Local: `npm start` → `http://localhost:3000/herramientas` → `Test`.
- En producción: `https://<tu-dominio>/herramientas/morse?text=hola`.
- Catálogo JSON: `https://<tu-dominio>/docs`.

## 7. Receta D — Agregar un canvas nuevo (imagen)

### 7.1 La plantilla (opcional)

Si el canvas usa una imagen de fondo, va en `assets/templates/`.

### 7.2 El generador — `src/canvas/generators/<id>.js`

```js
module.exports = async function <id>(q = {}) {
  // devolver un Buffer PNG
};
```

### 7.3 Las medidas — `src/canvas/layouts.js`

Agregá un bloque con el mismo `<id>` y sus partes (`canvas`, `text`, …).

### 7.4 La ficha — `src/catalog/canvas.js`

```js
{ id: '<id>', group: 'brats', desc: 'Qué hace', media: 'image', params: [...] }
```

### 7.5 Habilitarlo

En `src/routes/canvas.js`, sumá el id a `ALLOWED`:

```js
const ALLOWED = new Set(['brat', 'bratvideo', '<id>']);
```

### 7.6 Probalo

`npm run check` (cuadra catálogo ↔ motor) y `http://localhost:3000/canvas/<id>?text=hola`.

## 8. Cómo se declaran los parámetros

| Helper | Resultado |
|---|---|
| `P(nombre, ejemplo, desc)` | requerido, input de texto |
| `O(nombre, ejemplo, desc)` | opcional, input de texto |
| `S(nombre, ejemplo, desc, [opciones])` | opcional, lista desplegable |
| `textStyle()` | bloque de estilo de texto |
| `photoStyle()` | bloque de imagen de la galería |

## 9. Probar antes de mergear

El PR corre la CI automáticamente (`.github/workflows/ci.yml`):

```
npm run check   → catálogo (ids, params, canvas ↔ catálogo)
npm run lint    → variables, claves duplicadas, código inalcanzable
npm test        → smoke de la web + endpoints publicados + pruebas de brat
```

Si algo falla, la pestaña **Checks** del PR muestra el mensaje exacto.

## 10. Abrir, revisar y mergear el Pull Request

1. Revisá la pestaña **Files changed**.
2. Esperá a que **Checks** quede en verde.
3. `Merge pull request` → `Confirm merge`.
4. Render / Vercel despliegan solos desde `main`.

## 11. Checklist antes de guardar

- [ ] El `id` está en minúsculas, sin espacios
- [ ] `desc` explica en una línea qué hace
- [ ] Cada parámetro tiene nombre, ejemplo y descripción
- [ ] El endpoint devuelve `{ creator, status, result }`
- [ ] Ninguna clave de IA ni contenido NSFW en el código
- [ ] README actualizado si cambió la lista

## 12. Errores frecuentes

| Síntoma | Causa | Solución |
|---|---|---|
| El endpoint da 404 en la web | falta la ficha en el catálogo | agregala en `src/catalog/<categoría>.js` |
| Aparece la fila pero el Test falla | falta la ruta o tiene otro `id` | revisá `src/routes/<categoría>.js` |
| `/canvas/<id>` da 404 | el id no está en `ALLOWED` | sumalo en `src/routes/canvas.js` |
| `npm run check` falla | id repetido, params sin descripción o canvas sin generador | leé el mensaje: dice el id exacto |

## 13. Atajos útiles

- `https://github.com/lyanvalentinmail-prog/Pulse-api/blob/main/src/catalog/canvas.js` → editar la ficha.
- `https://github.com/lyanvalentinmail-prog/Pulse-api/blob/main/src/routes/` → todos los routers.
- `https://github.com/lyanvalentinmail-prog/Pulse-api/compare` → abrir un PR a mano.
