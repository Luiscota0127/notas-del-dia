# PLAN — Notas del Día

> Salida del Paso 1 de `PROMPT.md`. Esperando confirmación antes de escribir código.
> Contrato de formato: `.opencode/skills/notas-formato/`. Reglas del repo: `AGENTS.md`.

## 0. Verificado en esta máquina

| Herramienta | Versión / estado |
|---|---|
| Node | v24.19.0 |
| npm | 11.17.0 |
| Next | 16.3.7 (última) |
| React | 19 (vía Next 16) |
| Tailwind | 4.3.3 |
| Vitest | 5.0.2 |
| @supabase/supabase-js | 2.117.2 |
| git | 2.32.0 |
| Supabase CLI | **shim roto** (`scoop\apps\supabase\current\supabase.exe` no existe) |
| Docker | **no instalado** |
| Podman | 6.0.2 (no sirve: Supabase CLI exige Docker) |

**Consecuencia:** no hay Supabase local. Todo el SQL de este plan se entrega como
archivos de migración en `supabase/migrations/` y se aplica desde el SQL Editor del
proyecto hosteado, o con `supabase db push` cuando se arregle el CLI. El desarrollo
local apunta al proyecto hosteado. Es lo razonable para una app de dos personas.

## 1. Decisiones de diseño

### 1.1 El editor: `textarea` + capa de display sincronizada

Este es el crux del proyecto, así que va con justificación completa.

**El problema.** El brief pide texto libre con estilos por línea y checkboxes
clickeables. La respuesta obvia es `contenteditable`, y `contenteditable` en iOS
Safari tiene un bug conocido: el caret salta al inicio del elemento cuando React
reconcilia el subárbol. El brief ya lo anticipa y prohíbe re-renderizar el árbol en
cada keystroke.

**Por qué un `contenteditable` bien escrito tampoco resuelve el problema.** Se
puede evitar re-renderizar durante la escritura: dejar que el browser sea dueño del
DOM mientras se escribe, leer `innerText` en `input`, y reconciliar solo cuando
cambia la *identidad* de la línea (de `text` a `heading`, etc.). Funciona en
escritorio. En iOS quedan casos sueltos —composición IME, autocorrección, selección
por arrastre— que son imposibles de cazar todos desde un escritorio Windows, y esta
app se usa **en un iPhone**.

**Solución: patrón de dos capas.** La tecla nunca toca el DOM que React controla.

```
┌─────────────────────────────────────┐
│  capa de display  (visual)          │  div[contenteditable=false]
│  h1.acento / h2 / label > input     │  ← se re-renderiza libremente,
│  (pointer-events en los checkbox)   │    nunca recibe el foco
├─────────────────────────────────────┤  ← se superponen
│  textarea (invisible, real)         │  ← recibe SIEMPRE la escritura
│  color: transparent, caret-color    │
└─────────────────────────────────────┘
```

- La **`textarea`** recibe el foco, el teclado, el autocorrector, el dictionary y el
  undo nativo de iOS. Cero bugs de caret, porque no hay `contenteditable` de por
  medio.
- La **capa de display** es `contenteditable="false"`, `aria-hidden="true"`. Nunca se
  enfoca, nunca se edita, y se puede re-renderizar en cada keystroke sin
  consecuencias porque el caret no está ahí.
- `pointer-events: none` en la capa de display salvo en los checkbox, que son
  `<button>` reales de 44x44 y sí capturan clic.

**Por qué no `textarea` + vista renderizada debajo (más simple aún).** Porque
obliga a dos lugares para mirar. Ella escribe en un sitio y ve el resultado en
otro. Eso no es Notion, y el objetivo declarado es que no note el cambio.

**Por qué no TipTap/ProseMirror.** El brief lo prohíbe salvo justificación escrita.
Además acá la justificación es fácil: el 90% del valor de esta app es que el texto
siga siendo texto plano que ella reconoce como suyo. Un editor WYSIWYG convierte
cada checkbox en un nodo, cada salto de línea en un `paragraph`, y obliga a un
serializador a la ida y a la vuelta. Eso es exactamente la fragilidad que estamos
eliminando al salir de Notion. **No lo usaremos.**

**Sync.** Una sola fuente: `string`. El modelo es el string. La capa de display es
`renderNote(parseNote(model))`. El `textarea` es un input controlado por React con
`value={model}`. Sin estado duplicado, sin reconciliación de dos caminos.

