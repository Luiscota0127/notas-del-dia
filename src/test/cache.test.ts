import { afterEach, beforeEach, describe, expect, it } from "vitest";

/**
 * El cache de IndexedDB necesita un DOM. En Node no existe, así que estos tests
 * corren contra un stub mínimo que implementa la parte de la API que usa
 * `src/lib/cache.ts`.
 *
 * No es un fake-indexeddb completo: es lo justo para que los tests sirvan de red
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

  // Dos agendas de muestra. La A es la de siempre.
  const A = "aaaaaaaa-1111-1111-1111-111111111111";
  const B = "bbbbbbbb-2222-2222-2222-222222222222";

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
    await cache.guardarNotaEnCache(A, "2026-09-01", "☐ pan");
    expect(await cache.leerNota(A, "2026-09-01")).toBe("☐ pan");
  });

  it("devuelve undefined para una fecha que nunca se vio", async () => {
    expect(await cache.leerNota(A, "2020-01-01")).toBeUndefined();
  });

  it("sobrescribe en vez de duplicar", async () => {
    await cache.guardarNotaEnCache(A, "2026-09-01", "uno");
    await cache.guardarNotaEnCache(A, "2026-09-01", "dos");
    expect(await cache.leerNota(A, "2026-09-01")).toBe("dos");
  });

  /**
   * El caso que motivó el prefijo de agenda en la clave. Dos agendas pueden
   * tener nota para la misma fecha, y sin el prefijo una pisaría a la otra en el
   * teléfono sin que se note hasta que se abre la agenda equivocada.
   */
  it("la misma fecha en dos agendas no se pisan", async () => {
    await cache.guardarNotaEnCache(A, "2026-09-01", "nota de A");
    await cache.guardarNotaEnCache(B, "2026-09-01", "nota de B");

    expect(await cache.leerNota(A, "2026-09-01")).toBe("nota de A");
    expect(await cache.leerNota(B, "2026-09-01")).toBe("nota de B");
  });

  it("leerTodasLasNotas devuelve solo las de esa agenda", async () => {
    await cache.guardarNotaEnCache(A, "2026-09-01", "a");
    await cache.guardarNotaEnCache(A, "2026-09-02", "b");
    await cache.guardarNotaEnCache(B, "2026-09-01", "de otra agenda");

    expect(await cache.leerTodasLasNotas(A)).toEqual({
      "2026-09-01": "a",
      "2026-09-02": "b",
    });
    expect(await cache.leerTodasLasNotas(B)).toEqual({ "2026-09-01": "de otra agenda" });
  });

  it("la lista es de la agenda, no un valor único", async () => {
    await cache.guardarListaEnCache(A, "☐ leche");
    expect(await cache.leerLista(A)).toBe("☐ leche");

    await cache.guardarListaEnCache(B, "☐ pan");
    expect(await cache.leerLista(A)).toBe("☐ leche");
    expect(await cache.leerLista(B)).toBe("☐ pan");

    await cache.guardarListaEnCache(A, "☐ leche\n☐ pan");
    expect(await cache.leerLista(A)).toBe("☐ leche\n☐ pan");
  });

  describe("la cola offline", () => {
    const nota = (agendaId: string, fecha: string, body: string) =>
      ({ tipo: "nota" as const, agendaId, fecha, body });

    it("encola y lee", async () => {
      await cache.encolar(nota(A, "2026-09-01", "x"));
      const cola = await cache.leerCola();
      expect(cola).toHaveLength(1);
      expect(cola[0].body).toBe("x");
      expect(cola[0].agendaId).toBe(A);
    });

    it("una nota encolada cinco veces queda una", async () => {
      // Last-write-wins: subir cinco veces la misma nota es trabajo de más.
      for (const body of ["a", "b", "c", "d", "e"]) {
        await cache.encolar(nota(A, "2026-09-01", body));
      }
      const cola = await cache.leerCola();
      expect(cola).toHaveLength(1);
      expect(cola[0].body).toBe("e");
    });

    it("notas distintas son entradas distintas", async () => {
      await cache.encolar(nota(A, "2026-09-01", "a"));
      await cache.encolar(nota(A, "2026-09-02", "b"));
      expect(await cache.leerCola()).toHaveLength(2);
    });

    /**
     * La misma fecha en dos agendas son dos notas distintas. Si la clave de la
     * cola no lleva la agenda, una se pisa con la otra y una de las dos se pierde
     * sin dejar rastro.
     */
    it("la misma fecha en dos agendas son dos entradas", async () => {
      await cache.encolar(nota(A, "2026-09-01", "de A"));
      await cache.encolar(nota(B, "2026-09-01", "de B"));
      const cola = await cache.leerCola();
      expect(cola).toHaveLength(2);
      expect(cola.map((e) => e.body).sort()).toEqual(["de A", "de B"]);
    });

    it("la lista tiene su propia clave, no pisa las notas", async () => {
      await cache.encolar(nota(A, "2026-09-01", "nota"));
      await cache.encolar({ tipo: "lista", agendaId: A, fecha: "", body: "lista" });
      const cola = await cache.leerCola();
      expect(cola).toHaveLength(2);
      expect(cola.map((e) => e.body).sort()).toEqual(["lista", "nota"]);
    });

    it("las listas de dos agendas no se pisan", async () => {
      await cache.encolar({ tipo: "lista", agendaId: A, fecha: "", body: "lista A" });
      await cache.encolar({ tipo: "lista", agendaId: B, fecha: "", body: "lista B" });
      const cola = await cache.leerCola();
      expect(cola).toHaveLength(2);
    });

    it("sacar una entrada la quita", async () => {
      await cache.encolar(nota(A, "2026-09-01", "x"));
      await cache.sacarDeLaCola(cache.claveEntrada("nota", A, "2026-09-01"));
      expect(await cache.leerCola()).toHaveLength(0);
    });

    it("sacar la de una agenda no saca la de la otra", async () => {
      await cache.encolar(nota(A, "2026-09-01", "de A"));
      await cache.encolar(nota(B, "2026-09-01", "de B"));
      await cache.sacarDeLaCola(cache.claveEntrada("nota", A, "2026-09-01"));

      const cola = await cache.leerCola();
      expect(cola).toHaveLength(1);
      expect(cola[0].agendaId).toBe(B);
    });

    it("orden por momento de encolado", async () => {
      await cache.encolar(nota(A, "2026-09-02", "segunda"));
      await cache.encolar(nota(A, "2026-09-01", "primera"));
      const cola = await cache.leerCola();
      // La clave es el orden de inserción en este stub, no el timestamp: lo que
      // importa es que sale en el orden en que se encoló.
      expect(cola[0].fecha).toBe("2026-09-02");
    });
  });

  it("borrarTodo limpia las tres cosas", async () => {
    await cache.guardarNotaEnCache(A, "2026-09-01", "a");
    await cache.guardarListaEnCache(A, "b");
    await cache.encolar({ tipo: "nota", agendaId: A, fecha: "2026-09-01", body: "c" });

    await cache.borrarTodo();

    expect(await cache.leerNota(A, "2026-09-01")).toBeUndefined();
    expect(await cache.leerLista(A)).toBeUndefined();
    expect(await cache.leerCola()).toHaveLength(0);
  });

  it("sin IndexedDB no tira: la app sigue con red", async () => {
    // Safari en modo privado puede no tenerlo. Un cache que tira es peor que
    // ningún cache.
    (globalThis as { indexedDB?: unknown }).indexedDB = undefined;

    expect(cache.hayCache()).toBe(false);
    await expect(cache.leerNota(A, "2026-09-01")).resolves.toBeUndefined();
    await expect(cache.guardarNotaEnCache(A, "2026-09-01", "x")).resolves.toBeUndefined();
    await expect(cache.leerCola()).resolves.toEqual([]);
  });
});
