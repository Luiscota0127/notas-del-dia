import { describe, expect, it } from "vitest";

import { buscarEnNotas } from "@/components/Buscador";
import { NOTA_REAL } from "./fixtures";

/**
 * El buscador es una función pura sobre un Record<fecha, body>. Se testea sin
 * navegador a propósito: la UI es una lista de resultados, la lógica es esto.
 */

describe("buscarEnNotas", () => {
  const bodies = {
    "2026-09-01": NOTA_REAL,
    "2026-09-02": "☐ comprar café\n☐ llamar a Luis",
    "2026-09-03": "☐ revisar el drenaje",
  };

  it("con menos de 2 caracteres no busca", () => {
    expect(buscarEnNotas(bodies, "")).toEqual([]);
    expect(buscarEnNotas(bodies, "a")).toEqual([]);
  });

  it("encuentra sin distinguir mayúsculas", () => {
    const r = buscarEnNotas(bodies, "CAFÉ");
    expect(r).toHaveLength(1);
    expect(r[0].date).toBe("2026-09-02");
    expect(r[0].texto).toBe("☐ comprar café");
  });

  it("devuelve la línea completa, no solo el fragmento", () => {
    const r = buscarEnNotas(bodies, "drenaje");
    expect(r[0].texto).toBe("☐ revisar el drenaje");
  });

  it("marca qué se encontró, para resaltar", () => {
    const r = buscarEnNotas(bodies, "comprar");
    expect(r[0].match).toBe("comprar");
  });

  it("reporta el índice de la línea, para saltar dentro de la nota", () => {
    // "7:30am publicar ventas y promo" es la línea 12 de la nota real.
    const r = buscarEnNotas(bodies, "publicar ventas");
    expect(r[0].linea).toBe(12);
    expect(r[0].date).toBe("2026-09-01");
  });

  it("encuentra en varias líneas del mismo día", () => {
    const r = buscarEnNotas(bodies, "publicar");
    expect(r.length).toBeGreaterThan(1);
    expect(new Set(r.map((x) => x.linea)).size).toBe(r.length);
  });

  it("encuentra en varios días", () => {
    const r = buscarEnNotas(bodies, "revisar");
    expect(r).toHaveLength(1);
    expect(r[0].date).toBe("2026-09-03");
  });

  it("sin resultados devuelve vacío, no un error", () => {
    expect(buscarEnNotas(bodies, "zzzz")).toEqual([]);
  });

  it("ignora los días con body vacío", () => {
    const conVacios = { ...bodies, "2026-09-04": "", "2026-09-05": "   " };
    expect(buscarEnNotas(conVacios, "comprar")).toHaveLength(1);
  });

  it("busca también en los encabezados", () => {
    const r = buscarEnNotas(bodies, "SEPTIEMBRE");
    expect(r[0].linea).toBe(0);
  });

  it("ordena por fecha descendente", () => {
    const r = buscarEnNotas(bodies, "☐");
    const fechas = r.map((x) => x.date);
    expect(fechas).toEqual([...fechas].sort().reverse());
  });

  it("un término que aparece dos veces en la misma línea cuenta una vez", () => {
    const bodies2 = { "2026-09-01": "☐ café café" };
    const r = buscarEnNotas(bodies2, "café");
    expect(r).toHaveLength(1);
  });
});
