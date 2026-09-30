"use client";

import { useCallback, useEffect, useRef } from "react";

import { ContadorDia } from "@/components/ContadorDia";
import { useNota } from "@/lib/hooks/useCache";
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
  // El estado y el autoguardado viven en useNota: cache primero, servidor si hay
  // red, cola si no. El editor solo manipula el string.
  const { body, setBody, estado } = useNota(date, initialBody || emptyNoteTemplate(date));

  const inputRef = useRef<HTMLTextAreaElement>(null);
  const capaRef = useRef<HTMLDivElement>(null);

  // Undo de las acciones programáticas (toggle de checkbox). La escritura va por
  // el undo nativo de la textarea, que es el 95% del uso.
  const pilaProgramatica = useRef<{ before: string; after: string }[]>([]);
  const escribiendoDesde = useRef(false);

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
    [body, setBody],
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
    [setBody],
  );

  useEffect(() => {
    // El ref se copia a una variable: en el cleanup, inputRef.current puede
    // apuntar a otro nodo (o a null) y se dejaría el listener huérfano.
    const input = inputRef.current;
    if (!input) return;
    input.addEventListener("keydown", alTeclado);
    return () => input.removeEventListener("keydown", alTeclado);
  }, [alTeclado]);

  // --- Enter al final de una línea de tarea crea la siguiente ------------
  // Ella escribe a mano y a una mano. Escribir "☐ " en cada renglón es lo
  // natural cuando la app puede ponerlo sola.
  //
  // Solo dispara al FINAL de una línea, y solo si la línea ya es una tarea
  // (checkbox o bullet). En medio de un texto no toca nada: escribir "hola" y
  // apretar Enter tiene que hacer un Enter.
  //
  // Muta el estado en vez de execCommand: el insertText deprecado depende de un
  // selection que React ya no controló, y con un rAF de diferencia el caret
  // queda en cualquier lado.
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

      // Solo sobre líneas que ya son una tarea: un encabezado o una línea de
      // texto no generan un checkbox nuevo.
      const t = parseNote(lineaActual)[0];
      if (!t || (t.kind !== "check" && t.kind !== "bullet")) return;

      e.preventDefault();

      // El prefijo nuevo es el de la línea actual: si escribe bullets, sigue
      // con bullets. Copiar el carácter, no hardcodear "☐ ".
      const prefijo = t.kind === "check" ? "☐ " : t.prefix || "• ";
      const insercion = `\n${prefijo}`;

      // Si el cursor estaba en medio de la línea, lo que queda después se va con
      // la línea nueva; si estaba al final, no hay nada que mover. Sin esto,
      // "abc)def" partido en medio queda "abc" y "☐ )def".
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

  // --- en iOS el teclado tapa el elemento enfocado -----------------------
  const alEnfocar = useCallback(() => {
    requestAnimationFrame(() => {
      inputRef.current?.scrollIntoView({ block: "center" });
    });
  }, []);

  // --- agregar al final sin escribir -------------------------------------
  // A veces se quiere sumar una tarea abajo de todo, no seguir la línea que se
  // está escribiendo. These dos botones son para eso.
  //
  // ponytail: mutan el string y mueven el caret al final. Sin historial
  // propio: el de la textarea no los cubre, pero con Ctrl+Z alcanza con
  // desahacer la línea siguiente.
  const agregarAlFinal = useCallback(
    (texto: string) => {
      const base = body.endsWith("\n") || body === "" ? body : body + "\n";
      const nuevo = base + texto;
      setBody(nuevo);
      escribiendoDesde.current = true;

      requestAnimationFrame(() => {
        const el = inputRef.current;
        if (!el) return;
        el.focus();
        const fin = nuevo.length;
        el.setSelectionRange(fin, fin);
        el.scrollIntoView({ block: "end" });
      });
    },
    [body, setBody],
  );

  const agregarTarea = useCallback(() => agregarAlFinal("☐ "), [agregarAlFinal]);
  const agregarLinea = useCallback(() => agregarAlFinal(""), [agregarAlFinal]);

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
            {estado === "sin-conexion" && "En el teléfono"}
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

      <div className="mt-4 flex gap-2">
        <button type="button" onClick={agregarTarea} className="btn-ghost text-sm">
          + Tarea
        </button>
        <button type="button" onClick={agregarLinea} className="btn-ghost text-sm">
          + Línea
        </button>
      </div>
    </div>
  );
}