**Alineación de capas.** Ambas capas comparten `font`, `line-height`, `padding`,
`letter-spacing` y `tab-size` exactos vía una clase CSS común. Si divergen, el
desfase es visible de inmediato en la captura. Sync de scroll con un
`onScroll` → `scrollTop` de la otra, guard con `requestAnimationFrame` para no
encadenar eventos.

**Undo.** El nativo de la `textarea` cubre la escritura, que es el 95% del uso. Las
acciones programáticas (toggle de checkbox) no pasan por el undo nativo, así que
hay una pila propia de una sola entrada: `[{ lineIndex, before, after }]`. `Ctrl+Z`
deshace la última acción programática si existe y no hubo escritura desde entonces;
si hubo, delega al nativo. `Ctrl+Shift+Z` la re-aplica.

**Toggle de checkbox.** Un clic muta el string en el índice de la línea: se cambia
el primer carácter del prefijo (`☐`↔`☑`, `☒`↔`☐`, `[ ]`↔`[x]`) y nada más. Se
preserva el carácter que ella usaba, como manda `parsing.md`. Al asignar
`textarea.value` programáticamente el caret se va al final, así que hay que guardar
y restaurar `selectionStart`/`selectionEnd`. Son 4 líneas.

**Teclado en iOS.** `enterkeyhint="enter"`, `autocapitalize="sentences"`,
`autocorrect="on"` (sí, queremos el autocorrector), `spellcheck` nativo,
`inputmode="text"`. `--kb-inset` desde `visualViewport` para que el teclado no
tape la fila activa; `scrollIntoView({ block: "center" })` en el focus.

**Costo aceptado a favor.** Seleccionar y borrar una línea completa, o
peek-ábrela, es un click, no una selección. Given que edita ~8 líneas al día, es un
intercambio favorable frente a la alternativa de un editor roto en el teléfono que
más importa.

### 1.2 Parser: puro y compartido

`src/lib/parse.ts`, sin imports. `parseNote(body: string): Task[]`. Sin estado, sin
`Date`, sin red. Clonable tal cual a una Edge Function de Deno, donde se usa para
extraer recordatorios del mismo texto.

Test fixtures derivados de `references/ejemplo-real.md` **y** de la tabla de casos
borde de `parsing.md`. Los 9 casos de hora y los 7 de paréntesis son tests
nombrados, no un `it("works")`.

El criterio de aceptación del brief —la nota renderizada idéntica— se implementa
como un test que compara el HTML de la capa de display contra un snapshot, más un
test que verifica que el round-trip `parse → serializar → parse` es idempotente.
Si el render cambia, el snapshot falla.

### 1.3 Datos: dos tablas, y solo dos

```sql
create table profiles (
  id         uuid primary key references auth.users on delete cascade,
  name       text not null,
  color      text not null default '#f59e0b',
  notify     text not null default 'all'
             check (notify in ('all', 'mine', 'none')),
  notified   jsonb not null default '{}',   -- ver 1.5
  updated_at timestamptz not null default now()
);

create table notes (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references profiles(id) on delete cascade,
  date       date not null,
  body       text not null default '',
  updated_at timestamptz not null default now(),
  unique (user_id, date)
);
```

Más un índice único parcial para el punto "hay pendientes vencidos" de la vista
semana:

```sql
create index on notes (user_id, date desc);
```

`notes.body` es el único campo que importa. `notify` en `profiles` es una
preferencia, no un campo de tarea. `notified` se explica en 1.5.

RLS, estricta: cada usuario lee y escribe solo sus filas. `notes` se lee solo por
`auth.uid()`. Sin excepciones, sin policies de "ver los de tu pareja": la vista
"Ambas" hace dos queries con dos `uid` distintos, no una policy más permisiva.

```sql
alter table profiles enable row level security;
alter table notes     enable row level security;

create policy "own profile" on profiles
  for all using (id = auth.uid()) with check (id = auth.uid());

create policy "own notes" on notes
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
```

Trigger `handle_new_user` que crea el `profile` con `name` del metadata de magic
link. Es lo que evita que el primer insert de `notes` falle por FK.

Realtime: `alter publication supabase_realtime add table notes;`. Con RLS activa,
Realtime respeta las policies, así que cada uno solo recibe cambios propios.

### 1.4 Vista "Ambas" sin schema extra

Son dos queries, una por `uid`, unidas en el cliente. No hay tabla de "pareja", no
hay `partner_id`, no hay invites. Para una app de dos personas, un `profiles` con
dos filas ya **es** la pareja: "Pareja" = el otro `profile` que no soy yo. Se
resuelve con un `select id, name, color from profiles where id <> auth.uid()`.

