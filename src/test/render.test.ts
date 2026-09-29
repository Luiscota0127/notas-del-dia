import { describe, expect, it } from "vitest";

import { parseNote } from "@/lib/parse";
import { NOTA_REAL } from "./fixtures";

/**
 * El criterio de aceptación de F2: la nota real debe renderizarse idéntica.
 * "Idéntica" se operacionaliza como tres cosas que se pueden testear:
 *   1. el orden y el tipo de cada línea son los de la referencia,
 *   2. el texto visible de cada línea es el que escribió, ni más ni menos,
 *   3. nada se pierde en el camino.
 *
 * El render visual en sí (colores, tamaños) lo verifica la captura en navegador;
 * esto fija la estructura, que es lo que un snapshot de texto puede atrapar.
 */

describe("estructura visible de la nota real", () => {
  const tasks = parseNote(NOTA_REAL);

  it("el orden de los tipos es el de la referencia", () => {
    expect(tasks.map((t) => t.kind)).toEqual([
      "heading", // SEPTIEMBRE
      "blank",
      "check",
      "check",
      "check",
      "check",
      "check",
      "blank",
      "heading", // MARTES 01 SEP
      "blank",
      "bullet",
      "blank",
      "text",
      "blank",
      "bullet",
      "blank",
      "text",
      "blank",
      "text",
      "blank",
      "text",
      "blank",
      "text",
    ]);
  });

  it("el mes y el día se distinguen", () => {
    expect(tasks[0].heading).toBe("mes");
    expect(tasks[8].heading).toBe("dia");
  });

  it("cada línea visible muestra lo que escribió, reconstructo desde el parse", () => {
    // Reconstruir la línea tal como se ve: prefijo + hora + cuerpo. Si el
    // parser pierde algo, el round-trip no vuelve al original.
    const lineas = tasks.map((t) => {
      if (t.kind === "blank") return "";
      if (t.kind === "heading") return t.body;
      const hora = t.time ? t.time + (t.timeRange ? ` a ${t.timeRange[1]}` : "") + " " : "";
      return t.prefix + hora + t.body;
    });

    // La hora se normaliza a minúscula, así que la comparación es sobre esa
    // diferencia conocida, no sobre el string crudo.
    const reconstruido = lineas.join("\n");
    const normalizado = NOTA_REAL.replace(/(\d:\d\d)(AM|PM)/g, (m, h, p) => h + p.toLowerCase());
    expect(reconstruido).toBe(normalizado);
  });

  it("los 5 checkboxes son los de la referencia", () => {
    const checks = tasks.filter((t) => t.kind === "check");
    expect(checks).toHaveLength(5);
    expect(checks.every((c) => c.done === false)).toBe(true);
    expect(checks.every((c) => c.prefix === "☐ ")).toBe(true);
  });

  it("cada línea tiene un índice igual a su posición", () => {
    tasks.forEach((t, i) => expect(t.index).toBe(i));
  });

  it("el texto de la hora se ve antes del cuerpo, no se pierde", () => {
    // Las 4 líneas con hora de la referencia.
    const conHora = tasks.filter((t) => t.time);
    expect(conHora.map((t) => t.time)).toEqual([
      "7:30am",
      "1:00pm",
      "6:00pm",
      "7:00pm",
      "11:00pm",
    ]);
    // Ninguna puede tener el cuerpo vacío: la hora sola no es una tarea.
    expect(conHora.every((t) => t.body.length > 0)).toBe(true);
  });

  it("los responsables se detectan solo en la línea que corresponde", () => {
    const conResponsable = tasks.filter((t) => t.assignees.length > 0);
    expect(conResponsable).toHaveLength(2);
    // En orden de línea: la 5 es "Tapar drenaje (Luis)", la 6 es "Pintar cuarto".
    expect(conResponsable[0].index).toBe(5);
    expect(conResponsable[0].assignees).toEqual(["Luis"]);
    expect(conResponsable[1].index).toBe(6);
    expect(conResponsable[1].assignees).toEqual(["Luis raspar", "Nahomi pintar"]);
  });

  it("el emoji del final sobrevive al parse", () => {
    expect(tasks[22].body).toBe("dormir 😴");
  });

  it("el punto suelto y los espacios dobles sobreviven", () => {
    // body incluye los paréntesis de los responsables a propósito: es el texto
    // que se ve, y sacarlos haría que la línea pierde caracteres en pantalla.
    expect(tasks[3].body).toBe(
      "Ya volver a reuniones PT . (Ya que esté establecido la venta desayunos)",
    );
    expect(tasks[6].body).toBe("Pintar cuarto  nuestro (Luis raspar/ Nahomi pintar)");
    // Pero el title sí los saca, porque ahí solo importa el texto de la tarea.
    expect(tasks[6].title).toBe("Pintar cuarto  nuestro");
  });
});

describe("notas de otros días: el parse no depende de la fecha", () => {
  it("una nota con líneas mezcladas y vacío devuelve solo las que hay", () => {
    expect(parseNote("")).toEqual([]);
    expect(parseNote("\n\n")).toHaveLength(3);
  });

  it("una línea con solo el checkbox no rompe", () => {
    const t = parseNote("☐ ")[0];
    expect(t).toMatchObject({ kind: "check", done: false, body: "" });
  });
});
