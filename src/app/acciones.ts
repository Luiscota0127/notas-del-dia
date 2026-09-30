"use server";

import { revalidatePath } from "next/cache";

import { requireUser, saveLista, saveNote } from "@/lib/db/queries";

/**
 * Autoguardado. Recibe el body entero porque es la única fuente de verdad: no
 * hay campos parciales que updatear.
 *
 * `guardado: false` explícito cuando falla, y no una excepción. Razón concreta:
 * sin red, el service worker intercepta el POST de la server action y devuelve
 * el shell cacheado con un 200. El cliente vería "éxito" y no pondría nada en la
 * cola, y la nota se perdería. Con el flag, el cliente sabe que no se guardó.
 */
export async function guardarNota(date: string, body: string) {
  try {
    const user = await requireUser();
    await saveNote(user.id, date, body);
    revalidatePath(`/${date}`);
    return { guardado: true as const };
  } catch (e) {
    return { guardado: false as const, motivo: String(e) };
  }
}

/** La lista de mandado. Compartida, así que no lleva user_id. */
export async function guardarLista(body: string) {
  try {
    await requireUser();
    await saveLista(body);
    revalidatePath("/mandado");
    return { guardado: true as const };
  } catch (e) {
    return { guardado: false as const, motivo: String(e) };
  }
}
