import { describe, expect, it } from "vitest";

import { NOTA_DEMO } from "@/lib/demo";
import { NOTA_REAL } from "./fixtures";

/**
 * La nota de la referencia está en tres lugares: el skill (que es el contrato),
 * el fixture de los tests, y src/lib/demo.ts que usan las páginas de demo.
 * Si divergen, los tests pasan probando una cosa y la pantalla muestra otra.
 */
describe("la nota de referencia tiene una sola fuente", () => {
  it("demo.ts y el fixture de los tests son idénticos", () => {
    expect(NOTA_DEMO).toBe(NOTA_REAL);
  });

  it("tiene los 5 checkboxes y los 2 encabezados de la referencia", () => {
    expect(NOTA_DEMO.split("\n").filter((l) => l.startsWith("☐"))).toHaveLength(5);
    expect(NOTA_DEMO).toContain("SEPTIEMBRE");
    expect(NOTA_DEMO).toContain("MARTES 01 SEP");
  });

  it("conserva el emoji y los espacios dobles que la referencia tiene", () => {
    expect(NOTA_DEMO).toContain("dormir 😴");
    expect(NOTA_DEMO).toContain("Pintar cuarto  nuestro");
  });
});
