/**
 * Cache local en IndexedDB.
 *
 * Por qué IndexedDB y no localStorage: localStorage son 5 MB, es síncrono (bloquea
 * el hilo en cada lectura) y no tiene transacciones. Para un dispositivo con
 * años de notas, 5 MB no alcanzan y cada lectura congela la app.
 *
 * Por qué sin `idb-keyval`: son 40 líneas de IDBObjectStore y una dependencia
 * menos que mantener. Todo el acceso pasa por acá, así que si algún día duele,
 * se cambia en este archivo y en ningún otro.
 *
 * El service worker NO cachea respuestas de Supabase. Cachear SQL sobre la red
 * es la forma más directa de mostrarle a alguien la nota de ayer cuando quería la
 * de hoy. Los datos van acá.
 */

const DB = "notas";
const VERSION = 1;
const STORE_NOTAS = "notas";
const STORE_LISTA = "lista";
const STORE_COLA = "cola";

function abrir(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, VERSION);

    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NOTAS)) {
        db.createObjectStore(STORE_NOTAS);
      }
      if (!db.objectStoreNames.contains(STORE_LISTA)) {
        db.createObjectStore(STORE_LISTA);
      }
      if (!db.objectStoreNames.contains(STORE_COLA)) {
        db.createObjectStore(STORE_COLA, { keyPath: "clave" });
      }
    };

    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function tx<T>(
  db: IDBDatabase,
  store: string,
  modo: IDBTransactionMode,
  fn: (s: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = db.transaction(store, modo);
    const req = fn(t.objectStore(store));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/** ¿Hay IndexedDB? Safari en modo privado puede no tenerlo. */
export function hayCache(): boolean {
  return typeof indexedDB !== "undefined";
}

// --- notas ---------------------------------------------------------------

/** La nota de un día, o undefined si nunca se vio. */
export async function leerNota(fecha: string): Promise<string | undefined> {
  if (!hayCache()) return undefined;
  try {
    const db = await abrir();
    const valor = await tx<string | undefined>(db, STORE_NOTAS, "readonly", (s) =>
      s.get(fecha),
    );
    db.close();
    return valor;
  } catch {
    // Un cache que falla es un cache que no existe. La app sigue con red.
    return undefined;
  }
}

export async function guardarNotaEnCache(fecha: string, body: string): Promise<void> {
  if (!hayCache()) return;
  try {
    const db = await abrir();
    await tx(db, STORE_NOTAS, "readwrite", (s) => s.put(body, fecha));
    db.close();
  } catch {
    // Silencio: si el cache falla, el autoguardado a Postgres sigue siendo la
    // fuente de verdad y el error se muestra en el indicador de guardado.
  }
}

/** Todas las notas cacheadas, como Record<fecha, body>. */
export async function leerTodasLasNotas(): Promise<Record<string, string>> {
  if (!hayCache()) return {};
  try {
    const db = await abrir();
    const claves = await tx<IDBValidKey[]>(db, STORE_NOTAS, "readonly", (s) => s.getAllKeys());
    const valores = await tx<string[]>(db, STORE_NOTAS, "readonly", (s) => s.getAll());
    db.close();

    const out: Record<string, string> = {};
    claves.forEach((k, i) => {
      out[String(k)] = valores[i] ?? "";
    });
    return out;
  } catch {
    return {};
  }
}

// --- lista de mandado -----------------------------------------------------

export async function leerLista(): Promise<string | undefined> {
  if (!hayCache()) return undefined;
  try {
    const db = await abrir();
    const valor = await tx<string | undefined>(db, STORE_LISTA, "readonly", (s) =>
      s.get("body"),
    );
    db.close();
    return valor;
  } catch {
    return undefined;
  }
}

export async function guardarListaEnCache(body: string): Promise<void> {
  if (!hayCache()) return;
  try {
    const db = await abrir();
    await tx(db, STORE_LISTA, "readwrite", (s) => s.put(body, "body"));
    db.close();
  } catch {
    // idem
  }
}

// --- cola offline --------------------------------------------------------

export type Entrada = {
  /** "nota" o "lista". */
  tipo: "nota" | "lista";
  /** La fecha, para las notas. Vacío para la lista. */
  fecha: string;
  body: string;
  /** Para ordenar y descartar lo viejo. */
  cuando: number;
};

function claveDe(e: Entrada): string {
  return e.tipo === "nota" ? `nota:${e.fecha}` : "lista";
}

/**
 * Encola una escritura para subir cuando vuelva la red.
 *
 * Una sola entrada por clave: si escribís cinco veces en la misma nota sin red,
 * se sube la última, no las cinco. Es last-write-wins y es lo correcto.
 */
export async function encolar(e: Omit<Entrada, "cuando">): Promise<void> {
  if (!hayCache()) return;
  try {
    const db = await abrir();
    const entrada: Entrada = { ...e, cuando: Date.now() };
    await tx(db, STORE_COLA, "readwrite", (s) => s.put(entrada, claveDe(entrada)));
    db.close();
  } catch {
    // idem
  }
}

export async function leerCola(): Promise<Entrada[]> {
  if (!hayCache()) return [];
  try {
    const db = await abrir();
    const items = await tx<Entrada[]>(db, STORE_COLA, "readonly", (s) => s.getAll());
    db.close();
    return items.sort((a, b) => a.cuando - b.cuando);
  } catch {
    return [];
  }
}

export async function sacarDeLaCola(clave: string): Promise<void> {
  if (!hayCache()) return;
  try {
    const db = await abrir();
    await tx(db, STORE_COLA, "readwrite", (s) => s.delete(clave));
    db.close();
  } catch {
    // idem
  }
}

export async function vaciarCola(): Promise<void> {
  if (!hayCache()) return;
  try {
    const db = await abrir();
    await tx(db, STORE_COLA, "readwrite", (s) => s.clear());
    db.close();
  } catch {
    // idem
  }
}

/** Borra todo. Solo para el botón de "borrar datos locales" de Ajustes. */
export async function borrarTodo(): Promise<void> {
  if (!hayCache()) return;
  try {
    const db = await abrir();
    await Promise.all([
      tx(db, STORE_NOTAS, "readwrite", (s) => s.clear()),
      tx(db, STORE_LISTA, "readwrite", (s) => s.clear()),
      tx(db, STORE_COLA, "readwrite", (s) => s.clear()),
    ]);
    db.close();
  } catch {
    // idem
  }
}
