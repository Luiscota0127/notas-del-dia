// Un test que mida el alto real de la caja del titulo. Es el modo de falla que
// no se ve leyendo el parser: el parser dice "subtitulo", todo parece bien, y
// en pantalla el caret queda corrido a partir de esa linea.
//
// La regla del repo es que el alto de TODA linea de la capa de display sea
// exactamente --linea. Este test la verifica con los valores reales del CSS.
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const raiz = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const css = readFileSync(join(raiz, "src", "components", "editor", "layers.css"), "utf8");
const capa = readFileSync(
  join(raiz, "src", "components", "editor", "DisplayLayer.tsx"),
  "utf8",
);

/** El valor de `--linea`, para comparar contra los min-height declarados. */
const linea = Number(css.match(/--linea:\s*([\d.]+)px/)?.[1]);

/** Los font-size declarados para los subtitulos. */
const tamanos = [...css.matchAll(/\.nivel-\d[\s\S]*?font-size:\s*([\d.]+)px;/g)].map((m) =>
  Number(m[1]),
);

describe("los titulos no mueven el caret", () => {
  it("se conoce el alto de linea", () => {
    expect(linea).toBeGreaterThan(0);
  });

  it("la caja la fija .subtitulo, y los niveles solo cambian el tamaño", () => {
  // Los bloques .nivel-N heredan min-height de .subtitulo. Lo que importa es
  // que exista UNA regla base que fije la caja: si el min-height viviera solo en
  // los niveles, un nivel nuevo sin esa regla agrandaría la línea en silencio.
  const base = css.match(/\.subtitulo\s*\{[\s\S]*?\}/)?.[0] ?? "";
  expect(base).toMatch(/min-height:\s*var\(--linea\)/);

  // Y que los niveles no metan nada que también mueva la caja.
  const niveles = [...css.matchAll(/\.nivel-\d[\s\S]*?\}/g)].map((m) => m[0]);
  expect(niveles.length).toBeGreaterThanOrEqual(3);
  for (const b of niveles) {
    expect(b).not.toMatch(/min-height/);
    expect(b).not.toMatch(/line-height/);
    expect(b).not.toMatch(/padding[^:]*:\s*[^;]*\d/);
    expect(b).not.toMatch(/margin[^:]*:\s*[^;]*\d/);
  }
});

  it("ningun nivel de titulo se pasa del tamaño ya aprobado", () => {
  // 20px es lo que ya usa `.mes`, el título más grande que hay en el diseño, y
  // entra en la caja de 27.2px sin agrandarla. Un título de Notion no tiene
  // por qué ser más grande que eso: se distingue por el peso, no por la caja.
  //
  // OJO: este test mira el CSS declarado, no el alto renderizado. La regla de
  // verdad —que el div mida exactamente --linea— solo se puede comprobar midiendo
  // en el navegador. Ver `docs/verificar-en-navegador.md`.
  for (const t of tamanos) {
    expect(t).toBeLessThanOrEqual(20);
  }
});

  it("no hay padding ni margin vertical en los titulos", () => {
    // Ambos mueven la caja aunque el min-height este bien.
    const bloques = [...css.matchAll(/\.(?:nivel-\d|subtitulo)\s*\{[\s\S]*?\}/g)].map(
      (m) => m[0],
    );
    for (const b of bloques) {
      expect(b).not.toMatch(/padding[^:]*:\s*[^;]*\d/);
      expect(b).not.toMatch(/margin[^:]*:\s*[^;]*\d/);
      expect(b).not.toMatch(/line-height/);
    }
  });

  it("la capa de display tiene el caso subtitulo", () => {
    // Sin esto el titulo cae al final y se renderiza como texto pelado, con los
    // ## pegados: el parser estaria bien y la pantalla no.
    expect(capa).toContain('task.kind === "subtitulo"');
    expect(capa).toContain("linea subtitulo");
  });

  it("el subtitulo NO lleva el prefijo invisible de las casillas", () => {
    // Ese prefijo reserva el ancho del caracter del checkbox. En un titulo no
    // hay checkbox que alinear y el `##` no se ve, asi que dejaria un hueco al
    // principio de la linea.
    const i = capa.indexOf('task.kind === "subtitulo"');
    const bloque = capa.slice(i, capa.indexOf(");", i));
    expect(bloque).not.toContain("prefijo");
  });
});