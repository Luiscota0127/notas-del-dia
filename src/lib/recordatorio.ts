/**
 * Los recordatorios: qué hay que avisar, a quién y si ya se avisó.
 *
 * ## Por qué este archivo es puro y no tiene imports
 *
 * Lo usan DOS ejecutores con restricciones opuestas:
 *
 *   - la Edge Function de Supabase (Deno), que corre sin red cada 5 minutos y es
 *     el único canal que llega con la app cerrada;
 *   - el navegador, que revisa las horas próximas mientras la app está abierta.
 *
 * Por eso no importa nada: ni `Date` de verdad, ni Supabase, ni React. Recibe la
 * hora y el día ya resueltos y devuelve qué mandar. Así se testea entero sin
 * mockear nada, que es la única forma de que una regla de deduplicación se pueda
 * probar de verdad.
 *
 * ## El texto libre sigue siendo la fuente de verdad
 *
 * No hay tabla de tareas ni columna `time`. Un recordatorio sale de parsear
 * `notes.body` con el mismo `parseNote` que usa la pantalla. Si mañana cambia el
 * formato de una línea, los dos caminos cambian juntos: no puede pasar que la
 * app muestre una cosa y el email otra.
 *
 * ## Deduplicación
 *
 * La clave es `"<fecha>|<hora>|<línea>"` en `profiles.notified`. Vive en el
 * profile y no en una tabla aparte, a propósito: son un par de claves por día y
 * una tabla para eso es schema de más.
 *
 * La deduplicación es lo que hace que la Function pueda correr cada 5 minutos
 * sin espiar: correrla de más no manda emails de más.
 */

import { parseNote, type Task } from "./parse";

/** `profiles.notify`: a quién le avisa cada persona. */
export type PreferenciaAviso = "all" | "mine" | "none";

/** Una línea con hora que hay que recordar. */
export type Recordatorio = {
  /** La fecha de la nota, "YYYY-MM-DD". */
  fecha: string;
  /**
   * La agenda a la que pertenece, si se pasó. Va aparte de la clave porque el
   * email necesita armar el link `/<agenda>/<fecha>` y la clave es un campo opaco
   * para deduplicar, no algo que se deba parsear.
   */
  agendaId?: string;
  /** La línea original, tal cual. Se usa para armar el mensaje. */
  linea: string;
  /** "7:30am", ya normalizado por el parser. */
  hora: string;
  /** Minutos desde medianoche, local. `undefined` si la hora no parsea. */
  minutos?: number;
  /** El texto sin prefijo ni hora, que es lo que se lee. */
  texto: string;
  /** De quién es la línea, según los paréntesis. */
  responsables: string[];
  /** Clave de dedup: "<fecha>|<hora>|<línea>". */
  clave: string;
};

/** Dónde termina la nota: el texto y, si hay, de quién es cada línea. */
export type Nota = {
  userId: string;
  userName: string;
  /**
   * A qué agenda pertenece. Las notas son por agenda desde `0005`, y la clave de
   * dedup lo necesita adelante: sin él, las dos personas de una agenda comparten
   * clave y una se queda sin aviso.
   *
   * Opcional solo para el toast in-app, que ya sabe en qué agenda está y no
   * escribe en `notified`. La Function siempre lo pasa.
   */
  agendaId?: string;
  fecha: string;
  body: string;
};

/**
 * La ventana de aviso, en minutos.
 *
 * La cron corre cada 5 minutos, así que una ventana menor que eso produce
 * minutos sin revisar: alguien pone "6:00pm" a las 5:57 y la Function de las
 * 5:55 no lo vio, la de las 6:00 sí. Con 5 exactos hay una carrera de un minuto.
 *
 * Con 10 hay dos pasadas y el aviso llega a tiempo sin duplicar, porque la
 * deduplicación es lo que impide el segundo envío.
 */
export const VENTANA_MINUTOS = 10;

/**
 * Cuánto antes del horario avisa.
 *
 * Avisar en el minuto exacto es tarde: con la app cerrada el email tarda en
 * llegar, y con la abierta el toast aparece cuando ya era hora. Diez minutos
 * antes es lo que hace que sirva.
 */
export const ANTICIPACION_MINUTOS = 10;

/** Pasado esto, el recordatorio ya no sirve y no se manda. */
export const VIEJO_MINUTOS = 60;

/**
 * Las líneas de una nota que tienen hora y todavía no pasaron.
 *
 * `ahoraMin` son los minutos desde medianoche de HOY. La nota de un día futuro
 * no entra todavía: su "ahora" sería otro día y la comparación no significaría
 * nada. Por eso el ejecutor tiene que pasar la hora del día de la nota.
 */
export function recordatoriosDe(
  nota: Nota,
  ahoraMin: number,
  fechaHoy: string,
): Recordatorio[] {
  if (nota.fecha < fechaHoy) return [];

  // Para un día futuro, el momento de la línea es ese día a esa hora: si son las
  // 10:00 y la línea dice "7:30am" de mañana, todavía no es hora.
  const referencia = nota.fecha === fechaHoy ? ahoraMin : -1;

  const salida: Recordatorio[] = [];
  for (const t of parseNote(nota.body)) {
    const r = deTask(nota, t);
    if (!r || r.minutos === undefined) continue;
    // Una línea que es solo la hora no avisa. Es el momento en que más probable es
    // que se escriba —la hora primero, el texto después— y sin esto el toast
    // saldría con "12:10pm" y nada más, dejando la clave marcada: el texto que
    // viniera después no volvería a avisar.
    if (!r.texto) continue;
    if (r.minutos < referencia - VIEJO_MINUTOS) continue;
    if (r.minutos > referencia + VENTANA_MINUTOS) continue;
    salida.push(r);
  }
  return salida;
}

