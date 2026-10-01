"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";

import {
  claveEntrada,
  encolar,
  guardarListaEnCache,
  guardarNotaEnCache,
  hayCache,
  leerCola,
  leerLista,
  leerNota,
  leerTodasLasNotas,
  sacarDeLaCola,
} from "@/lib/cache";
import { guardarLista, guardarNota } from "@/app/acciones";
import { useCambiosEnVivo } from "./useRealtime";

/**
 * `navigator.onLine` no es un estado de React: es del sistema. useSyncExternalStore
 * es exactamente para eso, y evita el setState-en-un-efecto que dispara un
 * render de cascada.
 */
function suscribirConexion(cb: () => void): () => void {
  window.addEventListener("online", cb);
  window.addEventListener("offline", cb);
  return () => {
    window.removeEventListener("online", cb);
    window.removeEventListener("offline", cb);
  };
}

function leerConexion(): boolean {
  // El servidor no tiene navigator: se asume que hay red y no se monta banda.
  return typeof navigator === "undefined" ? true : navigator.onLine;
}

export function useOnline(): boolean {
  return useSyncExternalStore(suscribirConexion, leerConexion, () => true);
}

/** Sube lo que quedó en la cola. Llamar cuando vuelve la red. */
export function useVaciarCola(online: boolean) {
  const Corriendo = useRef(false);

  const vaciar = useCallback(async () => {
    if (Corriendo.current) return;
    Corriendo.current = true;
    try {
      const cola = await leerCola();
      for (const e of cola) {
        // Si algo falla, se deja la entrada en la cola y se corta el recorrido:
        // el orden importa y seguir subiría cosas viejo por encima de lo nuevo.
        let ok = false;
        try {
          const r =
            e.tipo === "nota"
              ? await guardarNota(e.agendaId, e.fecha, e.body)
              : await guardarLista(e.agendaId, e.body);
          // La server action NO lanza cuando falla: devuelve { guardado: false }.
          // Mirar solo el throw hacía que esto sacara de la cola una nota que
          // nunca se guardó — que es perderla sin dejar rastro. Con la sesión
          // vencida pasa siempre, y la nota desaparece sola.
          ok = r.guardado;
        } catch {
          ok = false;
        }

        if (!ok) return;
        await sacarDeLaCola(claveEntrada(e.tipo, e.agendaId, e.fecha));
      }
    } finally {
      Corriendo.current = false;
    }
  }, []);

  useEffect(() => {
    if (!online) return;

    vaciar();
    const id = setTimeout(vaciar, 5000);
    return () => clearTimeout(id);
  }, [online, vaciar]);

  // Desbloquear el teléfono es el caso más común de "volvió la red" con una PWA:
  // saliste del subte, la app estaba en background. Y el evento `online` a veces
  // no salta, porque para el navegador la red nunca llegó a caerse.
  useEffect(() => {
    if (!online) return;
    const alVolver = () => {
      if (document.visibilityState === "visible") vaciar();
    };
    document.addEventListener("visibilitychange", alVolver);
    return () => document.removeEventListener("visibilitychange", alVolver);
  }, [online, vaciar]);

  return vaciar;
}

export type Estado = "guardado" | "guardando" | "sin-conexion" | "error";

/**
 * La nota, leída del cache primero y revalidada con el servidor.
 *
 * El cache es la lectura: sin red muestra lo último que se vio, y con red
 * muestra lo mismo al instante y después se actualiza. Al revés, la app
 * arrancaría esperando el servidor en cada apertura.
 */
