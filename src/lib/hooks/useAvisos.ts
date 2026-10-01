"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import { esSafariIos } from "@/lib/instalar";
import {
  estadoDe,
  faltaPara,
  hayQuePedir,
  INTERVALO_REVISADA,
  yaAvisadoEnSesion,
  type EstadoPermiso,
} from "@/lib/permiso-notificaciones";
import {
  recordatoriosDe,
  textoDelAviso,
  type Nota,
} from "@/lib/recordatorio";

/**
 * El scheduler in-app: el canal 1 de los tres.
 *
 * Corre mientras la app está abierta, cada `INTERVALO_REVISADA`, y avisa por dos
 * vías: un toast en la pantalla y una notificación del sistema. Los tres canales
 * de F4 son deliberados y se complementan:
 *
 *   1. este, que solo existe con la app abierta pero es instantáneo;
 *   2. la notificación del sistema, que llega con la app en background;
 *   3. el email, que es el único que llega con la app cerrada.
 *
 * En iOS el 3 es el que importa: las notificaciones del sistema no llegan con la
 * app en background, así que sin email un recordatorio se pierde. Ese canal vive
 * en la Edge Function (`supabase/functions/notify`), no acá.
 *
 * ## Por qué no es un hook por recordatorio
 *
 * El bucle es uno solo y va con un `setInterval`. Un efecto por línea would
 * multiplicar los timers por cada tarea de la nota y cada uno con su cleanup, que
 * es la forma de tener un `setInterval` sin dueño cuando la nota cambia.
 */

export type Aviso = {
  clave: string;
  texto: string;
  /** Para el enlace del toast: abre la nota de ese día. */
  url: string;
};

/**
 * Corre el bucle de avisos mientras la app está abierta.
 *
 * `nota` es la nota abierta: el scheduler solo mira el día que se está viendo.
 * Es lo que el plan pide y lo que alcanza para el uso real —una persona tiene una
 * nota abierta, no el mes entero— con el agregado de que el aviso aparece justo
 * donde ella está escribiendo.
 */
