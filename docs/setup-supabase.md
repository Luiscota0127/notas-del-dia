# Supabase: pasos para vos

Hacé esto en cualquier momento durante F3. No bloquea nada: el editor ya
funciona sin backend con `/2026-09-01?demo=1`.

## 1. Crear el proyecto

<https://supabase.com/dashboard> → **New project**.

- **Plan: Pro.** El canal de recordatorios por email (F4) usa `pg_cron` cada 5
  minutos, y el plan free lo limita. Son $25/mes. Si preferís el free, decímelo y
  F4 va con cron cada 15 minutos, que para dos personas con ~6 avisos al día
  alcanza igual.
- **Database password**: la que quieras, no la vas a necesitar (el login es por
  magic link).
- **Region**: la más cercana. El tráfico es de la casa, la latencia es
  irrelevante con dos usuarios.

Tarda un par de minutos en provisionarse.

## 2. Correr las migraciones

**SQL Editor** → **New query** → pegá el contenido de `0001_init.sql` → **Run**.
Esperá "Success". Repetí con `0002_realtime.sql`.

Desde la terminal, si preferís no copiar a mano:

```powershell
Get-Content supabase\migrations\0001_init.sql -Raw | Set-Clipboard
```

`0003_cron.sql` es de F4. No lo corras.

## 3. Sacar las dos keys

**Project Settings → API**. Copiá:

- **Project URL** → `NEXT_PUBLIC_SUPABASE_URL`
- **anon public** → `NEXT_PUBLIC_SUPABASE_ANON_KEY`

Copiá el `.env.local` ya existente y reemplazá las dos líneas:

```powershell
notepad .env.local
```

Quedaría así:

```
NEXT_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGci...
SUPABASE_SERVICE_ROLE_KEY=

NEXT_PUBLIC_DEMO_NOTA="SEPTIEMBRE\n\n☐ 08 sep ..."
```

Dejá `SUPABASE_SERVICE_ROLE_KEY` vacío hasta F4. **Nunca** le pongas prefijo
`NEXT_PUBLIC_`: esa key salta al navegador y con ella cualquiera lee y escribe las
notas de los dos.

## 4. Avisame

Decime "listo" y yo:

1. Levanto la app.
2. Hago login con tu correo y creo la primera nota.
3. Repito con un segundo correo.
4. Verifico el aislamiento: escribo desde A, confirmo que B no la ve.

Eso es la verificación que F1 necesita y que no puedo hacer sin el proyecto.

## Lo que ya está listo

El código de F1 está completo y compila: las dos tablas, las RLS, el trigger del
profile, el login por magic link, el autoguardado. Lo que falta es probarlo
contra una base real, y eso es lo que hacemos en el paso 4.
