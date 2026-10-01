import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * La cola offline no puede perder escrituras.
 *
 * El bug: `guardarNota` no lanza cuando falla, devuelve `{ guardado: false }` —
 * así lo establecimos en F5.3 para distinguir "el service worker devolvió un 200
 * falso" de un error de verdad. Pero el flush de la cola miraba solo el `throw`.
 * Con la sesión vencida, que es el caso normal de alguien que volvió a tener
 * señal en el subte después de horas: la acción devolvía `false`, no había
 * excepción, y la cola sacaba la nota como si se hubiera guardado.
 *
 * Escribís sin señal, la cola se llena, volvés a tener señal pero sin sesión
 * válida, y la nota desaparece de la cola. Perdida, sin rastro y sin error.
 *
 * El test lee el código porque el flujo necesita IndexedDB, red y una sesión que
 * haya caducado: son tres cosas que no se pueden montar en un test de unidad.
 */

const raiz = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const hook = readFileSync(join(raiz, "src", "lib", "hooks", "useCache.ts"), "utf8");
const acciones = readFileSync(join(raiz, "src", "app", "acciones.ts"), "utf8");

// Solo la función de flush, no el archivo entero.
const inicio = hook.indexOf("export function useVaciarCola");
const fin = hook.indexOf("export type Estado");
const vaciar = hook.slice(inicio, fin);

describe("el flush respeta el flag de la server action", () => {
  it("las acciones devuelven un flag en vez de lanzar", () => {
    // Si volvieran a lanzar, el `catch` de abajo alcanzaría y el bug no
    // aparecería. El flag es lo que hace falta mirar.
    expect(acciones).toContain("guardado: false as const");
    expect(acciones).toContain("guardado: true as const");
  });

  it("el flush mira el flag, no solo que no haya lanzado", () => {
    expect(vaciar).toMatch(/ok = r\.guardado/);
  });

  it("no saca la entrada de la cola si no se guardó", () => {
    // El orden importa: la guarda `if (!ok) return` tiene que estar ANTES del
    // sacar de la cola.
    const corta = vaciar.indexOf("if (!ok) return");
    const saca = vaciar.indexOf("sacarDeLaCola");
    expect(corta).toBeGreaterThan(-1);
    expect(saca).toBeGreaterThan(-1);
    expect(corta).toBeLessThan(saca);
  });

  it("un fallo de red también deja la entrada", () => {
    // Y el throw sigue siendo un camino de fallo, no solo el flag.
    expect(vaciar).toMatch(/catch \{\s*ok = false;\s*\}/);
  });
});

describe("el flush se dispara por los tres motivos reales", () => {
  it("cuando vuelve la red", () => {
    expect(vaciar).toBeTruthy();
    expect(hook).toMatch(/if \(!online\) return;[\s\S]*vaciar\(\);[\s\S]*setTimeout\(vaciar, 5000\)/);
  });

  it("cuando desbloqueás el teléfono", () => {
    // El caso más común con PWA: la app estaba en background y `online` no
    // salta, porque para el navegador la red nunca se cayó.
    expect(hook).toContain("visibilitychange");
    expect(hook).toContain('document.visibilityState === "visible"');
  });

  it("solo una corrida a la vez", () => {
    // Sin el flag, dos disparos simultáneos suben la misma entrada dos veces y
    // la segunda saca una cola que ya está vacía.
    expect(vaciar).toContain("if (Corriendo.current) return");
  });
});

describe("quedarse sin la corrida no pierde la cola", () => {
  it("el flag se libera siempre", () => {
    // Si una excepción escapara sin pasar por el finally, la app quedaría con la
    // cola trabada para siempre: nunca más se intentaría subir nada.
    expect(vaciar).toMatch(/finally \{\s*Corriendo\.current = false;\s*\}/);
  });
});
