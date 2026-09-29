"use client";

/**
 * Contador del día: "2/7 completadas" con una barra sutil.
 *
 * Sale del parse, no de un campo. No hay `done: number` en la base.
 */

import { useMemo } from "react";

import { countChecks, parseNote } from "@/lib/parse";

export function ContadorDia({ body }: { body: string }) {
  // El conteo sale del parse en cada render. useMemo para no reparsear el body
  // entero tres veces en el mismo render; no hay estado que sincronizar, y así
  // no puede quedar desfasado del texto.
  const cuenta = useMemo(() => countChecks(parseNote(body)), [body]);

  if (cuenta.total === 0) return null;

  const pct = Math.round((cuenta.hechos / cuenta.total) * 100);
  const limpio = cuenta.hechos === cuenta.total;

  return (
    <div className="flex items-center gap-3">
      {/* La barra se oculta en iPhone: con ella, la fecha del header parte
          "2026-09-01" en dos líneas y el nombre en cuatro. */}
      <div
        className="h-1 w-24 rounded-full overflow-hidden hidden md:block"
        style={{ background: "var(--color-line)" }}
        role="presentation"
      >
        <div
          className="h-full transition-[width] duration-200"
          style={{
            width: `${pct}%`,
            background: limpio ? "var(--color-accent)" : "var(--color-dim)",
          }}
        />
      </div>
      {/* aria-live: el cambio se anuncia, no es solo visual. */}
      <p aria-live="polite" className="text-dim text-sm whitespace-nowrap">
        {cuenta.hechos}/{cuenta.total} completadas
        {limpio && " 🌙"}
      </p>
    </div>
  );
}
