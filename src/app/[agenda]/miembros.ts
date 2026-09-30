import { getMiembros } from "@/lib/db/queries";

/**
 * Los datos de "quién está en esta agenda" que el navbar y el editor repiten.
 *
 * Va aparte de las pages porque Next no permite exportar helpers desde un
 * `page.tsx`: todo lo que no sea el default o metadata se ignora o rompe el
 * typecheck.
 */

export type Miembro = { id: string; name: string; color: string };

/** El profile propio, o un placeholder si la RLS no lo trajo. */
export function miembroPropio(userId: string, miembros: Miembro[]): Miembro {
  return miembros.find((m) => m.id === userId) ?? { id: userId, name: "Yo", color: "#f59e0b" };
}

/**
 * Alguien más en la agenda, para el subtítulo "Compartida con X".
 *
 * Con más de dos miembros esto muestra solo el primero: es un subtítulo, no un
 * listado, y la agenda tiene su propia pantalla con la lista completa.
 */
export function otroMiembro(userId: string, miembros: Miembro[]): Miembro | null {
  return miembros.find((m) => m.id !== userId) ?? null;
}

/**
 * "Nahomi y Luis", "Nahomi, Luis y Ana".
 *
 * La RLS de `agenda_miembros` ya limita esto a las agendas de las que sos
 * miembro, así que la lista nunca incluye gente ajena.
 */
export function nombresDe(miembros: Miembro[], yoId: string): string {
  const otros = miembros.filter((m) => m.id !== yoId).map((m) => m.name);
  if (otros.length === 0) return "";
  if (otros.length === 1) return otros[0];
  return `${otros.slice(0, -1).join(", ")} y ${otros[otros.length - 1]}`;
}

export async function miembrosDe(agendaId: string): Promise<Miembro[]> {
  const miembros = await getMiembros(agendaId);
  return miembros.map((m) => ({ id: m.id, name: m.name, color: m.color }));
}
