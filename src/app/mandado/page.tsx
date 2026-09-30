import { getLista, getPartner, getProfile, requireUser } from "@/lib/db/queries";
import { esDemo } from "@/lib/demo";

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
 * La lista de mandado. Un solo documento compartido, texto libre como siempre.
 *
 * Server Component: lee la fila única. La RLS de `lista` deja leer a cualquiera
 * con un profile, que es exactamente la pareja.
 */
export default async function MandadoPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const q = await searchParams;

  // Mismo atajo que las notas: /mandado?demo=1 renderiza sin backend.
  // `esDemo` es false en producción, así que acá no llega nunca y cae al login.
  if (esDemo(q.demo)) {
    return (
      <main className="md:grid md:grid-cols-[auto_1fr] md:gap-8">
        <aside className="hidden md:block p-4 sticky top-0 h-dvh self-start">
          <p className="text-accent text-lg font-medium mb-2">Mandado</p>
          <p className="text-dim text-sm">Una lista para los dos.</p>
        </aside>
        <ListaEditor initialBody={LISTA_DEMO} partner={{ name: "Luis" }} />
      </main>
    );
  }

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
