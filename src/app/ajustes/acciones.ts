"use server";

import { revalidatePath } from "next/cache";

import { requireUser } from "@/lib/db/queries";
import { createClient } from "@/lib/db/server";

/**
 * Server Actions de los ajustes personales.
 *
 * Reciben FormData, no un argumento suelto: es la firma que React exige para
 * usarlas sin un wrapper.
 */

/** Cambia el nombre propio. Es lo que ven los demás en las agendas. */
export async function guardarNombre(formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return;

  const user = await requireUser();
  const supabase = await createClient();

  const { error } = await supabase.from("profiles").update({ name }).eq("id", user.id);
  if (error) throw error;

  revalidatePath("/ajustes");
  revalidatePath("/agendas");
}

/** Preferencia de avisos: "all" | "mine" | "none". */
export async function guardarAvisos(formData: FormData) {
  const valor = String(formData.get("notify") ?? "");
  if (valor !== "all" && valor !== "mine" && valor !== "none") return;

  const user = await requireUser();
  const supabase = await createClient();

  const { error } = await supabase
    .from("profiles")
    .update({ notify: valor })
    .eq("id", user.id);
  if (error) throw error;

  revalidatePath("/ajustes");
}
