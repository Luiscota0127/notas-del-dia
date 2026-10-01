import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { contraste, hexToRgb, luminancia, UMBRAL } from "@/lib/contraste";

/**
 * Contraste AA medido sobre los tokens reales.
 *
 * El CSS se PARSEA en vez de tener los colores copiados acá. Copiados se
 * desincronizan en silencio: cambiás `--color-dim` en globals.css, el test sigue
 * midiendo el valor viejo y sigue dando verde, y el problema aparece en el
 * teléfono.
 */

const raiz = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const css = readFileSync(join(raiz, "src", "app", "globals.css"), "utf8");

function tokensDe(bloque: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of bloque.matchAll(/--color-([\w-]+):\s*(#[0-9a-fA-F]{3,6})\s*;/g)) {
    out[m[1]] = m[2];
  }
  return out;
}

const oscuro = tokensDe(css.slice(css.indexOf("@theme"), css.indexOf("};")));
const claro = tokensDe(
  css.slice(css.indexOf('[data-theme="light"]')),
);

describe("el CSS tiene los tokens que se miden", () => {
  it("los dos temas declaran los mismos nombres", () => {
    // Si el tema claro no define algo, ese token se queda con el valor oscuro:
    // el mismo nombre significa dos colores según el tema, y el test no lo
    // detectaría.
    expect(Object.keys(claro).sort()).toEqual(Object.keys(oscuro).sort());
  });

  it("están los que la app usa", () => {
    for (const t of ["bg", "elevated", "fg", "dim", "accent", "line"]) {
      expect(oscuro[t], `falta ${t} en oscuro`).toBeTruthy();
      expect(claro[t], `falta ${t} en claro`).toBeTruthy();
    }
  });
});

describe("la fórmula es la de la spec", () => {
  it("hexToRgb acepta 3 y 6 dígitos", () => {
    expect(hexToRgb("#fff")).toEqual([255, 255, 255]);
    expect(hexToRgb("#e4e4e7")).toEqual([228, 228, 231]);
    expect(hexToRgb("#FFFFFF")).toEqual([255, 255, 255]);
  });

  it("rechaza lo que no es un hex", () => {
    expect(hexToRgb("rojo")).toBeNull();
    expect(hexToRgb("#12345")).toBeNull();
  });

  it("blanco sobre negro da 21", () => {
    // El número ancla de la spec. Si esto no da 21, la fórmula está mal y todos
    // los otros números no sirven.
    expect(contraste("#ffffff", "#000000")).toBeCloseTo(21, 5);
  });

  it("un color contra sí mismo da 1", () => {
    expect(contraste("#111111", "#111111")).toBeCloseTo(1, 5);
  });

  it("el orden de los argumentos no cambia el resultado", () => {
    // El orden importa si el cálculo elige mal el "claro" y el "oscuro".
    expect(contraste("#ffffff", "#767676")!).toBeCloseTo(contraste("#767676", "#ffffff")!, 10);
  });

  it("el umbral del canal es 0.04045, no un promedio", () => {
    // Con un promedio lineal, el gris medio saldría demasiado claro. Este es el
    // valor de la spec para #767676.
    expect(contraste("#767676", "#ffffff")!).toBeCloseTo(4.54, 1);
  });

  it("la luminancia del blanco es 1 y la del negro 0", () => {
    expect(luminancia([255, 255, 255])).toBeCloseTo(1, 10);
    expect(luminancia([0, 0, 0])).toBeCloseTo(0, 10);
  });
});

/**
 * Las parejas que la app usa de verdad, no "todos los colores contra el fondo".
 * Una matriz completa daría falsos positivos: `--color-fg` contra `--color-accent`
 * nunca se escriben juntos.
 */
const PAREJAS_TEXTO: Array<[string, string, string, number]> = [
  // [descripción, foreground, background, umbral]
  ["cuerpo del texto", "fg", "bg", UMBRAL.texto],
  ["texto secundario", "dim", "bg", UMBRAL.texto],
  ["rótulos y links", "accent", "bg", UMBRAL.texto],
  ["texto dentro de un input", "fg", "elevated", UMBRAL.texto],
];

/**
 * Dos bordes distintos, con requisitos distintos.
 *
 * `--color-line` es decorativo: separa ítems de lista. No tiene requisito de
 * contraste —WCAG 1.4.11 no aplica a algo que no identifica un control— pero sí
 * tiene que verse, o no decora nada.
 *
 * `--color-border-control` dibuja el borde de los inputs y de los botones
 * fantasma. Ahí el borde ES lo que identifica el control, así que sí pide 3:1.
 *
 * Antes era un solo token haciendo las dos cosas, y el borde de control daba
 * 1.39:1 en oscuro y 1.48:1 en claro.
 */
describe.each([
  ["oscuro", oscuro],
  ["claro", claro],
])("bordes en %s", (_nombre, t) => {
  it("el decorativo se ve, aunque no llegue a 3:1", () => {
    const r = contraste(t.line, t.bg);
    expect(r).not.toBeNull();
    // 1.2:1 es el piso de "se distingue del fondo". Por debajo, un separador
    // no separa nada.
    expect(r, `el borde decorativo da ${r?.toFixed(2)}:1 y ni siquiera se ve`).toBeGreaterThanOrEqual(1.2);
  });

  it("el de los controles llega a 3:1", () => {
    const r = contraste(t["border-control"], t.bg);
    expect(r, `falta el token --color-border-control`).not.toBeNull();
    expect(
      r,
      `el borde de control (${t["border-control"]}) da ${r?.toFixed(2)}:1 sobre ${t.bg} y necesita 3:1`,
    ).toBeGreaterThanOrEqual(UMBRAL.noTexto);
  });
});

describe("el borde de control se usa donde corresponde", () => {
  const cssCompleto = css;

  it("los inputs y los botones fantasma lo usan", () => {
    // Si alguien vuelve a apuntarlos al token decorativo, el control queda
    // invisible otra vez y este test no lo va a notar.
    const input = cssCompleto.slice(cssCompleto.indexOf("@utility input"));
    const ghost = cssCompleto.slice(cssCompleto.indexOf("@utility btn-ghost"));
    expect(input).toContain("border: 1px solid var(--color-border-control)");
    expect(ghost).toContain("border: 1px solid var(--color-border-control)");
  });
});

describe.each([
  ["tema oscuro", oscuro],
  ["tema claro", claro],
])("contraste en %s", (_nombre, t) => {
  it.each(PAREJAS_TEXTO)(
    "%s llega a AA",
    (_desc, fg, bg, minimo) => {
      const r = contraste(t[fg], t[bg]);
      expect(r, `no pude calcular ${t[fg]} sobre ${t[bg]}`).not.toBeNull();
      expect(
        r,
        `${fg} (${t[fg]}) sobre ${bg} (${t[bg]}) da ${r?.toFixed(2)}:1 y necesita ${minimo}:1`,
      ).toBeGreaterThanOrEqual(minimo);
    },
  );
});

describe("el botón, que no usa tokens para el texto", () => {
  it("el texto del botón contrasta contra el acento, en los dos temas", () => {
    // El acento cambia con el tema y cada uno necesita un texto distinto: con
    // `#111111` fijo, el botón del tema claro daba 3.76:1 y quedaba por debajo
    // del 4.5:1 de AA. Ahora el texto es `--color-btn-fg`.
    for (const t of [oscuro, claro]) {
      const r = contraste(t["btn-fg"], t.accent);
      expect(
        r,
        `el texto del botón (${t["btn-fg"]}) da ${r?.toFixed(2)}:1 sobre el acento ${t.accent}`,
      ).toBeGreaterThanOrEqual(UMBRAL.texto);
    }
  });
});

/**
 * El hover y el pressed también son estados que el usuario ve, y también tienen
 * que cumplir AA. Un estado que se mira un segundo mientras el puntero está
 * encima no está exento.
 *
 * El hover NO aclara el acento. Con el texto del botón en blanco (tema claro),
 * aclarar el fondo BAJA el contraste: medido, un 12% de blanco daba 4.06:1 y
 * quedaba debajo del 4.5:1 de AA. Oscurecer mantiene los dos temas de lado.
 *
 * Estos valores se midieron en el navegador con `getComputedStyle`, y acá se
 * reproducen con la fórmula de la spec sobre los mismos colores.
 */
function mezclar(base: string, otra: string, peso: number): string {
  const a = hexToRgb(base)!;
  const b = hexToRgb(otra)!;
  return (
    "#" +
    a
      .map((v, i) =>
        Math.round(v * peso + b[i] * (1 - peso))
          .toString(16)
          .padStart(2, "0"),
      )
      .join("")
  );
}

describe.each([
  ["oscuro", oscuro],
  ["claro", claro],
])("estados del botón en %s", (_nombre, t) => {
  it.each([
    ["hover", 0.9],
    ["pressed", 0.78],
  ])("el %s sigue cumpliendo AA", (estado, peso) => {
    const fondo = mezclar(t.accent, "#000000", peso);
    const r = contraste(t["btn-fg"], fondo);
    expect(
      r,
      `en ${estado} el texto (${t["btn-fg"]}) da ${r?.toFixed(2)}:1 sobre ${fondo} y necesita ${UMBRAL.texto}:1`,
    ).toBeGreaterThanOrEqual(UMBRAL.texto);
  });
});
