import { redirect } from "next/navigation";

import { hasSupabaseEnv } from "./client";
import { createClient } from "./server";
import type { Agenda, Invitacion, Miembro, Note, Profile } from "./types";

export type { Agenda, Invitacion, Miembro, Note, Profile };

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

/**
 * El profile propio. Lo crea el trigger handle_new_user; si no existe todavía
 * (alta recién hecha), lo insertamos para no bloquear la primera nota.
 */
export async function getProfile(userId: string): Promise<Profile> {
  const supabase = await createClient();
  const {
    data,
  } = await supabase.from("profiles").select("*").eq("id", userId).maybeSingle();

  if (data) return data;

  const {
    data: created,
    error,
  } = await supabase.from("profiles").insert({ id: userId, name: "Yo" }).select("*").single();

  if (error) throw error;
  return created;
}

// ---------------------------------------------------------------------------
// Agendas
// ---------------------------------------------------------------------------

/**
 * Las agendas de las que uno es miembro, con quién más está adentro.
 *
 * La lista es la pantalla de inicio de la app, así que se ordena por cuándo se
 * unió a cada una: la primera es la de siempre y no tiene que cambiar nunca.
 */
export async function getAgendas(userId: string): Promise<Array<Agenda & { miembros: Profile[] }>> {
  const supabase = await createClient();

  // Las agendas: la RLS ya filtra por membresía, así que no hace falta filtrar acá.
  const { data: agendas, error } = await supabase
    .from("agendas")
    .select("*, agenda_miembros (profile_id, profiles (id, name, color))")
    .order("created_at", { ascending: true });

  if (error) throw error;

  const resultado: Array<Agenda & { miembros: Profile[] }> = [];
  for (const agenda of agendas ?? []) {
    const miembros = (agenda.agenda_miembros ?? [])
      .map((m) => m.profiles as unknown as Profile)
      .filter((p): p is Profile => Boolean(p?.id))
      .sort((a, b) => a.name.localeCompare(b.name));
    resultado.push({ ...agenda, miembros });
  }
  return resultado;
}

/**
 * Una agenda por id, o `null` si no existe o no sos miembro.
 *
 * Los dos casos sedevuelven igual a propósito: la RLS no distingue "no existe"
 * de "no tenés permiso", y fingir que sí obligaría a una consulta extra para
 * confirmar algo que la base ya decidió no revelar.
 */
export async function getAgenda(agendaId: string): Promise<Agenda | null> {
  const supabase = await createClient();
  const {
    data,
  } = await supabase.from("agendas").select("*").eq("id", agendaId).maybeSingle();
  return data;
}

