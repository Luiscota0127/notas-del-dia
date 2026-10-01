# Backlog

Lo que está abierto, en el orden en que conviene hacerlo. Lo cerrado está más
abajo, con por qué se cerró.

Regla que vengo aplicando: **una entrada dice qué está verificado y qué se
supone**. Casi todos los bugs de esta fase eran creíbles pero no ejecutados, y
una lista que no distingue eso se vuelve una lista de intenciones.

---

## 0. F4 está escrito pero no instalado

**Estado:** código listo, sin ejecutar. Es lo único que bloquea una función.

Hay que correr, en este orden:

1. `supabase/migrations/0009_notificado-por-agenda.sql` en el SQL Editor
2. `supabase functions deploy notify --no-verify-jwt`
3. los secretos: `SMTP_URL`, `SMTP_TOKEN`, `EMAIL_FROM`, `NOTIFY_SECRET`, `APP_URL`
4. `0003_cron.sql`, **corregido**: el `notify_secret` va con un secret propio y no
   con la anon key

Mientras tanto no llega ningún email. El toast del navegador sí funciona y está
verificado.

Paso a paso, con cómo probar que cada cosa funciona y qué significa cada error:
[`docs/recordatorios.md`](recordatorios.md).

## 1. El flujo con dos cuentas nunca se ejecutó

**Estado:** no verificado. Es lo más importante que queda.

Toda la app se probó con `?demo=1`, que abre la pantalla completa **sin tocar
Postgres ni una vez**. Los tres bugs seguidos de la migración de agendas —policy
que rompía `/agendas`, deadlock de RLS en crear agenda, trigger sin columna en
renombrar— salieron de probar solo escrituras, que en demo no existen.

Nunca se ejecutó, con dos sesiones reales:

- crear una agenda
- invitar a alguien por email y que acepte
- los dos escribiendo en la misma nota

**Hace falta:** una sesión real por persona. Con la confirmación de email prendida
y el rate limit de Supabase, no se puede armar desde acá.

## 2. Realtime: implementado, nunca visto funcionar

**Estado:** código escrito, sin verificación de punta a punta.

`useCambiosEnVivo` está completo y su cableado está cubierto por tests que leen
el código. Lo que **no** se vio es que dos personas realmente vean los cambios
del otro.

El escenario que importa: uno escribe, el otro mira, y el cambio tiene que
aparecer solo. Y el difícil: los dos escriben a la vez, que tiene que dar el
aviso de "la otra persona guardó algo mientras escribías" en vez de pisarse.

## 3. Offline con sesión

**Estado:** verificado en local sin sesión. Con sesión, no.

Ya funciona y está comprobado:

- sin red, escribir deja la nota en el cache y **en la cola** (esto estaba roto
  y se arregló: el store usaba `keyPath` y el objeto no lo tenía)
- al recargar sin red, la nota sigue
- con la red pero sin sesión válida, la cola **no** se vacía (el flush miraba
  solo el `throw` y la server action no lanza)

Lo que falta: confirmar que con sesión real la cola sube a Postgres y se vacía.
Es el final de la cadena, y es el paso que nadie dio.

## 4. El borde de los controles no llega a 3:1 — DECISIÓN DE DISEÑO

**Estado:** medido, esperando decisión.

`--color-line` da **1.39:1 en oscuro y 1.48:1 en claro**. WCAG 1.4.11 pide 3:1,
pero solo para el borde que **identifica un control**, no para los separadores
decorativos. El problema es que el mismo token hace las dos cosas: separa ítems
de lista y además dibuja el borde de los inputs y de los botones fantasma.

Los valores que sí cumplirían:

| Tema | Hoy | Cumple con |
|---|---|---|
| claro | `#d4d4d8` (1.48) | `#949494` (3.03) · `#8a8a8a` (3.45) |
| oscuro | `#2e2e2e` (1.39) | `#5e5e5e` (2.91) · `#666666` (3.29) |

**Recomiendo partir el token:** `--color-line` sigue sutil para decorar, y un
`--color-border-control` más fuerte solo para `.input` y `.btn-ghost`. Así los
separadores siguen livianos —que es el aspecto tipo Notion que fija `visual.md`—
y los campos se ven de verdad.

**No recomiendo subir `--color-line` entero:** hace visibles todos los separadores
y aleja la app del diseño de referencia. `globals.css` pide justificación escrita
antes de cambiar un valor, así que no lo toqué por mi cuenta.

El test de contraste **no está en verde a propósito**. Mientras la decisión esté
abierta tiene que seguir diciendo que el contraste no llega; un test que pasa
porque bajé el umbral esconde el problema.

## 5. El HTML cacheado lleva la nota adentro — RESUELTO

**Estado:** cerrado y **verificado en navegador**.

`redPrimero` cachea cada navegación bajo su pathname, y esa respuesta lleva la
nota ya renderizada con la sesión de quien la pidió. En un teléfono compartido, la
segunda persona veía la nota de la primera hasta que IndexedDB la reemplazaba.

### El bug de verdad

