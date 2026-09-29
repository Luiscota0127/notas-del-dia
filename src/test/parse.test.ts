import { describe, expect, it } from "vitest";

import { countChecks, parseNote, toggleCheck } from "@/lib/parse";
import { NOTA_REAL } from "./fixtures";

/** Atajo: la línea i del body. */
const linea = (i: number) => parseNote(NOTA_REAL)[i];

describe("estructura de la nota real", () => {
  it("conserva las 23 líneas, incluidos los blancos", () => {
    expect(parseNote(NOTA_REAL)).toHaveLength(23);
  });

  it("preserva los 9 blancos de la referencia", () => {
    expect(parseNote(NOTA_REAL).filter((t) => t.kind === "blank")).toHaveLength(9);
  });

  it("un body vacío no es una línea en blanco", () => {
    expect(parseNote("")).toEqual([]);
  });

  it("preserva los blancos del medio: el aire es intencional", () => {
    const kinds = parseNote(NOTA_REAL).map((t) => t.kind);
    expect(kinds.filter((k) => k === "blank")).toHaveLength(9);
  });
});

describe("encabezados", () => {
  it("SEPTIEMBRE es un mes, no una tarea", () => {
    expect(linea(0)).toMatchObject({ kind: "heading", title: "SEPTIEMBRE" });
    expect(linea(0).time).toBeUndefined();
  });

  it("MARTES 01 SEP es un día", () => {
    expect(linea(8)).toMatchObject({ kind: "heading", title: "MARTES 01 SEP" });
  });

  it("acepta # por si escribe Markdown a mano", () => {
    const t = parseNote("# SEPTIEMBRE")[0];
    expect(t).toMatchObject({ kind: "heading", title: "SEPTIEMBRE" });
  });
});

describe("la tabla de la referencia, línea por línea", () => {
  // Cada fila de la tabla de expected de ejemplo-real.md.
  const esperado: Array<[number, Partial<ReturnType<typeof linea>>]> = [
    [0, { kind: "heading", title: "SEPTIEMBRE" }],
    [2, { kind: "check", title: "08 sep (dosis 3 de anti pulgas mishibu)", time: undefined }],
    [4, { kind: "check", title: "Buscar tratar celulitis  Nahomi" }],
    [6, { kind: "check", title: "Pintar cuarto  nuestro", assignees: ["Luis raspar", "Nahomi pintar"] }],
    [8, { kind: "heading", title: "MARTES 01 SEP" }],
    [10, { kind: "bullet", title: "inicia campaña vacuna vph (buscar entro de salud)" }],
    [12, { kind: "text", time: "7:30am", title: "publicar ventas y promo" }],
    [14, { kind: "bullet", title: "preparar comida del día" }],
    [16, { kind: "text", time: "1:00pm", title: "publicar comida el día." }],
    [18, { kind: "text", time: "6:00pm", title: "hacer ejercicio/ ir gym caminar y masaje." }],
    [20, { kind: "text", time: "7:00pm", timeRange: ["7:00pm", "9:00pm"], title: "luis didi" }],
    [22, { kind: "text", time: "11:00pm", title: "dormir 😴" }],
  ];

  it.each(esperado)("línea %i", (i, want) => {
    expect(linea(i)).toMatchObject(want);
  });

  it("el raw de cada línea es exactamente lo que se escribió", () => {
    for (const task of parseNote(NOTA_REAL)) {
      expect(NOTA_REAL.split("\n")).toContain(task.raw);
    }
  });
});

describe("horas: los 9 casos de parsing.md", () => {
  const t = (line: string) => parseNote(line)[0];

  it("7:30am al inicio", () => {
    expect(t("7:30am publicar ventas")).toMatchObject({ time: "7:30am", title: "publicar ventas" });
  });

  it("11:00pm con emoji al final", () => {
    expect(t("11:00pm dormir 😴")).toMatchObject({ time: "11:00pm", title: "dormir 😴" });
  });

  it("6:00 PM en mayúscula se normaliza a minúscula", () => {
    expect(t("6:00 PM hacer ejercicio")).toMatchObject({ time: "6:00pm", title: "hacer ejercicio" });
  });

  it("6:00pm en minúscula", () => {
    expect(t("6:00pm hacer ejercicio")).toMatchObject({ time: "6:00pm" });
  });

  it("rango con 'a' minúscula", () => {
    expect(t("7:00pm a 9:00pm luis didi")).toMatchObject({
      time: "7:00pm",
      timeRange: ["7:00pm", "9:00pm"],
      title: "luis didi",
    });
  });

  it("rango con mayúsculas se normaliza en ambos extremos", () => {
    expect(t("7:00PM a 9:00AM luis didi")).toMatchObject({
      time: "7:00pm",
      timeRange: ["7:00pm", "9:00am"],
    });
  });

  it("'7 pm' NO matchea: requiere :mm", () => {
    expect(t("7 pm").time).toBeUndefined();
  });

  it("una hora en medio de la línea NO matchea", () => {
    expect(t("publicar a las 7:30am").time).toBeUndefined();
  });

  it("'08 sep' NO matchea: 08 no es 8:08", () => {
    expect(t("08 sep (dosis 3)")).toMatchObject({ kind: "text", time: undefined });
  });

  it("acepta a.m. y p.m. con puntos", () => {
    expect(t("6:00 p.m. cenar").time).toBe("6:00pm");
  });
});

