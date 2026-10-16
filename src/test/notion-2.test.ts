import { describe, expect, it } from "vitest";

import { parseNote, toggleCheck } from "../lib/parse";

/**
 * Segunda tanda de Notion: títulos con `#` y casillas sin texto.
 *
 * Lo que NO funcionaba era solo el título: `## Nahomi` salía como texto normal
 * con los `##` pegados, que es exactamente lo que no quiere quien copia una
 * lista de Notion. Las otras cuatro líneas ya entraban bien.
 *
 * El resto de esta lista fija que no se rompió nada: la casilla vacía, la barra
 * que separa cosas, el espacio final.
 */
const DE_NOTION = `- [ ]  

## Nahomi

- [ ]  Planta eucalipto / jazmin
- [ ]  comprar crema manos  `;

describe("los títulos de Notion se ven como título, no con los ## pegados", () => {
  it("## Nahomi es un subtítulo y el texto sale limpio", () => {
    const t = parseNote("## Nahomi")[0];
    expect(t.kind).toBe("subtitulo");
    expect(t.title).toBe("Nahomi");
    expect(t.body).toBe("Nahomi");
    // Lo que más importa: el `##` no aparece en lo que se ve.
    expect(t.body).not.toContain("#");
  });

  it("el nivel del título viene del número de #", () => {
    expect(parseNote("# Nahomi")[0].nivel).toBe(1);
    expect(parseNote("## Nahomi")[0].nivel).toBe(2);
    expect(parseNote("### Nahomi")[0].nivel).toBe(3);
    expect(parseNote("###### Nahomi")[0].nivel).toBe(6);
  });

  it("acepta uno a seis #, como Markdown", () => {
    for (let n = 1; n <= 6; n++) {
      const t = parseNote("#".repeat(n) + " Nahomi")[0];
      expect(t.kind).toBe("subtitulo");
      expect(t.title).toBe("Nahomi");
    }
  });

  it("siete # ya no es un título", () => {
    // Más de seis niveles no existe en Markdown. Tratarlo como texto es lo
    // correcto antes que inventar un nivel siete.
    const t = parseNote("####### Nahomi")[0];
    expect(t.kind).toBe("text");
  });

  it("un # sin texto NO es un título", () => {
    // Es una línea que alguien empezó a escribir y no terminó. Convertirla en
    // título borra la intención de "todavía no escribí esto".
    expect(parseNote("#")[0].kind).toBe("text");
    expect(parseNote("#   ")[0].kind).toBe("text");
  });

  it("no se come los títulos que ya existían", () => {
    // "SEPTIEMBRE" y "MARTES 01 SEP" siguen siendo encabezado de mes y de día.
    expect(parseNote("SEPTIEMBRE")[0]).toMatchObject({ kind: "heading", heading: "mes" });
    expect(parseNote("## SEPTIEMBRE")[0]).toMatchObject({
      kind: "heading",
      heading: "mes",
    });
    expect(parseNote("MARTES 01 SEP")[0]).toMatchObject({ kind: "heading", heading: "dia" });
  });

  it("una línea normal que empieza con # pero no es título sigue siendo texto", () => {
    // El caso que importa para no comerse contenido real: texto que empieza
    // con almohadilla.
    expect(parseNote("#hashtag")[0].kind).toBe("text");
    expect(parseNote("#1error")[0].kind).toBe("text");
  });
});

describe("el resto de la lista de Notion ya entraba bien", () => {
  it("una casilla sin texto es una tarea vacía y su toggle funciona", () => {
    const vacia = parseNote("- [ ]  ")[0];
    expect(vacia.kind).toBe("check");
    expect(vacia.done).toBe(false);
    expect(vacia.title).toBe("");

    expect(toggleCheck("- [ ]  ")).toBe("- [x] ");
    expect(parseNote(toggleCheck("- [ ]  "))[0].done).toBe(true);
  });

  it("la barra NO parte en responsables si los trozos no son nombres", () => {
    // "Planta eucalipto / jazmin": la barra separa, pero no son nombres propios,
    // así que el texto queda entero.
    const t = parseNote("- [ ]  Planta eucalipto / jazmin")[0];
    expect(t.assignees).toEqual([]);
    expect(t.title).toBe("Planta eucalipto / jazmin");
  });

  it("el espacio final de Notion no ensucia el texto", () => {
    const t = parseNote("- [ ]  comprar crema manos  ")[0];
    expect(t.title).toBe("comprar crema manos");
  });

  it("la lista completa queda como se espera", () => {
    const tasks = parseNote(DE_NOTION).filter((t) => t.kind !== "blank");
    expect(
      tasks.map((t) => ({ kind: t.kind, title: t.title })),
    ).toEqual([
      { kind: "check", title: "" },
      { kind: "subtitulo", title: "Nahomi" },
      { kind: "check", title: "Planta eucalipto / jazmin" },
      { kind: "check", title: "comprar crema manos" },
    ]);
  });
});