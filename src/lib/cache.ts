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
 * es la forma más directa de mostrarle a alguien la nota de ayer cuando quería
 * la de hoy. Los datos van acá.
 *
 * Todas las claves llevan el id de agenda adelante. Dos agendas pueden tener
 * nota para la misma fecha, y sin el prefijo una pisaría a la otra en el
 * teléfono sin que se note hasta que se abre la agenda equivocada.
 */

const DB = "notas";
// 1, no 2: el schema de IndexedDB no cambió, solo el FORMATO de las claves. Subir
// la versión dispara un `onupgradeneeded` que no tiene nada que hacer, y una
// migración a medias es la forma más directa de romperle el cache a alguien.
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
      // Acá NO se borran las notas que quedaron con la `fecha` pelada de cuando
      // el cache era por persona. Se podrían, con un cursor, y la tentación es
      // grande: quedan ahí, con datos viejos que ya no apuntan a ninguna parte.
      //
      // No vale la pena. Esas claves no se leen nunca —todo acceso pasa por
      // `agenda/fecha`— y borrarlas exige iterar un cursor DENTRO de la
      // transacción de upgrade, donde un corte a medio camino deja el store
      // incompleto para todos los usuarios. El riesgo no compensa unos kilobytes
      // de un cache que se regenera solo con la próxima visita con red.
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

export function hayCache(): boolean {
  return typeof indexedDB !== "undefined";
}

/** `agenda/fecha`. La barra es lo que separa agenda de fecha; un uuid no la tiene. */
const claveNota = (agendaId: string, fecha: string) => `${agendaId}/${fecha}`;

// --- notas ---------------------------------------------------------------

/** La nota de un día, o undefined si nunca se vio. */
export async function leerNota(
  agendaId: string,
  fecha: string,
): Promise<string | undefined> {
  if (!hayCache()) return undefined;
  try {
    const db = await abrir();
    const valor = await tx<string | undefined>(db, STORE_NOTAS, "readonly", (s) =>
      s.get(claveNota(agendaId, fecha)),
    );
    db.close();
    return valor;
  } catch {
    // Un cache que falla es un cache que no existe. La app sigue con red.
    return undefined;
  }
}

export async function guardarNotaEnCache(
  agendaId: string,
  fecha: string,
  body: string,
): Promise<void> {
  if (!hayCache()) return;
  try {
    const db = await abrir();
    await tx(db, STORE_NOTAS, "readwrite", (s) => s.put(body, claveNota(agendaId, fecha)));
    db.close();
  } catch {
    // Silencio: si el cache falla, el autoguardado a Postgres sigue siendo la
    // fuente de verdad y el error se muestra en el indicador de guardado.
  }
}

/** Las notas de UNA agenda, como Record<fecha, body>. */
export async function leerTodasLasNotas(agendaId: string): Promise<Record<string, string>> {
  if (!hayCache()) return {};
  try {
    const db = await abrir();
    const claves = await tx<IDBValidKey[]>(db, STORE_NOTAS, "readonly", (s) => s.getAllKeys());
    const valores = await tx<string[]>(db, STORE_NOTAS, "readonly", (s) => s.getAll());
    db.close();

    const prefijo = `${agendaId}/`;
    const out: Record<string, string> = {};
    claves.forEach((k, i) => {
      const clave = String(k);
      if (!clave.startsWith(prefijo)) return;
      out[clave.slice(prefijo.length)] = valores[i] ?? "";
    });
    return out;
  } catch {
    return {};
  }
}

// --- lista de mandado -----------------------------------------------------

export async function leerLista(agendaId: string): Promise<string | undefined> {
  if (!hayCache()) return undefined;
  try {
    const db = await abrir();
    const valor = await tx<string | undefined>(db, STORE_LISTA, "readonly", (s) =>
      s.get(agendaId),
    );
    db.close();
    return valor;
  } catch {
    return undefined;
  }
}

export async function guardarListaEnCache(agendaId: string, body: string): Promise<void> {
  if (!hayCache()) return;
  try {
    const db = await abrir();
    await tx(db, STORE_LISTA, "readwrite", (s) => s.put(body, agendaId));
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
  /** La agenda a la que pertenece. Sin esto, al subir la cola se mezclarían. */
  agendaId: string;
  body: string;
  /** Para ordenar y descartar lo viejo. */
  cuando: number;
  /**
   * La clave del store.
   *
   * El store `cola` se crea con `keyPath: "clave"`, y con keyPath IndexedDB
   * IGNORA la clave que se le pasa como segundo argumento: la saca del objeto.
   * Sin esta propiedad, `put` tira DataError y la escritura se pierde. Pasaba
   * con un `catch {}` encima, así que la cola se llenaba a la nada: el usuario
   * veía "En el teléfono" y la nota no se subía nunca, sin error en ningún lado.
   */
  clave: string;
};

/**
 * Una sola entrada por nota y agenda.
 *
 * Con `agendaId` adelante porque "nota:2026-09-01" no dice en qué agenda: la
 * misma fecha en dos agendas son dos notas distintas y no se pisan entre sí.
 */
function claveDe(e: Pick<Entrada, "tipo" | "agendaId" | "fecha">): string {
  return e.tipo === "nota" ? `nota:${e.agendaId}:${e.fecha}` : `lista:${e.agendaId}`;
}

/** La clave de una entrada, para poder sacarla de la cola. */
export function claveEntrada(
  tipo: Entrada["tipo"],
  agendaId: string,
  fecha: string,
): string {
  return tipo === "nota" ? `nota:${agendaId}:${fecha}` : `lista:${agendaId}`;
}

/**
 * Encola una escritura para subir cuando vuelva la red.
 *
 * Una sola entrada por clave: si escribís cinco veces en la misma nota sin red,
 * se sube la última, no las cinco. Es last-write-wins y es lo correcto.
 */
export async function encolar(e: Omit<Entrada, "cuando" | "clave">): Promise<void> {
  if (!hayCache()) return;
  try {
    const db = await abrir();
    const entrada: Entrada = { ...e, cuando: Date.now(), clave: claveDe(e) };
    // Sin clave explícita: el store tiene keyPath y la saca del objeto.
    await tx(db, STORE_COLA, "readwrite", (s) => s.put(entrada));
    db.close();
  } catch (e) {
    // idem
    console.warn("cache: no se pudo encolar", e);
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