El borrado estaba escrito en `cerrarSesion()`, que tiene `"use server"` arriba:
**corre en el servidor**. En el servidor no existen `caches`, `indexedDB` ni
`localStorage`, así que los dos bloques de `borrarTodoLocal()` no hacían nada.
Estaban envueltos en try/catch, así que el logout "salía bien" —la sesión se
cerraba, el redirect pasaba— y el teléfono se quedaba con todo.

Escribí el backlog como resuelto leyendo el código, sin ejecutarlo. El código
parecía hacer lo correcto y no lo hacía. La lección está en el propio archivo de
tests: `src/test/logout.test.ts` falla si alguien vuelve a poner el borrado
dentro de la Server Action.

Había un segundo problema: aunque el borrado funcionara, se deshacía solo. El
service worker seguía registrado y la navegación siguiente volvía a cachear el
HTML. Por eso ahora hay un mensaje `purgar-datos` que el SW atiende.

### Qué se borra y qué no

El HTML de navegación y los payloads RSC —los dos llevan la nota—. **No** los
chunks de JS y CSS, los íconos ni el manifest: son los mismos para cualquiera y
no llevan datos de nadie. Tirarlos dejaría la PWA sin poder abrir sin red, que es
peor que el problema que se busca resolver.

### Verificado

Con un service worker real y el cache real, mandando el mensaje de verdad:

| Entrada | Resultado |
|---|---|
| `/casa/2026-09-01` (HTML con la nota) | **borrada** |
| `/__rsc__/casa/2026-09-01` (RSC con la nota) | **borrada** |
| `/_next/static/chunk.js` | conservada |
| íconos y manifest | conservados |

Lo que NO se pudo verificar: el recorrido completo con dos sesiones reales. Lo que
se verificó es que el mensaje purga lo que tiene que purgar y conserva lo que tiene
que conservar.

## 6. Confirmar el email en un iPhone sin señal

**Estado:** anotado.

Con la confirmación prendida, el enlace llega al teléfono que a veces no tiene
red justo cuando toca confirmar. La nota de ese momento se pierde si no hay señal
en ese instante. Vale la pena ver si la confirmación puede vivir en la agenda en
vez de en `/login`.

## 7. Rate limit de Supabase — RESUELTO

**Estado:** cerrado. SMTP propio configurado.

Con el SMTP de desarrollo de Supabase el límite es de unas pocas horas por IP,
compartidas entre las dos cuentas. No se nota mucho mientras nadie más entre,
pero cualquier persona que conozca el dominio podía pedir un link a ese correo y
agotarlo. La clave de acceso frenaba la puerta de la UI, no la API de auth.

Esto además destrabó el punto 1 y el punto 3, que estaban bloqueados por lo
mismo. Y es lo que hace posible F4: sin SMTP propio, el canal de email —el único
que llega con la app cerrada— no era confiable.

## 8. Subir `VERSION` en cada deploy de `sw.js` — RESUELTO

**Estado:** cerrado. La calcula `scripts/gen-sw.mjs` como un hash de `sw.src.js`.

Era un string que alguien tenía que acordarse de subir, y el síntoma era
invisible: la app abría bien, se veía bien, y el iPhone seguía con el bundle
viejo para siempre. Ahora no hay nada que acordarse.

## 9. Markdown: `**negrita**` y `*cursiva*` en línea — RESUELTO

**Estado:** cerrado. `src/lib/markdown.ts`, con tests en `markdown.test.ts`.

El texto sigue siendo el texto y la capa de display interpreta las marcas, igual
que ya hace con `☐` y `7:30am`. Cero cambios de schema y de sincronización.

La trampa prevista —la negrita mide distinto en las dos capas— estaba resuelta:
`--md-comp-negrita` mide el ancho en runtime y compensa por carácter. Es la misma
trampa del `--linea: 27.2px` absoluto, repetida por marca.

---

## Cerrado

| Qué | Por qué |
|---|---|
| **Precache que guardaba el login** | `addAll` seguía el 307 a `/login`. Ahora el shell es solo manifest, íconos y chunks. Verificado en producción. |
| **Clave compartida `/shell`** | Era "la última página que se vio": `/mandado` sin red devolvía una nota. Ahora cada ruta se cachea por su pathname, más los segmentos RSC. |
| **404 al agregar la app a inicio** | `start_url` apuntaba a `/hoy`, borrada con las agendas. Ahora es `/`, y hay un test que resuelve la ruta contra el disco. |
| **`/mandado` daba 404** | La carpeta se llamaba `mamado` y en App Router el nombre **es** la URL. Compilaba, los tests pasaban y la app abría. |
| **Renombrar una agenda daba 42703** | El trigger `touch_updated_at` escribía en una columna que la tabla no tenía. |
| **Crear agenda fallaba siempre** | Deadlock de RLS: la policy exige `es_dueno()`, que pregunta si la fila ya existe — que es lo que se está insertando. |
| **`/agendas` daba 404** | Una policy consultaba `auth.users`, que el rol de policies no puede leer. |
| **La confirmación de email estaba apagada** | `mailer_autoconfirm: false`. Era una ventana de desarrollo en internet. |
| **El `localhost` en producción** | Nunca estuvo en el código. Venía de la Site URL de Supabase. |
| **Cola offline rota** | El store usaba `keyPath: "clave"` y el objeto no la tenía: `put` fallaba en silencio y la cola quedaba siempre vacía. |
