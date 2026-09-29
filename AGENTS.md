# Notas del Día

PWA de pendientes compartida para una pareja. Reemplaza el uso diario de Notion:
texto libre por día, sincronizado entre dos dispositivos, con recordatorios.

Lee `.opencode/skills/notas-formato/SKILL.md` antes de tocar el editor, el parser
o cualquier estilo visual. Es el contrato del formato.

## Reglas duras

Estas cinco no se negocian. Si una decisión las contradice, cambia la decisión.

### 1. El texto libre es la fuente de verdad

Postgres guarda `notes.body` (un `text`) y nada más. No existe tabla de tareas,
no hay columnas de `title`/`time`/`done`, no hay campos obligatorios.

El parser produce un `Task` derivado **en el cliente, en cada render**. No se
persiste. Si alguna vez una columna nueva "haría más rápido el buscador", primero
demuestra con un test que el parser no puede dar el mismo resultado; si puede,
la columna no se agrega.

No uses un editor WYSIWYG pesado (TipTap, ProseMirror, Slate, Lexical). El
problema que estamos resolviendo es precisamente que Notion mete una capa
estructurada sobre texto que la gente escribe a mano. Un `contenteditable` con un
parser de ~200 líneas mantiene el control exacto del formato de referencia.

### 2. La dirección visual está bloqueada

Valores fijos, en `references/visual.md`:

- Fondo `#111111`, texto `#E4E4E7`, acento de mes `#F59E0B`
- Sans del sistema, 16-17px, `line-height` 1.6
- Checkbox **cuadrado** con borde, se llena al marcar. Nunca redondo.
- Modo oscuro por defecto.

El brief del usuario fija la estética. No propongas alternativas, no "mejores" la
paleta, no sustituyas la tipografía. La skill `frontend-design` aplica a login,
ajustes y primera carga; **no** al editor del día ni a la vista de semana, donde
replicar el look de Notion es el requisito.

Accesibilidad no es decoración y no se negocia por estética: contraste AA, foco de
teclado visible, checkboxes operables con Enter, `aria-label` en botones de solo
icono, `prefers-reduced-motion` respetado.

### 3. Ponytail corre en modo lite

`/ponytail lite`. La escalera sigue vigente (stdlib y nativo antes que
dependencias), pero **no uses el modo para recortar alcance**. El service worker,
las notificaciones y Supabase están pedidos explícitamente; que los propongas como
sobreingeniería no es un argumento para quitarlos.

Cuando tomes un atajo deliberado, márcalo con un comentario `ponytail:` en el
código explicando qué se_cutó y por qué, para que `/ponytail-debt` lo pueda
recuperar.

### 4. El editor es una superficie hostil en iOS

`contenteditable` en iOS Safari tiene bugs conocidos de caret salta al inicio al
re-renderizar. Requisitos no opcionales:

- Escribir una línea **no** debe re-renderizar todo el árbol. Si no puedes evitarlo,
  cambia de estrategia a `textarea` + estilos por línea y anota el porqué.
- `inputmode`, `enterkeyhint` y `autocapitalize` configurados a mano.
- `visualViewport` para que el teclado no tape la fila que se está editando.
- Prueba obligatoria en viewport 390x844 antes de cerrar cualquier fase.

### 5. Verificar antes de reportar

Nunca digas "debería funcionar" sin ejecutarlo. Antes de reportar una fase como
completa:

```bash
npm run build     # debe pasar limpio
npm run test      # debe pasar limpio
```

Y levanta la app, ábrela con la skill `browser-automation` en viewport de
escritorio **y** de 390x844, y mira la captura. Si hay errores de consola o de
build, arréglalos antes de reportar.

## Comandos

```bash
npm run dev       # servidor de desarrollo
npm run build     # build de producción
npm run test      # Vitest
npm run lint
```

## Estado

- **F0** scaffolding, parser, `format.ts`, 79 tests. Hecho.
- **F1** auth magic link, esquema con RLS, `NoteEditor` de placeholder. Código
  listo; falta que el usuario cree el proyecto de Supabase y aplique
  `0001_init.sql` + `0002_realtime.sql` (el CLI local no funciona, ver README).
- **F2** a **F5** pendientes. Ver `PLAN.md`.

El `NoteEditor` actual es un textarea con autoguardado a propósito: prueba el
round-trip de datos contra las RLS reales antes de meter el editor de dos capas
encima. En F2 se reemplaza.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
