import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * "Crear agenda" fallaba siempre y no se veía ni leyendo ni compilando.
 *
 * La policy de insert en `agenda_miembros` exige `es_dueno(agenda_id,
 * auth.uid())`, y `es_dueno` pregunta si esa fila YA existe. Al crear, no
 * existe: es lo que se está insertando. El primer insert pasaba, el segundo lo
 * rechazaba Postgres, y la agenda quedaba huérfana — invisible para todos.
 *
 * Estos tests no pueden reproducir el deadlock —eso necesita Postgres— pero sí
 * fijar que el alta no vuelva a armarse con dos inserts desde el cliente, que es
 * exactamente la forma que lo causaba.
 */

const raiz = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const queries = readFileSync(join(raiz, "src", "lib", "db", "queries.ts"), "utf8");

describe("crear una agenda no se puede armar con dos inserts", () => {
  // Solo esa función: un slice hasta el final del archivo agarra media base de
  // datos y el test pasa o falla por cosas que no son suyas.
  const inicio = queries.indexOf("export async function createAgenda");
  const cuerpo = queries.slice(inicio, queries.indexOf("export async function renameAgenda"));

  it("usa la función crear_agenda en vez de insertar directamente", () => {
    // Con dos inserts, el segundo siempre es rechazado por la RLS: el dueño no
    // puede ser miembro de una agenda que todavía no tiene miembros.
    expect(cuerpo).toContain('supabase.rpc("crear_agenda"');
  });

  it("no inserta en agenda_miembros desde el cliente", () => {
    expect(cuerpo).not.toContain('.from("agenda_miembros")');
  });

  it("normaliza que la función devuelva objeto o array", () => {
    // PostgREST devuelve array para funciones que retornan SETOF y objeto para
    // las que retornan fila única. Depender de cuál es no hace falta.
    expect(cuerpo).toContain("Array.isArray(data)");
  });
});
