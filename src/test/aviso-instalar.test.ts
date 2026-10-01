import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * El aviso de instalar va en el layout, que se monta en TODAS las páginas.
 *
 * El riesgo no es que falte en iOS: es que aparezca en desktop o en Android,
 * donde no se puede instalar desde la web. Ahí es un aviso que promete algo que
 * no pasa, y la persona lo descubre en el peor momento.
 *
 * Se lee el código porque no hay iPhone en la máquina. Lo que sí importa es que
 * la decisión de MOSTRAR esté en la función pura de `instalar.ts`, que tiene sus
 * propios tests con user agents reales.
 */

const raiz = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const leer = (...p: string[]) => readFileSync(join(raiz, ...p), "utf8");

const componente = leer("src", "components", "AvisoInstalar.tsx");
const layout = leer("src", "app", "layout.tsx");

describe("el aviso está montado en la app", () => {
  it("va en el layout, que es donde se monta en todas las páginas", () => {
    expect(layout).toContain("<AvisoInstalar />");
  });
});

describe("el aviso no aparece donde no sirve", () => {
  it("solo se muestra si la función pura lo autoriza", () => {
    // Nada de condiciones propias en el componente: si aparece la condición de
    // "es iOS" acá, se puede desincronizar de los tests.
    expect(componente).toContain("deberiaOfrecerInstalar({");
  });

  it("no aparece en el modo demo", () => {
    // En demo no es la app real: el aviso sería ruido en las capturas.
    expect(componente).toContain('.get("demo") === "1"');
    expect(componente).toMatch(/\.get\("demo"\) === "1"\)\s*return;/);
  });

  it("lee los dos indicadores de app instalada y los pasa", () => {
    // `navigator.standalone` es el modo propio de iOS y no está en los tipos de
    // TS, así que se lee con un cast. El nombre de la prop es lo que importa,
    // no el string literal — la primera versión de este test buscaba
    // "navigator.standalone" y fallaba contra el código correcto.
    expect(componente).toContain("standaloneIos:");
    expect(componente).toContain("displayModeStandalone:");
    expect(componente).toContain('(display-mode: standalone)');
  });
});

describe("el aviso se va solo", () => {
  it("desaparece después de un rato", () => {
    // Un aviso que espera un toque y no lo recibe se vuelve decoración
    // permanente, y entrena a la persona a ignorar lo que hay en pantalla.
    expect(componente).toContain("SEGUNDOS_PARA_CERRAR");
    expect(componente).toMatch(/setTimeout\(/);
  });

  it("guarda el descarte para no volver a preguntar", () => {
    expect(componente).toContain("descartarInstalacion");
  });

  it("no bloquea la nota: es un aviso, no un modal", () => {
    // Sin overlay ni `fixed inset-0`: el contenido de abajo tiene que seguir
    // siendo usable.
    expect(componente).not.toContain("inset-0");
    expect(componente).toContain("bottom-0");
  });

  it("respeta el notch de abajo", () => {
    // Sin esto el botón queda debajo del gesto de home del iPhone.
    expect(componente).toContain("env(safe-area-inset-bottom)");
  });
});

describe("la detección tiene cobertura propia", () => {
  it("instalar.ts tiene tests con user agents reales", () => {
    const tests = leer("src", "test", "instalar.test.ts");
    expect(tests).toContain("CriOS");
    expect(tests).toContain("Instagram");
    expect(tests).toContain("iPadOS");
  });
});
