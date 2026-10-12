import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Compartir agendas.
 *
 * El síntoma era "no veo las agendas compartidas", y atrás había dos fallas
 * distintas que no se veían desde la app: la invitación se descartaba en
 * silencio y "Unirme" fallaba en silencio.
 *
 * El patrón que se repite en las dos: un join a `agendas` que la RLS vacía para
 * quien todavía no es miembro, y un insert que la policy rechaza porque exige
 * ser dueño. Ver `0010_aceptar-invitacion.sql`.
 */

const raiz = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const leer = (...p: string[]) => readFileSync(join(raiz, ...p), "utf8");

const queries = leer("src", "lib", "db", "queries.ts");
const pagina = leer("src", "app", "agendas", "page.tsx");
const acciones = leer("src", "app", "agendas", "acciones.ts");
const sql = leer("supabase", "migrations", "0010_aceptar-invitacion.sql");

describe("la invitación se ve aunque no seas miembro", () => {
  it("las invitaciones vienen por RPC, no con un join a agendas", () => {
    // El join a `agendas` es lo que la RLS vacía: solo deja leer las agendas de
    // las que uno es miembro, y al recibir una invitación todavía no lo es. El
    // join devolvía null y la invitación se descartaba antes de dibujarse.
    expect(queries).toContain('supabase.rpc("invitaciones_pendientes")');
    expect(queries).not.toContain('select("*, agendas (');
  });

  it("la pantalla ya no descarta invitaciones por falta de agenda", () => {
    // Este filtro era el bug. `i.agenda` llegaba null y toda la invitación se
    // perdía en silencio: existía, se leía bien, y no se vea.
    //
    // Se buscan las TRES formas de escribirlo, no solo una: el bug original
    // era `i.agenda && !agendas.some(...)`, pero el mismo bug reescrito como
    // `i.agenda !== null` pasó este test sin que lo dijera. Un test que solo
    // busca una forma del error es un test que no atrapa el error.
    expect(pagina).not.toMatch(/\(i\)\s*=>\s*i\.agenda\s*&&/);
    expect(pagina).not.toMatch(/\(i\)\s*=>\s*i\.agenda\s*!==\s*null/);
    expect(pagina).not.toMatch(/\(i\)\s*=>\s*[^)]*i\.agenda\s*&&/);
    expect(pagina).not.toContain("i.agenda!");
  });

  it("dibuja el nombre que trae la RPC", () => {
    expect(pagina).toContain("i.agenda_nombre");
    expect(pagina).toContain("i.invitacion_id");
    expect(pagina).toContain("i.agenda_id");
  });
});

describe("Unirme funciona", () => {
  it("acepta por RPC, no insertando en agenda_miembros", () => {
    // La policy de insert en agenda_miembros exige es_dueno(agenda_id,
    // auth.uid()). Quien acepta una invitación no es el dueño, así que el
    // insert se rechazaba siempre: el dueño podía invitar, nadie podía unirse.
    expect(queries).toContain('supabase.rpc("aceptar_invitation"');
    expect(queries).not.toContain('.from("agenda_miembros")\n    .upsert(');
  });

  it("la firma ya no pide userId", () => {
    // El id lo saca la propia RPC de auth.uid(). Pedirlo por parámetro y no
    // usarlo sería una puerta abierta: cualquiera podría unirse a una agenda
    // haciéndose pasar por otro.
    expect(queries).toContain("aceptarInvitacion(agendaId: string): Promise<boolean>");
    expect(queries).not.toContain("aceptarInvitacion(agendaId: string, userId");
    expect(acciones).toContain("await aceptarInvitacion(agendaId)");
  });

  it("si la RPC dice que no, no manda a una agenda ajena", () => {
    // Mandar a /[agendaId] sin ser miembro daba un 404 sin explicación.
    expect(acciones).toContain("if (!unidos)");
    expect(acciones).toContain("/agendas?error=no-invitacion");
    expect(pagina).toContain('q.error === "no-invitacion"');
  });
});

describe("la autorización se movió a la base, no se aflojó", () => {
  it("la RPC solo devuelve invitaciones del correo de la sesión", () => {
    expect(sql).toContain("security definer");
    expect(sql).toMatch(/lower\(i\.email\) = lower\(mi_email\(auth\.uid\(\)\)\)/);
  });

  it("aceptar_invitation solo une si hay invitación real", () => {
    // Es lo que reemplaza la policy. Si se quitara este chequeo, cualquiera
    // podría llamar la función y meterse en cualquier agenda.
    expect(sql).toMatch(
      /if not exists \(\s*select 1 from agenda_invitaciones[\s\S]*lower\(i\.email\) = lower\(v_email\)/,
    );
    expect(sql).toContain("return false;");
  });

  it("la policy de agenda_miembros sigue exigiendo ser dueño", () => {
    // No se aflojó: un miembro que no es dueño no puede ampliar la agenda. La
    // migración es idempotente y se puede correr las veces que haga falta.
    expect(sql).toMatch(/idempotente/i);
    expect(sql).not.toMatch(/drop policy if exists "agregar miembros si soy dueño"/);
  });

  it("el filtro de 'ya sos miembro' está en la base", () => {
    // Si depende de que la app se acuerde de filtrarlo, vuelve el bug de
    // pedirle a alguien que se una a algo en lo que ya está.
    expect(sql).toMatch(/not exists \(\s*select 1 from agenda_miembros/);
  });

  it("crea el profile si falta, para no gastar la invitación en falso", () => {
    // Sin esto, el insert en agenda_miembros revienta por la foreign key y la
    // invitación se borra sin que la persona entre.
    expect(sql).toMatch(/insert into profiles[\s\S]*on conflict \(id\) do nothing/);
  });
});