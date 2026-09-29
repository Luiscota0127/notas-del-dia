"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";

import { guardarNota } from "@/app/acciones";
import { ContadorDia } from "@/components/ContadorDia";
import { emptyNoteTemplate } from "@/lib/format";
import { parseNote, toggleCheck } from "@/lib/parse";

import { DisplayLayer } from "./DisplayLayer";
import "./layers.css";

/**
 * El editor de dos capas.
 *
 *   ┌──────────────────────────────┐
 *   │  capa de display  (visual)   │  contentEditable=false, aria-hidden
 *   │  h1/h2, checkbox, texto      │  ← se re-renderiza en cada tecla
 *   ├──────────────────────────────┤    sin consecuencias: nunca tiene el foco
 *   │  textarea (invisible)        │  ← recibe TODA la escritura
 *   └──────────────────────────────┘
 *
 * Por qué dos capas y no un contenteditable: el caret de iOS Safari salta al
 * inicio cuando React reconcilia el subárbol de un contenteditable. Como la
 * textarea nunca es re-renderizada por el modelo y la capa de display nunca
 * tiene el foco, ese bug no puede ocurrir. A cambio: el autocorrector, el
 * diccionario, el undo nativo y el IME del sistema funcionan, porque lo que
 * recibe la escritura es una textarea de verdad.
 *
 * Trade-off asumido: no se puede seleccionar una línea arrastrando. Se hace clic
 * en el checkbox. Ver PLAN.md 1.1.
 */