Si algún día son tres, se agrega una tabla. Hoy sería sobreingeniería.

### 1.5 Recordatorios: tres canales, el in-app no puede fallar

El brief dice tres canales. El orden importa, porque iOS no es un caso más.

**Canal 1 — in-app + badge + vibration. El default. Funciona siempre.**

Un `setTimeout` por tarea con hora, armado en un `useEffect` de la página. Cuando
dispara: toast in-app, `navigator.vibrate()` si
existe, y badge del icono vía `setAppBadge` (Android y PWA en iOS 16.4+; se ignora
en silencio donde no exista). Botón "posponer 10 min" dentro del toast. El snooze
es un `setTimeout` nuevo, no un estado.

**Canal 2 — Web Notification vía service worker. Mejora, condicional.**

`showNotification` desde el service worker, solo si `Notification.permission ===
"granted"`. Los botones de acción ("posponer", "hecho") van en
`notificationclick`; donde el SO no soporta acciones, el toast in-app ya cubre el
caso.

**Canal 3 — email vía Edge Function. La red de seguridad.**

Es lo único que llega con la app cerrada. Implementación:

- Edge Function `supabase/functions/notify/index.ts` (Deno), que importa
  `src/lib/parse.ts` tal cual para no duplicar reglas.
- Invocada por `pg_cron` cada 5 minutos vía `pg_net`. Es el patrón estándar de
  Supabase para jobs sin servidor abierto.
- Selecciona `notes` de hoy y mañana de los profiles, parsea, y para cada tarea con
  hora cuya ventana `[hora, hora+5min)` contiene `now()`, manda el email.
- **Deduplicación sin tabla nueva:** escribe la clave `"<fecha>|<hora>|<línea>"` en
  `profiles.notified` (un `jsonb` que ya existe en la tabla que necesitamos) y
  limpia las claves de fechas viejas. Cumple la regla de "solo dos tablas" sin
  inflar el schema.
- Email vía Resend o el SMTP de Supabase. Un endpoint HTTP con `fetch` nativo, sin
  SDK.

**Degradación.** Si `Notification` no existe, o el permiso está en `denied`, o el
email no está configurado, el canal 1 sigue funcionando y nada se rompe. Nunca un
error rojo, nunca un modal bloqueante.

**Nudge de iOS.** `navigator.standalone` es `false` y el UA es iOS → toast no
bloqueante, una sola vez, guardado en `localStorage`:
"Añádela a tu pantalla de inicio para recibir avisos." Con botón "Ahora no" que no
vuelve a aparecer.

**Quiet hours.** 23:00–07:00, una tarea cuya hora cae en esa ventana sí suena (si no
es inútil); una que *no* tiene hora no genera nada. Implementado en el scheduler,
no con un cron aparte.

### 1.6 Service worker

A mano, sin `next-pwa` (wrapper deprecado y overkill para un shell de 5 archivos).
`public/sw.js`: precache del shell, cache-first para estáticos,
network-first con fallback al shell para navegación. Nunca cachea respuestas de
Supabase: los datos van a `IndexedDB` vía el cache local, no al `Cache` del SW.

### 1.7 Cache local / offline

`notes` de los últimos 30 días por usuario, en `IndexedDB` (idb-keyval, 600 bytes,
o 40 líneas a mano). `localStorage` no: 5 MB y sin transacciones. Al escribir
offline se encola y se sube al reconectar. Realtime sigue siendo la fuente de
verdad cuando hay red.

### 1.8 Auth

Magic link por email. Sin contraseñas: es uso doméstico y una contraseña compartida
es una contraseña que se filtra. Google OAuth queda como botón secundario si el
magic link se siente lento en su flujo.

RLS ya garantiza el aislamiento, así que no hay que filtrar nada en el cliente
para "proteger" datos: la base de datos es la frontera.

## 2. Árbol de archivos

