# Verificar en el navegador

Herramienta: `node ~/.claude/skills/browser-automation/browser.mjs <url> --wait <sel> --script <archivo>`

## El `browser.mjs` no muestra `console.log`

**Solo reporta errores y warnings.** Un `console.log` en la página no aparece en
la salida, ni siquiera con la página cargada y el código ejecutándose.

Pasé un rato largo creyendo que un efecto no se estaba ejecutando porque mi
sonda `console.log` salía muda. Estaba corriendo. Lo deduje recién cuando revisé
que la sonda no salía **ni en el montaje**, que es imposible que no pase.

Para ver lo que pasa dentro de la página hay dos caminos que sí funcionan:

- **`document.title`** como sonda. El harness devuelve el título en la salida
  (`title "..."`), y `page.title()` lo lee cuando quieras.
- **`page.evaluate`** para leer estado, medir el DOM o consultar IndexedDB.

`console.warn` y `console.error` sí salen, en la sección
`console errors/warnings (N)`.

## La sonda va en el archivo `.mjs` de verdad

Los scripts se corren como ESM en Node, no como TypeScript. Escribir `as const`
o anotaciones de tipo ahí es un error de sintaxis, no un aviso.

Y `page.evaluate` corre **en el navegador**: no ve el scope de Node. Un `AG` de
Node usado adentro de `evaluate` es `ReferenceError`. Pasarlo como argumento:

```js
await page.evaluate((agenda) => { ... }, AG)
```

## Un test que pasa no siempre sirve

Dos veces en este repo un test dio verde con el producto roto:

- El de `start_url` comparaba contra el literal `"/hoy"`: siguió verde después
  de que esa ruta se borrara. Verificaba una cadena, no que la ruta existiera.
- El stub de IndexedDB ignoraba el `keyPath`, así que la cola rota pasaba.

**Antes de creer un test, rompé el código a propósito y confirmá que el test
falla.** Y cuando la prueba de que algo falla no falla, sospechá del experimento
antes que del código: me pasó, y era el `sed` de PowerShell que no estaba
modificando nada.

## La demo no toca la base

`?demo=1` abre la app completa —editor, navegación, sidebar— **sin tocar
Postgres ni una vez**. Los tres bugs seguidos de la migración de agendas
(policy rota, deadlock de RLS, trigger sin columna) salieron de probar solo con
demo, porque en demo no hay escrituras.

Para probar escrituras de verdad hace falta una sesión real.
