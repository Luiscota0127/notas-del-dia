# Ejemplo real de nota

Este es el texto exacto que escribe ella. Copiar literal, incluidos los espacios
dobles, los emojis y las comas raras. Es la referencia de formato y también el
fixture de test.

## La nota

```text
SEPTIEMBRE

☐ 08 sep (dosis 3 de anti pulgas mishibu)
☐ Ya volver a reuniones PT . (Ya que esté establecido la venta desayunos)
☐ Buscar tratar celulitis  Nahomi
☐ Tapar drenaje con cemento. (Luis)
☐ Pintar cuarto  nuestro (Luis raspar/ Nahomi pintar)

MARTES 01 SEP

•  inicia campaña vacuna vph (buscar entro de salud)

7:30am publicar ventas y promo

•  preparar comida del día

1:00pm publicar comida el día.

6:00pm hacer ejercicio/ ir gym caminar y masaje.

7:00pm a 9:00pm luis didi

11:00pm dormir 😴
```

## Qué observar

Estas convenciones no son estilo personal arbitrario. Son parte del contrato:

| Observación | Detalle | Por qué importa |
|---|---|---|
| Mes en MAYÚSCULAS | `SEPTIEMBRE` | Es un encabezado, no una tarea. No debe parsearse como pendiente. |
| Día en MAYÚSCULAS | `MARTES 01 SEP` | Formato `DÍA DD MON`. Detecta el cambio de día dentro de un texto corrido. |
| Checkbox = carácter | `☐` es texto plano, no elemento | Un editor WYSIWYG los volvería nodos y rompería el round-trip a Markdown. |
| Doble espacio | `celulitis  Nahomi` | Real, no es un error. No "normalices" espacios al serializar. |
| Espacio antes del punto | `PT .` | Idem. Preservar el `raw` tal cual. |
| Paréntesis explicativo | `(Ya que esté establecido...)` | No es un responsable: es texto libre que empieza con `Ya`. Ver parsing. |
| Paréntesis con nombres | `(Luis raspar/ Nahomi pintar)` | **Sí** son responsables. Dos nombres separados por `/`. |
| Paréntesis suelto sin nombre | `(buscar entro de salud)` | Frase en minúsculas: es una nota, no un responsable. |
| Bullets con `•` | Sin espacio después del carácter | `•  inicia campaña` lleva dos espacios. Preservar. |
| Hora pegada al texto | `7:30am publicar ventas` | Sin `:` de separación, sin espacio tras la hora más allá del simple. |
| Rango con `a` | `7:00pm a 9:00pm` | Minúscula, con espacios. El recordatorio usa la hora inicial. |
| Emoji al final | `dormir 😴` | Se preserva tal cual. |
| Línea en blanco | Separadores entre ideas | `kind: "blank"`, se preserva. El aire es intencional. |

## Fixture de test esperado

Si parseas el bloque de arriba, estas tareas deben salir con estos valores:

| Línea | kind | time | title | assignees |
|---|---|---|---|---|
| `SEPTIEMBRE` | heading | — | `SEPTIEMBRE` | [] |
| `☐ 08 sep (dosis 3 de anti pulgas mishibu)` | check | — | `08 sep (dosis 3 de anti pulgas mishibu)` | [] |
| `☐ Buscar tratar celulitis  Nahomi` | check | — | `Buscar tratar celulitis  Nahomi` | [] |
| `☐ Pintar cuarto  nuestro (Luis raspar/ Nahomi pintar)` | check | — | `Pintar cuarto  nuestro` | `["Luis", "Nahomi"]` |
| `MARTES 01 SEP` | heading | — | `MARTES 01 SEP` | [] |
| `•  inicia campaña vacuna vph (buscar entro de salud)` | bullet | — | `inicia campaña vacuna vph (buscar entro de salud)` | [] |
| `7:30am publicar ventas y promo` | text | `7:30am` | `publicar ventas y promo` | [] |
| `•  preparar comida del día` | bullet | — | `preparar comida del día` | [] |
| `1:00pm publicar comida el día.` | text | `1:00pm` | `publicar comida el día.` | [] |
| `6:00pm hacer ejercicio/ ir gym caminar y masaje.` | text | `6:00pm` | `hacer ejercicio/ ir gym caminar y masaje.` | [] |
| `7:00pm a 9:00pm luis didi` | text | `7:00pm` + range | `luis didi` | [] |
| `11:00pm dormir 😴` | text | `11:00pm` | `dormir 😴` | [] |

`Nahomi` sin paréntesis (`celulitis  Nahomi`) **no** es responsable. Solo cuenta
dentro de paréntesis. Esa asimetria es intencional: el parser no debe inventar
estructura donde ella no la puso.
