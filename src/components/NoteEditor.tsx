"use client";

import { useEffect, useRef, useState, useTransition } from "react";

import { guardarNota } from "@/app/acciones";
import { emptyNoteTemplate } from "@/lib/format";

/**
 * F1: un textarea y un botón. El editor de verdad es F2.
 *
 * Lo importante acá es que el round-trip de datos ya funciona contra Supabase con
 * las RLS reales, antes de meter el editor de dos capas encima.
 */
export function NoteEditor({
  date,
  initialBody,
  me,
  partner,
}: {
  date: string;
  initialBody: string;
  me: { id: string; name: string };
  partner: { id: string; name: string } | null;
}) {
  const [body, setBody] = useState(initialBody || emptyNoteTemplate(date));
  const [estado, setEstado] = useState<"guardado" | "guardando" | "error">("guardado");
  const [pendiente, startTransition] = useTransition();
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const ultimoGuardado = useRef(body);

  // Debounce de 800ms. ponytail: un timeout, no una librería de debounce.
  useEffect(() => {
    if (body === ultimoGuardado.current) return;
    clearTimeout(timer.current);
    setEstado("guardando");

    timer.current = setTimeout(() => {
      startTransition(async () => {
        try {
          await guardarNota(date, body);
          ultimoGuardado.current = body;
          setEstado("guardado");
        } catch {
          setEstado("error");
        }
      });
    }, 800);

    return () => clearTimeout(timer.current);
  }, [body, date]);

  return (
    <div className="p-4 md:p-8">
      <header className="flex items-center justify-between mb-4 gap-4">
        <div>
          <h1 className="text-xl">{date}</h1>
          <p className="text-dim text-sm">
            {me.name}
            {partner ? ` · viendo también a ${partner.name}` : ""}
          </p>
        </div>
        <p aria-live="polite" className="text-dim text-sm shrink-0">
          {estado === "guardando" && "Guardando…"}
          {estado === "guardado" && "Guardado ✓"}
          {estado === "error" && (
            <span className="text-accent">No se pudo guardar. Reintentá.</span>
          )}
          {pendiente && estado === "guardado" && ""}
        </p>
      </header>

      <label htmlFor="nota" className="sr-only">
        La nota de {date}
      </label>
      <textarea
        id="nota"
        value={body}
        onChange={(e) => setBody(e.target.value)}
        rows={20}
        enterKeyHint="enter"
        autoCapitalize="sentences"
        spellCheck
        className="input w-full font-mono text-[15px] leading-8 resize-y"
      />
    </div>
  );
}