/** Los miembros de una agenda, para mostrar "quién más ve esto". */
export async function getMiembros(agendaId: string): Promise<Profile[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("agenda_miembros")
    .select("profiles (id, name, color)")
    .eq("agenda_id", agendaId);

  if (error) throw error;
  return (data ?? [])
    .map((m) => m.profiles as unknown as Profile)
    .filter((p): p is Profile => Boolean(p?.id))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * La agenda donde cae el `/` y el link "volver": la primera en la que estás.
 *
 * No es "la más reciente": cambiar de agenda la haría saltar debajo de los dedos
 * de quien está escribiendo. La primera es estable y es la que uno ya tiene
 * abierta casi siempre.
 */
export async function getAgendaPorDefecto(userId: string): Promise<Agenda | null> {
  const agendas = await getAgendas(userId);
  return agendas[0] ?? null;
}

/** Crea una agenda con uno como dueño, y ya es miembro. */
export async function createAgenda(userId: string, name: string): Promise<Agenda | null> {
  const supabase = await createClient();

  const {
    data: agenda,
    error,
  } = await supabase.from("agendas").insert({ name, created_by: userId }).select("*").single();

  if (error) throw error;

  // El insert de la membresía no puede depender de la agenda: la RLS de
  // agenda_miembros exige es_dueno, y el dueño todavía no es nadie en esa tabla.
  const { error: errorMiembro } = await supabase
    .from("agenda_miembros")
    .insert({ agenda_id: agenda.id, profile_id: userId, rol: "dueno" });

  if (errorMiembro) throw errorMiembro;
  return agenda;
}

export async function renameAgenda(agendaId: string, name: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("agendas").update({ name }).eq("id", agendaId);
  if (error) throw error;
}

// --- invitaciones ------------------------------------------------------------

/** Invita a alguien por email. No manda el correo: eso es una función aparte. */
export async function invitar(agendaId: string, userId: string, email: string) {
  const supabase = await createClient();
  const {
    error,
  } = await supabase
    .from("agenda_invitaciones")
    .insert({ agenda_id: agendaId, email: email.toLowerCase(), invited_by: userId });

  if (error) throw error;
}

/**
 * Las invitaciones que te hicieron a vos, para el aviso de "te invitaron a X".
 *
 * NO tira si la consulta falla. Esta función vive en la pantalla de inicio, y
 * `/agendas` es justamente donde se entra a una agenda compartida: si fallar
 * al buscar invitaciones tumba la pantalla, no se puede entrar a ninguna agenda
 * que sea. Peor todavía: el síntoma es un 404, porque el error sube por la page
 * y no hay nada que distinguishes de "esta agenda no existe".
 *
 * Degradar a "no tenés invitaciones" es lo correcto acá. Una invitación perdida
 * se vuelve a mandar; una app que no abre, no.
 */
export async function getInvitacionesPara(userId: string): Promise<
  Array<Invitacion & { agenda: Agenda | null }>
> {
  const supabase = await createClient();
  const email = (await getUser())?.email ?? "";

  if (!email) return [];

  const { data, error } = await supabase
    .from("agenda_invitaciones")
    .select("*, agendas (id, name, color, created_by, created_at)")
    .ilike("email", email);

  if (error) {
    console.error("getInvitacionesPara:", error.message);
    return [];
  }

  return (data ?? []).map((i) => ({
    ...i,
    agenda: (i.agendas as unknown as Agenda) ?? null,
  }));
}

/** Las invitaciones que están esperando, para la pantalla de ajustes. */
export async function getInvitacionesDe(agendaId: string): Promise<Invitacion[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("agenda_invitaciones")
    .select("*")
    .eq("agenda_id", agendaId)
    .order("created_at", { ascending: false });

  // Mismo criterio que getInvitacionesPara: los ajustes de una agenda no pueden
  // caerse porque la tabla de invitaciones esté en un mal momento. La agenda se
  // sigue pudiendo usar.
  if (error) {
    console.error("getInvitacionesDe:", error.message);
    return [];
  }
  return data ?? [];
}

export async function revocarInvitacion(agendaId: string, email: string) {
  const supabase = await createClient();
  const {
    error,
  } = await supabase
    .from("agenda_invitaciones")
    .delete()
    .eq("agenda_id", agendaId)
    .eq("email", email.toLowerCase());

  if (error) throw error;
}

/**
 * Acepta una invitación: te suma a la agenda y borra el invitation.
 *
 * Las dos cosas en una transacción de la API no se puede, así que el orden es
 * miembro primero. Si el borrado falla, queda una invitación que ya no sirve:
 * volver a aceptar es un no-op porque la primary key de agenda_miembros ya
 * tiene la fila. Al revés, borrar primero y fallar el insert deja a alguien
 * invited sin poder entrar nunca.
 */
export async function aceptarInvitacion(agendaId: string, userId: string) {
  const supabase = await createClient();

  const { error: errorMiembro } = await supabase
    .from("agenda_miembros")
    .upsert(
      { agenda_id: agendaId, profile_id: userId, rol: "miembro" },
      { onConflict: "agenda_id,profile_id" },
    );

  if (errorMiembro) throw errorMiembro;

  const email = (await getUser())?.email ?? "";
  await supabase
    .from("agenda_invitaciones")
    .delete()
    .eq("agenda_id", agendaId)
    .ilike("email", email);
}

// ---------------------------------------------------------------------------
// Notas
// ---------------------------------------------------------------------------

/**
 * Las notas son de la agenda, no de la persona.
 *
 * No queda rastro de `user_id` en las queries: la pertenencia la decide la RLS a
 * través de `agenda_miembros`, y filtrar por persona sería un segundo criterio
 * capaz de contradecir al primero.
 */

/** La nota de un día. `null` si nunca se escribió: el editor crea la plantilla. */
export async function getNote(agendaId: string, date: string): Promise<Note | null> {
  const supabase = await createClient();
  const {
    data,
  } = await supabase.from("notes").select("*").eq("agenda_id", agendaId).eq("date", date).maybeSingle();
  return data;
}

/**
 * Un rango de notas, para el calendario y el buscador.
 *
 * Devuelve solo los bodies. Los contadores se derivan en el cliente con el
 * mismo parse: hacerlo en los dos lados es el mismo cálculo dando dos
 * resultados distintos si alguno cambia.
 */
export async function getNotes(
  agendaId: string,
  desde: string,
  hasta: string,
): Promise<{ bodies: Record<string, string> }> {
  const supabase = await createClient();

  const {
    data,
    error,
  } = await supabase
    .from("notes")
    .select("date, body")
    .eq("agenda_id", agendaId)
    .gte("date", desde)
    .lte("date", hasta);

  if (error) throw error;

  const bodies: Record<string, string> = {};
  for (const row of data ?? []) bodies[row.date] = row.body;

  return { bodies };
}

/** Crea o actualiza. El body entero, porque es la única fuente de verdad. */
export async function saveNote(agendaId: string, date: string, body: string): Promise<void> {
  const supabase = await createClient();

  const {
    error,
  } = await supabase.from("notes").upsert(
    { agenda_id: agendaId, date, body },
    { onConflict: "agenda_id,date" },
  );

  if (error) throw error;
}

// ---------------------------------------------------------------------------
// Lista de mandado
// ---------------------------------------------------------------------------

/**
 * La lista de la agenda. Compartida por los miembros, como la agenda misma.
 *
 * Devuelve "" si todavía no existe: la fila se crea en el primer guardado, no
 * al leer. Una lista vacía y una lista que no existen son el mismo estado para
 * quien la usa.
 */
export async function getLista(agendaId: string): Promise<string> {
  const supabase = await createClient();

  const {
    data,
    error,
  } = await supabase.from("lista").select("body").eq("agenda_id", agendaId).maybeSingle();

  if (error) throw error;
  return data?.body ?? "";
}

/** Guarda la lista. Crea la fila si es la primera vez para esta agenda. */
export async function saveLista(agendaId: string, body: string): Promise<void> {
  const supabase = await createClient();

  // maybeSingle + update sobre el índice (agenda_id). La alternativa sería un
  // select-then-insert, que tiene carrera entre dos personas guardando a la vez.
  const {
    data: actual,
  } = await supabase.from("lista").select("id").eq("agenda_id", agendaId).maybeSingle();

  const { error } = actual
    ? await supabase.from("lista").update({ body }).eq("id", actual.id)
    : await supabase.from("lista").insert({ agenda_id: agendaId, body });

  if (error) throw error;
}
