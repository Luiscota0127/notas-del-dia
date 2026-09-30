# Notas del Día

PWA de pendientes compartida para una pareja. Reemplaza el uso diario de Notion:
texto libre por día, sincronizado entre dos dispositivos, con recordatorios que
llegan aunque la app esté cerrada.

**El texto libre es la fuente de verdad.** Postgres guarda `notes.body`, un
`text`, y nada más. El parser deriva las tareas en el cliente, en cada render. No
hay tabla de tareas, ni campos obligatorios, ni formulario. Editar una tarea es
editar una línea de texto.

El contrato de formato vive en
[`.opencode/skills/notas-formato/`](.opencode/skills/notas-formato/) y es ley:
`AGENTS.md`, `PLAN.md` y `PROMPT.md` explícan el porqué, pero el skill manda.

TypeScript · Next.js 16 · React 19 · Supabase (SSR auth + realtime) · Tailwind 4 ·
Vitest

## Estado

| Fase | Qué | Estado |
|---|---|---|
| F0 | Scaffolding, parser, tests de formato | Hecho |
| F1 | Auth magic link, esquema con RLS, notas guardadas | Código listo, falta crear el proyecto en Supabase |
| F2 | Editor de dos capas con checkboxes y estilos | Hecho y verificado |
| F3 | Navegación día/semana, buscador, atajos | Pendiente |
| F4 | Recordatorios: in-app, web, email | Pendiente |
| F5 | PWA instalable, modo claro, offline | Pendiente |

## Ver el editor sin backend

Con `NEXT_PUBLIC_DEMO_NOTA` en `.env.local` (ya viene ahí), la ruta:

```
http://localhost:3000/2026-09-01?demo=1
```

renderiza la nota real de la referencia. Es la forma de revisar el editor sin
Supabase configurado. En producción ese atajo no existe.

## Development

```bash
npm install
npm run dev        # http://localhost:3000
npm run build
npm run lint
npm test           # 90 tests
npm run test:watch
```

Las credenciales de Supabase van en `.env.local` — ver `.env.example`. Nunca
commitees keys reales.

## Setup de Supabase

El Supabase CLI no funciona en esta máquina (el shim de scoop apunta a un binario
inexistente, y no hay Docker), así que las migraciones se aplican a mano:

1. **New project** en <https://supabase.com/dashboard>, plan **Pro** (el cron de
   F4 lo necesita).
2. **SQL Editor** → pegá y corré `supabase/migrations/0001_init.sql`.
3. Repetí con `supabase/migrations/0002_realtime.sql`.

`0003_cron.sql` es de F4, no la corras todavía.

## Estructura

```
supabase/migrations/   SQL. 2 tablas: profiles y notes. RLS estricta por auth.uid().
src/lib/parse.ts       El parser. string → Task[]. Puro, sin imports, se comparte
                       con la Edge Function de F4 sin duplicar reglas.
src/lib/format.ts      Fechas y horas en zona local. Nada de toISOString().
src/lib/db/            Cliente de Supabase, queries y tipos.
src/proxy.ts           Refresh de sesión y redirección. No valida permisos: las
                       RLS son la frontera real.
src/components/editor/ El editor de dos capas: textarea invisible + capa de
                       display con contentEditable=false.
src/test/              Fixtures y tests. La nota real de la referencia vive
                       en fixtures.ts.
```

## El editor: por qué dos capas

```
┌──────────────────────────────┐
│  capa de display  (visual)   │  contentEditable=false, aria-hidden
│  h1/h2, checkbox, texto      │  ← se re-renderiza en cada tecla
├──────────────────────────────┤    sin consecuencias: nunca tiene el foco
│  textarea (invisible)        │  ← recibe TODA la escritura
└──────────────────────────────┘
```

El caret de iOS Safari salta al inicio cuando React reconcilia el subárbol de
un `contenteditable`. Como la textarea nunca se re-renderiza desde el modelo y la
capa de display nunca tiene el foco, ese bug no puede ocurrir. A cambio, el
autocorrector, el diccionario, el undo nativo y el IME del sistema funcionan.

**Trade-off asumido:** no se puede seleccionar una línea arrastrando; hay que
clicar el checkbox. Ver `PLAN.md` 1.1.

**Rutas nuevas: `npm run build` dos veces.** Next escribe `.next/types/routes.d.ts`
*después* del typecheck, así que un build limpio con una ruta que acabás de crear
falla con `Type '"/x"' does not satisfy the constraint 'AppRoutes'`. La segunda
pasada pasa. No es un error de código: si el archivo generado sí lista la ruta,
ya está. Borrar `.next` lo reproduce siempre.

**Notas de implementación**

Estas cosas costaron tiempo y van a volver a estorbar si alguien las toca:

**`--linea: 27.2px`, absoluto, nunca `em` ni `rem`.** Con `1.6em` cada elemento lo
resuelve contra SU font-size: en `.mes` (20px) daba 32px, y como el error se
acumula hacia abajo, todas las líneas siguientes quedaban 4.8px corridas respecto
del caret. Absoluto: 27.2px = 17 * 1.6.

**Hanging indent con `float`, no con `text-indent`.** `padding-left` +
`text-indent` negativo deja las continuaciones en el borde (probado, falla). Lo
que funciona es un prefijo invisible con `float: left` y ancho real: la primera
línea lo esquiva y las siguientes pasan por debajo. Por eso `.prefijo` no puede
ser `display: none` — necesita layout para que se mida.

**Fechas en hora local.** `toISODate`/`fromISODate` en `format.ts`, nunca
`toISOString()`. Parsear `YYYY-MM-DD` como UTC corre la fecha un día en husos
negativos, que es exactamente el bug de "hoy saltó al día".

**El proxy no valida permisos.** Solo decide a dónde mandarte. Lo que protege los
datos son las RLS de Postgres. Agregar una policy permisiva "para ver los de la
pareja" sería el error: la vista "Ambas" son dos queries, una por `uid`.

**`Relationships` en los tipos.** No es opcional en postgrest-js v2; sin eso los
tipos de `Insert` colapsan a `never[]` y TypeScript rechaza los inserts. Si
cambia el schema, regenerar con `npx supabase gen types typescript --local`.

**Sin Supabase, la app no rompe.** `/login` explica qué falta. Las demás rutas
pasan y muestran lo que hay. Un 500 en cada ruta por una env var faltante no
ayuda a nadie.

## Visual direction

El look está fijado por diseño, no por preferencia:

- Fondo `#111111`, texto `#E4E4E7`, acento de mes `#F59E0B`
- Sans del sistema, 16–17px, `line-height` 1.6
- Checkboxes **cuadrados** con borde, se llenan al marcar — nunca redondeados
- Modo oscuro por defecto

El editor del día y la vista de semana replican la experiencia de lectura de
Notion. Ese requisito le gana a cualquier consejo general de UI. La skill
`frontend-design` aplica a login, ajustes y primera carga, **no** al editor.

## Deploy

Vercel, con el repo en GitHub:

1. **Add New → Project**, importá el repo. Next 16 se detecta solo.
2. **Settings → Environment Variables**: las dos `NEXT_PUBLIC_` de `.env.local`.
3. Deploy.

Las migraciones ya están aplicadas a mano, así que Vercel no toca la base. Cuando
exista la CLI, `supabase db push` en el pipeline.
