import { redirect } from "next/navigation";

import { getAgendaPorDefecto, requireUser } from "@/lib/db/queries";

/**
 * `/` va a la primera agenda.
 *
 * "Primera" y no "la última abierta": esta última cambiaría debajo de los dedos
 * de quien está escribiendo en la agenda de siempre. La primera es estable.
 *
 * Si no hay ninguna, se cae en /agendas, que es donde se crea la primera.
 */
export default async function Home() {
  await requireUser();

  const agenda = await getAgendaPorDefecto();
  if (!agenda) redirect("/agendas");

  redirect(`/${agenda.id}`);
}
