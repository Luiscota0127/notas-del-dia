# Reglas de parsing

El parser es puro: `string` → `Task[]`. Sin React, sin fetch, sin estado. Por eso
es trivial de testear y por eso vive en `src/lib/parse.ts` sin dependencias.

## Contrato

```ts
type TaskKind = "check" | "bullet" | "text" | "heading" | "blank"

type Task = {
  raw: string // la línea tal cual se escribió, sin trim
  kind: TaskKind
  done: boolean // solo meaningful en kind === "check"
  time?: string // "7:30am", normalizado a minúscula
  timeRange?: [string, string] // ["7:00pm", "9:00pm"]
  title: string // sin el prefijo de checkbox/bullet, sin la hora, sin paréntesis de responsables
  assignees: string[]
}
```

`raw` se conserva **siempre**. Es la fuente de verdad. Si el parse pierde
información, se pierde en `title`, nunca en `raw`.

## Orden de detección

Una línea pasa por estas reglas en orden. La primera que aplica gana.

### 1. `blank`

`line.trim() === ""` → `kind: "blank"`, todo lo demás vacío.

Se preserva al renderizar. El aire entre ideas es intencional.

### 2. `heading`

- `^([A-ZÁÉÍÓÚÑ]{3,})\s*$` sin `☐` ni `•` → mes (`SEPTIEMBRE`).
- `^(LUNES|MARTES|MIÉRCOLES|JUEVES|VIERNES|SÁBADO|DOMINGO)\s+\d{1,2}\s+[A-Z]{3}$` →
  día (`MARTES 01 SEP`).

Con o sin `#` al inicio, por si alguien escribe Markdown a mano. Con `#` el título
es el texto sin los `#`.

### 3. `check`

Prefijo `☐`, `☑`, `☒` o `[ ]` / `[x]`, seguido de espacio.

`done` es `true` para `☑`, `☒` y `[x]`. Al alternar, se preserva el carácter que
usaba, no se cambia por otro: si escribió `[x]`, sigue siendo `[x]`.

### 4. `bullet`

Prefijo `-`, `*` o `•`, seguido de espacio. El `•` puede ir seguido de **dos**
espacios (ver el ejemplo real). `done` es siempre `false`: un bullet no es una
tarea completable.

### 5. `text`

Todo lo demás. Puede tener o no hora.

## Hora

### Regex

```regex
/^(\d{1,2}:\d{2})\s*([ap])\.?m\.?(\s+a\s+(\d{1,2}:\d{2})\s*([ap])\.?m\.?)?/i
```

Casos que debe cubrir, todos fixtures obligatorios:

| Entrada | Resultado |
|---|---|
| `7:30am publicar ventas` | `time: "7:30am"`, `title: "publicar ventas"` |
| `11:00pm dormir 😴` | `time: "11:00pm"`, `title: "dormir 😴"` |
| `6:00 PM hacer ejercicio` | `time: "6:00pm"` (minúscula), `title: "hacer ejercicio"` |
| `6:00pm hacer ejercicio` | `time: "6:00pm"`, `title: "hacer ejercicio"` |
| `7:00pm a 9:00pm luis didi` | `time: "7:00pm"`, `timeRange: ["7:00pm", "9:00pm"]`, `title: "luis didi"` |
| `7:00PM a 9:00AM luis didi` | normalizado a minúscula en ambos extremos |
| `7 pm` | **no** matchea. Requiere `:mm`. Es una tarea de texto normal. |
| `publicar a las 7:30am` | **no** matchea. La hora va al inicio de la línea. |
| `08 sep (dosis 3)` | **no** matchea. `08` no es `8:08`. |

Esa última fila importa: `08 sep` empieza con dígitos y es tentador matchearlo. La
exigencia de `:` lo evita.

### `pm` con punto

Se acepta `a.m.` y `p.m.` con puntos. Es un bullet que no le va a costar nada
aceptar.

