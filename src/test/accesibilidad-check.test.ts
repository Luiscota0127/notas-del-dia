import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { parseNote } from "@/lib/parse";
import { NOTA_REAL } from "./fixtures";

/**
 * Los checkboxes tienen que ser operables con teclado.
 *
 * Esto se rompió en silencio una vez: eran `<button class="hit">` con
 * `tabIndex={-1}` y `aria-hidden="true"`, y la capa entera era `aria-hidden`.
 * Se podía marcar con el ratón —una prueba manual lo daba por bueno— y no con
 * el teclado ni con lector de pantalla. Rompe WCAG 2.1.1 (Keyboard) y 4.1.2
 * (Name, Role, Value), y contradice la regla dura 2 de AGENTS.md.
 *
 * Estos tests leen el código, como los demás de la carpeta: no hay DOM en
 * Vitest. Mirror la verificación real que sí se corrió en navegador
 * (`verifica-tab.mjs`: 5 inputs reales, alcanzables con Tab, Espacio y Enter
 * alternan el estado, y el contador se actualiza).
 */

const raiz = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const leer = (...p: string[]) => readFileSync(join(raiz, ...p), "utf8");

const display = leer("src", "components", "editor", "DisplayLayer.tsx");
const layers = leer("src", "components", "editor", "layers.css");

describe("el checkbox es un control real, no un button pintado", () => {
  it("es un `<input type=\"checkbox\">`", () => {
    expect(display).toMatch(/<input\s+type="checkbox"/);
  });

  it("no queda ningún `<button>` con la clase del checkbox", () => {
    // El botón viejo: cliqueable, pero inalcanzable con teclado.
    expect(display).not.toMatch(/<button[\s\S]{0,200}?className="hit"/);
  });

  it("no le pone `aria-hidden` al checkbox", () => {
    // Si el input queda aria-hidden, el lector no lo anuncia aunque sea real.
    const bloque = display.slice(display.indexOf('type="checkbox"'));
    const hastaCierre = bloque.slice(0, bloque.indexOf("/>"));
    expect(hastaCierre).not.toContain('aria-hidden="true"');
  });

  it("no le saca del recorrido de tabulación", () => {
    // Solo el JSX del input: el `tabIndex={-1}` que se menciona en el comentario
    // del código es el del ANTIGUO button, y no debe hacer fallar esto.
    const bloque = display.slice(display.indexOf('<input\n                type="checkbox"'));
    expect(bloque).toBeTruthy();
    const hastaCierre = bloque.slice(0, bloque.indexOf("/>"));
    expect(hastaCierre).not.toContain("tabIndex={-1}");
    expect(hastaCierre).not.toContain("hidden");
  });

  it("cada checkbox nombra la línea que marca", () => {
    // Sin esto se anuncian cinco "casilla, sin marcar" sin decir cuáles.
    expect(display).toContain("aria-label={nombreDeLaLinea(task)}");
  });
});

