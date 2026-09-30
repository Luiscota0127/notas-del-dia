import { notFound } from "next/navigation";

import { addDays } from "@/lib/format";
import { esDemo, NOTA_DEMO } from "@/lib/demo";
import { getNotes, getPartner, getProfile, requireUser } from "@/lib/db/queries";

import { BarraNavegacion } from "@/components/BarraNavegacion";
import { NoteEditor } from "@/components/editor/NoteEditor";

/**
 * Una nota por día, en /[date]. El path canónico de "hoy" es /hoy, que redirige
 * acá con la fecha real del servidor, para que el link de un día sí sea
 * compartible.
 */
export default async function NotaPage({
  params,
  searchParams,
}: PageProps<"/[date]">) {
  const { date } = await params;
  const q = await searchParams;

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) notFound();

  // Atajo de desarrollo: /2026-09-01?demo=1 renderiza la nota de referencia.
  // `esDemo` ya devuelve false en producción, así que acá no llega nunca: en el
  // deploy el atajo cae al requireUser() de abajo y termina en /login.
  if (esDemo(q.demo)) {
    const demo = NOTA_DEMO;
    // Días vecinos con contenido, para que el calendario y el buscador tengan
    // algo que mostrar sin Supabase.
    const cuerpos: Record<string, string> = {
      [date]: demo,
      [addDays(date, -1)]: "☐ comprar café\n☐ llamar a Luis",
      [addDays(date, -2)]: "☐ revisar el drenaje",
      [addDays(date, 1)]: "☐ pagar la luz",
    };

    return (
      <main className="md:grid md:grid-cols-[auto_1fr] md:gap-8">
        <BarraNavegacion
          fecha={date}
          cuerpos={cuerpos}
          me={{ id: "demo", name: "Nahomi" }}
          partner={{ id: "demo2", name: "Luis" }}
        />
        <NoteEditor
          date={date}
          initialBody={demo}
          me={{ id: "demo", name: "Nahomi" }}
          partner={{ id: "demo2", name: "Luis" }}
        />
      </main>
    );
  }

  const user = await requireUser();
  const profile = await getProfile(user.id);
  const partner = await getPartner(user.id);

  // El calendario y el buscador necesitan contexto alrededor del día. Una sola
  // query; los contadores se derivan en el cliente de los mismos bodies.
  const desde = addDays(date, -45);
  const hasta = addDays(date, 45);
  const { bodies } = await getNotes(user.id, desde, hasta);

  return (
    <main className="md:grid md:grid-cols-[auto_1fr] md:gap-8">
      <BarraNavegacion
        fecha={date}
        cuerpos={bodies}
        me={{ id: profile.id, name: profile.name }}
        partner={partner ? { id: partner.id, name: partner.name } : null}
      />
      <NoteEditor
        date={date}
        initialBody={bodies[date] ?? ""}
        me={{ id: profile.id, name: profile.name }}
        partner={partner ? { id: partner.id, name: partner.name } : null}
      />
    </main>
  );
}
