import { describe, expect, it } from "vitest";

import { parseNote, toggleCheck } from "../lib/parse";

/**
 * Migrar desde Notion.
 *
 * Notion exporta las listas de tareas con el guion delante:
 *
 *     - [ ] Aire acondicionado
 *     - [x] Centrum
 *
 * El parser solo reconocia el checkbox cuando está al PRINCIPIO de la línea
 * (`MARKER_RE` está anclado con `^`). Con el guion delante, la línea cae como
 * viñeta y el `[ ]` queda dentro del texto, que es lo que se ve en pantalla.
 */
const DE_NOTION = `- [ ]  Aire acondicionado
- [ ]  Ingrediente leche dorada
- [ ]  Snack
- [ ]  estante jabón
- [ ]  Huevos
- [ ]  Puré tomate
- [x]  Lysi
- [x]  Centrum`;

const ESPERADO = [
  { title: "Aire acondicionado", done: false },
  { title: "Ingrediente leche dorada", done: false },
  { title: "Snack", done: false },
  { title: "estante jabón", done: false },
  { title: "Huevos", done: false },
  { title: "Puré tomate", done: false },
  { title: "Lysi", done: true },
  { title: "Centrum", done: true },
];

describe("la lista de Notion se importa como tareas de verdad", () => {
  it("cada línea `- [ ]` es una tarea, no una viñeta con texto pegado", () => {
    const tasks = parseNote(DE_NOTION).filter((t) => t.kind !== "blank");

    expect(tasks.map((t) => ({ title: t.title, done: t.done }))).toEqual(ESPERADO);
  });

  it("el guion de Notion no queda pegado al texto", () => {
    for (const t of parseNote(DE_NOTION)) {
      if (t.kind === "blank") continue;
      expect(t.title.startsWith("- ")).toBe(false);
      expect(t.title).not.toContain("[ ]");
      expect(t.title).not.toContain("[x]");
    }
  });

  it("`[x]` de Notion cuenta como hecha", () => {
    const hechas = parseNote(DE_NOTION).filter((t) => t.done).map((t) => t.title);
    expect(hechas).toEqual(["Lysi", "Centrum"]);
  });

  it("todas son kind check, para que el checkbox sea clickeable", () => {
    const kinds = new Set(
      parseNote(DE_NOTION)
        .filter((t) => t.kind !== "blank")
        .map((t) => t.kind),
    );
    expect([...kinds]).toEqual(["check"]);
  });

  it("al tocar el checkbox se alterna bien y se conserva el guion", () => {
    // Lo que se escribe tiene que seguir siendo algo que el parser vuelve a
    // entender: si el toggle devuelve `☐` y se pierde el guion, la línea deja de
    // ser una tarea al recargar.
    const primera = DE_NOTION.split("\n")[0];
    const alternada = toggleCheck(primera);

    // El espaciado se normaliza a un espacio: Notion deja dos y no tiene
    // sentido conservar eso en una línea que ya se está reescribiendo.
    expect(alternada).toBe("- [x] Aire acondicionado");
    expect(parseNote(alternada)[0].done).toBe(true);
    expect(parseNote(alternada)[0].title).toBe("Aire acondicionado");

    const yaHecha = "- [x]  Centrum";
    expect(toggleCheck(yaHecha)).toBe("- [ ] Centrum");
  });

  it("sigue aceptando las formas viejas, sin `-` delante", () => {
    // No se rompe nada de lo que ya funciona: `[ ] ` y `[x] ` sueltos, y `☐ ☑ ☒`.
    expect(parseNote("[ ] Pan")[0]).toMatchObject({ kind: "check", done: false });
    expect(parseNote("[x] Pan")[0]).toMatchObject({ kind: "check", done: true });
    expect(parseNote("☐ Pan")[0]).toMatchObject({ kind: "check", done: false });
    expect(parseNote("☑ Pan")[0]).toMatchObject({ kind: "check", done: true });
    expect(parseNote("☒ Pan")[0]).toMatchObject({ kind: "check", done: true });
  });

  it("sigue aceptando las viñetas de verdad, sin checkbox", () => {
    // `- algo` tiene que seguir siendo una viñeta, no una tarea sin checkbox.
    expect(parseNote("- algo")[0]).toMatchObject({ kind: "bullet", title: "algo" });
    expect(parseNote("• algo")[0]).toMatchObject({ kind: "bullet", title: "algo" });
  });
});