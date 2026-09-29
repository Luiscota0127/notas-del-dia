/**
 * El parser. string → Task[]. 
 *
 * Puro a propósito: sin React, sin fetch, sin Date, sin imports. Por eso se testea
 * en aislamiento y por eso la Edge Function de recordatorios lo importa tal cual
 * (ver supabase/functions/notify) en vez de duplicar las reglas.
 *
 * Contrato: .opencode/skills/notas-formato/references/parsing.md
 */

export type TaskKind = "check" | "bullet" | "text" | "heading" | "blank";

export type Task = {
  /** La línea tal cual se escribió. Siempre preservada: es la fuente de verdad. */
  raw: string;
  kind: TaskKind;
  /** Solo tiene sentido en kind === "check". */
  done: boolean;
  /** "7:30am", siempre minúscula. */
  time?: string;
  timeRange?: [string, string];
  /** Sin prefijo, sin hora, y sin los paréntesis que se consumieron como
   *  responsables. Los paréntesis de contenido siguen dentro. */
  title: string;
  assignees: string[];
  /**
   * El prefijo exacto que se usó: `☐ `, `☑ `, `[ ] `, `•  `… El editor lo
   * reemplaza por el checkbox, así que necesita saber cuántos píxeles ocupaba en
   * la textarea para poner el botón en el mismo lugar. Vacío si la línea no
   * tiene marcador.
   */
  prefix: string;
  /** El texto que se ve, después del prefijo y de la hora. Empieza y termina sin
   *  espacios. La capa de display renderiza esto, no `title`. */
  body: string;
  /** "mes" o "dia". Solo en kind === "heading". */
  heading?: "mes" | "dia";
  /** Índice de la línea en el body. Para el toggle programático del checkbox. */
  index: number;
};

const DIAS_RE =
  /^(LUNES|MARTES|MIÉRCOLES|JUEVES|VIERNES|SÁBADO|DOMINGO)\s+\d{1,2}\s+[A-Z]{3}$/;
const MES_RE = /^[A-ZÁÉÍÓÚÑ]{3,}$/;

/** `7:30am`, `6:00 PM`, `6:00p.m.` y el rango `7:00pm a 9:00pm`. */
const TIME_RE =
  /^(\d{1,2}:\d{2})\s*([ap])\.?\s*m?\.?(?:\s+a\s+(\d{1,2}:\d{2})\s*([ap])\.?\s*m?\.?)?/i;

const MARKER_RE = /^([☐☑☒]\s*|\[[ xX]\]\s*)/;
/** `•` puede ir seguido de dos espacios. */
const BULLET_RE = /^([-*•]\s+)/;

const PAREN_RE = /\(([^()]*)\)/g;
const SEP_RE = /\s*(?:\/|,|\sy\s)\s*/;

/**
 * Un responsable es un nombre propio. El filtro es estrecho a propósito: en la
 * nota real los paréntesis cumplen tres funciones y hay que distinguirlas.
 * Ver la tabla de parsing.md.
 *
 * La primera palabra va capitalizada; las siguientes pueden ser cualquier cosa
 * alfabética, porque en la referencia hay verbos pegados al nombre:
 * "Luis raspar", "Nahomi pintar". Exigir mayúscula en todas las palabras
 * rechazaría el caso real.
 */
const NOMBRE_RE = /^[A-ZÁÉÍÓÚÑ][a-záéíóúñ]*(?: [A-Za-zÁÉÍÓÚÑáéíóúñ]+){0,2}$/;

function esNombre(trozo: string): boolean {
  const t = trozo.trim();
  if (!t) return false;
  if (/\d/.test(t)) return false;
  if (!/[a-zA-ZÁÉÍÓÚÑáéíóúñ]/.test(t)) return false;
  return NOMBRE_RE.test(t);
}

/** Extrae la hora del inicio de la línea. `undefined` si no hay. */
function parseTime(line: string): { time?: string; range?: [string, string]; rest: string } {
  const m = TIME_RE.exec(line);
  if (!m) return { rest: line };

  const time = `${m[1]}${m[2].toLowerCase()}m`;
  const range: [string, string] | undefined =
    m[3] && m[4] ? [time, `${m[3]}${m[4].toLowerCase()}m`] : undefined;

  return { time, range, rest: line.slice(m[0].length).replace(/^\s+/, "") };
}

