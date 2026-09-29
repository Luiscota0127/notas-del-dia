# Prompt de construcción

> Este archivo es el brief para un agente de código. Está escrito para poder pegarse
> en una sesión nueva sin contexto previo. `AGENTS.md` y
> `.opencode/skills/notas-formato/` son el contrato permanente; este prompt explica
> el porqué.

# App de pendientes compartida — "Notas del día"

Construye una **PWA responsive** para reemplazar Notion en el uso diario de una
pareja. Replicar exactamente cómo ya anotan, sin límites de bloques, con
sincronización entre dispositivos y con recordatorios en iPhone.

## Contexto de uso real

Hoy usan dos cosas distintas en Notion:

- Yo uso vista de base de datos con checkboxes.
- Ella usa un **bloque de notas** con texto libre: encabezado de mes en mayúsculas,
  luego el día, y debajo líneas que mezclan checkboxes (`☐`), bullets (`•`) y
  líneas con hora (`7:30am ...`).

Este es un ejemplo REAL de su escritura. Es la referencia de formato, respétalo al
pie de la letra:

```
SEPTIEMBRE

☐ 08 sep (dosis 3 de anti pulgas mishibu)
☐ Ya volver a reuniones PT . (Ya que esté establecido la venta desayunos)
☐ Buscar tratar celulitis  Nahomi
☐ Tapar drenaje con cemento. (Luis)
☐ Pintar cuarto  nuestro (Luis raspar/ Nahomi pintar)

MARTES 01 SEP

•  inicia campaña vacuna vph (buscar entro de salud)

7:30am publicar ventas y promo

•  preparar comida del día

1:00pm publicar comida el día.

6:00pm hacer ejercicio/ ir gym caminar y masaje.

7:00pm a 9:00pm luis didi

11:00pm dormir 😴
```

Convenciones observadas. No son arbitrarias: son cómo escribe ella.

- Mes en MAYÚSCULAS, color de acento naranja.
- Día en mayúsculas, formato `DÍA DD MON` → `MARTES 01 SEP`.
- Los "checkboxes" son **caracteres en texto plano**, no elementos de Notion.
- Párrafos en blanco como separadores. El ritmo es aireado, no compacto.
- Emojis sueltos al final de línea.
- Paréntesis con nombres = persona responsable.

## Dirección visual — FIJADA, no negociable

Este brief ya fija la estética. No propongas alternativas ni "mejores" la paleta.

- Fondo `#111111`, texto `#E4E4E7`, acento de mes `#F59E0B`.
- Sans del sistema, 16-17px, `line-height` 1.6.
- Checkbox **cuadrado** con borde, se llena al marcar. Nunca redondo.
- Modo oscuro por defecto, modo claro como secundario con toggle.
- Responsive: usable con una mano en iPhone; en escritorio, sidebar de calendario.
- Accesible: contraste AA, foco visible, checkboxes operables con Enter, `aria-label`
  en botones de solo icono, `prefers-reduced-motion` respetado. Requisito, no
  decoración.

## Requisitos

### 1. Editor de notas diarias

- Una nota por día, creada automáticamente al abrir un día nuevo.
- Texto libre con formato mínimo. **NO** una base de datos con campos obligatorios.
- Soporta: encabezado de mes (h1) y día (h2) con estilos distinguibles; toggle de
  checkbox por línea (`☐` ↔ `☑`); negritas y cursiva; paréntesis con nombre;
  emojis.
- Autoguardado con debounce ~800 ms e indicador "Guardado ✓".
- **Criterio de aceptación:** la nota de ejemplo de arriba, usada como fixture,
  debe renderizarse idéntica. Es un test que falla el build, no una opinión.

### 2. Parsing

Cada línea se parsea para poder consultar y notificar, sin obligar a nadie a
cambiar cómo escribe:

```ts
type Task = {
  raw: string
  done: boolean
  time?: string // "7:30am" | "6:00 PM"
  timeRange?: [string, string] // "7:00pm a 9:00pm"
  title: string
  assignees: string[]
  kind: "check" | "bullet" | "text" | "heading" | "blank"
}
```

Reglas, con regex testeables. No heurísticas.

- `7:30am`, `11:00pm`, `6:00 PM` → `time`. Acepta mayúscula y minúscula.
- `7:00pm a 9:00pm` → `timeRange`. El recordatorio usa la hora **inicial**.
- Paréntesis con 1-2 nombres capitalizados → `assignees`.
- `-`, `*`, `•` al inicio → `bullet`.
- Línea vacía → `blank`, se preserva al renderizar. El aire es intencional.

### 3. Navegación

- **Vista Día** (principal) y **Vista Semana** con contador y punto de color en
  días con pendientes vencidos.
- Indicador de pendientes sin completar de días anteriores, con acción de
  marcarlos o moverlos a hoy.