### Normalización

Siempre minúscula, sin puntos: `"7:30am"`. `am`/`pm` en minúscula para que
comparar contra `"7:00pm"` funcione sin `toLowerCase` en cada llamada.

### Para el recordatorio

`time` es la hora de aviso. En un rango, la **inicial**. `7:00pm a 9:00pm luis
didi` avisa a las 19:00, no a las 21:00.

## Responsables

### Regex

```regex
/\(([^()]*)\)/g
```

Dentro de cada paréntesis, se extraen nombres así:

1. Separar por `/`, `,` o ` y `.
2. Cada trozo se `trim()`.
3. Es responsable si cumple **todo**:
   - entre 1 y 3 palabras,
   - cada palabra empieza con mayúscula,
   - todo en letras (con acentos), sin dígitos ni signos de puntuación.

`"(Luis raspar/ Nahomi pintar)"` → cada trozo es `Luis raspar` y `Nahomi pintar`.
Cada uno pasa el filtro → `["Luis raspar", "Nahomi pintar"]`.

### Por qué este filtro es estrecho a propósito

Los paréntesis de la nota real tienen tres usos distintos y el parser tiene que
distinguir los tres:

| Entrada | Resultado | Motivo |
|---|---|---|
| `(Luis)` | `["Luis"]` | nombre propio, 1 palabra |
| `(Nahomi)` | `["Nahomi"]` | nombre propio, 1 palabra |
| `(Luis raspar/ Nahomi pintar)` | `["Luis raspar", "Nahomi pintar"]` | 2 palabras, capitalizadas, `/` separa |
| `(Ya que esté establecido la venta desayunos)` | `[]` | 7 palabras, y `que` en minúscula |
| `(buscar entro de salud)` | `[]` | 4 palabras, todas en minúscula |
| `(dosis 3 de anti pulgas mishibu)` | `[]` | contiene el dígito `3` |
| `(08 sep)` | `[]` | contiene dígitos |

Un filtro laxo de "lo que está en paréntesis es un responsable" convierte la nota
en basura. El filtro estricto acepta los 3 casos reales y rechaza los 4 de ruido.

**Consecuencia:** `title` excluye solo los paréntesis que se consumieron como
responsables. `(dosis 3 de anti pulgas mishibu)` sigue dentro del `title`, porque
es contenido, no responsable.

## Casos borde ya resueltos

Decididos. No los re-litigues sin motivo.

| Entrada | Decisión | Motivo |
|---|---|---|
| `☐ 08 sep (dosis 3 de anti pulgas mishibu)` | `time: undefined` | `08` no tiene `:` |
| `☐ Buscar tratar celulitis  Nahomi` | `assignees: []` | nombre **fuera** de paréntesis. No inventar estructura. |
| `•  preparar comida del día` | `kind: "bullet"`, `done: false` | un bullet no es completable |
| `# SEPTIEMBRE` | `kind: "heading"` | por si escribe Markdown a mano |
| Línea con tabulador | se normaliza a espacio | no romper el render |
| Línea con `\r` (CRLF) | se quita el `\r` | venimos de Postgres en Windows |
| Más de un `☐` en la línea | solo cuenta el primero | no hay caso de uso; no lo soportes |
| Paréntesis anidados | no se parsean | no hay caso de uso |

## Filtrado de líneas en blanco

`parseNote("")` devuelve `[]`, no `[{ kind: "blank" }]`. Un note vacío no tiene una
línea en blanco, tiene cero líneas. leading/trailing blanks se conservan; los del
medio también, porque separan ideas.

## Performance

`parseNote` corre en cada render y en cada búsqueda. Restricciones:

- Una sola pasada por línea. Nada de `O(n²)`.
- Sin `String.prototype.normalize`, sin ICU, sin regex global reutilizado entre
  llamadas sin reset.
- Para la vista de semana no reparsees el mismo body dos veces: cachea por
  `note.updated_at`.