```
notas-del-dia/
├── AGENTS.md                      # existe
├── PROMPT.md                      # existe
├── PLAN.md                        # este archivo
├── README.md                      # F5
├── package.json
├── tsconfig.json
├── next.config.ts
├── postcss.config.mjs
├── .env.example
├── .gitignore                     # existe
├── vitest.config.ts
├── supabase/
│   ├── migrations/
│   │   ├── 0001_init.sql          # 2 tablas, RLS, índices, trigger profile
│   │   ├── 0002_realtime.sql      # publication
│   │   └── 0003_cron.sql          # pg_cron + pg_net (F4)
│   └── functions/
│       └── notify/index.ts        # canal 3 (F4)
├── public/
│   ├── manifest.webmanifest
│   ├── sw.js
│   ├── icon-192.png
│   └── icon-512.png
└── src/
    ├── app/
    │   ├── layout.tsx             # tokens, viewport-fit=cover
    │   ├── globals.css            # @theme de Tailwind 4 + capas del editor
    │   ├── page.tsx               # redirect a /hoy
    │   ├── login/page.tsx         # magic link
    │   ├── [date]/page.tsx        # server: carga la nota
    │   ├── semana/page.tsx
    │   └── ajustes/page.tsx
    ├── components/
    │   ├── editor/
    │   │   ├── NoteEditor.tsx     # orquesta las dos capas
    │   │   ├── DisplayLayer.tsx   # render de Task[], contentEditable=false
    │   │   └── layers.css         # métricas compartidas, scroll sync
    │   ├── Calendario.tsx
    │   ├── SemanaView.tsx
    │   ├── ContadorDia.tsx
    │   ├── PendientesAtrasados.tsx
    │   ├── Toast.tsx
    │   └── Buscador.tsx           # Ctrl+K
    ├── lib/
    │   ├── parse.ts               # el parser. puro. sin imports
    │   ├── format.ts              # fecha, mes, día, hora → minutos
    │   ├── db.ts                  # cliente Supabase, types
    │   ├── cache.ts               # IndexedDB
    │   ├── notify.ts              # scheduler de 3 canales
    │   └── hooks/
    │       ├── useNote.ts
    │       ├── useKeyboard.ts
    │       └── useVisualViewport.ts
    └── test/
        ├── parse.test.ts
        ├── format.test.ts
        └── render.test.ts         # snapshot del HTML de la nota real
```

## 3. Fases

| Fase | Entrega | Verificación |
|---|---|---|
| **F1** | Supabase client, auth magic link, `0001`+`0002`, listar y guardar `notes` | App levanta, login real, nota persiste, RLS verificada con 2 sesiones |
| **F2** | `parse.ts` + `NoteEditor` + `DisplayLayer` + tests + snapshot | `npm test` verde con los 9+7 casos. **Captura del render vs la imagen** |
| **F3** | Calendario, semana, buscador, contador, atajos, pendientes atrasados | Navegación completa probada en 390px y escritorio |
| **F4** | Scheduler in-app, SW notifications, nudge iOS, `0003` + Edge Function | Toast dispara, badge aparece, email llega con la app cerrada |
| **F5** | Manifest, SW, offline, modo claro, ajustes, `README.md` | Instalable en iPhone, funciona sin red, contraste AA medido |

Cada fase termina con `npm run build` y `npm run test` en verde, más verificación
en navegador con la skill `browser-automation` en **390x844 y escritorio**, mirando
la captura. Sin excepciones.

## 4. Riesgos

| Riesgo | Impacto | Mitigación |
|---|---|---|
| Deriva de alineación entre las dos capas | Texto y display desfasados | Métricas en una clase CSS compartida; la captura de F2 lo detecta al instante |
| Bugs de IME/acentos en la `textarea` | Escribe mal su nombre | `textarea` nativa, sin `contenteditable`: el IME del sistema funciona. Test con acentos y `ñ` |
| Supabase CLI roto, sin Docker | No hay backend local | SQL como migraciones + proyecto hosteado. Sin impacto en el código |
| Web Notifications no llegan en iOS en background | Recordatorios perdidos | El canal 3 (email) es la red de seguridad por diseño, no un extra |
| Realtime con RLS: eventos que no llegan | Cambios no en vivo | Probar con 2 sesiones reales en F1, no confiar en el código |
| Parsing demasiado estricto | "Nahomi" fuera de paréntesis no se detecta | **Es intencional.** `parsing.md` lo fija así. Preguntar, no bespoke |

## 5. Confirmación

Necesito tu OK para arrancar. Dos puntos donde quiero tu decisión explícita:

1. **Editor de dos capas.** Es ~350 líneas más que un `contenteditable` directo y
   tiene el trade-off de no poder seleccionar una línea arrastrando. Lo recomiendo
   por el bug de caret en iOS. La alternativa es un `contenteditable` por línea,
   que es más simple pero queda sin probar en el dispositivo que más importa.
2. **Canal 3 (email) implica Supabase Pro o el cron limitado del free tier.**
   pg_cron cada 5 min en el plan free está limitado. Con dos personas y ~6
   recordatorios al día, un cron cada 15 minutos alcanza y es lo que pido. Si
   querés 5 minutos exactos, hace falta Pro.
