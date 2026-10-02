"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { todayISO } from "@/lib/format";

/**
 * Ctrl+K: busca en las notas ya cargadas.
 *
 * ponytail: busca en memoria lo que el calendario ya trajo. No hay índice de
 * búsqueda en la base —el texto libre es la fuente de verdad— así que un search
 * server-side sería un `ilike` sobre `notes.body` que después hay que parsear de
 * todos modos. Con los últimos 30 días en memoria, la respuesta es inmediata.
 *
 * Si algún día hay miles de notas, el índice va en Postgres con un `tsvector`
 * sobre body. No antes.
 */

export type Resultado = {
  date: string;
  /** Índice de la línea dentro del body. -1 si el match fue en un encabezado. */
  linea: number;
  /** La línea completa, tal cual. */
  texto: string;
  /** El pedazo que coincidió, para resaltar. */
  match: string;
};

export function buscarEnNotas(
  bodies: Record<string, string>,
  texto: string,
): Resultado[] {
  const q = texto.trim().toLowerCase();
  if (q.length < 2) return [];

  const out: Resultado[] = [];
  for (const [date, body] of Object.entries(bodies)) {
    if (!body) continue;
    body.split("\n").forEach((linea, i) => {
      const j = linea.toLowerCase().indexOf(q);
      if (j === -1) return;
      out.push({ date, linea: i, texto: linea, match: linea.slice(j, j + q.length) });
    });
  }

  // Las de hoy primero, luego por fecha descendente.
  const hoy = todayISO();
  return out.sort((a, b) => {
    if (a.date === hoy && b.date !== hoy) return -1;
    if (b.date === hoy && a.date !== hoy) return 1;
    return b.date.localeCompare(a.date);
  });
}

export function Buscador({
  agendaId,
  bodies,
  abierto,
  onCerrar,
  sufijo = "",
}: {
  agendaId: string;
  bodies: Record<string, string>;
  abierto: boolean;
  onCerrar: () => void;
  /** "?demo=1" cuando el modo demo está activo, "" normalmente. Sin esto, abrir
   *  un resultado desde el demo saca del modo y cae al login. */
  sufijo?: string;
}) {
  const router = useRouter();
  const [texto, setTexto] = useState("");
  const [sel, setSel] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const resultados = useMemo(() => buscarEnNotas(bodies, texto), [bodies, texto]);

  // El foco tiene que esperar al montage del input, si no se pierde. Sin tocar
  // el estado: el reset va en el onClick del botón que abre.
  useEffect(() => {
    if (!abierto) return;
    const id = requestAnimationFrame(() => inputRef.current?.focus());
    return () => cancelAnimationFrame(id);
  }, [abierto]);

  useEffect(() => {
    if (!abierto) return;
    const alTeclado = (e: KeyboardEvent) => {
      if (e.key === "Escape") return onCerrar();
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSel((s) => Math.min(s + 1, resultados.length - 1));
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setSel((s) => Math.max(s - 1, 0));
      }
      if (e.key === "Enter" && resultados[sel]) {
        e.preventDefault();
        const r = resultados[sel];
        onCerrar();
        router.push(`/${agendaId}/${r.date}${sufijo}`);
      }
    };
    document.addEventListener("keydown", alTeclado);
    return () => document.removeEventListener("keydown", alTeclado);
  }, [abierto, resultados, sel, onCerrar, router, sufijo, agendaId]);

  if (!abierto) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 flex items-start justify-center p-4 pt-[15vh]"
      onClick={onCerrar}
      role="dialog"
      aria-modal="true"
      aria-label="Buscar en las notas"
    >
      <div
        className="w-full max-w-lg bg-elevated border border-line rounded overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <input
          ref={inputRef}
          type="search"
          value={texto}
          onChange={(e) => {
            setTexto(e.target.value);
            setSel(0);
          }}
          placeholder="Buscar en las notas…"
          aria-label="Buscar en las notas"
          className="w-full bg-transparent border-0 border-b border-line px-4 py-3 text-fg outline-none"
        />

        {texto.trim().length >= 2 && (
          <ul className="max-h-80 overflow-y-auto" role="listbox">
            {resultados.length === 0 && (
              <li className="px-4 py-6 text-dim text-sm text-center">
                Nada con “{texto.trim()}”.
              </li>
            )}
            {resultados.slice(0, 40).map((r, i) => (
              <li key={`${r.date}-${r.linea}`}>
                <button
                  type="button"
                  role="option"
                  aria-selected={i === sel}
                  onClick={() => {
                    onCerrar();
                    router.push(`/${agendaId}/${r.date}${sufijo}`);
                  }}
                  onMouseEnter={() => setSel(i)}
                  className={`w-full text-left px-4 py-2 flex gap-3 items-baseline ${
                    i === sel ? "bg-line/40" : ""
                  }`}
                >
                  <span className="text-dim text-xs whitespace-nowrap shrink-0">
                    {r.date.slice(5)}
                  </span>
                  <span className="text-sm truncate">{resaltar(r.texto, r.match)}</span>
                </button>
              </li>
            ))}
            {resultados.length > 40 && (
              <li className="px-4 py-2 text-dim text-xs">
                y {resultados.length - 40} más
              </li>
            )}
          </ul>
        )}

        {texto.trim().length < 2 && (
          <p className="px-4 py-4 text-dim text-sm">
            Dos caracteres o más. Con las flechas eliges, con Enter abres el día.
          </p>
        )}
      </div>
    </div>
  );
}

/** Parte la línea en tres: antes, el match, después. */
function resaltar(texto: string, match: string) {
  const i = texto.indexOf(match);
  if (i === -1) return texto;
  return (
    <>
      {texto.slice(0, i)}
      <mark className="bg-transparent text-accent">{match}</mark>
      {texto.slice(i + match.length)}
    </>
  );
}
