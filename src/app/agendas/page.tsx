import Link from "next/link";

import { todayISO } from "@/lib/format";
import { getAgendas, getInvitacionesPara, requireUser } from "@/lib/db/queries";
import type { InvitacionPendiente } from "@/lib/db/types";

import { aceptar, crearAgenda } from "./acciones";

/**
 * La pantalla de inicio: las agendas de las que sos parte.
 *
 * Antes esto no existía porque había una sola libreta y `/` iba derecho a ella.
 * Con varias agendas, `/` tiene que resolver cuál, y el lugar honesto para
 * resolverlo es una pantalla donde se ven todas y se elige.
 */
export default async function AgendasPage({
  searchParams,
}: PageProps<"/agendas">) {
  await requireUser();
  const q = await searchParams;

  const [agendas, invitaciones] = await Promise.all([
    getAgendas(),
    getInvitacionesPara(),
  ]);

  // Las invitaciones que llegan ya vienen sin las de agendas en las que ya sos
  // miembro: eso se filtra en la RPC, en la base, y no acá.
  //
  // Antes se filtraba en esta pantalla con `i.agenda && ...`, y ese era el bug:
  // la RLS de `agendas` no deja leer una agenda de la que todavía no sos
  // miembro, así que `agenda` llegaba null y TODA la invitación se descartaba
  // antes de dibujarse. Existía y no se veía. Ver `0010_aceptar-invitacion.sql`.
  const pendientes: InvitacionPendiente[] = invitaciones;

  return (
    <main className="p-4 md:p-8 max-w-lg">
      <h1 className="text-xl mb-6">Agendas</h1>

      {/* La RPC devolvió false: no había invitación para este correo. Antes el
          botón mandaba a /[agendaId] y la persona caía en un 404 sin explicación
          alguna. */}
      {q.error === "no-invitacion" && (
        <p role="alert" className="text-accent text-sm mb-6">
          Esa invitación ya no está disponible. Pide que te la vuelvan a mandar.
        </p>
      )}

      {pendientes.length > 0 && (
        <section className="mb-8">
          <p className="text-sm text-dim mb-2">Te invitaron</p>
          <ul className="flex flex-col gap-2">
            {pendientes.map((i) => (
              <li
                key={i.invitacion_id}
                className="border border-line rounded p-3 flex items-center justify-between gap-3"
              >
                <span className="min-w-0 truncate">{i.agenda_nombre}</span>
                <form action={aceptar}>
                  <input type="hidden" name="agendaId" value={i.agenda_id} />
                  <button type="submit" className="btn shrink-0">
                    Unirme
                  </button>
                </form>
              </li>
            ))}
          </ul>
        </section>
      )}

      {agendas.length === 0 ? (
        <p className="text-dim text-sm mb-8">
          Todavía no tienes ninguna agenda. Crea la primera abajo.
        </p>
      ) : (
        <ul className="flex flex-col gap-2 mb-8">
          {agendas.map((agenda) => (
            <li key={agenda.id}>
              <Link
                href={`/${agenda.id}/${todayISO()}`}
                className="border border-line rounded p-3 flex items-center justify-between gap-3 hover:bg-elevated"
              >
                <span className="min-w-0">
                  <span className="block truncate">{agenda.name}</span>
                  <span className="block text-dim text-sm truncate">
                    {agenda.miembros.map((m) => m.name).join(" y ")}
                  </span>
                </span>
                <span
                  className="w-2.5 h-2.5 rounded-full shrink-0"
                  style={{ background: agenda.color }}
                  aria-hidden="true"
                />
              </Link>
            </li>
          ))}
        </ul>
      )}

      <section>
        <p className="text-sm text-dim mb-2">Nueva agenda</p>
        <form action={crearAgenda} className="flex gap-2">
          <input
            name="nombre"
            className="input flex-1"
            placeholder="Casa, viaje, trabajo…"
            maxLength={60}
            required
            aria-label="Nombre de la agenda"
          />
          <button type="submit" className="btn shrink-0">
            Crear
          </button>
        </form>
      </section>
    </main>
  );
}
