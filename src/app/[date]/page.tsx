import { notFound } from "next/navigation";

import { NoteEditor } from "@/components/NoteEditor";
import { getNote, getPartner, getProfile, requireUser } from "@/lib/db/queries";

/**
 * Una nota por día, en /[date]. El path canónico de "hoy" es /hoy, que redirige
 * acá con la fecha real del servidor, para que el link de un día sí sea
 * compartible.
 */
export default async function NotaPage({ params }: PageProps<"/[date]">) {
  const { date } = await params;

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) notFound();

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
