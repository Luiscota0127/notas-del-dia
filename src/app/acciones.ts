"use server";

import { revalidatePath } from "next/cache";

import {
  createAgenda,
  requireUser,
  renameAgenda,
  saveLista,
  saveNote,
} from "@/lib/db/queries";

/**
 * Autoguardado. Recibe el body entero porque es la única fuente de verdad: no
 * hay campos parciales que updatear.
 *
 * `guardado: false` explícito cuando falla, y no una excepción. Razón concreta:
 * sin red, el service worker intercepta el POST de la server action y devuelve
 * el shell cacheado con un 200. El cliente vería "éxito" y no pondría nada en la
 * cola, y la nota se perdería. Con el flag, el cliente sabe que no se guardó.
 */
export async function guardarNota(agendaId: string, date: string, body: string) {
  try {
    await requireUser();
    await saveNote(agendaId, date, body);
    revalidatePath(`/${agendaId}/${date}`);
    return { guardado: true as const };
  } catch (e) {
    return { guardado: false as const, motivo: String(e) };
  }
}

/** La lista de mandado de una agenda. Compartida, así que no lleva user_id. */
export async function guardarLista(agendaId: string, body: string) {
  try {
    await requireUser();
    await saveLista(agendaId, body);
    revalidatePath(`/${agendaId}/mandado`);
    return { guardado: true as const };
  } catch (e) {
    return { guardado: false as const, motivo: String(e) };
  }
}

export async function crearAgenda(nombre: string) {
  try {
    const user = await requireUser();
    const agenda = await createAgenda(user.id, nombre);
    revalidatePath("/agendas");
    return { creada: true as const, agendaId: agenda?.id ?? null };
  } catch (e) {
    return { creada: false as const, motivo: String(e) };
  }
}

export async function renombrarAgenda(agendaId: string, nombre: string) {
  try {
    await requireUser();
    await renameAgenda(agendaId, nombre);
    revalidatePath(`/${agendaId}`);
    return { renombrada: true as const };
  } catch (e) {
    return { renombrada: false as const, motivo: String(e) };
  }
}
