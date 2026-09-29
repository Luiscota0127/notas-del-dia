"use server";

import { revalidatePath } from "next/cache";

import { requireUser, saveNote } from "@/lib/db/queries";

/**
 * Autoguardado. Recibe el body entero porque es la única fuente de verdad: no
 * hay campos parciales que updatear.
 */
export async function guardarNota(date: string, body: string) {
  const user = await requireUser();
  await saveNote(user.id, date, body);
  revalidatePath(`/${date}`);
}
