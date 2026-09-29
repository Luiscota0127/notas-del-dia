"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

import { addDays, todayISO } from "@/lib/format";

/**
 * Atajos de teclado. Activos solo cuando NO se está escribiendo: si no, `w`
 * escribiría una "w" en vez de cambiar de vista.
 *
 * ponytail: un listener de keydown en document. No un hook por tecla, ni una
 * librería de atajos.
 */
export function useAtajos(acciones: Atajos) {
  // El ref evita reabrir el listener en cada render, pero escribirlo durante
  // el render React lo marca como error. Se escribe en un efecto.
  const ref = useRef(acciones);
  useEffect(() => {
    ref.current = acciones;
  });

  useEffect(() => {
    const alTeclado = (e: KeyboardEvent) => {
      // Ctrl/Cmd+K: buscar, aunque estés escribiendo.
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        ref.current.buscar();
        return;
      }

      // El resto solo sin modificadores y sin foco en un campo.
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const el = e.target as HTMLElement | null;
      if (
        el &&
        (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable)
      ) {
        return;
      }

      const a = ref.current;
      switch (e.key) {
        case "h":
          a.hoy();
          break;
        case "ArrowLeft":
          e.preventDefault();
          a.anterior();
          break;
        case "ArrowRight":
          e.preventDefault();
          a.siguiente();
          break;
        case "1":
          a.ayer();
          break;
        case "2":
          a.hoy();
          break;
        case "3":
          a.manana();
          break;
        case "w":
          a.semana();
          break;
        default:
          return;
      }
    };

    document.addEventListener("keydown", alTeclado);
    return () => document.removeEventListener("keydown", alTeclado);
  }, []);
}

type Atajos = {
  hoy: () => void;
  anterior: () => void;
  siguiente: () => void;
  ayer: () => void;
  manana: () => void;
  semana: () => void;
  buscar: () => void;
};

/**
 * Navegación por fecha. Conserva `?demo=1` cuando está activo, para que el modo
 * de desarrollo sobreviva a los saltos de día.
 */
export function useNavegacionFecha(fecha: string) {
  const router = useRouter();
  const params = useSearchParams();
  const demo = params.get("demo") === "1" ? "?demo=1" : "";

  const ir = (nueva: string) => router.push(`/${nueva}${demo}`);

  return {
    /** El sufijo actual, para que quien navegue lo conserve. */
    demo,
    ir,
    hoy: () => ir(todayISO()),
    anterior: () => ir(addDays(fecha, -1)),
    siguiente: () => ir(addDays(fecha, 1)),
    ayer: () => ir(addDays(fecha, -1)),
    manana: () => ir(addDays(fecha, 1)),
    semana: () => router.push(`/semana${demo}`),
  };
}

/**
 * `true` si la fecha es hoy.
 *
 * ponytail: se calcula, no se guarda. "Hoy" cambia a medianoche, pero la página
 * se recarga o no se importa nada, y comparar dos strings es gratis.
 */
export function useEsHoy(fecha: string): boolean {
  return fecha === todayISO();
}
