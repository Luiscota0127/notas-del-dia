import Link from "next/link";
import { notFound } from "next/navigation";

import { todayISO } from "@/lib/format";
import { getAgenda, getInvitacionesDe, requireUser } from "@/lib/db/queries";

import { invitarPorEmail, renombrarAgenda, revocar } from "../../agendas/acciones";
import { miembrosDe } from "../miembros";
import { InvitacionesDe } from "./InvitacionesDe";

/**
 * Ajustes de una agenda: nombre, quién está, a quién se invitó.
 *
 * Los ajustes personales —nombre, avisos, tema— no viven acá: son de la persona
 * y no cambian al cambiar de agenda. Quedan en /ajustes.
 */
export default async function AjustesAgenda({
  params,
}: {
  params: Promise<{ agenda: string }>;
}) {
  const { agenda: agendaId } = await params;
  const user = await requireUser();

  // `getAgenda` devuelve null si no existe O si no sos miembro, y en los dos
  // casos la respuesta correcta es 404. Lo mismo con las invitaciones: la RLS
  // solo deja leer las que mandó el dueño.
  const agenda = await getAgenda(agendaId);
  if (!agenda) notFound();

  const soyDueno = agenda.created_by === user.id;

  const [miembros, invitadas] = await Promise.all([
    miembrosDe(agendaId),
    soyDueno ? getInvitacionesDe(agendaId) : Promise.resolve([]),
  ]);

  return (
    <main className="p-4 md:p-8 max-w-lg">
      <Link
        href={`/${agendaId}/${todayISO()}`}
        className="inline-block -ml-1 px-1 py-2.5 text-dim text-sm hover:text-accent"
      >
        ← Volver
      </Link>

      <h1 className="text-xl mt-4 mb-6">{agenda.name}</h1>

      {soyDueno && (
        <form action={renombrarAgenda} className="flex gap-2 mb-8">
          <input type="hidden" name="agendaId" value={agendaId} />
          <input
            name="nombre"
            className="input flex-1"
            defaultValue={agenda.name}
            maxLength={60}
            required
            aria-label="Nombre de la agenda"
          />
          <button type="submit" className="btn shrink-0">
            Guardar
          </button>
        </form>
      )}

      <section className="mb-8">
        <p className="text-sm text-dim mb-2">Quién ve esta agenda</p>
        <ul className="flex flex-col gap-1">
          {miembros.map((m) => (
            <li key={m.id} className="flex items-center gap-2">
              <span
                className="w-2.5 h-2.5 rounded-full inline-block shrink-0"
                style={{ background: m.color }}
                aria-hidden="true"
              />
              {m.name}
              {m.id === user.id && <span className="text-dim text-sm"> (vos)</span>}
            </li>
          ))}
        </ul>
      </section>

      {soyDueno && (
        <>
          <section className="mb-8">
            <p className="text-sm text-dim mb-2">Invitar a alguien</p>
            <form action={invitarPorEmail} className="flex gap-2">
              <input type="hidden" name="agendaId" value={agendaId} />
              <input
                name="email"
                type="email"
                className="input flex-1"
                placeholder="correo@ejemplo.com"
                required
                aria-label="Correo a invitar"
              />
              <button type="submit" className="btn shrink-0">
                Invitar
              </button>
            </form>
            <p className="text-dim text-sm mt-2">
              No se manda ningún correo: la invitación aparece en /agendas la próxima
              vez que esa persona entre con ese correo.
            </p>
          </section>

          {invitadas.length > 0 && (
            <InvitacionesDe agendaId={agendaId} invitaciones={invitadas} revocar={revocar} />
          )}
        </>
      )}

      <p className="text-dim text-sm mt-8">
        <Link href="/agendas" className="hover:text-accent">
          ← Todas las agendas
        </Link>
      </p>
    </main>
  );
}
