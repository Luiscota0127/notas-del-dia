# Backlog

Lo que está abierto, en el orden en que conviene hacerlo. Lo cerrado está más
abajo, con por qué se cerró.

Regla que vengo aplicando: **una entrada dice qué está verificado y qué se
supone**. Casi todos los bugs de esta fase eran creíbles pero no ejecutados, y
una lista que no distingue eso se vuelve una lista de intenciones.

---

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

## 5. El HTML cacheado lleva la nota adentro

**Estado:** riesgo conocido, sin arreglo.

`redPrimero` cachea cada navegación bajo su pathname, y esa respuesta lleva la
nota ya renderizada con la sesión de quien la pidió. En un teléfono compartido, la
segunda persona ve la nota de la primera hasta que IndexedDB la reemplaza.

No hay logout en el código donde colgar un `caches.delete()`. Si algún día se
agrega, ese es el punto donde el dato ajeno se va.

## 6. Confirmar el email en un iPhone sin señal

**Estado:** anotado.

Con la confirmación prendida, el enlace llega al teléfono que a veces no tiene
red justo cuando toca confirmar. La nota de ese momento se pierde si no hay señal
en ese instante. Vale la pena ver si la confirmación puede vivir en la agenda en
vez de en `/login`.

## 7. Rate limit de Supabase

**Estado:** sigue. Unas pocas emails por hora, **compartidas entre las dos
cuentas**.

No se nota mucho mientras nadie más entre, pero cualquier persona que conozca el
dominio puede pedir un link a ese correo y agotarlo. La clave de acceso frena la
puerta de la UI, no la API de auth.

La salida es SMTP propio (Resend o Brevo), que además es lo que corresponde en
producción: el SMTP por defecto de Supabase es de desarrollo. También hace falta
para los recordatorios de F4, que salen de la nada en cuanto ese exista.

## 8. Subir `VERSION` en cada deploy de `sw.js`

**Estado:** proceso, sin forma de automatizar.

Un service worker con la misma versión no reinstala nada, y el iPhone sigue con el
bundle viejo para siempre. No hay manera de que la app se entere sola.

## 9. Markdown: `**negrita**` y `*cursiva*` en línea

**Estado:** acordado, no empezado. Decidido que queda para más adelante.

La versión buena es que **el texto sigue siendo el texto** y la capa de display
interpreta las marcas, igual que ya hace con `☐` y `7:30am`. Cero cambios de
schema y de sincronización.

El costo está en un detalle: la capa de display tiene que medir exactamente igual
que la textarea, y una `**` dibujada en negrita mide distinto que una `**` en
normal. Es la misma trampa del `--linea: 27.2px` absoluto, repetida por marca.

Solo en línea y solo esos dos. Nada de listas, headers ni blocks.

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
