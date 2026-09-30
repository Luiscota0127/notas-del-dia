import { notFound } from "next/navigation";

import { addDays } from "@/lib/format";
import { esDemo, NOTA_DEMO } from "@/lib/demo";
import { getAgenda, getNote, getNotes, requireUser } from "@/lib/db/queries";

import { BarraNavegacion } from "@/components/BarraNavegacion";
import { NoteEditor } from "@/components/editor/NoteEditor";
import { AGENDA_DEMO, NOMBRE_AGENDA_DEMO } from "../demo";
import { miembrosDe, miembroPropio, otroMiembro } from "../miembros";

/** Días vecinos con contenido, para que el calendario y el buscador tengan algo. */
function vecinosDemo(fecha: string): Record<string, string> {
  return {
    [fecha]: NOTA_DEMO,
    [addDays(fecha, -1)]: "☐ comprar café\n☐ llamar a Luis",
    [addDays(fecha, -2)]: "☐ revisar el drenaje",
    [addDays(fecha, 1)]: "☐ pagar la luz",
  };
}

/**
 * La nota de un día dentro de una agenda: `/[agenda]/[fecha]`.
 *
 * La agenda va primero en la URL porque es el contexto de todo lo demás: sin
 * ella, un link a "el martes" no dice de qué agenda es.
 */
export default async function NotaPage({
  params,
  searchParams,
}: PageProps<"/[agenda]/[fecha]">) {
  const { agenda: agendaId, fecha } = await params;
  const q = await searchParams;

  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) notFound();

  // Modo demo: `esDemo` es false en producción, así que ahí nunca entra.
  if (esDemo(q.demo)) {
    return (
      <main className="md:grid md:grid-cols-[auto_1fr] md:gap-8">
        <BarraNavegacion
          agendaId={AGENDA_DEMO}
          fecha={fecha}
          cuerpos={vecinosDemo(fecha)}
          me={{ id: "demo", name: "Nahomi", color: "#f59e0b" }}
          partner={{ id: "demo2", name: "Luis", color: "#6b7280" }}
          nombreAgenda={NOMBRE_AGENDA_DEMO}
        />
        <NoteEditor
          agendaId={AGENDA_DEMO}
          date={fecha}
          initialBody={NOTA_DEMO}
          me={{ id: "demo", name: "Nahomi", color: "#f59e0b" }}
          partner={{ id: "demo2", name: "Luis", color: "#6b7280" }}
        />
      </main>
    );
  }

  const user = await requireUser();

  // La RLS filtra por membresía, así que `null` significa "no existe o no te
  // corresponde". Se responde 404 en los dos casos: distinguirlos confirmaría la
  // existencia de agendas ajenas.
  const agenda = await getAgenda(agendaId);
  if (!agenda) notFound();

  const note = await getNote(agendaId, fecha);

  // El calendario y el buscador necesitan contexto alrededor del día. Una sola
  // query; los contadores se derivan en el cliente de los mismos bodies.
  const desde = addDays(fecha, -45);
  const hasta = addDays(fecha, 45);
  const [{ bodies }, miembros] = await Promise.all([
    getNotes(agendaId, desde, hasta),
    miembrosDe(agendaId),
  ]);

  return (
    <main className="md:grid md:grid-cols-[auto_1fr] md:gap-8">
      <BarraNavegacion
        agendaId={agendaId}
        fecha={fecha}
        cuerpos={bodies}
        me={miembroPropio(user.id, miembros)}
        partner={otroMiembro(user.id, miembros)}
        nombreAgenda={agenda.name}
      />
      <NoteEditor
        agendaId={agendaId}
        date={fecha}
        initialBody={note?.body ?? ""}
        me={miembroPropio(user.id, miembros)}
        partner={otroMiembro(user.id, miembros)}
      />
    </main>
  );
}
