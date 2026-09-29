import { redirect } from "next/navigation";

import { hasSupabaseEnv } from "./client";
import { createClient } from "./server";
import type { Note, Profile } from "./types";

export type { Note, Profile };

/** Usuario de la request, o null. No redirige: eso es del proxy. */
export async function getUser() {
  if (!hasSupabaseEnv()) return null;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}

export async function requireUser() {
  const user = await getUser();
  if (!user) redirect("/login");
  return user;
}

/** El profile propio. Lo crea el trigger handle_new_user; si no existe todavía
 *  (alta recién hecha), lo insertamos para no bloquear la primera nota. */
export async function getProfile(userId: string): Promise<Profile> {
  const supabase = await createClient();

  const { data } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", userId)
    .maybeSingle();

  if (data) return data;

  const { data: created, error } = await supabase
    .from("profiles")
    .insert({ id: userId, name: "Yo" })
    .select("*")
    .single();

  if (error) throw error;
  return created;
}

/** La pareja. Con dos personas, "la pareja" es el otro profile. No hay tabla de
 *  invites ni partner_id: para cuando sean tres, se agrega. */
export async function getPartner(userId: string): Promise<Profile | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("profiles")
    .select("*")
    .neq("id", userId)
    .limit(1)
    .maybeSingle();
  return data;
}

/** La nota de un día. `null` si nunca se escribió: el editor crea la plantilla. */
export async function getNote(userId: string, date: string): Promise<Note | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("notes")
    .select("*")
    .eq("user_id", userId)
    .eq("date", date)
    .maybeSingle();
  return data;
}

/** Una nota de cualquier usuario, para la vista "Ambas". Las RLS igualajn a que
 *  solo se puedan leer las propias; el check es solo un mensaje claro. */
export async function getNoteOf(userId: string, date: string): Promise<Note | null> {
  return getNote(userId, date);
}

/** Crea o actualiza. El body entero, porque es la única fuente de verdad. */
export async function saveNote(userId: string, date: string, body: string): Promise<void> {
  const supabase = await createClient();

  const { error } = await supabase.from("notes").upsert(
    { user_id: userId, date, body },
    { onConflict: "user_id,date" },
  );

  if (error) throw error;
}
