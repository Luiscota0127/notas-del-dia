"use client";

import { useCallback, useEffect, useRef } from "react";

import { useLista, useOnline, useVaciarCola } from "@/lib/hooks/useCache";
import { parseNote, toggleCheck } from "@/lib/parse";

import { DisplayLayer } from "@/components/editor/DisplayLayer";
import "@/components/editor/layers.css";

/**
 * El editor de la lista de mandado. Es el mismo de dos capas de la nota, sin
 * fecha: no hay encabezado de día, y el documento es compartido.
 *
 * El estado y el autoguardado vienen de useLista: cache primero, servidor si hay
 * red, cola si no.
 */
export function ListaEditor({
  initialBody,
  partner,
}: {
  initialBody: string;
  partner: { name: string } | null;
}) {
  const { body, setBody, estado } = useLista(initialBody);
  const online = useOnline();
  useVaciarCola(online);

  const inputRef = useRef<HTMLTextAreaElement>(null);
  const capaRef = useRef<HTMLDivElement>(null);
  const pilaProgramatica = useRef<{ before: string; after: string }[]>([]);
  const escribiendoDesde = useRef(false);

  // --- sincronización de scroll ------------------------------------------
  const sincScroll = useCallback(() => {
    const input = inputRef.current;
    const capa = capaRef.current;
    if (!input || !capa) return;
    capa.scrollTop = input.scrollTop;
  }, []);

  // --- teclado en iOS ----------------------------------------------------
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const alCambiar = () => {
      const inset = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
      document.documentElement.style.setProperty("--kb-inset", `${inset}px`);
    };
    alCambiar();
    vv.addEventListener("resize", alCambiar);
    vv.addEventListener("scroll", alCambiar);
    return () => {
      vv.removeEventListener("resize", alCambiar);
      vv.removeEventListener("scroll", alCambiar);
      document.documentElement.style.removeProperty("--kb-inset");
    };
  }, []);

  // --- toggle ------------------------------------------------------------
  const toggle = useCallback(
    (index: number) => {
      const lineas = body.split("\n");
      if (index < 0 || index >= lineas.length) return;

      const antes = lineas[index];
      const despues = toggleCheck(antes);
      if (antes === despues) return;

      lineas[index] = despues;
      const siguiente = lineas.join("\n");

      const input = inputRef.current;
      const sel = input?.selectionStart ?? 0;
      const selFin = input?.selectionEnd ?? 0;
      const delta = despues.length - antes.length;

      pilaProgramatica.current.push({ before: body, after: siguiente });
      escribiendoDesde.current = false;
      setBody(siguiente);

      requestAnimationFrame(() => {
        const el = inputRef.current;
        if (!el) return;
        el.setSelectionRange(Math.max(0, sel + delta), Math.max(0, selFin + delta));
      });
    },
    [body, setBody],
  );

  // --- Enter al final de una tarea crea la siguiente ---------------------
  const alEnter = useCallback(
    (e: KeyboardEvent) => {
      const input = inputRef.current;
      if (!input || e.key !== "Enter" || e.shiftKey || e.ctrlKey || e.metaKey) return;

      const pos = input.selectionStart;
      if (pos !== input.selectionEnd) return;

      const antes = input.value.slice(0, pos);
      if (antes === "" || antes.endsWith("\n")) return;

      const lineaActual = antes.slice(antes.lastIndexOf("\n") + 1);
      if (lineaActual.trim() === "") return;

      const t = parseNote(lineaActual)[0];
      if (!t || (t.kind !== "check" && t.kind !== "bullet")) return;

      e.preventDefault();

      const prefijo = t.kind === "check" ? "☐ " : t.prefix || "• ";
      const insercion = `\n${prefijo}`;

      const resto = body.slice(pos);
      const corte = resto.indexOf("\n");
      const cola = corte === -1 ? "" : resto.slice(0, corte);
      const siguiente = corte === -1 ? resto : resto.slice(corte);

      escribiendoDesde.current = true;
      setBody(body.slice(0, pos) + insercion + cola + siguiente);

      const caret = pos + insercion.length;
      requestAnimationFrame(() => {
        const el = inputRef.current;
        if (!el) return;
        el.setSelectionRange(caret, caret);
      });
    },
    [body, setBody],
  );

  useEffect(() => {
    const input = inputRef.current;
    if (!input) return;
    input.addEventListener("keydown", alEnter);
    return () => input.removeEventListener("keydown", alEnter);
  }, [alEnter]);

  // --- Ctrl+Z de los toggles --------------------------------------------
  useEffect(() => {
    const input = inputRef.current;
    if (!input) return;

    const alTeclado = (e: KeyboardEvent) => {
      if (e.target !== input) return;
      if (e.key !== "z" && e.key !== "Z") return;
      if (!e.ctrlKey && !e.metaKey) return;

      const pila = pilaProgramatica.current;
      if (pila.length === 0 || escribiendoDesde.current) return;

      e.preventDefault();
      const op = pila.pop()!;
      escribiendoDesde.current = false;
      setBody(op.before);
      requestAnimationFrame(() => inputRef.current?.focus());
    };

    input.addEventListener("keydown", alTeclado);
    return () => input.removeEventListener("keydown", alTeclado);
  }, [setBody]);

  // --- ancho del prefijo -------------------------------------------------
  useEffect(() => {
    const medir = () => {
      const prefijo = inputRef.current
        ?.parentElement?.querySelector<HTMLElement>(".linea-check .prefijo");
      if (!prefijo) return;
      const ancho = prefijo.getBoundingClientRect().width;
      if (ancho > 0) {
        document.documentElement.style.setProperty("--ancho-prefijo", `${ancho}px`);
      }
    };
    medir();
    const t = setTimeout(medir, 120);
    return () => clearTimeout(t);
  }, [body]);

  // --- agregar al final sin escribir -------------------------------------
  const agregarAlFinal = useCallback(() => {
    const base = body.endsWith("\n") || body === "" ? body : body + "\n";
    const nuevo = base + "☐ ";
    escribiendoDesde.current = true;
    setBody(nuevo);

    requestAnimationFrame(() => {
      const el = inputRef.current;
      if (!el) return;
      el.focus();
      el.setSelectionRange(nuevo.length, nuevo.length);
      el.scrollIntoView({ block: "end" });
    });
  }, [body, setBody]);

  const tasks = parseNote(body);
  const pendientes = tasks.filter((t) => t.kind === "check" && !t.done).length;

  return (
    <div className="p-4 md:p-8">
      <header className="flex flex-col gap-2 mb-4 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
        <div className="min-w-0">
          <h1 className="text-xl">Mandado</h1>
          <p className="text-dim text-sm truncate">
            {partner ? `Compartida con ${partner.name}` : "La lista de la casa"}
          </p>
        </div>
        <div className="flex items-center gap-4 shrink-0">
          {pendientes > 0 && (
            <p className="text-dim text-sm whitespace-nowrap">{pendientes} sin comprar</p>
          )}
          <p aria-live="polite" className="text-dim text-sm">
            {estado === "guardando" && "Guardando…"}
            {estado === "guardado" && "Guardado ✓"}
            {estado === "sin-conexion" && "En el teléfono"}
            {estado === "error" && (
              <span className="text-accent">No se pudo guardar. Reintentá.</span>
            )}
          </p>
        </div>
      </header>

      <div className="mb-3">
        <button type="button" onClick={agregarAlFinal} className="btn-ghost text-sm">
          + Agregar
        </button>
      </div>

      <div className="editor">
        <label htmlFor="lista" className="sr-only">
          La lista de mandado
        </label>
        <textarea
          id="lista"
          ref={inputRef}
          className="capa-input"
          value={body}
          onChange={(e) => {
            escribiendoDesde.current = true;
            setBody(e.target.value);
          }}
          onScroll={sincScroll}
          spellCheck
          autoCapitalize="sentences"
          autoCorrect="on"
          enterKeyHint="enter"
          inputMode="text"
          rows={16}
        />
        <div className="capa-scroll" ref={capaRef}>
          <DisplayLayer tasks={tasks} onToggle={toggle} />
        </div>
      </div>
    </div>
  );
}
