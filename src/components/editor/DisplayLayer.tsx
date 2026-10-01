"use client";

import { Fragment, type ReactNode } from "react";

import { partirEnSegmentos, type Segmento } from "@/lib/markdown";
import type { Task } from "@/lib/parse";

/**
 * La capa de display: el texto bonito.
 *
 * Nunca se edita. Existe solo para verse. La `textarea` de
 * abajo es la que recibe la escritura, y por eso los checkboxes de acá no pueden
 * romper el caret.
 *
 * Regla de alineación (PLAN.md 1.1): dentro del cuerpo de una línea, el
 * `font-family`, `font-size`, `font-weight` y `letter-spacing` tienen que ser
 * IDÉNTICOS a los de la textarea. El único atributo que puede cambiar es
 * `color`. Cualquier otra cosa desplaza el texto y el caret deja de calzar.
 *
 * Hay dos excepciones, y las dos son deliberadas:
 *
 *   - los responsables van en otro color, que no desplaza nada;
 *   - `**negrita**` y `*cursiva*` cambian el peso y el estilo, que sí desplazan.
 *
 * La segunda es cara y por eso queda escrita acá: la negrita mide 7.6% más que
 * la normal en 17px —14px de desvío en una frase de 23 caracteres—, así que sin
 * compensar, todo lo que sigue en la línea queda corrido, y con él el caret. Los
 * tramos con estilo llevan `letter-spacing` negativo, con el valor medido en
 * runtime y puesto en `--md-comp-negrita`. Si ese valor no está, vale 0 y el
 * desvío se ve: mejor visible que inventado.
 *
 * El texto que se guarda sigue siendo `**negrita**`. Esto no toca el schema, ni
 * el cache, ni Realtime.
 */

function claseDe(tipo: Segmento["tipo"]): string {
  switch (tipo) {
    case "marca":
      return "md-marca";
    case "negrita":
      return "md-negrita";
    case "cursiva":
      return "md-cursiva";
    default:
      return "";
  }
}

function Cuerpo({ task }: { task: Task }) {
  const partes: ReactNode[] = [];
  let key = 0;

  // La hora se la comió el parser, así que no está en `body`. Se pone adelante
  // para que se lea como en la referencia.
  if (task.time) {
    partes.push(
      <span key={key++} className="hora">
        {task.time}
        {task.timeRange ? ` a ${task.timeRange[1]}` : ""}{" "}
      </span>,
    );
  }

  const texto = task.body;
  if (texto === "") return <Fragment>{partes}</Fragment>;

  // Primero se parte en segmentos de estilo, y DENTRO de cada segmento de texto
  // se buscan los paréntesis de los responsables. Al revés no se puede: un
  // responsable puede caer dentro de un tramo en negrita.
  for (const seg of partirEnSegmentos(texto)) {
    if (seg.tipo !== "texto") {
      partes.push(
        <span key={key++} className={claseDe(seg.tipo)}>
          {seg.valor}
        </span>,
      );
      continue;
    }

    if (task.assignees.length === 0) {
      // Sin responsables no hay nada que resaltar: se deja el texto pelado para
      // no llenarlo de <span> innecesarios.
      if (seg.valor !== "") partes.push(seg.valor);
      continue;
    }

    let cursor = 0;
    for (const coincidencia of seg.valor.matchAll(/\(([^()]*)\)/g)) {
      const ini = coincidencia.index!;
      const fin = ini + coincidencia[0].length;
      if (ini > cursor) partes.push(seg.valor.slice(cursor, ini));
      partes.push(
        <span key={key++} className="quien">
          {coincidencia[0]}
        </span>,
      );
      cursor = fin;
    }
    if (cursor < seg.valor.length) partes.push(seg.valor.slice(cursor));
  }

  return <Fragment>{partes}</Fragment>;
}