export function useNota(agendaId: string, fecha: string, inicialDelServidor: string) {
  const [body, setBody] = useState(inicialDelServidor);
  const [estado, setEstado] = useState<Estado>("guardado");
  const online = useOnline();
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const ultimoGuardado = useRef(inicialDelServidor);

  // El body en vivo, para que el callback de realtime sepa si hay algo sin
  // guardar sin tener que depender del closure del render.
  const bodyRef = useRef(body);
  useEffect(() => {
    bodyRef.current = body;
  }, [body]);

  /** Body remoto que llegó mientras esta persona tenía cambios sin guardar. */
  const [ajeno, setAjeno] = useState<string | null>(null);

  useCambiosEnVivo({
    tabla: "notes",
    agendaId,
    fecha,
    onCambio: (remoto) => {
      const actual = bodyRef.current;
      // Es nuestro: el eco de nuestro propio guardado volviendo por realtime.
      if (remoto === actual) return;

      // Hay algo sin guardar de este lado. NO se pisa lo que se está escribiendo:
      // se guarda y se avisa. Pisar acá perdería la línea del otro sin dejar
      // rastro, que es la peor de las cuatro opciones disponibles.
      if (actual !== ultimoGuardado.current) {
        setAjeno(remoto);
        return;
      }

      // Nada pendiente: se adopta lo suyo. Es el caso normal —uno escribe y el
      // otro mira— y no necesita ninguna acción de nadie.
      ultimoGuardado.current = remoto;
      bodyRef.current = remoto;
      setBody(remoto);
    },
  });

  /** Cargar la versión del otro, descartando lo que había sin guardar. */
  const tomarAjeno = useCallback(() => {
    if (ajeno === null) return;
    ultimoGuardado.current = ajeno;
    bodyRef.current = ajeno;
    setBody(ajeno);
    setAjeno(null);
  }, [ajeno]);

  /** Seguir con lo propio y descartar lo del otro. */
  const descartarAjeno = useCallback(() => setAjeno(null), []);

  // 1. Cache primero: sin red, esto es lo que se ve.
  //
  // Y guardar en el cache al LEER, no solo al escribir. Si el cache solo se
  // llena cuando alguien edita, una nota que se mira pero no se toca nunca llega
  // al cache, y sin red no está. El cache tiene que reflejar lo último que se
  // VIO, noto último que se escribió.
  useEffect(() => {
    if (!hayCache()) return;
    let vivo = true;

    leerNota(agendaId, fecha).then((guardado) => {
      if (!vivo) return;
      if (guardado === undefined) {
        // No está en el cache: guardar lo que trajo el servidor, para que la
        // próxima vez esté aunque no haya red.
        if (inicialDelServidor) void guardarNotaEnCache(agendaId, fecha, inicialDelServidor);
        return;
      }
      if (guardado !== body) {
        setBody(guardado);
        ultimoGuardado.current = guardado;
      }
    });

    return () => {
      vivo = false;
    };
    // Solo al cambiar de agenda o fecha: después manda el autoguardado.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agendaId, fecha, inicialDelServidor]);

  // 2. Autoguardado: cache siempre, servidor si hay red.
  useEffect(() => {
    if (body === ultimoGuardado.current) return;
    clearTimeout(timer.current);
    setEstado(online ? "guardando" : "sin-conexion");

    // El cache es inmediato y no puede fallar: el usuario ya lo tiene.
    void guardarNotaEnCache(agendaId, fecha, body);

    timer.current = setTimeout(async () => {
      try {
        const r = await guardarNota(agendaId, fecha, body);

        // El service worker puede devolver un 200 con el shell cacheado cuando
        // no hay red, y eso NO es un guardado. La server action devuelve un flag
        // explícito justamente para esto: sin él, la nota se pierde en silencio.
        if (r.guardado) {
          ultimoGuardado.current = body;
          setEstado("guardado");
        } else if (!navigator.onLine) {
          await encolar({ tipo: "nota", agendaId, fecha, body });
          setEstado("sin-conexion");
        } else {
          setEstado("error");
        }
      } catch (e) {
        // La llamada ni siquiera llegó al servidor: red caída de verdad.
        await encolar({ tipo: "nota", agendaId, fecha, body });
        setEstado("sin-conexion");
      }
    }, 800);

    return () => {
      clearTimeout(timer.current);
    };
  }, [body, agendaId, fecha, online]);

  return { body, setBody, estado, ajeno, tomarAjeno, descartarAjeno };
}

/** Igual que useNota, para la lista. */
export function useLista(agendaId: string, inicialDelServidor: string) {
  const [body, setBody] = useState(inicialDelServidor);
  const [estado, setEstado] = useState<Estado>("guardado");
  const online = useOnline();
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const ultimoGuardado = useRef(inicialDelServidor);

  const bodyRef = useRef(body);
  useEffect(() => {
    bodyRef.current = body;
  }, [body]);

  const [ajeno, setAjeno] = useState<string | null>(null);

  // La lista es el peor caso de colisión de la app: los dos agregan cosas al
  // mismo documento, seguido, todo el día. Sin realtime, el que agrega el
  // segundo pisa al primero sin enterarse.
  useCambiosEnVivo({
    tabla: "lista",
    agendaId,
    onCambio: (remoto) => {
      const actual = bodyRef.current;
      if (remoto === actual) return;

      if (actual !== ultimoGuardado.current) {
        setAjeno(remoto);
        return;
      }

      ultimoGuardado.current = remoto;
      bodyRef.current = remoto;
      setBody(remoto);
    },
  });

  const tomarAjeno = useCallback(() => {
    if (ajeno === null) return;
    ultimoGuardado.current = ajeno;
    bodyRef.current = ajeno;
    setBody(ajeno);
    setAjeno(null);
  }, [ajeno]);

  const descartarAjeno = useCallback(() => setAjeno(null), []);

  // Igual que useNota: el cache se llena al leer, no solo al escribir. Si la
  // lista se mira y no se toca, tiene que estar igual en el teléfono.
  useEffect(() => {
    if (!hayCache()) return;
    let vivo = true;

    leerLista(agendaId).then((guardado) => {
      if (!vivo) return;
      if (guardado === undefined) {
        if (inicialDelServidor) void guardarListaEnCache(agendaId, inicialDelServidor);
        return;
      }
      if (guardado !== body) {
        setBody(guardado);
        ultimoGuardado.current = guardado;
      }
    });

    return () => {
      vivo = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agendaId, inicialDelServidor]);

  useEffect(() => {
    if (body === ultimoGuardado.current) return;
    clearTimeout(timer.current);
    setEstado(online ? "guardando" : "sin-conexion");
    void guardarListaEnCache(agendaId, body);

    timer.current = setTimeout(async () => {
      try {
        const r = await guardarLista(agendaId, body);
        if (r.guardado) {
          ultimoGuardado.current = body;
          setEstado("guardado");
        } else if (!navigator.onLine) {
          await encolar({ tipo: "lista", agendaId, fecha: "", body });
          setEstado("sin-conexion");
        } else {
          setEstado("error");
        }
      } catch {
        await encolar({ tipo: "lista", agendaId, fecha: "", body });
        setEstado("sin-conexion");
      }
    }, 800);

    return () => clearTimeout(timer.current);
  }, [body, agendaId, online]);

  return { body, setBody, estado, ajeno, tomarAjeno, descartarAjeno };
}

/** Las notas cacheadas de una agenda, para el calendario y el buscador. */
export function useNotasCacheadas(agendaId: string, cuerposDelServidor: Record<string, string>) {
  const [cuerpos, setCuerpos] = useState(cuerposDelServidor);

  useEffect(() => {
    if (!hayCache()) return;
    let vivo = true;
    leerTodasLasNotas(agendaId).then((guardado) => {
      if (!vivo) return;
      setCuerpos((prev) => ({ ...guardado, ...prev }));
    });
    return () => {
      vivo = false;
    };
  }, [agendaId]);

  return cuerpos;
}
