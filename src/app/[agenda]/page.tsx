import { notFound, redirect } from "next/navigation";

import { todayISO } from "@/lib/format";
import { esDemo } from "@/lib/demo";
import { getAgenda, requireUser } from "@/lib/db/queries";

import { AGENDA_DEMO } from "./demo";

/**
 * `/[agenda]` sin fecha: va a hoy de esa agenda.
 *
 * Existe para que un link a "la agenda" sea algo que se puede tipear y mandar
 * por WhatsApp. Con un solo segmento no hay nada que mostrar, pero sí un
 * destino obvious.
 */
export default async function AgendaIndice({
  params,
  searchParams,
}: {
  params: Promise<{ agenda: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { agenda } = await params;
  const q = await searchParams;

  // El demo no consulta la base, así que no pide sesión: si la pidiera,
  // `?demo=1` en esta ruta caería al login y el atajo de desarrollo dejaría de
  // servir justamente para probar la navegación sin backend.
  const conDemo = esDemo(q.demo);
  if (!conDemo) await requireUser();

  if (!conDemo && agenda !== AGENDA_DEMO) {
    const fila = await getAgenda(agenda);
    if (!fila) notFound();
  }

  redirect(`/${agenda}/${todayISO()}${conDemo ? "?demo=1" : ""}`);
}
