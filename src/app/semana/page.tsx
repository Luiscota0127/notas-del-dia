import Link from "next/link";

import { addDays, formatDayHeading, fromISODate, todayISO } from "@/lib/format";
import { getNote, requireUser } from "@/lib/db/queries";
import { countChecks, parseNote } from "@/lib/parse";
import { NOTA_DEMO } from "@/lib/demo";

/**
 * Vista Semana. Server Component: lee directo de Postgres.
 *
 * Con 7 días son 7 queries de una fila; cuando haga falta, esto se vuelve una
 * sola con `in.()`. A dos personas no vale la pena.
 */
export default async function SemanaPage({ searchParams }: PageProps<"/semana">) {
  const q = await searchParams;
  const demo = q.demo === "1";

  if (demo) return <SemanaDemo />;

  const user = await requireUser();
  const fecha =
    typeof q.fecha === "string" && /^\d{4}-\d{2}-\d{2}$/.test(q.fecha)
      ? q.fecha
      : todayISO();

  const lunes = lunesDe(fecha);
  const notas = await Promise.all(
    Array.from({ length: 7 }, (_, i) => getNote(user.id, addDays(lunes, i))),
  );

  const dias = notas.map((nota, i) => {
    const date = addDays(lunes, i);
    const body = nota?.body ?? "";
    return { date, body, ...countChecks(parseNote(body)) };
  });

  return <Semana dias={dias} lunes={lunes} />;
}

function lunesDe(fecha: string): string {
  const d = fromISODate(fecha);
  return addDays(fecha, -((d.getDay() + 6) % 7));
}

async function SemanaDemo() {
  const lunes = lunesDe(todayISO());
  const dias = Array.from({ length: 7 }, (_, i) => {
    const date = addDays(lunes, i);
    // Solo algunos días tienen nota, para que se vean los contadores.
    const body = i % 2 === 0 ? NOTA_DEMO : i === 1 ? "☐ comprar café\n☐ llamar a Luis" : "";
    return { date, body, ...countChecks(parseNote(body)) };
  });
  return <Semana dias={dias} lunes={lunes} />;
}

function Semana({
  dias,
  lunes,
}: {
  dias: Array<{ date: string; body: string; total: number; hechos: number }>;
  lunes: string;
}) {
  const completados = dias.reduce((a, d) => a + d.hechos, 0);
  const total = dias.reduce((a, d) => a + d.total, 0);
  const domingo = dias[6].date;

  return (
    <main className="p-4 md:p-8 max-w-2xl">
      <Link href="/hoy" className="text-dim text-sm hover:text-accent">
        ← Volver
      </Link>

      <header className="mt-4 mb-6">
        <h1 className="text-xl">
          {formatDayHeading(lunes).split(" ")[0]} a {formatDayHeading(domingo)}
        </h1>
        <p className="text-dim text-sm">
          {completados}/{total} completadas
          {total > 0 && completados === total && " 🌙"}
        </p>
      </header>

      <ol className="flex flex-col gap-3">
        {dias.map((dia) => {
          const [diaSemana, resto] = split(formatDayHeading(dia.date));
          return (
            <li key={dia.date}>
              <Link
                href={`/${dia.date}`}
                className="block border border-line rounded p-3 hover:bg-elevated"
              >
                <div className="flex items-baseline justify-between gap-3">
                  <span className="font-medium">
                    {diaSemana} {resto}
                    {dia.date === todayISO() && (
                      <span className="text-accent font-normal"> · hoy</span>
                    )}
                  </span>
                  {dia.total > 0 && (
                    <span className="text-dim text-sm tabular-nums shrink-0">
                      {dia.hechos}/{dia.total}
                    </span>
                  )}
                </div>

                {dia.total === 0 ? (
                  <p className="text-dim text-sm mt-1">
                    {dia.body.trim() === "" ? "Sin pendientes" : "Sin checkboxes"}
                  </p>
                ) : (
                  <ul className="mt-1.5 flex flex-col gap-0.5">
                    {parseNote(dia.body)
                      .filter((t) => t.kind === "check" || t.kind === "bullet")
                      .map((t) => (
                        <li
                          key={t.index}
                          className={`text-sm flex gap-2 ${t.done ? "text-dim" : ""}`}
                        >
                          <span aria-hidden="true" className="shrink-0 tabular-nums">
                            {t.kind === "check" ? (t.done ? "☑" : "☐") : "•"}
                          </span>
                          <span className={t.done ? "line-through" : ""}>
                            {t.title || "—"}
                          </span>
                        </li>
                      ))}
                  </ul>
                )}
              </Link>
            </li>
          );
        })}
      </ol>
    </main>
  );
}

/** "MARTES 01 SEP" → ["MARTES", "01 SEP"] */
function split(heading: string): [string, string] {
  const i = heading.indexOf(" ");
  return [heading.slice(0, i), heading.slice(i + 1)];
}
