import { notFound } from "next/navigation";

import { NoteEditor } from "@/components/editor/NoteEditor";
import { getNote, getPartner, getProfile, requireUser } from "@/lib/db/queries";

/**
 * Una nota por día, en /[date]. El path canónico de "hoy" es /hoy, que redirige
 * acá con la fecha real del servidor, para que el link de un día sí sea
 * compartible.
 */
/**
 * ponytail: en desarrollo, sin Supabase, la nota se sirve desde la query string
 * con la nota real de la referencia. Es la única forma de ver el render sin
 * backend, y el render es justo lo que hay que revisar en F2. En producción
 * nunca se ejecuta.
 */
function notaDePrueba(): string | null {
  if (process.env.NODE_ENV === "production") return null;
  if (!process.env.NEXT_PUBLIC_DEMO_NOTA) return null;
  return process.env.NEXT_PUBLIC_DEMO_NOTA.replace(/\\n/g, "\n");
}

export default async function NotaPage({
  params,
  searchParams,
}: PageProps<"/[date]">) {
  const { date } = await params;
  const q = await searchParams;

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) notFound();

  // Atajo de desarrollo: /2026-09-01?demo=1 renderiza la nota de referencia.
  if (q.demo === "1") {
    return (
      <main>
        <NoteEditor
          date={date}
          initialBody={notaDePrueba() ?? ""}
          me={{ id: "demo", name: "Nahomi" }}
          partner={{ id: "demo2", name: "Luis" }}
        />
      </main>
    );
  }

  const user = await requireUser();
  const [note, profile, partner] = await Promise.all([
    getNote(user.id, date),
    getProfile(user.id),
    getPartner(user.id),
  ]);

  return (
    <main>
      <NoteEditor
        date={date}
        initialBody={note?.body ?? ""}
        me={{ id: profile.id, name: profile.name }}
        partner={partner ? { id: partner.id, name: partner.name } : null}
      />
    </main>
  );
}
