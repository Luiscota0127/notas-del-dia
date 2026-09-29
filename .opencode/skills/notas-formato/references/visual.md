# Dirección visual — FIJADA

El objetivo es que ella abra la app y no note el cambio. Replicar Notion en oscuro.

Esta dirección está fijada por el brief del usuario. La skill `frontend-design`
tiene una regla explícita al respecto: *"Where the brief pins down a visual
direction, follow it exactly — the brief's own words always win."* Aplica. No
propongas alternativas, no "mejores" la paleta, no sustituyas la tipografía.

`frontend-design` **sí** aplica a: pantalla de login, panel de ajustes, estado
vacío, primer arranque. Ahí hay libertad estética dentro de estos tokens.

## Tokens

```css
--bg: #111111
--bg-elevated: #1a1a1a /* tarjetas, sidebar, inputs */
--text: #e4e4e7
--text-dim: #a1a1aa /* placeholder, metadatos, contador */
--accent: #f59e0b /* mes en mayúsculas */
--border: #2e2e2e /* checkbox sin marcar, separadores */
--border-focus: #f59e0b /* foco de teclado */
```

Modo claro como secundario, con toggle persistido:

```css
--bg: #ffffff
--bg-elevated: #f7f7f8
--text: #1c1c1e
--text-dim: #6b6b70
--accent: #b45309 /* el mismo naranja, oscurecido para contraste AA en blanco */
--border: #d4d4d8
```

`--accent` **no** es el mismo hex en claro. `#f59e0b` sobre blanco da contraste
~2.1:1 y falla AA. Oscurecer es requisito, no preferencia.

## Tipografía

Sans del sistema. Sin fuentes web.

```
font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
font-size: 17px;
line-height: 1.6;
```

17px, no 16: en iPhone 16px se ve pequeño con el teclado abierto. Con
`meta viewport` con `viewport-fit=cover` y safe-area insets para notch.

`line-height: 1.6` es lo que produce el ritmo aireado de la referencia. No lo
bajes a 1.4 aunque "se vea más compacto".

Mono solo para las horas, si se decide separarlas visualmente:

```
font-family: ui-monospace, "SF Mono", Menlo, monospace;
font-size: 15px;
```

## Estructura de la nota

```html
<h1 class="mes">SEPTIEMBRE</h1>        <!-- mayúsculas, --accent, 20px, tracking normal -->
<h2 class="dia">MARTES 01 SEP</h2>     <!-- mayúsculas, --text, 16px, weight 500 -->
<div class="blank"></div>              <!-- altura 1.6em, preservada -->
<label class="check">
  <input type="checkbox" />
  <span>08 sep (dosis 3 de anti pulgas mishibu)</span>
</label>
```

### El mes

Mayúsculas, `--accent`, 20px, `font-weight: 500`. El tracking amplio en mayúsculas
se ve pretencioso a 20px. Dejar el tracking normal.

### El día

Mayúsculas, `--text`, 16px, `font-weight: 500`. **No** es `--accent`: si el mes y
el día son del mismo color, la jerarquía se pierde y es justo lo que Notion
distingue.

### Checkbox

Cuadrado. `16x16px`, `border: 1px solid var(--border)`, sin `border-radius`.

Marcado: `background: var(--text)` con un check en `--bg` encima. Se **llena**.
En la referencia los checkboxes completados se ven sólidos.

Estado de foco: `outline: 2px solid var(--border-focus)`, `outline-offset: 2px`.

Nunca redondeado. Un checkbox circular rompe la referencia inmediatamente y no hay
razón de diseño que lo justifique: la referencia no lo usa.

### Línea completada

El texto baja a `--text-dim`. **No** tachado, **no** opacity. Notion no tacha, y el
tachado sobre un texto que ella escribe a mano se ve sucio.

### Línea en blanco

`height: 1.6em`. Se preserva desde el parse. Nunca la colapses con
`white-space: normal` ni la elimines con CSS.

## Layout

### Escritorio

```
┌──────────┬─────────────────────────┐
│          │  SEPTIEMBRE             │
│ Calendario│                         │
│          │  MARTES 01 SEP          │
│          │                         │
│  ◻ 2/7   │  ☐ 08 sep (dosis 3)     │
│          │  ☐ Buscar tratar...     │
└──────────┴─────────────────────────┘
```

Sidebar de calendario 260px. Nota en el resto, `max-width: 68ch` para que las
líneas no se estiren a 1400px y sean difíciles de leer.

### Móvil

Una sola columna. El calendario no es un sidebar: es un drawer o se sustituye por
un selector de fecha compacto en la cabecera. El área de escritura empieza arriba,
debajo de la cabecera, con el padding suficiente para que el notch y el Dynamic
Island no la tapen.

Ancho objetivo: 390x844 (iPhone 14 Pro). Esa es la cifra de referencia, no
375x812.

## Accesibilidad — requisito, no decoración

- Contraste AA en todo el texto. Incluido `--accent` sobre `--bg` y viceversa.
- Checkbox: `<input type="checkbox">` real, con `label` envolviendo el texto. Clic
  en el texto = clic en el checkbox. Enter y Espacio funcionan. Navegación por
  tabulador en orden lógico.
- Foco visible en todo elemento interactivo, nunca `outline: none` sin reemplazo.
- Botones de solo icono (calendario, buscar, tema): `aria-label` en español.
- `prefers-reduced-motion: reduce` → sin transiciones ni animaciones. La única
  animación aceptable es el check al marcar, y desaparece bajo reduced-motion.
- Landmarks: `<main>`, `<nav>` en el sidebar, `<header>`.
- El contador "2/7 completadas" no es solo visual: que el lector de pantalla lo
  anuncie al cambiar.

## iOS — tres cosas concretas

1. **Teclado.** `visualViewport` para saber el alto real. Con el teclado abierto el
   `100vh` de iOS Safari es el alto del viewport **visible**, y el área de escritura
   queda bajo el teclado si se usa `min-height: 100vh`. Usar
   `visualViewport.height` y `--kb-inset`.
2. **Focus.** Al enfocar un input, `scrollIntoView({ block: "center" })`. Safari
   no siempre lo hace solo, y el teclado tapa el elemento enfocado.
3. **Toque.** Checkbox de 16px es pequeño para un dedo. El área táctil real es
   44x44px con `padding`, y el `input` visible se centra dentro. El área grande es
   clicable, el cuadrado es lo que se ve.

## Anti-patrones

Rechazados explícitamente. Si aparecen, están mal:

- Cards SaaS con `border-radius` en todo y sombra suave.
- Texto centrado. La nota va alineada a la izquierda, como en la referencia.
- Gradientes decorativos.
- Animate.css, framer-motion, o cualquier librería de animación para marcar un
  checkbox.
- Iconos de librería para el calendario o el check cuando un SVG inline de 3
  líneas basta.
- Cualquier cosa que se mueva sin que el usuario la haya gatillado, salvo el check
  al marcar.