type Estado = "guardado" | "guardando" | "error";

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
  const [estado, setEstado] = useState<Estado>("guardado");
  // ponytail: useTransition solo por el flag `pending`, que no se usa. El
  // indicador de "Guardando…" ya lo lleva `estado`.
  const [, startTransition] = useTransition();

  const inputRef = useRef<HTMLTextAreaElement>(null);
  const capaRef = useRef<HTMLDivElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const ultimoGuardado = useRef(body);

  // Undo de las acciones programáticas (toggle de checkbox). La escritura va por
  // el undo nativo de la textarea, que es el 95% del uso.
  const pilaProgramatica = useRef<{ before: string; after: string }[]>([]);
  const escribiendoDesde = useRef(false);

  // --- autoguardado ------------------------------------------------------
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

  // --- sincronización de scroll ------------------------------------------
  // La textarea scrollea; la capa de display la sigue. Sin esto el texto se ve
  // corrido al hacer scroll.
  useEffect(() => {
    const input = inputRef.current;
    const capa = capaRef.current;
    if (!input || !capa) return;

    let pendiente = false;
    const alScroll = () => {
      if (pendiente) return;
      pendiente = true;
      requestAnimationFrame(() => {
        capa.scrollTop = input.scrollTop;
        pendiente = false;
      });
    };

    input.addEventListener("scroll", alScroll, { passive: true });
    return () => input.removeEventListener("scroll", alScroll);
  }, []);

  // Al cambiar de día, la textarea arranca arriba: si no, se queda el
  // scrollTop de la nota anterior y el texto aparece cortado.
  useEffect(() => {
    if (inputRef.current) inputRef.current.scrollTop = 0;
    if (capaRef.current) capaRef.current.scrollTop = 0;
  }, [date]);

  // --- alto del editor ----------------------------------------------------
  // La textarea define la altura. Rows fijo cortaba las notas largas; esto la
  // ajusta al contenido con un piso de media pantalla.
  const ajustarAlto = useCallback(() => {
    const input = inputRef.current;
    if (!input) return;
    const piso = window.innerHeight * 0.5;
    input.style.height = "auto";
    input.style.height = `${Math.max(input.scrollHeight, piso)}px`;
  }, []);

  useEffect(() => {
    ajustarAlto();
    window.addEventListener("resize", ajustarAlto);
    return () => window.removeEventListener("resize", ajustarAlto);
  }, [ajustarAlto, body]);

  // --- ancho del prefijo --------------------------------------------------
  // El checkbox de la capa de display se alinea sobre el `☐` invisible. Se mide
  // el prefijo real una vez, porque el ancho del carácter depende de la fuente
  // del sistema y no se puede hardcodear.
  useEffect(() => {
    const medir = () => {
      const prefijo = inputRef.current?.parentElement?.querySelector<HTMLElement>(
        ".linea-check .prefijo",
      );
      if (!prefijo) return;
      const ancho = prefijo.getBoundingClientRect().width;
      if (ancho > 0) {
        document.documentElement.style.setProperty("--ancho-prefijo", `${ancho}px`);
      }
    };

    medir();
    // Las fuentes del sistema no disparan eventos, así que se re-mide al
    // cambiar de tamaño y un poco después del primer render.
    const t = setTimeout(medir, 120);
    window.addEventListener("resize", medir);
    return () => {
      clearTimeout(t);
      window.removeEventListener("resize", medir);
    };
  }, [body]);

  // --- teclado en iOS ----------------------------------------------------
  // Con el teclado abierto, 100vh es el alto del layout, no el visible. Sin
  // esto el área de escritura queda debajo del teclado.
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

      // Asignar value programáticamente manda el caret al final. Hay que
      // acordarlo antes de que React escriba.
      const input = inputRef.current;
      const sel = input?.selectionStart ?? 0;
      const selFin = input?.selectionEnd ?? 0;

      // El prefijo cambió de largo (`☐ ` → `☑ ` es igual, pero `[ ] ` → `[x] `
      // no), así que el caret se desplaza por el delta.
      const delta = despues.length - antes.length;

      pilaProgramatica.current.push({ before: body, after: siguiente });
      escribiendoDesde.current = false;
      setBody(siguiente);

      requestAnimationFrame(() => {
        const el = inputRef.current;
        if (!el) return;
        el.setSelectionRange(
          Math.max(0, sel + delta),
          Math.max(0, selFin + delta),
        );
      });
    },
    [body],
  );

  // --- Ctrl+Z / Ctrl+Shift+Z --------------------------------------------
  const alTeclado = useCallback(
    (e: KeyboardEvent) => {
      const input = inputRef.current;
      if (!input || e.target !== input) return;

      if (e.key !== "z" && e.key !== "Z") return;
      if (!e.ctrlKey && !e.metaKey) return;

      const pila = pilaProgramatica.current;
      // Si hubo escritura desde el último toggle, el undo nativo es el correcto
      // y este no aplica.
      if (pila.length === 0 || escribiendoDesde.current) return;

      e.preventDefault();
      const op = pila.pop()!;
      escribiendoDesde.current = false;
      setBody(op.before);

      // Sin tocar la selección: el toggle no la destruye, y saltarle al final de
      // la línea es lo que hace que Ctrl+Z "salte". Se deja donde estaba.
      requestAnimationFrame(() => inputRef.current?.focus());
    },
    [],
  );

  useEffect(() => {
    // El ref se copia a una variable: en el cleanup, inputRef.current puede
    // apuntar a otro nodo (o a null) y se dejaría el listener huérfano.
    const input = inputRef.current;
    if (!input) return;
    input.addEventListener("keydown", alTeclado);
    return () => input.removeEventListener("keydown", alTeclado);
  }, [alTeclado]);

  // --- en iOS el teclado tapa el elemento enfocado -----------------------
  const alEnfocar = useCallback(() => {
    requestAnimationFrame(() => {
      inputRef.current?.scrollIntoView({ block: "center" });
    });
  }, []);

  const tasks = parseNote(body);

  return (
    <div className="p-4 md:p-8">
      {/* En iPhone el header se apila: en una fila, la fecha y el nombre se
          parten en varias líneas y se lee mal. */}
      <header className="flex flex-col gap-2 mb-4 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
        <div className="min-w-0">
          <h1 className="text-xl">{date}</h1>
          <p className="text-dim text-sm truncate">
            {me.name}
            {partner ? ` · viendo también a ${partner.name}` : ""}
          </p>
        </div>
        <div className="flex items-center gap-4 shrink-0">
          <ContadorDia body={body} />
          <p aria-live="polite" className="text-dim text-sm">
            {estado === "guardando" && "Guardando…"}
            {estado === "guardado" && "Guardado ✓"}
            {estado === "error" && (
              <span className="text-accent">No se pudo guardar. Reintentá.</span>
            )}
          </p>
        </div>
      </header>

      <div className="editor">
        <label htmlFor="nota" className="sr-only">
          La nota de {date}
        </label>
        <textarea
          id="nota"
          ref={inputRef}
          className="capa-input"
          value={body}
          onChange={(e) => {
            escribiendoDesde.current = true;
            setBody(e.target.value);
          }}
          onFocus={alEnfocar}
          spellCheck
          autoCapitalize="sentences"
          autoCorrect="on"
          enterKeyHint="enter"
          inputMode="text"
          rows={20}
        />
        <div className="capa-scroll" ref={capaRef}>
          <DisplayLayer tasks={tasks} onToggle={toggle} />
        </div>
      </div>
    </div>
  );
}
