import { existsSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * En App Router, el nombre de la carpeta ES la URL. No hay ruta que registrar en
 * ningún lado: `/[agenda]/mandado` es `src/app/[agenda]/mandado/page.tsx`.
 *
 * Este test existe porque la carpeta estuvo una vez como `mamado` mientras todo
 * el código decía `/mandado`: compilaba, los tests pasaban, la app abría, y el
 * enlace de "Mandado" caía en 404. Solo se veía entrando a la página.
 *
 * Mirlos el disco, no el código, porque el código estaba bien.
 */
describe("las rutas existen de verdad", () => {
  const app = join(process.cwd(), "src", "app");

  it("la nota vive en [agenda]/[fecha]", () => {
    expect(existsSync(join(app, "[agenda]", "[fecha]", "page.tsx"))).toBe(true);
  });

  it("mandado y semana están dentro de la agenda, no sueltos", () => {
    expect(existsSync(join(app, "[agenda]", "mandado", "page.tsx"))).toBe(true);
    expect(existsSync(join(app, "[agenda]", "semana", "page.tsx"))).toBe(true);
  });

  it("no quedan carpetas sueltas de una sola agenda", () => {
    // /mandado y /semana a secas no tienen agenda: ¿de cuál? No se pueden
    // resolver, y por eso quedaron movidas adentro de [agenda].
    expect(existsSync(join(app, "mandado"))).toBe(false);
    expect(existsSync(join(app, "semana"))).toBe(false);
    expect(existsSync(join(app, "[date]"))).toBe(false);
  });

  it("el editor de la lista vive con su página", () => {
    expect(existsSync(join(app, "[agenda]", "mandado", "ListaEditor.tsx"))).toBe(true);
  });

  it("existe la pantalla de elección de agenda", () => {
    // `/` redirige a la primera agenda, pero la elección explícita necesita una
    // pantalla donde se vean todas.
    expect(existsSync(join(app, "agendas", "page.tsx"))).toBe(true);
  });

  it("los ajustes personales siguen existiendo, aparte de los de la agenda", () => {
    // Son de la persona, no de la agenda: no cambian al cambiar de contexto.
    expect(existsSync(join(app, "ajustes", "page.tsx"))).toBe(true);
    expect(existsSync(join(app, "[agenda]", "ajustes", "page.tsx"))).toBe(true);
  });
});
