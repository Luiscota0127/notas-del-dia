# El magic link vuelve al login

## Causa 1 — el código (ya arreglado)

`/login` decidía si había sesión en el **servidor**, que corre antes de que el
JavaScript procese el token de la URL. El servidor no lo veía, renderizaba el
login, y después el cliente canjeaba el token y ponía la cookie — pero nadie
volvía a preguntar, así que la pantalla quedaba en login con la sesión ya
creada.

Arreglado con `src/components/ContinuarSesion.tsx`: escucha
`onAuthStateChange` y, si hay sesión, hace `router.replace("/hoy")` +
`router.refresh()`. El `refresh` es lo importante: le dice al server component
que vuelva a leer la cookie.

## Causa 2 — la configuración de Supabase (la tenés que cambiar vos)

Supabase **ignora** el `emailRedirectTo` si el origen no está permitido, y manda
a la **Site URL**, que por defecto es `http://localhost:3000` — el puerto viejo,
donde vive desayunos-web. Por eso el link te boholean la app incorrecta.

**Supabase → Authentication → URL Configuration:**

| Campo | Valor |
|---|---|
| **Site URL** | `http://localhost:3005` |
| **Redirect URLs** | agregá `http://localhost:3005/login` |

Guardá. La Site URL es lo que usa cuando no reconoce el redirectTo.

Para cuando despliegues, agregá también el dominio real, por ejemplo
`https://notas.vercel.app/login`.

## Después de cambiarlo

1. Decime "listo" y mando un link nuevo al 3005.
2. Ojo: el rate limit de Supabase sigue activo. Si da 429, hay que esperar.

## Alternativa si querés desbloquear ya

**Authentication → SMTP** con Resend o Brevo. Sin rate limit, y es lo que
corresponde en producción igual. El SMTP por defecto de Supabase está pensado
para desarrollo.
