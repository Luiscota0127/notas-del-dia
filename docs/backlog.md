# Backlog

## 0. El borde de los controles no llega a 3:1 — DECISIÓN PENDIENTE

**Estado:** medido, con los números a la vista, esperando decisión de diseño.

`--color-line` da **1.39:1 en oscuro y 1.48:1 en claro** contra su fondo. WCAG
1.4.11 pide 3:1, pero solo para el borde que **identifica un control**, no para
los separadores decorativos. El problema es que `--color-line` está haciendo las
dos cosas a la vez: separa ítems de lista y además dibuja el borde de los inputs
y de los botones fantasma.

Los valores que sí cumplirían:

| Tema | Hoy | Cumple con |
|---|---|---|
| claro | `#d4d4d8` (1.48) | `#949494` (3.03) · `#8a8a8a` (3.45) |
| oscuro | `#2e2e2e` (1.39) | `#5e5e5e` (2.91) · `#666666` (3.29) |

**Lo que recomiendo:** partir el token. `--color-line` sigue sutil para
decorar, y un `--color-border-control` nuevo, más fuerte, solo para `.input` y
`.btn-ghost`. Así los separadores siguen livianos —que es el aspecto tipo Notion
que fija `visual.md`— y los campos se ven de verdad.

**Lo que no recomiendo:** subir `--color-line` entero. Hace visibles todos los
separadores de la app y la aleja del diseño de referencia.

El test de contraste **no está en verde a propósito**: mientras la decisión esté
abierta tiene que seguir diciendo que no llega. Un test que pasa porque bajé el
umbral esconde el problema.

## 1. El precache guarda la pantalla de login — CERRADO

Arreglado en `dfc8d52` y verificado en producción: el precache ya no tiene `/`,
`/hoy`, `/mandado` ni la clave compartida `/shell`. Solo manifest, íconos y los
chunks con hash que se piden en runtime.

Dos cosas que quedan de esto, y que son riesgos reales:

**El HTML por ruta se cachea con datos adentro.** `redPrimero` guarda cada
respuesta de navegación bajo su pathname, y esa respuesta lleva la nota
renderizada con la sesión de quien la pidió. En un teléfono compartido, la
segunda persona ve la nota de la primera hasta que IndexedDB la reemplaza.

No hay logout en el código donde colgar un `caches.delete()`. Si algún día se
agrega, hay que borrar el cache ahí: es el punto donde el dato ajeno se va.

**Sin sesión no hay shell universal.** `desdeCache` no puede servir "una página
de app" cuando lo que se necesita son los datos de una nota concreta. Por eso,
sin red y sin visita previa a esa ruta, la respuesta es el mensaje de Sin
conexión y no una pantalla rota. Con red y con visita previa, funciona.

## 9. Compartir la agenda entre los dos

**Estado:** decisión de diseño, sin empezar.

Hoy las notas **no** son compartidas: `notes` tiene `unique (user_id, date)` y la
policy es `user_id = auth.uid()`. Cada persona tiene su libreta, como en Notion.
Solo `lista` es compartida, y tiene su propia tabla justamente por eso (ver
`0004_lista.sql`).

El problema de hacer la nota compartida: dos personas escriben el mismo día, y
la última que guarda pisa a la otra. Con `lista` no pasa porque es un documento
continuo donde los dos agregan abajo. Con una nota por día, "agregar abajo" no
significa nada porque la nota es de un día puntual.

Lo que resuelve esto sin romper el modelo: **dejar la nota como es, y agregar la
lista al día**. Es decir, `/mandado` pasa a embeberse en la nota del día, o la
nota del día muestra la lista debajo. Un solo documento, los dos escriben, y la
separación visual la hace el parser —que ya distingue `☐`, `•` y texto libre.

Alternativa más grande: una tabla `agenda` compartida como `lista`, donde cada
día es una fila. Más limpio de modelar, pero es otro documento con otro editor, y
la app ya tiene dos.

**Falta decidir cuál.** No lo empiezo sin que lo elijas, porque las dos cambian el
schema y el modelo mental.

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