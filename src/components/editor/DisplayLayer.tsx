"use client";

import { Fragment, type ReactNode } from "react";

import { partirEnSegmentos, type Segmento } from "@/lib/markdown";
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