- Atajos, activos solo cuando no se está escribiendo: `h` hoy, `←`/`→` día,
  `1`/`2`/`3` ayer/hoy/mañana, `w` semana, `Ctrl+K` buscar.

### 4. Recordatorios — corre en iPhone

**Restricción real que debes respetar:** en iOS las Web Notifications solo funcionan
en una PWA **instalada** (Add to Home Screen) y desde iOS 16.4. En segundo plano no
son fiables. Por eso hay tres canales:

1. **In-app + badge + vibration** — funciona siempre, en cualquier navegador. Es el
   canal por defecto y no puede fallar.
2. **Web Notification vía service worker** — improvement, solo si la PWA está
   instalada y el permiso está concedido.
3. **Email vía Supabase Edge Function** — el único canal que llega 100% con la app
   cerrada. Es la red de seguridad. Se configura por tarea: "gym 6pm" sí avisa,
   "publicar promo" no.

Requisitos:

- Si el navegador no soporta notificaciones, **degradar en silencio**. Nunca romper
  la app ni mostrar un error rojo.
- Detecta iOS + no-instalada y muestra un nudge **no bloqueante** una sola vez:
  "Añádela a tu pantalla de inicio para recibir avisos."
- Preferencia por usuario: solo mías / todas / ninguna. Persistida.
- No molestar entre 23:00 y 07:00, salvo que la tarea tenga hora en ese rango.
- Botón "posponer 10 min", con fallback in-app si el SO no soporta la acción.

### 5. Compartido

**Supabase** (Postgres + Auth + Realtime). Debe quedar funcionando, no pseudocódigo.

Tablas, y solo estas hasta que el parsing demuestre que falta algo:

- `profiles(id, display_name, color, notify_all boolean)`
- `notes(id, date, user_id, body text, updated_at)` — **una nota por usuario por
  día**. Cada quien tiene su libreta, igual que hoy en Notion.

RLS estricta: cada usuario lee y escribe solo sus notas.

- Auth por **magic link** (email) o Google. Sin contraseñas, es uso doméstico.
- Vista **Mía / Pareja / Ambas**: columnas en escritorio, swipe en móvil.
- Realtime para que los cambios de ella aparezcan en vivo en tu dispositivo.
- Exportar e importar todo a Markdown o JSON. Cache local para modo offline.

### 6. Detalles

- Plantilla precargada al abrir un día nuevo: `<DÍA> <DD MON>\n\n☐ \n\n`, para que
  solo tenga que escribir.
- `Ctrl+Z` y `Ctrl+Shift+Z` en el editor.
- Contador del día "2/7 completadas" con barra sutil.
- Al completar la última: check visual de "día limpio 🌙".

## Editor en móvil — riesgo conocido

`contenteditable` en iOS Safari tiene bugs notorious de caret que salta al inicio al
re-renderizar, y autocapitalización. Requisitos:

- La escritura por línea NO debe re-renderizar todo el árbol en cada keystroke, o el
  caret salta. Si no puedes evitarlo, evalúa `textarea` + estilos por línea.
- `inputmode`, `enterkeyhint` y `autocapitalize` configurados a mano.
- `visualViewport` para que el teclado no tape el checkbox que estás marcando.
- **Prueba obligatoria en viewport 390x844** antes de dar la fase por cerrada.

## Stack

- **Next.js (App Router) + TypeScript + Tailwind.** El editor es un componente
  client.
- Parser propio de ~200 líneas con serialización a Markdown por línea. **No uses
  TipTap/ProseMirror** salvo que justifiques por escrito por qué.
- **Vitest** para el parser y el formateo de horas, con la nota real como fixture.
- `.env.example` documentado. Scripts: `dev`, `build`, `test`.

## Entrega

1. **Primero un `PLAN.md`**: árbol de archivos, SQL de tablas + RLS, decisiones con
   justificación. Espera mi confirmación.
2. Luego por fases, confirmando cada una:

   - **F1** Auth + modelo de datos + notas guardadas.
   - **F2** Editor con checkboxes, estilos y parsing. Aquí el render debe ser
     **idéntico** a la nota de ejemplo.
   - **F3** Navegación día/semana, buscador, contadores.
   - **F4** Recordatorios: canal in-app primero, luego web, luego email.
   - **F5** PWA instalable, modo claro, responsive final.

3. `README.md` con setup local y deploy (Vercel + Supabase).
4. **En cada fase: levanta la app y verifícala antes de reportar.** Usa la skill
   `browser-automation` en viewport de escritorio **y** de 390px. Si hay errores de
   consola o de build, arréglalos.

## Fuera de alcance

Sin IA. Sin sugerencias de tareas. Sin LLMs. Sin gamificación, sin rachas, sin
puntos. Sin red social. Sin app nativa. Sin migrar Notion automáticamente.
