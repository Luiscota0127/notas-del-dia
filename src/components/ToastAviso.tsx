"use client";

import Link from "next/link";

import type { Aviso } from "@/lib/hooks/useAvisos";

/**
 * El toast del recordatorio: el canal 1.
 *
 * Aparece abajo, no encima: arriba está la cabecera con la fecha y el contador, y
 * taparla cuando alguien está escribiendo es peor que un aviso que se lee un
 * segundo después.
 *
 * Es un aviso, no un modal: no bloquea la nota, que es lo que la persona estaba
 * haciendo. El cierre automático lo maneja `useAvisos`, que es el que sabe si
 * viene otro aviso detrás.
 *
 * `aria-live="assertive"` y no "polite": es un aviso puntual que quiere interrumpir
 * lo que el lector de pantalla está leyendo. Un "polite" lo encola detrás de todo
 * lo demás y el recordatorio se pierde.
 */

export function ToastAviso({ aviso, onCerrar }: { aviso: Aviso; onCerrar: () => void }) {
  return (
    <div
      role="alert"
      aria-live="assertive"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-bg"
      style={{
        // El notch de abajo y el gesto de home: sin esto queda debajo.
        paddingBottom: "calc(0.75rem + env(safe-area-inset-bottom))",
        paddingTop: "0.75rem",
        paddingLeft: "1rem",
        paddingRight: "1rem",
      }}
    >
      <div className="mx-auto flex max-w-lg items-center gap-2">
        {/* `leading-snug`: con el safe-area el bloque queda corto en iPhone y el
            texto a una línea se cortaba arriba y abajo. */}
        <p className="min-w-0 flex-1 text-sm leading-snug">
          <span className="text-dim">Ahora · </span>
          {aviso.texto}
        </p>
        {/* Link de verdad, no un div con onClick: se abre en pestaña nueva con
            Cmd/Ctrl y el botón del medio del mouse. */}
        <Link
          href={aviso.url}
          onClick={onCerrar}
          className="btn-ghost text-sm shrink-0"
        >
          Ver
        </Link>
        {/* 44x44, no w-9 (36px): es lo que un dedo necesita. El del buscador y
            el del menú usan w-9 porque están en una barra apretada con otros
            controles; acá hay espacio de sobra. */}
        <button
          type="button"
          onClick={onCerrar}
          aria-label="Cerrar el aviso"
          className="w-11 h-11 -mr-2 flex items-center justify-center text-dim hover:text-fg shrink-0"
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 16 16"
            fill="none"
            aria-hidden="true"
          >
            <path d="M3 3L13 13M13 3L3 13" stroke="currentColor" strokeWidth="1.5" />
          </svg>
        </button>
      </div>
    </div>
  );
}