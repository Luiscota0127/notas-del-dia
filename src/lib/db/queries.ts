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

/**
 * Un rango de notas, para el calendario y el buscador.
 *
 * Devuelve solo los bodies. Los contadores se derivan en el cliente con el
 * mismo parse: hacerlo en los dos lados es el mismo cálculo dando dos
 * resultados distintos si alguno cambia.
 *
 * RLS sigue aplicando: cada uno solo lee lo suyo.
 */
export async function getNotes(
  userId: string,
  desde: string,
  hasta: string,
): Promise<{ bodies: Record<string, string> }> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("notes")
    .select("date, body")
    .eq("user_id", userId)
    .gte("date", desde)
    .lte("date", hasta);

  if (error) throw error;

  const bodies: Record<string, string> = {};
  for (const row of data ?? []) bodies[row.date] = row.body;

  return { bodies };
}

/**
 * La lista de mandado. Compartida por la pareja: las RLS de `lista` permiten
 * leer y escribir a cualquiera con un profile, a diferencia de `notes`.
 *
 * Devuelve "" si todavía no existe: la fila se crea en el primer guardado, no
 * al leer. Una lista vacía y una lista que no existen son el mismo estado para
 * quien la usa.
 */
export async function getLista(): Promise<string> {
  const supabase = await createClient();

  const { data, error } = await supabase.from("lista").select("body").maybeSingle();
  if (error) throw error;
  return data?.body ?? "";
}

/** Guarda la lista. Crea la fila si es la primera vez. */
export async function saveLista(body: string): Promise<void> {
  const supabase = await createClient();

  // maybeSingle + upsert sobre el índice singleton. La alternative sería un
  // select-then-insert, que tiene carrera entre dos personas guardando a la vez.
  const { data: actual } = await supabase
    .from("lista")
    .select("id")
    .maybeSingle();

  const { error } = actual
    ? await supabase.from("lista").update({ body }).eq("id", actual.id)
    : await supabase.from("lista").insert({ body });

  if (error) throw error;
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
