"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import {
  aceptarInvitacion,
  createAgenda,
  invitar,
  requireUser,
  renameAgenda as renombrar,
  revocarInvitacion,
} from "@/lib/db/queries";

/**
 * Server actions de las agendas.
 *
 * Viven acá y no en `app/acciones.ts` porque son de la agenda: el alta, la
 * invitación y la aceptación. `acciones.ts` es lo que el editor autoguarda en
 * cada tecla, y mezclarlo con altas-asíncronas-cuando-pega-botón hace que un
 * error de la lista rompa el guardado del texto.
 */

export async function crearAgenda(formData: FormData) {
  const nombre = String(formData.get("nombre") ?? "").trim();
  if (!nombre) return;

  const user = await requireUser();
  const agenda = await createAgenda(user.id, nombre);
  if (!agenda) return;

  revalidatePath("/agendas");
  // A la agenda nueva, no a la primera: alguien que crea una agenda quiere
  // usarla ya, no volver a la de siempre.
  redirect(`/${agenda.id}`);
}

export async function renombrarAgenda(formData: FormData) {
  const agendaId = String(formData.get("agendaId") ?? "");
  const nombre = String(formData.get("nombre") ?? "").trim();
  if (!agendaId || !nombre) return;

  await requireUser();
  await renombrar(agendaId, nombre);
  revalidatePath(`/${agendaId}/ajustes`);
  revalidatePath("/agendas");
}

export async function invitarPorEmail(formData: FormData) {
  const agendaId = String(formData.get("agendaId") ?? "");
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  if (!agendaId || !email) return;

  const user = await requireUser();
  await invitar(agendaId, user.id, email);
  revalidatePath(`/${agendaId}/ajustes`);
}

export async function revocar(formData: FormData) {
  const agendaId = String(formData.get("agendaId") ?? "");
  const email = String(formData.get("email") ?? "");
  if (!agendaId || !email) return;

  await requireUser();
  await revocarInvitacion(agendaId, email);
  revalidatePath(`/${agendaId}/ajustes`);
}

export async function aceptar(formData: FormData) {
  const agendaId = String(formData.get("agendaId") ?? "");
  if (!agendaId) return;

  const user = await requireUser();
  await aceptarInvitacion(agendaId, user.id);
  revalidatePath("/agendas");
  redirect(`/${agendaId}`);
}
