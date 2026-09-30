import Link from "next/link";

import { todayISO } from "@/lib/format";
import { getAgendas, getInvitacionesPara, requireUser } from "@/lib/db/queries";

import { aceptar, crearAgenda } from "./acciones";

/**
 * La pantalla de inicio: las agendas de las que sos parte.
 *
 * Antes esto no existía porque había una sola libreta y `/` iba derecho a ella.
 * Con varias agendas, `/` tiene que resolver cuál, y el lugar honesto para
 * resolverlo es una pantalla donde se ven todas y se elige.
 */
export default async function AgendasPage() {
  await requireUser();

  const [agendas, invitaciones] = await Promise.all([
    getAgendas(),
    getInvitacionesPara(),
  ]);

  // Una invitación a una agenda de la que ya sos miembro es basura de un intento
  // anterior que no llegó a borrar la fila. Mostrarla sería pedirle a alguien
  // que se una a algo en lo que ya está.
  const pendientes = invitaciones.filter(
    (i) => i.agenda && !agendas.some((a) => a.id === i.agenda!.id),
  );

  return (
    <main className="p-4 md:p-8 max-w-lg">
      <h1 className="text-xl mb-6">Agendas</h1>

      {pendientes.length > 0 && (
        <section className="mb-8">
          <p className="text-sm text-dim mb-2">Te invitaron</p>
          <ul className="flex flex-col gap-2">
            {pendientes.map((i) => (
              <li
                key={i.id}
                className="border border-line rounded p-3 flex items-center justify-between gap-3"
              >
                <span className="min-w-0 truncate">{i.agenda?.name}</span>
                <form action={aceptar}>
                  <input type="hidden" name="agendaId" value={i.agenda!.id} />
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
          Todavía no tenés ninguna agenda. Creá la primera abajo.
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
