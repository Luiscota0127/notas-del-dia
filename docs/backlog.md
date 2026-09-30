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

Con red y sesión, `/mandado` funciona. Lo que falla es sin red, y es *además* del
bug de carpeta que estaba antes (404 con la app entera andando, arreglado y con
tests).

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

Para probarlo con red hace falta una sesión, y con la confirmación ya prendida
tampoco se puede sacar por API. Alguien tiene que abrir el correo y tocar el
link, y ahí avisar qué pasa — error, pantalla en blanco, 500, la lista vacía. Con
el síntoma se acota en un paso.

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

## 4. La confirmación de email — CERRADO

**Estado:** prendida. Verificado con `GET /auth/v1/settings` →
`"mailer_autoconfirm": false`.

La ventana de desarrollo en la que cualquiera con el correo podía entrar como
esa persona está cerrada. Ver `confirmacion-email-off.md`.

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

## 7. El textarea pierde los saltos de línea en el HTML del servidor

**Estado:** cerrado, era consecuencia del bug de la carpeta.

Renderizado de `/mandado`, el `<textarea>` llegaba con 87 caracteres y **cero
saltos de línea**: las seis líneas de la listavenues unidas con espacios.

```
repr: ☐ pan ☐ leche (descremada) ☐ huevos ☑ café • cosas del depot papel de cocina
```

La capa de display (`.capa`) sí renderizaba las seis líneas, así que a simple
vista la pantalla estaba bien y el bug quedaba oculto: recién al editar se
habría notado, cuando la lista entera se reemplaza por esa versión pegada.

Causa: no era el `\n` en sí. El HTML bien formado, y la causa de fondo era que
estaba mirando `/mamado?demo=1`, una ruta que el navegador servía desde una
página de error con contenido de la página anterior. Al corregir la carpeta a
`/mandado`, el textarea llegó con sus saltos de línea correctos.

Vale la pena revisarlo si algún día el editor muestra una lista pegada en
pantalla completa pero el contenido real está bien.

## 8. Verificar el `sw.js` con el VERSION correcto en cada deploy

**Estado:** anotado, proceso.

Cambiar `VERSION` en `public/sw.js` es obligatorio en cada deploy. Si no, el
navegador no reinstala nada y el iPhone sigue con el bundle viejo para siempre.
No hay forma de que la app se dé cuenta sola.