# Backlog

## 1. El precache guarda la pantalla de login, no la app

**Estado:** verificado en producción, sin arreglar.

`cache.addAll(["/", "/hoy", ...])` sigue los redirects. Con la sesión cerrada,
`/` y `/hoy` responden **307 a `/login`**, así que lo que queda guardado bajo esas
claves es el HTML del login. Medido en `notas-del-dia.vercel.app`:

```
"/":     { status: 200, redirected: true, esLogin: true, bytes: 9206 }
"/hoy":  { status: 200, redirected: true, esLogin: true, bytes: 9206 }
```

9206 bytes idénticos en las dos: es la misma página, la del login.

Peor: **`addAll` solo corre en el `install`**, o sea una vez. La primera visita
de cualquiera es deslogueada, así que el shell cacheado es el login aunque después
la persona entre con sesión. Nunca se actualiza.

Por qué importa: sin red, `/` y `/hoy` devuelven el login. La app "abre" pero no
muestra notas.

Arreglo probable: `/` y `/hoy` no deberían estar en el precache. El shell son
archivos sin auth — los íconos, el manifest, los chunks. Las rutas que dependen
de la sesión no se precachean: se resuelven en runtime contra la red, y sin red
lo que hay es IndexedDB (`src/lib/cache.ts`), que es justamente el diseño de F5.3.

## 2. `/mandado` sin red no abre

**Estado:** verificado que falla; la causa raíz probablemente es la misma que (1).

Sin red, `/mandado` termina en la página de error del navegador
(*"No se puede acceder a este sitio web"*), no en la app.

Los requests que fallan:

```
ERR_INTERNET_DISCONNECTED  /hoy?_rsc=...
ERR_FAILED                 /hoy
```

`?_rsc=` son los payloads de App Router. **Ninguno está precacheado**, y el
HTML de `/` y `/hoy` no los incluye. Aunque el SW devuelva el shell, el cliente
igual pide el segmento RSC de la ruta y lo necesita para pintar.

Es el problema clásico de hacer offline con App Router: precachear HTML no
alcanza, hacen falta los segmentos RSC, o desactivar la navegación cliente en el
camino sin red.

En local esto no se vio porque `?demo=1` atendía todo por SSR y el perfil del
navegador ya tenía caches de corridas anteriores.

**Necesito de vos:** qué pasa exactamente con `/mandado` *con red* y con sesión.
Sin una sesión real no puedo reproducirlo, y con la confirmación de email apagada
no puedo obtenerla por API (ver `confirmacion-email-off.md`). Con el síntoma
—error, pantalla en blanco, 500, la lista vacía— se puede acotar en un paso.

## 3. El `localhost` no está en el código

**Estado:** descartado, verificado.

No hay ningún `localhost:3000` ni `:3005` en producción. Inspeccionados los 10
chunks que carga `/login` (438.308 bytes) más `sw.js`: cero coincidencias. En el
repo solo aparece en `README.md` y en docs, que es texto.

El `localhost` que se ve viene de la **configuración de Supabase**, no del
código:

**Supabase → Authentication → URL Configuration → Site URL**

Supabase ignora el `emailRedirectTo` si el origen no está permitido y manda a la
Site URL. El link que llegó al correo probablemente apuntaba a `localhost:3000`
o `localhost:3005`.

| Campo | Valor |
|---|---|
| **Site URL** | `https://notas-del-dia.vercel.app` |
| **Redirect URLs** | agregar `https://notas-del-dia.vercel.app/login` |

Con eso el link vuelve a la app en vez de al puerto viejo, donde vive
`desayunos-web`.

Lo raro es que la petición del magic link la aceptara. Acepta y aun así manda el
link a la Site URL si el destino no está en la lista de permitidos — son dos
validaciones distintas.

## 4. La confirmación de email de Supabase sigue apagada

**Estado:** verificado, es lo más urgente de todo.

`GET /auth/v1/settings` responde `"mailer_autoconfirm": true`.

Con eso, cualquiera que sepa `luiscota2701@gmail.com` pide un link y entra a leer
y escribir las notas. La app ya está en internet. Ver `confirmacion-email-off.md`.

## 5. Encolar en el service worker es más caro de lo que parece

**Estado:** anotado, no resuelto.

Con la confirmación de email prendida, el enlace del correo llega al teléfono con
un iPhone que a veces está sin señal. La nota de ese momento se va a perder si no
hay red justo cuando toca confirmar. Vale la pena ver si la confirmación puede
vivir en `/hoy` en vez de en `/login`.

## 6. El rate limit de Supabase

**Estado:** sigue. Un link por hora, y compartido entre las dos cuentas.

Con la confirmación apagada no se nota porque no hay correo. Prendiéndola vuelve.
La salida es SMTP propio (Resend o Brevo), que además es lo que corresponde en
producción: el SMTP por defecto de Supabase es de desarrollo.