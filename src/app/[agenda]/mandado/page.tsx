import { notFound } from "next/navigation";

import { getAgenda, getLista, requireUser } from "@/lib/db/queries";
import { esDemo } from "@/lib/demo";

import { AGENDA_DEMO } from "../demo";
import { miembrosDe, nombresDe } from "../miembros";
import { ListaEditor } from "./ListaEditor";

export const metadata = { title: "Mandado — Notas del Día" };

/** La lista de ejemplo, para el modo demo. */
const LISTA_DEMO = `☐ pan
☐ leche (descremada)
☐ huevos
☑ café
• cosas del depot
papel de cocina`;

/**
 * La lista de mandado de una agenda: `/[agenda]/mandado`.
 *
 * Compartida por los miembros, como la agenda misma. Antes era un singleton
 * global con una fila y una policy de "cualquiera con profile"; ahora es una fila
 * por agenda, y por eso el índice único pasó a ser sobre `agenda_id`.
 */
export default async function MandadoPage({
  params,
  searchParams,
}: PageProps<"/[agenda]/mandado">) {
  const { agenda: agendaId } = await params;
  const q = await searchParams;

  // Mismo atajo que las notas: renderiza sin backend. `esDemo` es false en
  // producción, así que ahí nunca entra y cae al login.
  if (esDemo(q.demo)) {
    return (
      <main className="md:grid md:grid-cols-[auto_1fr] md:gap-8">
        <aside className="hidden md:block p-4 sticky top-0 h-dvh self-start">
          <p className="text-accent text-lg font-medium mb-2">Mandado</p>
          <p className="text-dim text-sm">Una lista para los dos.</p>
        </aside>
        <ListaEditor
          agendaId={AGENDA_DEMO}
          initialBody={LISTA_DEMO}
          partner={{ name: "Luis" }}
        />
      </main>
    );
  }

  const user = await requireUser();

  const agenda = await getAgenda(agendaId);
  if (!agenda) notFound();

  const [body, miembros] = await Promise.all([getLista(agendaId), miembrosDe(agendaId)]);

  const otros = nombresDe(miembros, user.id);

  return (
    <main className="md:grid md:grid-cols-[auto_1fr] md:gap-8">
      <aside className="hidden md:block p-4 sticky top-0 h-dvh self-start">
        <p className="text-accent text-lg font-medium mb-2">Mandado</p>
        <p className="text-dim text-sm">
          Una lista para los de {agenda.name}.
          {otros ? ` ${otros}.` : ""}
        </p>
      </aside>

      <ListaEditor
        agendaId={agendaId}
        initialBody={body}
        partner={otros ? { name: otros } : null}
      />
    </main>
  );
}