export function DisplayLayer({
  tasks,
  onToggle,
}: {
  tasks: Task[];
  onToggle: (index: number) => void;
}) {
  return (
    // La capa NO es aria-hidden entera. Antes lo era, y por eso los checkboxes
    // —que viven acá— quedaban invisibles para el lector de pantalla: no había
    // forma de saber que una tarea estaba sin marcar.
    //
    // Ahora cada parte decorativa se oculta por separado: los encabezados, los
    // textos y las líneas vacías. El lector recibe el texto de la textarea, que
    // ya lo declara entero y con el corrector funcionando, y los estados de las
    // casillas de acá. Si se anunciara todo dos veces, peor que no anunciar.
    <div className="capa">
      {tasks.map((task) => {
        if (task.kind === "blank") {
          return <div key={task.index} className="linea linea-vacia" aria-hidden="true" />;
        }

        if (task.kind === "heading") {
          return (
            <div
              key={task.index}
              className={task.heading === "mes" ? "linea mes" : "linea dia"}
              aria-hidden="true"
            >
              {task.body}
            </div>
          );
        }

        if (task.kind === "check") {
          return (
            <div key={task.index} className="linea linea-check hanging">
              {/* El prefijo real (`☐ `) invisible, en la misma fuente que la
                  textarea. Esto reserva EXACTAMENTE el ancho que ocupa allá, así
                  que el cuerpo del texto queda alineado por construcción, sin
                  medir píxeles ni adivinar el ancho del carácter. */}
              <span className="prefijo" aria-hidden="true">
                {task.prefix}
              </span>

              {/* Un `<input type="checkbox">` de verdad, no un `<button>` pintado.
                  Antes era un button con `aria-hidden` y `tabIndex={-1}`: se
                  podía tocar con el ratón y no se podía tocar con el teclado ni
                  announcing el lector de pantalla. Eso rompe WCAG 2.1.1
                  (Keyboard) y 4.1.2 (Name, Role, Value), y contradice la regla
                  dura 2 de AGENTS.md ("checkboxes operables con Enter").

                  El `aria-label` lleva el texto de la línea, así que se anuncia
                  "08 sep (dosis 3…), casilla, sin marcar" en vez de una casilla
                  sin nombre. El texto de la línea se repite como `body`, que va
                  dentro del `.capa` aria-hidden: al lector le llega por el
                  textarea, una sola vez.

                  La etiqueta visible (`<label for>`) no envuelve el texto a
                  propósito. `visual.md` lo pide, pero con una textarea debajo el
                  clic en el texto tiene que POSICIONAR EL CARET: si el texto
                  marcara la casilla, no se podría tocar una palabra para
                  corregirla. El clic marca desde el cuadrado, con 44x44 de área
                  real, y el nombre accesible viene del `aria-label`. */}
              <input
                type="checkbox"
                className="hit"
                checked={task.done}
                onChange={() => onToggle(task.index)}
                onKeyDown={(e) => {
                  // Espacio ya lo marca el navegador. Enter no: en un checkbox
                  // nativo Enter no alterna el estado, y AGENTS.md lo pide
                  // explícitamente ("checkboxes operables con Enter").
                  if (e.key !== "Enter") return;
                  e.preventDefault();
                  onToggle(task.index);
                }}
                data-testid={`check-${task.index}`}
                aria-label={nombreDeLaLinea(task)}
                id={`check-nota-${task.index}`}
              />
              <label htmlFor={`check-nota-${task.index}`} className="caja-envoltura">
                <span className="caja" data-done={task.done || undefined}>
                  <span className="caja-marca" aria-hidden="true" />
                </span>
              </label>

              <span className={`texto${task.done ? " hecho" : ""}`}>
                <Cuerpo task={task} />
              </span>
            </div>
          );
        }

        if (task.kind === "bullet") {
          return (
            <div key={task.index} className="linea linea-bullet hanging" aria-hidden="true">
              {/* El `•  ` de la referencia, literal. Misma fuente, mismo ancho,
                  misma posición que en la textarea. */}
              <span className="prefijo">{task.prefix}</span>
              <span className="texto">
                <Cuerpo task={task} />
              </span>
            </div>
          );
        }

        return (
          <div key={task.index} className="linea" aria-hidden="true">
            <span className="texto">
              <Cuerpo task={task} />
            </span>
          </div>
        );
      })}

      {/* Sin esto la última línea no se puede scrollear hasta abajo: Safari no
          deja pasar del último elemento. */}
      <div className="linea linea-colchon" aria-hidden="true" />
    </div>
  );
}

/**
 * El nombre accesible del checkbox: el texto de la línea tal como se ve.
 *
 * Sin esto el lector anunciaría cinco "casilla, sin marcar" sin decir cuáles.
 * Con la hora adelante porque así se lee en pantalla, y cae al `title` si el
 * `body` quedó vacío (una línea que es solo `☐ `).
 */
function nombreDeLaLinea(task: Task): string {
  const hora = task.time
    ? `${task.time}${task.timeRange ? ` a ${task.timeRange[1]}` : ""} `
    : "";
  return (hora + task.body).trim() || task.title.trim() || "Tarea";
}
