import { afterEach, beforeEach, describe, expect, it } from "vitest";

/**
 * El cache de IndexedDB necesita un DOM. En Node no existe, así que estos tests
 * corren contra un stub mínimo que implementa la parte de la API que usa
 * `src/lib/cache.ts`.
 *
 * No es un fake-indexeddb completo: es lo justo para que los testsSirvan de red
 * contra los errores de lógica. Un stub demasiado fiel termina siendo una
 * implementación de IndexedDB que hay que mantener.
 */

type Registro = { clave: string; valor: unknown };

/** Implementación en memoria de lo que el cache usa. */
function crearIndexedDB() {
  const datos = new Map<string, Map<string, unknown>>();

  const abrir = () => ({
    onsuccess: null as null | (() => void),
    onupgradeneeded: null as null | (() => void),
    onerror: null as null | (() => void),
    result: null as unknown,
    error: null,
  });

  const peticion = (resultado: unknown, falla = false) => {
    const req: Record<string, unknown> = {
      onsuccess: null,
      onerror: null,
      result: resultado,
      error: null,
    };
    // Los handlers se asignan después de crear el request, así que se dispara
    // en un microtask: el código del cache ya terminó de configurarlos.
    queueMicrotask(() => {
      if (falla) (req.onerror as (() => void) | null)?.();
      else (req.onsuccess as (() => void) | null)?.();
    });
    return req;
  };

  return {
    datos,
    open: () => {
      const req = abrir();
      const db = {
        objectStoreNames: { contains: () => true },
        createObjectStore: () => undefined,
        transaction: () => ({
          objectStore: (nombre: string) => {
            if (!datos.has(nombre)) datos.set(nombre, new Map());
            const m = datos.get(nombre)!;
            return {
              get: (k: string) => peticion(m.get(k)),
              put: (v: unknown, k?: string) => {
                m.set(k ?? (v as Registro).clave, v);
                return peticion(k ?? (v as Registro).clave);
              },
              delete: (k: string) => {
                m.delete(k);
                return peticion(undefined);
              },
              clear: () => {
                m.clear();
                return peticion(undefined);
              },
              getAll: () => peticion([...m.values()]),
              getAllKeys: () => peticion([...m.keys()]),
            };
          },
        }),
        close: () => undefined,
      };
      queueMicrotask(() => {
        req.result = db;
        req.onupgradeneeded?.();
        req.onsuccess?.();
      });
      return req;
    },
  };
}

describe("el cache local", () => {
  let cache: typeof import("@/lib/cache");
  let fake: ReturnType<typeof crearIndexedDB>;
  let original: unknown;

  beforeEach(async () => {
    original = (globalThis as { indexedDB?: unknown }).indexedDB;
    fake = crearIndexedDB();
    (globalThis as { indexedDB?: unknown }).indexedDB = fake;
    // Importar después de instalar el stub: el módulo lee indexedDB al usar, no
    // al importar, pero por si cambia.
    cache = await import("@/lib/cache");
  });

  afterEach(() => {
    (globalThis as { indexedDB?: unknown }).indexedDB = original;
  });

  it("guarda y lee una nota por fecha", async () => {
    await cache.guardarNotaEnCache("2026-09-01", "☐ pan");
    expect(await cache.leerNota("2026-09-01")).toBe("☐ pan");
  });

  it("devuelve undefined para una fecha que nunca se vio", async () => {
    expect(await cache.leerNota("2020-01-01")).toBeUndefined();
  });

  it("sobrescribe en vez de duplicar", async () => {
    await cache.guardarNotaEnCache("2026-09-01", "uno");
    await cache.guardarNotaEnCache("2026-09-01", "dos");
    expect(await cache.leerNota("2026-09-01")).toBe("dos");
  });

  it("lee todas las notas como Record", async () => {
    await cache.guardarNotaEnCache("2026-09-01", "a");
    await cache.guardarNotaEnCache("2026-09-02", "b");
    expect(await cache.leerTodasLasNotas()).toEqual({ "2026-09-01": "a", "2026-09-02": "b" });
  });

  it("la lista es un solo valor, no un mapa", async () => {
    await cache.guardarListaEnCache("☐ leche");
    expect(await cache.leerLista()).toBe("☐ leche");
    await cache.guardarListaEnCache("☐ leche\n☐ pan");
    expect(await cache.leerLista()).toBe("☐ leche\n☐ pan");
  });

  describe("la cola offline", () => {
    it("encola y lee", async () => {
      await cache.encolar({ tipo: "nota", fecha: "2026-09-01", body: "x" });
      const cola = await cache.leerCola();
      expect(cola).toHaveLength(1);
      expect(cola[0].body).toBe("x");
    });

    it("una nota encolada cinco veces queda una", async () => {
      // Last-write-wins: subir cinco veces la misma nota es trabajo de más.
      for (const body of ["a", "b", "c", "d", "e"]) {
        await cache.encolar({ tipo: "nota", fecha: "2026-09-01", body });
      }
      const cola = await cache.leerCola();
      expect(cola).toHaveLength(1);
      expect(cola[0].body).toBe("e");
    });

    it("notas distintas son entradas distintas", async () => {
      await cache.encolar({ tipo: "nota", fecha: "2026-09-01", body: "a" });
      await cache.encolar({ tipo: "nota", fecha: "2026-09-02", body: "b" });
      expect(await cache.leerCola()).toHaveLength(2);
    });

    it("la lista tiene su propia clave, no pisa las notas", async () => {
      await cache.encolar({ tipo: "nota", fecha: "2026-09-01", body: "nota" });
      await cache.encolar({ tipo: "lista", fecha: "", body: "lista" });
      const cola = await cache.leerCola();
      expect(cola).toHaveLength(2);
      expect(cola.map((e) => e.body).sort()).toEqual(["lista", "nota"]);
    });

    it("sacar una entrada la quita", async () => {
      await cache.encolar({ tipo: "nota", fecha: "2026-09-01", body: "x" });
      await cache.sacarDeLaCola("nota:2026-09-01");
      expect(await cache.leerCola()).toHaveLength(0);
    });

    it("orden por momento de encolado", async () => {
      await cache.encolar({ tipo: "nota", fecha: "2026-09-02", body: "segunda" });
      await cache.encolar({ tipo: "nota", fecha: "2026-09-01", body: "primera" });
      const cola = await cache.leerCola();
      // La clave es el orden de inserción en este stub, no el timestamp: lo que
      // importa es que sale en el orden en que se encoló.
      expect(cola[0].fecha).toBe("2026-09-02");
    });
  });

  it("borrarTodo limpia las tres cosas", async () => {
    await cache.guardarNotaEnCache("2026-09-01", "a");
    await cache.guardarListaEnCache("b");
    await cache.encolar({ tipo: "nota", fecha: "2026-09-01", body: "c" });

    await cache.borrarTodo();

    expect(await cache.leerNota("2026-09-01")).toBeUndefined();
    expect(await cache.leerLista()).toBeUndefined();
    expect(await cache.leerCola()).toHaveLength(0);
  });

  it("sin IndexedDB no tira: la app sigue con red", async () => {
    // Safari en modo privado puede no tenerlo. Un cache que tira es peor que
    // ningún cache.
    (globalThis as { indexedDB?: unknown }).indexedDB = undefined;

    expect(cache.hayCache()).toBe(false);
    await expect(cache.leerNota("2026-09-01")).resolves.toBeUndefined();
    await expect(cache.guardarNotaEnCache("2026-09-01", "x")).resolves.toBeUndefined();
    await expect(cache.leerCola()).resolves.toEqual([]);
  });
});
