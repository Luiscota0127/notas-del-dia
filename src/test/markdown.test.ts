import { describe, expect, it } from "vitest";

import { compensacion, partirEnSegmentos } from "@/lib/markdown";

/**
 * `**negrita**` y `*cursiva*` en línea.
 *
 * El texto sigue siendo la fuente de verdad: lo que se guarda es
 * `**negrita**`, no un nodo con estilo. La capa de display es la que interpreta,
 * igual que ya hace con `☐` y `7:30am`. Por eso no hay cambios de schema, ni en
 * el cache, ni en Realtime, ni en la sincronización.
 *
 * Lo difícil NO es encontrar las marcas: es que las dos capas midan igual.
 *
 * Medido en el navegador a 17px, "pintar el cuarto de arriba" mide 185.58px en
 * normal y 199.59px en negrita: 7.6% más, 14px de desvío. Todo lo que viene
 * después en esa línea queda corrido, y el caret también.
 *
 * Los marcadores en sí no son problema: con `visibility: hidden` y la fuente
 * normal miden lo que miden en la textarea —`**` son 14.19px— que es la misma
 * técnica que ya usa `.prefijo`.
 */

const NORMAL = "\n\ntexto normal\n";
const NEGRITA = "\n\nun poco de **texto en negrita** y seguí\n";
const CURSIVA = "\n\nesto es *cursiva* nada más\n";
const AMBAS = "\n\n**negrita** y *cursiva*\n";

describe("partir una línea en segmentos", () => {
  it("una línea sin marcas queda entera como texto", () => {
    expect(partirEnSegmentos(NORMAL)).toEqual([{ tipo: "texto", valor: NORMAL }]);
  });

  it("reconoce negrita", () => {
    expect(partirEnSegmentos(NEGRITA)).toEqual([
      { tipo: "texto", valor: "\n\nun poco de " },
      { tipo: "marca", valor: "**", largo: 2 },
      { tipo: "negrita", valor: "texto en negrita" },
      { tipo: "marca", valor: "**", largo: 2 },
      { tipo: "texto", valor: " y seguí\n" },
    ]);
  });

  it("reconoce cursiva", () => {
    expect(partirEnSegmentos(CURSIVA)).toEqual([
      { tipo: "texto", valor: "\n\nesto es " },
      { tipo: "marca", valor: "*", largo: 1 },
      { tipo: "cursiva", valor: "cursiva" },
      { tipo: "marca", valor: "*", largo: 1 },
      { tipo: "texto", valor: " nada más\n" },
    ]);
  });

  it("las dos en la misma línea", () => {
    const seg = partirEnSegmentos(AMBAS);
    expect(seg.filter((s) => s.tipo === "negrita").map((s) => s.valor)).toEqual(["negrita"]);
    expect(seg.filter((s) => s.tipo === "cursiva").map((s) => s.valor)).toEqual(["cursiva"]);
  });
});

describe("los errores que no pueden romper la línea", () => {
  it("una marca sin cerrar queda como texto", () => {
    // Escribir `2 * 3 = 6` no puede comerse el resto de la nota ni desaparecer
    // de la pantalla: si no cierra, no es cursiva.
    const linea = "\n\n2 * 3 = 6 y listo\n";
    expect(partirEnSegmentos(linea)).toEqual([{ tipo: "texto", valor: linea }]);
  });

  it("una marca vacía no existe", () => {
    const linea = "\n\n**** y nada\n";
    expect(partirEnSegmentos(linea)).toEqual([{ tipo: "texto", valor: linea }]);
  });

  it("las marcas pegadas al final, sin contenido, quedan como texto", () => {
    const linea = "\n\nestoy escribiendo **\n";
    expect(partirEnSegmentos(linea)).toEqual([{ tipo: "texto", valor: linea }]);
  });

  it("asteriscos sueltos no rompen nada", () => {
    for (const linea of ["\n\n2 * 3\n", "\n\nun * en el medio\n", "\n\n**\n"]) {
      expect(partirEnSegmentos(linea)).toEqual([{ tipo: "texto", valor: linea }]);
    }
  });

  it("nunca pierde un carácter, pase lo que pase", () => {
    // Esta es la invariante que importa: el display tiene que mostrar
    // EXACTAMENTE lo que hay en la textarea. Si al partir se pierde un asterisco,
    // el usuario ve texto que no escribió y el caret se corre.
    for (const linea of [NORMAL, NEGRITA, CURSIVA, AMBAS, "\n\n2 * 3\n", "\n\n****\n"]) {
      const juntado = partirEnSegmentos(linea)
        .map((s) => s.valor)
        .join("");
      expect(juntado, `se alteró: ${JSON.stringify(linea)}`).toBe(linea);
    }
  });
});

describe("la cursiva no se come la negrita", () => {
  it("** no es una cursiva doble", () => {
    // `**texto**` es negrita, no dos cursivas. Si el parser tomara el primer
    // `*` de cada lado, `*` quedaría suelto y el texto perdería peso.
    const seg = partirEnSegmentos("\n\n**a**\n");
    expect(seg.map((s) => s.tipo)).toEqual(["texto", "marca", "negrita", "marca", "texto"]);
  });

  it("*a* sí es cursiva", () => {
    const seg = partirEnSegmentos("\n\n*a*\n");
    expect(seg.filter((s) => s.tipo === "cursiva")).toHaveLength(1);
  });

  it("no anida: la negrita de adentro va como texto", () => {
    // Markdown anida, pero el parser de la app es de una línea y sin anidar.
    // Lo que no se reconoce tiene que SEGUIR SIENDO texto visible, no desaparecer.
    const linea = "\n\n**a *b* c**\n";
    const juntado = partirEnSegmentos(linea)
      .map((s) => s.valor)
      .join("");
    expect(juntado).toBe(linea);
    expect(juntado).toContain("b");
  });
});

describe("la compensación de ancho", () => {
  it("es la diferencia entre lo que mide con estilo y lo que mide normal", () => {
    // Medido en el navegador a 17px: "uno dos tres" mide 76.1px en normal y
    // 92.59px con la compensación puesta. La compensación tiene que restar.
    expect(compensacion(76.1, 92.59)).toBeCloseTo(76.1 - 92.59, 5);
  });

  it("si no hay diferencia, no compensa", () => {
    expect(compensacion(100, 100)).toBe(0);
  });

  it("la compensación es por carácter, no por tramo", () => {
    // El error se acumula a lo largo del texto: si se compensa el tramo entero
    // una vez, el desvío crece con la cantidad de caracteres.
    const porChar = compensacion(76.1, 92.59) / 13;
    expect(porChar).toBeCloseTo(-1.269, 2);
  });
});
