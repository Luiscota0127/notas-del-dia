import { afterEach, describe, expect, it, vi } from "vitest";

import { esDemo, NOTA_DEMO } from "@/lib/demo";
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

/**
 * El atajo `?demo=1` tiene que estar muerto en producción.
 *
 * El repo es público, así que `/mandado?demo=1` es una URL que cualquiera puede
 * abrir. Antes de este test el chequeo de NODE_ENV vivía en cada página por
 * separado y en dos de las tres nunca se ejecutaba: la app servía una lista de
 * ejemplo con nombres falsos a un visitante sin sesión. Centralizado en `esDemo`
 * ya no puede volver a colarse, y este test avisa si alguien lo re-abre.
 */
describe("el atajo de desarrollo no existe en producción", () => {
  // vi.stubEnv y no `process.env.NODE_ENV = ...`: los tipos de Node lo marcan
  // read-only y `next build` typechekea los tests, así que asignar a mano rompe
  // el build aunque vitest pase.
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("con NODE_ENV=production devuelve false, tenga o no el query param", () => {
    vi.stubEnv("NODE_ENV", "production");
    expect(esDemo("1")).toBe(false);
    expect(esDemo(undefined)).toBe(false);
  });

  it("en desarrollo solo entra con ?demo=1", () => {
    vi.stubEnv("NODE_ENV", "development");
    expect(esDemo("1")).toBe(true);
    expect(esDemo("0")).toBe(false);
    expect(esDemo(undefined)).toBe(false);
  });
});
