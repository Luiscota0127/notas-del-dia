import { getLista, getPartner, getProfile, requireUser } from "@/lib/db/queries";

import { ListaEditor } from "./ListaEditor";

export const metadata = { title: "Mandado — Notas del Día" };

/**
 * La lista de mandado. Un solo documento compartido, texto libre como siempre.
 *
 * Server Component: lee la fila única. La RLS de `lista` deja leer a cualquiera
 * con un profile, que es exactamente la pareja.
 */
export default async function MandadoPage() {
  const user = await requireUser();
  const [body, profile, partner] = await Promise.all([
    getLista(),
    getProfile(user.id),
    getPartner(user.id),
  ]);

  return (
    <main className="md:grid md:grid-cols-[auto_1fr] md:gap-8">
      <aside className="hidden md:block p-4 sticky top-0 h-dvh self-start">
        <p className="text-accent text-lg font-medium mb-2">Mandado</p>
        <p className="text-dim text-sm">
          Una lista para los dos.
          <br />
          {profile.name}
          {partner ? ` y ${partner.name}` : ""}
        </p>
      </aside>

      <ListaEditor
        initialBody={body}
        partner={partner ? { name: partner.name } : null}
      />
    </main>
  );
}
