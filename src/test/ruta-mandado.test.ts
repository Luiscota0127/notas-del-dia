import { existsSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * En App Router, el nombre de la carpeta ES la URL. No hay ruta que registrar en
 * ningún lado: `/mandado` es `src/app/mamado/page.tsx` y viceversa.
 *
 * La carpeta llegó como `mamado` y todo el código —la barra de navegación, el
 * `revalidatePath`, los tests— decía `/mandado`. Resultado: `/mandado` daba 404
 * y el enlace de "Mandado" no llevaba a ningún lado. Nada lo señalaba: compila,
 * los tests pasan, y la ruta rota solo se ve entrando a la app.
 *
 * Este test mira el disco, no el código, porque el código estaba bien. Es la
 * única forma de detectar que la carpeta y la URL se desencontraron.
 */
describe("la ruta /mandado existe de verdad", () => {
  const app = join(process.cwd(), "src", "app");

  it("la carpeta se llama mandado, como el enlace de la barra", () => {
    expect(existsSync(join(app, "mandado", "page.tsx"))).toBe(true);
  });

  it("no queda una carpeta mamado serviendo una ruta que nadie enlaza", () => {
    expect(existsSync(join(app, "mamado"))).toBe(false);
  });

  it("el editor de la lista vive con la página, no en otro lado", () => {
    // El import es relativo: si la página se mueve y el editor se queda, el
    // build falla, pero no antes.
    expect(existsSync(join(app, "mandado", "ListaEditor.tsx"))).toBe(true);
  });
});