export function useAvisos(nota: Nota | null, agendaId: string) {
  const [aviso, setAviso] = useState<Aviso | null>(null);

  const router = useRouter();

  // El permiso se lee UNA vez, en el inicializador del useState. No en un efecto:
  // `setState` síncrono dentro de un efecto provoca un segundo render en cascada
  // (regla de eslint react-hooks), y además el valor se puede leer antes del
  // primer paint, que es justo cuando el botón de "activar" decide si aparece.
  const [estado, setEstado] = useState<EstadoPermiso>(() => leerSoporte());

  // Las claves ya avisadas en esta sesión. Un `Set` en un ref y no en estado: no
  // provoca renders y no dispara el efecto que lo consulta.
  const vistos = useRef<Set<string>>(new Set());

  useEffect(() => {
    // El modo standalone cambia al instalar la app: sin esto, quien la instala
    // mientras la tiene abierta en Safari ve el botón de permisos en la
    // próxima carga.
    const mq = window.matchMedia("(display-mode: standalone)");
    const alCambiar = () => setEstado(leerSoporte());
    mq.addEventListener("change", alCambiar);
    return () => mq.removeEventListener("change", alCambiar);
  }, []);

  /** El permiso se pide desde acá: tiene que venir de un clic. */
  const pedirPermiso = useCallback(async () => {
    if (typeof Notification === "undefined") return "denied" as const;
    try {
      const r = await Notification.requestPermission();
      setEstado(leerSoporte());
      return r;
    } catch {
      return "denied" as const;
    }
  }, []);

  const cerrarAviso = useCallback(() => setAviso(null), []);

  // El toast se cierra solo. Un aviso que espera un toque y no lo recibe se
  // vuelve decoración permanente, que entrena a ignorar lo que hay en pantalla —
  // y el siguiente aviso ya no se lee. Mismo criterio que `AvisoInstalar`.
  useEffect(() => {
    if (!aviso) return;
    const t = setTimeout(cerrarAviso, SEGUNDOS_PARA_CERRAR * 1000);
    return () => clearTimeout(t);
  }, [aviso, cerrarAviso]);

  useEffect(() => {
    if (!nota) return;

    // En demo el toast SÍ corre. La nota de la referencia tiene horas, y sin esto
    // el canal 1 sería la única parte de F4 que no se puede ver sin levantar
    // Supabase y una sesión real.
    //
    // Lo que NO corre en demo es la notificación del sistema: es una señal del
    // teléfono, del sistema operativo, y por una nota de ejemplo sería ruido en
    // el dispositivo de quien está probando.
    const esDemo = new URLSearchParams(window.location.search).get("demo") === "1";

    const revisar = () => {
      const ahora = new Date();
      const minutosAhora = ahora.getHours() * 60 + ahora.getMinutes();

      const candidatos = recordatoriosDe(nota, minutosAhora, nota.fecha);

      for (const r of candidatos) {
        if (yaAvisadoEnSesion(vistos.current, r.clave)) continue;

        const texto = textoDelAviso(r);
        const url = `/${agendaId}/${nota.fecha}`;

        // Canal 2: notificación del sistema, si el permiso está dado.
        if (!esDemo && estado === "granted" && typeof Notification !== "undefined") {
          try {
            const n = new Notification(texto, {
              body: nota.userName,
              tag: r.clave,
              icon: "/icon-192.png",
              data: { url },
            });
            n.onclick = () => {
              window.focus();
              // `router.push` y no `window.location.href`: la segunda hace una
              // carga completa de la página y tira la cola offline y el estado en
              // memoria. Con la navegación del router, ir a la nota es instantáneo
              // y el service worker no participa.
              router.push(url);
              n.close();
            };
          } catch {
            // Sin notificación no hay fallo: el toast de acá está igual.
          }
        }

        // Canal 1: el toast. Siempre, porque es el que no depende de permisos.
        vistos.current.add(r.clave);
        setAviso({ clave: r.clave, texto, url });
        return;
      }
    };

    // La primera pasada es inmediata: si la app abre dentro de la ventana, el
    // aviso sale al toque y no 30 segundos después.
    revisar();
    const timer = setInterval(revisar, INTERVALO_REVISADA);

    // Volver de background suele coincidir con que ya es hora de un aviso: la
    // app dormida no corrió el intervalo.
    const alVolver = () => {
      if (document.visibilityState === "visible") revisar();
    };
    document.addEventListener("visibilitychange", alVolver);

    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", alVolver);
    };
  }, [nota, agendaId, estado, router]);

  return {
    aviso,
    estado,
    hayQuePedir: hayQuePedir(estado),
    pedirPermiso,
    cerrarAviso,
  };
}

type SoportePermiso = "granted" | "denied" | "default";

/**
 * Lee el soporte real del dispositivo.
 *
 * Fuera del hook a propósito: el inicializador del `useState` lo corre una vez, y
 * una función con dependencias sería recreada en cada render sin necesidad.
 */
function leerSoporte(): EstadoPermiso {
  if (typeof window === "undefined") return "nunca";

  const hayApi = typeof Notification !== "undefined";
  const safari = esSafariIos(navigator.userAgent, navigator.maxTouchPoints);
  const instalada =
    Boolean((navigator as { standalone?: boolean }).standalone) ||
    window.matchMedia("(display-mode: standalone)").matches;

  let permiso: SoportePermiso = "default";
  if (hayApi) permiso = Notification.permission as SoportePermiso;

  return estadoDe({ hayApi, esSafariIos: safari, instalada, permiso });
}

export { faltaPara };

/**
 * Cuánto dura el toast antes de cerrarse solo.
 *
 * Vive acá y no en el componente porque el componente solo lo pinta: quien decide
 * cuándo se va es el hook, que es el que sabe si hay más avisos en cola.
 */
const SEGUNDOS_PARA_CERRAR = 12;