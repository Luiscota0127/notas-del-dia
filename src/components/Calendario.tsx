"use client";

import { useMemo } from "react";

import {
  addDays,
  formatDayHeading,
  formatMonthHeading,
  fromISODate,
  todayISO,
} from "@/lib/format";
import { countChecks, parseNote } from "@/lib/parse";

/**
 * Calendario lateral. Muestra qué días tienen pendientes y cuáles tienen algo
 * vencido, para saltar a un día sin entrar por la URL.
 *
 * El punto de color se deriva del parse, no de una columna en la base.
 */
export type Dia = {
  date: string;
  total: number;
  hechos: number;
};

/** Grid fijo de 6 semanas. Un mes tiene 4 o 5; 42 celdas cubren todos los casos
 *  sin librería de fechas. */
function celdasDelMes(fecha: string): { titulo: string; dias: string[]; mes: number } {
  const d = fromISODate(fecha);
  const primero = new Date(d.getFullYear(), d.getMonth(), 1);
  const inicio = new Date(primero);
  inicio.setDate(1 - primero.getDay());

  const dias: string[] = [];
  for (let i = 0; i < 42; i++) dias.push(addDays(toISODateLocal(inicio), i));

  return { titulo: formatMonthHeading(fecha), dias, mes: d.getMonth() };
}

function toISODateLocal(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function Calendario({
  dias,
  fecha,
  onIr,
}: {
  dias: Dia[];
  fecha: string;
  onIr: (date: string) => void;
}) {
  const porFecha = new Map(dias.map((d) => [d.date, d]));
  const { titulo, dias: celdas, mes } = celdasDelMes(fecha);
  const hoy = todayISO();

  return (
    <nav aria-label="Calendario" className="w-full md:w-60 shrink-0">
      <p className="text-accent text-lg font-medium mb-3">{titulo}</p>
      <div className="grid grid-cols-7 gap-0.5">
        {["D", "L", "M", "M", "J", "V", "S"].map((d, i) => (
          <span key={i} className="text-dim text-xs py-1 text-center" aria-hidden="true">
            {d}
          </span>
        ))}
        {celdas.map((c) => {
          const dia = porFecha.get(c);
          const delMes = fromISODate(c).getMonth() === mes;
          const esHoy = c === hoy;
          const actual = c === fecha;
          const vencido = dia && dia.total > dia.hechos && c < hoy;

          return (
            <button
              key={c}
              type="button"
              onClick={() => onIr(c)}
              aria-current={actual ? "date" : undefined}
              aria-label={`${formatDayHeading(c)}${
                dia ? `, ${dia.hechos} de ${dia.total} completadas` : ", sin pendientes"
              }`}
              className={[
                "relative aspect-square text-sm py-1 rounded-sm hover:bg-elevated",
                delMes ? "text-fg" : "text-dim opacity-40",
                actual ? "bg-elevated" : "",
                esHoy && !actual ? "text-accent" : "",
                esHoy ? "font-semibold" : "",
              ].join(" ")}
            >
              {fromISODate(c).getDate()}
              {/* El aria-label ya dice el estado; el punto es solo visual. */}
              {dia && dia.total > dia.hechos && (
                <span
                  className="absolute bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full"
                  style={{
                    background: vencido ? "var(--color-accent)" : "var(--color-dim)",
                  }}
                />
              )}
            </button>
          );
        })}
      </div>
    </nav>
  );
}

/**
 * Contadores de un rango de días para el calendario. Deriva del parse.
 *
 * `bodies` es un Record<fecha, body> con las notas ya cargadas. El rango es corto
 * (un mes), así que un loop con addDays es más simple que aritmética de índices.
 */
export function useContadores(
  bodies: Record<string, string>,
  desde: string,
  hasta: string,
): Dia[] {
  // useMemo para no recalcular en cada render del padre. El rango es un mes, así
  // que el cálculo es barato igual.
  return useMemo(() => {
    const dias: Dia[] = [];
    const hastaMs = fromISODate(hasta).getTime();
    for (let f = desde; fromISODate(f).getTime() <= hastaMs; f = addDays(f, 1)) {
      const body = bodies[f];
      if (body && body.trim()) {
        dias.push({ date: f, ...countChecks(parseNote(body)) });
      }
    }
    return dias;
  }, [bodies, desde, hasta]);
}