describe("responsables: los 7 casos de parsing.md", () => {
  const a = (line: string) => parseNote(line)[0].assignees;

  it("(Luis)", () => expect(a("☐ (Luis)")).toEqual(["Luis"]));
  it("(Nahomi)", () => expect(a("☐ (Nahomi)")).toEqual(["Nahomi"]));

  it("(Luis raspar/ Nahomi pintar) son dos", () => {
    expect(a("☐ (Luis raspar/ Nahomi pintar)")).toEqual(["Luis raspar", "Nahomi pintar"]);
  });

  it("una frase no es responsable", () => {
    expect(a("☐ (Ya que esté establecido la venta desayunos)")).toEqual([]);
  });

  it("una nota en minúscula no es responsable", () => {
    expect(a("•  (buscar entro de salud)")).toEqual([]);
  });

  it("un dígito lo descarta", () => {
    expect(a("☐ (dosis 3 de anti pulgas mishibu)")).toEqual([]);
  });

  it("'08 sep' con dígitos lo descarta", () => {
    expect(a("☐ (08 sep)")).toEqual([]);
  });

  it("el paréntesis de contenido se queda en el title", () => {
    expect(parseNote("☐ 08 sep (dosis 3 de anti pulgas mishibu)")[0].title).toBe(
      "08 sep (dosis 3 de anti pulgas mishibu)",
    );
  });

  it("el nombre suelto fuera de paréntesis NO es responsable", () => {
    expect(parseNote("☐ Buscar tratar celulitis  Nahomi")[0].assignees).toEqual([]);
  });
});

describe("checkboxes", () => {
  it("☐ empieza sin hacer", () => {
    expect(parseNote("☐ comprar")[0]).toMatchObject({ kind: "check", done: false, title: "comprar" });
  });

  it("☑ empieza hecha", () => {
    expect(parseNote("☑ comprar")[0]).toMatchObject({ done: true, title: "comprar" });
  });

  it("☒ empieza hecha", () => {
    expect(parseNote("☒ comprar")[0].done).toBe(true);
  });

  it("[ ] y [x] funcionan", () => {
    expect(parseNote("[ ] comprar")[0].done).toBe(false);
    expect(parseNote("[x] comprar")[0].done).toBe(true);
  });

  it("un bullet no es completable", () => {
    expect(parseNote("•  algo")[0].done).toBe(false);
  });
});

describe("toggleCheck preserva el carácter que ella usó", () => {
  it("☐ ↔ ☑", () => {
    expect(toggleCheck("☐ comprar")).toBe("☑ comprar");
    expect(toggleCheck("☑ comprar")).toBe("☐ comprar");
  });

  it("☒ → ☐", () => {
    expect(toggleCheck("☒ comprar")).toBe("☐ comprar");
  });

  it("[ ] ↔ [x] y no se convierte en ☑", () => {
    expect(toggleCheck("[ ] comprar")).toBe("[x] comprar");
    expect(toggleCheck("[x] comprar")).toBe("[ ] comprar");
  });

  it("no toca el resto de la línea", () => {
    expect(toggleCheck("☐ 08 sep (dosis 3 de anti pulgas mishibu)")).toBe(
      "☑ 08 sep (dosis 3 de anti pulgas mishibu)",
    );
  });

  it("una línea que no es check no se toca", () => {
    expect(toggleCheck("7:30am publicar")).toBe("7:30am publicar");
  });
});

describe("casos borde ya resueltos", () => {
  it("normaliza tabuladores a espacios", () => {
    expect(parseNote("☐\tcomprar")[0].title).toBe("comprar");
  });

  it("quita el \\r de CRLF", () => {
    expect(parseNote("☐ comprar\r\n☐ pintar")[1].raw).toBe("☐ pintar");
  });

  it("solo cuenta el primer checkbox de la línea", () => {
    const t = parseNote("☐ comprar ☐ y pintar")[0];
    expect(t.title).toBe("comprar ☐ y pintar");
  });

  it("no parsea paréntesis anidados", () => {
    expect(parseNote("☐ (a (b))")[0].assignees).toEqual([]);
  });
});

describe("contador del día", () => {
  it("cuenta solo checkboxes, no bullets ni texto", () => {
    expect(countChecks(parseNote(NOTA_REAL))).toEqual({ done: 0, total: 5 });
  });

  it("cuenta las hechas", () => {
    const body = NOTA_REAL.replace("☐ 08 sep", "☑ 08 sep").replace("☐ Pintar", "☑ Pintar");
    expect(countChecks(parseNote(body))).toEqual({ done: 2, total: 5 });
  });
});

describe("round-trip: mutar una línea es mutar un string", () => {
  it("toggle → reparsear mantiene el índice y todo lo demás", () => {
    const tasks = parseNote(NOTA_REAL);
    const lineas = NOTA_REAL.split("\n");
    const i = 2; // "☐ 08 sep (dosis 3 de anti pulgas mishibu)"

    lineas[i] = toggleCheck(lineas[i]);
    const despues = parseNote(lineas.join("\n"));

    expect(despues[i]).toMatchObject({ index: i, done: true, title: tasks[i].title });
    expect(despues[i].raw).toBe(lineas[i]);
  });

  it("el doble toggle vuelve al original", () => {
    const lineas = NOTA_REAL.split("\n");
    const original = lineas[4];
    lineas[4] = toggleCheck(toggleCheck(original));
    expect(lineas[4]).toBe(original);
  });
});
