import { readFileSync, existsSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { existeRutaEstatica } from "./rutas";

/**
 * El manifest declara íconos que tienen que existir de verdad. Si el manifest
 * apunta a un PNG que no está, iOS instala la app sin icono y no avisa: el
 * error no se ve en ningún lado.
 *
 * Estos tests son la única red contra eso. Un test que lee el manifest y
 * comprueba que cada archivo exista, y que sea un PNG válido.
 */

const raiz = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const publicDir = join(raiz, "public");

const manifest = JSON.parse(
  readFileSync(join(publicDir, "manifest.webmanifest"), "utf8"),
);

describe("el manifest", () => {
  it("es JSON válido", () => {
    expect(manifest.name).toBeTruthy();
    expect(manifest.display).toBe("standalone");
  });

  /**
   * El que faltaba.
   *
   * Antes el test comparaba `start_url` contra el literal "/hoy", así que
   * siguió en verde semanas después de que esa ruta se borrara: verificaba una
   * cadena, no que la ruta existiera. Agregar el ícono al inicio del iPhone
   * abría un 404 y nada lo agarró.
   *
   * `existeRutaEstatica` y no `existeRuta` a propósito. `/lo-que-sea` cae
   * dentro de `/[agenda]` y técnicamente "existe", pero devuelve 404 en runtime
   * porque no hay ninguna agenda con ese id. Un start_url tiene que funcionar
   * sin que nadie haya escrito nada antes, así que no puede depender de un
   * parámetro.
   */
  it("start_url apunta a una ruta que existe y no depende de un parámetro", () => {
    expect(existeRutaEstatica(manifest.start_url)).toBe(true);
  });

  it("scope cubre start_url", () => {
    // Si start_url quedara fuera del scope, al abrir la PWA el navegador
    // muestra una barra de URL y no se siente como app.
    expect(manifest.start_url.startsWith(manifest.scope)).toBe(true);
  });

  it("los colores coinciden con los tokens de globals.css", () => {
    const css = readFileSync(join(raiz, "src", "app", "globals.css"), "utf8");
    expect(css).toContain(manifest.background_color.toLowerCase());
    expect(css).toContain(manifest.theme_color.toLowerCase());
  });

  it("declara los tres tamaños que iOS necesita", () => {
    const sizes = manifest.icons.map((i: { sizes: string }) => i.sizes);
    expect(sizes).toContain("192x192");
    expect(sizes).toContain("512x512");
  });

  it("tiene un ícono maskable propio", () => {
    // Si apunta al mismo archivo que el "any", iOS lo recorta en círculo y el
    // cuadrado del checkbox queda con las esquinas cortadas.
    const maskable = manifest.icons.filter((i: { purpose: string }) => i.purpose === "maskable");
    const any = manifest.icons.filter((i: { purpose: string }) => i.purpose === "any");
    expect(maskable).toHaveLength(1);
    expect(maskable[0].src).not.toBe(any[0].src);
  });

  it("el manifest declara iconos con la forma que espera el parser", () => {
    // Sin esto, un typo en "purpose" o en "sizes" pasa el JSON.parse y falla
    // recién en el iPhone.
    for (const i of manifest.icons) {
      expect(i.src).toMatch(/^\/[\w-]+\.png$/);
      expect(i.sizes).toMatch(/^\d+x\d+$/);
      expect(["any", "maskable", "monochrome"]).toContain(i.purpose);
    }
  });
});

describe("los íconos que el manifest declara", () => {
  const iconos: Array<{ src: string; sizes: string; purpose: string }> = manifest.icons;

  it.each(iconos.map((i) => i.src))("%s existe", (src) => {
    const ruta = join(publicDir, src.replace(/^\//, ""));
    expect(existsSync(ruta)).toBe(true);
    expect(statSync(ruta).size).toBeGreaterThan(100);
  });

  it.each(iconos.map((i) => i.src))("%s es un PNG válido", (src) => {
    const buf = readFileSync(join(publicDir, src.replace(/^\//, "")));
    // Firma PNG: 89 50 4E 47 0D 0A 1A 0A
    expect([...buf.subarray(0, 8)]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    // IHDR es el primer chunk y dice el ancho.
    expect(buf.subarray(12, 16).toString("ascii")).toBe("IHDR");
    const ancho = buf.readUInt32BE(16);
    const alto = buf.readUInt32BE(20);
    const declarado = iconos.find((i) => i.src === src)!.sizes.split("x")[0];
    expect(ancho).toBe(Number(declarado));
    expect(alto).toBe(Number(declarado));
  });

  it("el maskable tiene fondo completo, para que el recorte no deje huecos", () => {
    // El ícono "any" tiene fondo transparente salvo el dibujo: por eso se
    // distingue del maskable. Comparo píxeles.
    const leer = (nombre: string) => {
      const buf = readFileSync(join(publicDir, nombre));
      return buf;
    };
    // Solo verifico que difieren: si fueran idénticos, el recorte rompería el
    // ícono en Android.
    expect(leer("icon-512.png").equals(leer("icon-maskable-512.png"))).toBe(false);
  });
});
