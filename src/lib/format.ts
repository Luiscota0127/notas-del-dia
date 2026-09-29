/**
 * Una nota por día. El texto libre es la fuente de verdad: acá solo se mueven
 * strings. No hay title, ni time, ni done. El parser deriva todo en el cliente.
 */

const MESES = [
  "ENERO", "FEBRERO", "MARZO", "ABRIL", "MAYO", "JUNIO",
  "JULIO", "AGOSTO", "SEPTIEMBRE", "OCTUBRE", "NOVIEMBRE", "DICIEMBRE",
] as const;

const DIAS = [
  "DOMINGO", "LUNES", "MARTES", "MIÉRCOLES",
  "JUEVES", "VIERNES", "SÁBADO",
] as const;

const CORTOS = ["ENE", "FEB", "MAR", "ABR", "MAY", "JUN",
  "JUL", "AGO", "SEP", "OCT", "NOV", "DIC"] as const;

/** "YYYY-MM-DD" en hora local. */
export function toISODate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** "YYYY-MM-DD" → Date a medianoche local. Al revés que `new Date(iso)`, que
 *  parsea como UTC y en墨西哥 se come un día. */
export function fromISODate(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function todayISO(): string {
  return toISODate(new Date());
}

export function addDays(iso: string, days: number): string {
  const d = fromISODate(iso);
  d.setDate(d.getDate() + days);
  return toISODate(d);
}

/** "MARTES 01 SEP" — el encabezado de día de la referencia. */
export function formatDayHeading(iso: string): string {
  const d = fromISODate(iso);
  return `${DIAS[d.getDay()]} ${String(d.getDate()).padStart(2, "0")} ${CORTOS[d.getMonth()]}`;
}

/** "SEPTIEMBRE" — el encabezado de mes. */
export function formatMonthHeading(iso: string): string {
  return MESES[fromISODate(iso).getMonth()];
}

/** "martes 1 de septiembre" — para aria-labels y la cabecera. */
export function formatLong(iso: string): string {
  const d = fromISODate(iso);
  const dia = d.getDate();
  return `${DIAS[d.getDay()].toLowerCase()} ${dia} de ${MESES[d.getMonth()].toLowerCase()}`;
}

/**
 * La plantilla del día nuevo: encabezado de día y un checkbox vacío para que solo
 * tenga que escribir.
 */
export function emptyNoteTemplate(iso: string): string {
  return `${formatDayHeading(iso)}\n\n☐ \n\n`;
}

/** "7:30am" → 450. Minutos desde medianoche. `undefined` si no parsea. */
export function timeToMinutes(time: string): number | undefined {
  const m = /^(\d{1,2}):(\d{2})\s*([ap])\.?m?\.?$/i.exec(time.trim());
  if (!m) return undefined;
  const h = Number(m[1]);
  const min = Number(m[2]);
  const pm = m[3].toLowerCase() === "p";
  if (h > 23 || min > 59) return undefined;
  // 12am es medianoche y 12pm es mediodía. h % 12 lleva ambos a 0, y el +360 solo
  // se aplica a pm.
  return (h % 12) * 60 + min + (pm ? 12 * 60 : 0);
}

/** "2026-09-29" + "7:30am" → Date local. */
export function atTime(iso: string, time: string): Date | undefined {
  const minutes = timeToMinutes(time);
  if (minutes === undefined) return undefined;
  const d = fromISODate(iso);
  d.setMinutes(minutes);
  return d;
}

export const MS_PER_MIN = 60_000;
