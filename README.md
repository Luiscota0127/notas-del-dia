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

## Estado

| Fase | Qué | Estado |
|---|---|---|
| F0 | Scaffolding, parser, tests de formato | Hecho |
| F1 | Auth magic link, esquema con RLS, notas guardadas | Código listo, falta el proyecto de Supabase |
| F2 | Editor de dos capas con checkboxes y estilos | Pendiente |
| F3 | Navegación día/semana, buscador, contadores | Pendiente |
| F4 | Recordatorios: in-app, web, email | Pendiente |
| F5 | PWA instalable, modo claro, offline | Pendiente |

## Setup

### 1. Dependencias

```bash
npm install
```

### 2. Proyecto en Supabase

En <https://supabase.com/dashboard>, **New project**. Elegí Pro: el canal de
recordatorios por email (F4) usa `pg_cron` cada 5 minutos, y el plan free lo
limita.

### 3. Migraciones

El Supabase CLI no funciona en esta máquina (el shim de scoop apunta a un binario
que no existe, y no hay Docker), así que las migraciones se aplican a mano:

- **SQL Editor** → New query → pegá y corré `supabase/migrations/0001_init.sql`
- Repetí con `supabase/migrations/0002_realtime.sql`

`0003_cron.sql` es de F4, no lo corras todavía.

### 4. Variables de entorno

```bash
cp .env.example .env.local
```

**Settings → API** en el dashboard:

| Variable | Dónde está |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Project API keys → `anon` public |

`SUPABASE_SERVICE_ROLE_KEY` solo hace falta en F4, y **nunca** lleva prefijo
`NEXT_PUBLIC_`.

### 5. Correr

```bash
npm run dev
```

La primera vez que abris, la app pide el magic link por correo. Abrilo en el mismo
dispositivo donde la estás usando, así la sesión queda ahí.

### 6. Dos cuentas

La app está pensada para dos personas. Repetí el login con el segundo correo, y
"Ambas" va a mostrar las dos libretas. La pareja es el otro `profiles` con id
distinto: no hay tabla de invites, y para cuando sean tres se agrega.

## Comandos

```bash
npm run dev      # desarrollo
npm run build    # build de producción
npm run test     # Vitest (79 tests del parser y el formato)
npm run lint     # ESLint
```

## Deploy

Vercel, con el repo de GitHub:

1. **Add New → Project**, importá el repo. Next 16 se detecta solo.
2. **Settings → Environment Variables**: las dos `NEXT_PUBLIC_` de `.env.local`.
3. Deploy.

Las migraciones ya están aplicadas a mano, así que Vercel no necesita tocar la
base. Cuando exista la CLI, `supabase db push` en el pipeline.

## Estructura

```
supabase/migrations/   SQL. 2 tablas: profiles y notes. RLS estricta por auth.uid().
src/lib/parse.ts       El parser. string → Task[]. Puro, sin imports, se comparte
                       con la Edge Function de F4 sin duplicar reglas.
src/lib/format.ts      Fechas y horas en zona local. Nada de toISOString().
src/lib/db/            Cliente de Supabase, queries y tipos.
src/proxy.ts           Refresh de sesión y redirección. No valida permisos: las
                       RLS son la frontera real.
src/test/              Fixtures y tests. La nota real de la referencia vive
                       en fixtures.ts.
```

## Notas de implementación

**Fechas en hora local.** `toISODate`/`fromISODate` en `format.ts`, nunca
`toISOString()`. Parsear `YYYY-MM-DD` como UTC corre la fecha un día en husos
negativos, que es exactamente el bug de "hoy saltó al día".

**El proxy no valida permisos.** Solo decide a dónde mandarte. Lo que protege los
datos son las RLS de Postgres. Agregar una policy permisiva "para ver los de la
pareja" sería el error: la vista "Ambas" son dos queries, una por `uid`.

**`Relationships` en los tipos.** No es opcional en postgrest-js v2; sin eso los
tipos de `Insert` colapsan a `never[]` y TypeScript rejecta los inserts. Si
cambia el schema, regenerar con `npx supabase gen types typescript --local`.

**Sin Supabase, la app no rompe.** `/login` explica qué falta. Las demás rutas
pasan y muestran lo que hay. Un 500 en cada ruta por una env var faltante no
ayuda a nadie.
