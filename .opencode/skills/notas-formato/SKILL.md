---
name: notas-formato
description: Contrato del formato de las notas diarias de Notas del Día. Usar al implementar o tocar el editor de texto, el parser de líneas, el parsing de horas y responsables, el render de checkboxes, o cualquier estilo visual de la nota. Contiene el ejemplo real que debe renderizarse idéntico y las reglas de parsing con sus casos borde.
---

# Formato de las notas

Este archivo es el contrato. Cuando el prompt y este skill discrepen, gana este
skill. Cuando una duda sobre el formato no esté aquí, **pregunta**; no improvises
una convención.

## Antes de escribir código

1. Lee `references/ejemplo-real.md` — la nota tal como la escribe.
2. Lee `references/parsing.md` — reglas de parsing y casos borde ya resueltos.
3. Lee `references/visual.md` — la dirección visual fijada.

## La regla que lo explica todo

El texto libre es la fuente de verdad. Postgres guarda `notes.body`, un `text`, y
nada más. El parser produce un `Task` **derivado, en el cliente, en cada render**.

Esto no es infraestructura, son consecuencias.

- No hay tabla de tareas. No hay columnas `title`, `time`, `done`, `assignees`.
- Si una columna nueva "haría más rápido el buscador", primero demuestra con un test
  que el parser no puede dar lo mismo. Si puede, la columna no se agrega.
- Editar una tarea es editar una línea de texto. No hay formulario de tarea.
- El índice único es `(user_id, date)`: una nota por usuario por día.

## Identidad visual (FIJADA)

El objetivo es que ella abra la app y no note el cambio. Replicar Notion en oscuro.

- Fondo `#111111`. Texto `#E4E4E7`. Acento de mes `#F59E0B`.
- Sans del sistema. 16-17px. `line-height` 1.6.
- Checkbox **cuadrado** con borde, se llena al marcar. Nunca redondo.
- Mes en MAYÚSCULAS y en acento. Día en MAYÚSCULAS formato `DÍA DD MON`.
- Párrafos en blanco preservados. El aire es intencional, no holgura.

No propongas alternativas ni "mejores" la paleta. La skill `frontend-design` aplica
a login, ajustes y primera carga, **no** al editor del día.

Accesibilidad no es decoración: contraste AA, foco visible, checkboxes operables con
Enter, `aria-label` en botones de solo icono, `prefers-reduced-motion` respetado.

## Checklist de un cambio

Antes de dar por buena cualquier modificación de formato:

- [ ] Los fixtures de `references/ejemplo-real.md` siguen pasando.
- [ ] Los casos borde de `references/parsing.md` siguen pasando.
- [ ] `npm run build` y `npm run test` en verde.
- [ ] Probado en viewport 390x844, no solo en escritorio.
- [ ] Verificado en el navegador con la skill `browser-automation`, mirando la
      captura, no solo la consola.
