# Deploy en Vercel

**https://notas-del-dia.vercel.app**

Proyecto `papayaso/notas-del-dia`, conectado al repo `Luiscota0127/notas-del-dia`.
Cada `git push` a `master` despliega solo: no hace falta correr nada a mano.

## Lo que hay que tocar si algún día se rehace

**1. Variables de entorno** (solo dos, y hace falta tenerlas antes del primer
build porque `NEXT_PUBLIC_` se compila dentro del bundle):

```
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
```

Se cargan con `vercel env add`. La anon key va con `--type config`, no
`--sensitive`: es pública a propósito. Supabase la usa en el cliente de todas
formas y lo que protege los datos es la RLS, no esconderse la key.

Vercel se niega a guardarla sin que elijas explícitamente, y avisa: *"looks like
a credential"*. El aviso es correcto en general y equivocado acá. Con
`--type secret` la key no llega al navegador y la app no tiene con qué hablar
con Supabase.

`SUPABASE_SERVICE_ROLE_KEY` **no hace falta**: `src/lib/db/server.ts` usa la
anon key y depende de la RLS. Nunca se cargó en el repo.

**2. La URL de redirect de Supabase ya sirve.** `LoginForm` manda
`emailRedirectTo = window.location.origin + "/login"`, y Supabase aceptó el
dominio de Vercel sin configurar nada. Verificado: el magic link se envió.

**3. Al tocar `public/sw.js`, subir el `VERSION`.** Un service worker con la
misma versión no reinstala nada y el iPhone sigue con el bundle viejo para
siempre. Es el error clásico y no se ve en desarrollo.

## Lo que NO se cachea

El service worker ignora a propósito: respuestas de Supabase, POST, y
cross-origin. Cachear SQL sobre la red es mostrarle a alguien la nota de ayer
cuando quería la de hoy. Los datos van a IndexedDB (`src/lib/cache.ts`), no al
Cache Storage.

## `?demo=1` está muerto en producción

Por el repo público, `/mandado?demo=1` es una URL que cualquiera puede abrir.
Las tres páginas usan `esDemo()` de `src/lib/demo.ts`, que devuelve `false` con
`NODE_ENV=production`, así que el atajo cae al login. Hay dos tests que lo
fijan.

## Pendiente, y es de seguridad

**La confirmación de email de Supabase sigue apagada.** Era una ventana de
desarrollo y ahora la app está en internet: con la confirmación apagada,
cualquiera que sepa el correo pide un link y entra. Ver
`confirmacion-email-off.md`.