/**
 * Devuelve los responsables encontrados y el texto que queda.
 * Los paréntesis que no son responsables (frases, dígitos) siguen en el texto.
 */
function parseAssignees(text: string): { assignees: string[]; title: string } {
  const assignees: string[] = [];
  let title = text;

  title = title.replace(PAREN_RE, (match, inside: string) => {
    const found = inside
      .split(SEP_RE)
      .map((t) => t.trim())
      .filter(esNombre);

    if (found.length === 0) return match; // no era responsable: es contenido
    assignees.push(...found);
    return "";
  });

  // Solo se quita el whitespace de los bordes. Los espacios dobles del medio son
  // reales ("Pintar cuarto  nuestro") y la referencia los quiere tal cual.
  return { assignees, title: title.trim() };
}

function parseLine(raw: string, index: number): Task {
  const base: Task = {
    raw,
    kind: "text",
    done: false,
    title: "",
    assignees: [],
    prefix: "",
    body: "",
    index,
  };

  // 1. blank
  if (raw.trim() === "") return { ...base, kind: "blank" };

  // 2. heading. Con o sin `#` al inicio, por si escribe Markdown a mano.
  const sinHash = raw.replace(/^#+\s*/, "").trim();
  if (DIAS_RE.test(sinHash)) {
    return { ...base, kind: "heading", heading: "dia", title: sinHash, body: sinHash };
  }
  if (MES_RE.test(sinHash)) {
    return { ...base, kind: "heading", heading: "mes", title: sinHash, body: sinHash };
  }

  // 3. check
  const marker = MARKER_RE.exec(raw);
  if (marker) {
    const prefix = marker[0];
    const { time, range, rest } = parseTime(raw.slice(prefix.length));
    const { assignees, title } = parseAssignees(rest);
    return {
      ...base,
      kind: "check",
      done: /[☑☒]|\[[xX]\]/.test(prefix),
      prefix,
      time,
      timeRange: range,
      assignees,
      title,
      body: rest,
    };
  }

  // 4. bullet. done siempre false: un bullet no es una tarea completable.
  const bullet = BULLET_RE.exec(raw);
  if (bullet) {
    const prefix = bullet[0];
    const { time, range, rest } = parseTime(raw.slice(prefix.length));
    const { assignees, title } = parseAssignees(rest);
    return {
      ...base,
      kind: "bullet",
      prefix,
      time,
      timeRange: range,
      assignees,
      title,
      body: rest,
    };
  }

  // 5. text
  const { time, range, rest } = parseTime(raw);
  const { assignees, title } = parseAssignees(rest);
  return { ...base, time, timeRange: range, assignees, title, body: rest };
}

/** `""` → `[]`. Un body vacío no tiene una línea en blanco, tiene cero líneas. */
export function parseNote(body: string): Task[] {
  if (body === "") return [];
  return body
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line, index) => parseLine(line.replace(/\t/g, " "), index));
}

/** Cuántas checkboxes hay, cuántas hechas. Alimenta el contador del día. */
export function countChecks(tasks: Task[]): { done: number; total: number } {
  let done = 0;
  let total = 0;
  for (const t of tasks) {
    if (t.kind !== "check") continue;
    total++;
    if (t.done) done++;
  }
  return { done, total };
}

/**
 * Cambia el carácter del checkbox de una línea, preservando el que ella usó.
 * `☐`→`☑`, `☑`→`☐`, `☒`→`☐`, `[ ]`↔`[x]`.
 * Mutar una línea es mutar un string: no hay nada más que actualizar.
 */
export function toggleCheck(raw: string): string {
  const m = MARKER_RE.exec(raw);
  if (!m) return raw;
  const marker = m[0];
  const done = /[☑☒]|\[[xX]\]/.test(marker);

  let next: string;
  if (marker.startsWith("[")) next = done ? "[ ] " : "[x] ";
  else if (marker.startsWith("☑")) next = "☐ ";
  else if (marker.startsWith("☒")) next = "☐ ";
  else next = "☑ ";

  return next + raw.slice(marker.length);
}
