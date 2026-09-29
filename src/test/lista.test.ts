import { describe, expect, it } from "vitest";

import { countChecks, parseNote, toggleCheck } from "@/lib/parse";

/**
 * La lista de mandado usa el mismo parser que las notas. Estos tests fijan que
 * una lista de supermercado — que no tiene encabezado de mes ni de día, ni horas
 * — se parsea bien. Es el caso que la nota de referencia NO cubre.
 */

const LISTA = `☐ pan
☐ leche
☑ huevos
☐ café
• cosas del depot
papel`;

describe("una lista de mandado se parsea", () => {
  it("los checkboxes se detectan sin encabezado ni fecha", () => {
    const t = parseNote(LISTA);
    expect(t.map((x) => x.kind)).toEqual([
      "check",
      "check",
      "check",
      "check",
      "bullet",
      "text",
    ]);
  });

  it("cuenta solo lo que falta comprar", () => {
    expect(countChecks(parseNote(LISTA))).toEqual({ total: 4, hechos: 1 });
  });

  it("el texto de cada ítem es el nombre, sin el checkbox", () => {
    const t = parseNote(LISTA);
    expect(t[0].title).toBe("pan");
    expect(t[1].title).toBe("leche");
    expect(t[2].title).toBe("huevos");
    expect(t[2].done).toBe(true);
  });

  it("el bullet y la línea suelta también funcionan", () => {
    const t = parseNote(LISTA);
    expect(t[4].title).toBe("cosas del depot");
    expect(t[4].done).toBe(false); // un bullet no es completable
    expect(t[5].title).toBe("papel");
    expect(t[5].kind).toBe("text");
  });

  it("una línea con paréntesis sigue funcionando", () => {
    const t = parseNote("☐ leche (descremada)")[0];
    expect(t.title).toBe("leche (descremada)");
    expect(t.assignees).toEqual([]);
  });

  it("nada se confunde con un encabezado de mes o de día", () => {
    // "SEPTIEMBRE" en una lista sería raro, pero no puede volverse encabezado
    // sin que el usuario lo escriba en mayúsculas.
    const t = parseNote("☐ harina")[0];
    expect(t.kind).toBe("check");
    expect(t.title).toBe("harina");
  });
});

describe("marcar en la lista", () => {
  it("toggle ida y vuelta sobre un ítem", () => {
    expect(toggleCheck("☐ pan")).toBe("☑ pan");
    expect(toggleCheck(toggleCheck("☐ pan"))).toBe("☐ pan");
  });

  it("no toca los otros ítems", () => {
    const lineas = LISTA.split("\n");
    const antes = [...lineas];
    lineas[0] = toggleCheck(lineas[0]);
    expect(lineas[1]).toBe(antes[1]);
    expect(lineas.slice(2)).toEqual(antes.slice(2));
  });

  it("una lista vacía no es un error", () => {
    expect(parseNote("")).toEqual([]);
    expect(countChecks(parseNote(""))).toEqual({ total: 0, hechos: 0 });
  });

  it("solo espacios en blanco es una línea vacía, no un ítem", () => {
    const t = parseNote("   ")[0];
    expect(t.kind).toBe("blank");
  });
});
