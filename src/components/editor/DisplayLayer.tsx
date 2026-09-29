"use client";

import { Fragment, type ReactNode } from "react";

import type { Task } from "@/lib/parse";

/**
 * La capa de display: el texto bonito.
 *
 * Nunca recibe el foco, nunca se edita. Existe solo para verse. La `textarea` de
 * abajo es la que recibe la escritura, y por eso los checkboxes de acá no pueden
 * romper el caret.
 *
 * Regla de alineación (PLAN.md 1.1): dentro del cuerpo de una línea, el
 * `font-family`, `font-size`, `font-weight` y `letter-spacing` tienen que ser
 * IDÉNTICOS a los de la textarea. El único atributo que puede cambiar es
 * `color`. Cualquier otra cosa desplaza el texto y el caret deja de calzar.
 */

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

  // Los paréntesis que son responsables van en otro color. Mismo tamaño, otra
  // tinta: el color no desplaza, el font-weight sí.
  if (task.assignees.length === 0) {
    partes.push(texto);
    return <Fragment>{partes}</Fragment>;
  }

  let cursor = 0;
  for (const coincidencia of texto.matchAll(/\(([^()]*)\)/g)) {
    const inicio = coincidencia.index!;
    const fin = inicio + coincidencia[0].length;
    partes.push(texto.slice(cursor, inicio));
    partes.push(
      <span key={key++} className="quien">
        {coincidencia[0]}
      </span>,
    );
    cursor = fin;
  }
  partes.push(texto.slice(cursor));

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
    // aria-hidden: la capa es decorativa. El lector de pantalla debe leer la
    // textarea, que tiene el texto real y es un textarea de verdad.
    <div className="capa" aria-hidden="true">
      {tasks.map((task) => {
        if (task.kind === "blank") {
          return <div key={task.index} className="linea linea-vacia" />;
        }

        if (task.kind === "heading") {
          return (
            <div
              key={task.index}
              className={task.heading === "mes" ? "linea mes" : "linea dia"}
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
              <span className="prefijo">{task.prefix}</span>
              {/* tabIndex={-1}: el recorrido de tabulación va a la textarea, no
                  a estos botones. El checkbox sigue siendo usable con clic. */}
              <button
                type="button"
                className="hit"
                onClick={() => onToggle(task.index)}
                tabIndex={-1}
                data-testid={`check-${task.index}`}
                aria-hidden="true"
              >
                <span className="caja" data-done={task.done || undefined}>
                  <span className="caja-marca" />
                </span>
              </button>
              <span className={`texto${task.done ? " hecho" : ""}`}>
                <Cuerpo task={task} />
              </span>
            </div>
          );
        }

        if (task.kind === "bullet") {
          return (
            <div key={task.index} className="linea linea-bullet hanging">
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
          <div key={task.index} className="linea">
            <span className="texto">
              <Cuerpo task={task} />
            </span>
          </div>
        );
      })}

      {/* Sin esto la última línea no se puede scrollear hasta abajo: Safari no
          deja pasar del último elemento. */}
      <div className="linea linea-colchon" />
    </div>
  );
}