/**
 * `undefined` si la línea no tiene hora: no hay nada que recordar.
 *
 * ## Por qué NO exige `kind === "check"`
 *
 * Es tentador aceptar solo checkboxes, y está mal. En la nota de la referencia
 * las líneas con hora son SIN checkbox:
 *
 *     7:30am publicar ventas y promo
 *     1:00pm publicar comida el día.
 *
 * Los cinco checkboxes de arriba no tienen hora. Si el aviso exigiera checkbox,
 * la función no mandaría NADA de lo que ella realmente escribe con horario: el
 * caso de uso entero del recordatorio desaparecería sin error visible.
 *
 * También quedan afuera las líneas en blanco, que no tienen `time` igual.
 */
function deTask(nota: Nota, t: Task): Recordatorio | undefined {
  if (!t.time) return undefined;
  // Una tarea YA HECHA no se recuerda, aunque tenga hora. Es lo que evita que el
  // contador diga "3/5" y el aviso insista con algo que ya está marcado.
  if (t.done) return undefined;

  const texto = t.body.trim();
  return {
    fecha: nota.fecha,
    agendaId: nota.agendaId,
    linea: t.raw,
    hora: t.time,
    minutos: minutosDe(t.time),
    texto,
    responsables: t.assignees,
    clave: `${nota.agendaId ?? ""}|${nota.fecha}|${t.time}|${t.index}`,
  };
}

/** Reexportado para que la Function no tenga que importar `format` aparte. */
function minutosDe(hora: string): number | undefined {
  const m = /^(\d{1,2}):(\d{2})\s*([ap])\.?\s*m?\.?$/i.exec(hora.trim());
  if (!m) return undefined;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return undefined;
  return (h % 12) * 60 + min + (m[3].toLowerCase() === "p" ? 720 : 0);
}

/**
 * ¿Le toca avisarle a esta persona?
 *
 * La preferencia dice a QUIÉN, no si hay algo que avisar:
 *
 *   - `none`: a nadie. Es el interruptor deprivacy.
 *   - `mine`: solo lo que es de ella.
 *   - `all`: todo lo de la agenda, sea de quien sea.
 *
 * "De ella" se decide por los paréntesis del parser. Si una línea no nombra a
 * nadie, cuenta para las dos: es una tarea de la casa, no de alguien.
 */
export function leToca(
  recordatorio: Recordatorio,
  preferencia: PreferenciaAviso,
  nombrePropio: string,
): boolean {
  if (preferencia === "none") return false;
  if (preferencia === "all") return true;
  if (recordatorio.responsables.length === 0) return true;
  return recordatorio.responsables.some((r) => r === nombrePropio);
}

/**
 * Los que faltan mandar, y el `notified` nuevo.
 *
 * Devuelve los dos porque actualizar el campo y elegir a quién son el mismo cálculo:
 * si se hicieran por separado habría que recorrer dos veces y era donde se
 * colaba un envío duplicado.
 *
 * `notified` es el objeto entero, no las claves de hoy. Recortarlo obligaría a
 * saber qué es viejo, y lo más simple es dejar que el profile guarde unos
 * cuantos días: son bytes, no una tabla.
 */
export function elegirPendientes(
  candidatos: { recordatorio: Recordatorio; nota: Nota }[],
  yaNotificados: Record<string, unknown>,
  preferencia: PreferenciaAviso,
  nombrePropio: string,
): { aEnviar: Recordatorio[]; notified: Record<string, unknown> } {
  const notified = { ...yaNotificados };
  const aEnviar: Recordatorio[] = [];

  for (const { recordatorio, nota } of candidatos) {
    if (notified[recordatorio.clave]) continue;
    if (!leToca(recordatorio, preferencia, nombrePropio)) continue;
    notified[recordatorio.clave] = nota.fecha;
    aEnviar.push(recordatorio);
  }

  return { aEnviar, notified };
}

/**
 * Las claves con más de `dias` de antigüedad, para podar.
 *
 * La fecha sale del VALOR de la clave, que es la fecha de la nota. Leerla del
 * valor y no del nombre de la clave es a propósito: el valor es un campo con
 * forma de fecha y el nombre tiene los ids adentro, donde la posición depende de
 * si el `agendaId` viene o no.
 */
export function clavesViejas(
  notified: Record<string, unknown>,
  fechaHoy: string,
  dias = 3,
): string[] {
  const fuera: string[] = [];
  for (const [clave, fecha] of Object.entries(notified)) {
    if (typeof fecha !== "string") continue;
    const antiguedad = diasEntre(fecha, fechaHoy);
    if (antiguedad !== undefined && antiguedad > dias) fuera.push(clave);
  }
  return fuera;
}

/** Días de `a` a `b`. `undefined` si alguna no es una fecha válida. */
function diasEntre(a: string, b: string): number | undefined {
  const fa = a.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const fb = b.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!fa || !fb) return undefined;
  const da = Date.UTC(+fa[1], +fa[2] - 1, +fa[3]);
  const db = Date.UTC(+fb[1], +fb[2] - 1, +fb[3]);
  return Math.round((db - da) / 86_400_000);
}

/**
 * El texto del aviso.
 *
 * Corto a propósito: es una notificación del sistema o la primera línea de un
 * email, no un resumen del día. "7:30am publicar ventas y promo" dice todo lo
 * que hace falta y entra en el reloj del teléfono sin cortarse.
 */
export function textoDelAviso(recordatorio: Recordatorio): string {
  const cuando = recordatorio.hora;
  const de = recordatorio.responsables.length
    ? ` · ${recordatorio.responsables.join(", ")}`
    : "";
  return `${cuando} ${recordatorio.texto}${de}`.trim();
}