describe("Enter también marca, como pide AGENTS.md", () => {
  it("Espacio lo hace el navegador; Enter hay que agregarlo", () => {
    // En un checkbox nativo Enter NO alterna el estado. La regla 2 de AGENTS.md
    // lo exige, así que tiene que estar explícito.
    expect(display).toMatch(/onKeyDown=\{\(e\) => \{[\s\S]*?e\.key !== "Enter"[\s\S]*?onToggle\(task\.index\)/);
  });

  it("no interfiere con el resto de las teclas", () => {
    // Si no corta con `return`, marcaría también con la flecha o con "a".
    expect(display).toMatch(/if \(e\.key !== "Enter"\) return;/);
  });
});

describe("la capa ya no está oculta entera", () => {
  it("el contenedor `.capa` no lleva `aria-hidden`", () => {
    // Si lo llevara, escondería también los checkbox que ahora viven adentro.
    expect(display).toMatch(/<div className="capa">/);
    expect(display).not.toMatch(/<div className="capa" aria-hidden="true">/);
  });

  it("el texto que ya lee la textarea se sigue ocultando", () => {
    // Si no, el lector leería la nota dos veces: por la textarea y por acá.
    for (const trozo of [
      /className="linea linea-vacia" aria-hidden="true"/,
      /className="linea linea-bullet hanging" aria-hidden="true"/,
      /className="linea linea-colchon"/,
    ]) {
      expect(display).toMatch(trozo);
    }
    // El colchón está al final de la lista, después del map.
    const colchon = display.slice(display.indexOf('className="linea linea-colchon"'));
    expect(colchon.slice(0, colchon.indexOf("/>"))).toContain('aria-hidden="true"');
  });

  it("los encabezados también", () => {
    expect(display).toMatch(/className=\{task\.heading === "mes" \? "linea mes" : "linea dia"\}\s*\n\s*aria-hidden="true"/);
  });
});

describe("el input oculto sigue siendo enfocable", () => {
  it("se oculta con clip, no con `display:none` ni `visibility:hidden`", () => {
    // Las dos lo sacan del recorrido de tabulación, que es lo que hay que
    // arreglar. Es el error clásico del visually-hidden.
    const bloque = layers.slice(layers.indexOf(".hit {"), layers.indexOf(".caja-envoltura"));
    expect(bloque).not.toContain("display: none");
    expect(bloque).not.toContain("display:none");
    expect(bloque).not.toContain("visibility: hidden");
    expect(bloque).not.toContain("visibility:hidden");
  });

  it("vuelve a prender `pointer-events`", () => {
    // `.capa` es `pointer-events: none` y la propiedad se hereda: sin esto el
    // clic de ratón deja de funcionar (passó, y se notó en el navegador).
    const bloque = layers.slice(layers.indexOf(".hit {"), layers.indexOf(".caja-envoltura"));
    expect(bloque).toContain("pointer-events: auto");
  });

  it("el foco se dibuja sobre el cuadrado visible", () => {
    // El input es invisible: su `outline` no se ve. Sin esto se marca la casilla
    // con el teclado y no hay forma de saber cuál.
    expect(layers).toMatch(
      /\.hit:focus-visible \+ \.caja-envoltura \.caja \{[\s\S]*?outline: 2px solid var\(--color-accent\)/,
    );
  });
});

describe("el nombre accesible sale del parse", () => {
  it("usa la hora y el cuerpo, y cae al title si el body está vacío", () => {
    expect(display).toContain("function nombreDeLaLinea(task: Task): string");
    expect(display).toMatch(/hora \+ task\.body/);
    expect(display).toContain('|| "Tarea"');
  });

  it("una línea que es solo `☐ ` todavía tiene nombre", () => {
    // El caso borde: sin body ni title, el aria-label no puede quedar vacío.
    const t = parseNote("☐ ")[0];
    const nombre = (t.time ? `${t.time} ` : "") + t.body;
    expect(nombre.trim() || t.title.trim() || "Tarea").toBe("Tarea");
  });

  it("los 5 checkboxes de la nota real nombran líneas distintas", () => {
    const checks = parseNote(NOTA_REAL).filter((t) => t.kind === "check");
    const nombres = checks.map((t) => t.body.trim());
    expect(nombres).toHaveLength(5);
    expect(new Set(nombres).size).toBe(5);
    // Ninguno puede quedar sin texto: el que empieza con hora la lleva adelante.
    expect(nombres.every((n) => n.length > 0)).toBe(true);
  });
});

describe("lo que NO se rompió", () => {
  it("la estructura de la nota real sigue igual", () => {
    // El checkbox dejó de ser un <button>, pero las líneas se parsean igual.
    expect(parseNote(NOTA_REAL).filter((t) => t.kind === "check")).toHaveLength(5);
    expect(parseNote(NOTA_REAL)[2].body).toBe(
      "08 sep (dosis 3 de anti pulgas mishibu)",
    );
  });

  it("el cuadrado sigue siendo cuadrado y de 16px", () => {
    // `visual.md`: nunca redondeado.
    expect(layers).toMatch(/\.caja \{[\s\S]*?width: 16px;[\s\S]*?border-radius: 0;/);
  });

  it("el área táctil sigue siendo 44x44", () => {
    expect(layers).toMatch(/\.hit \{[\s\S]*?width: 44px;[\s\S]*?height: 44px;/);
  });

  it("el texto de la línea completada baja a `--dim`, sin tachado", () => {
    expect(layers).toMatch(/\.texto\.hecho \{[\s\S]*?color: var\(--color-dim\);/);
    expect(layers).not.toMatch(/\.texto\.hecho \{[^}]*line-through/);
  });
});