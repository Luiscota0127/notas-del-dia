import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Toda tabla con un trigger `touch_updated_at` tiene que declarar `updated_at`.
 *
 * `agendas` no lo hacía: el trigger escribía en una columna que no existía y
 * cualquier UPDATE fallaba con 42703. Renombrar una agenda reventaba, y como el
 * trigger es BEFORE UPDATE el INSERT pasaba igual — crear la agenda andaba bien
 * y el error no parecía tener nada que ver.
 *
 * Se lee el SQL de las migraciones porque el schema real no vive en el repo. Y
 * tiene sentido leerlo: el trigger compila perfecto sin la columna, que es
 * exactamente por lo que el bug llegó a producción.
 */

const raiz = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const dir = join(raiz, "supabase", "migrations");

const migraciones = readdirSync(dir)
  .filter((f) => f.endsWith(".sql"))
  .sort()
  .map((f) => ({ nombre: f, sql: readFileSync(join(dir, f), "utf8") }));

/** Todas las declaraciones `create table`, con su cuerpo. */
function tablas(): Map<string, string> {
  const out = new Map<string, string>();
  for (const { sql } of migraciones) {
    for (const m of sql.matchAll(/create table (?:if not exists )?(\w+)\s*\(([\s\S]*?)\n\);/g)) {
      out.set(m[1], (out.get(m[1]) ?? "") + m[2]);
    }
  }
  return out;
}

/** Las tablas que tienen un BEFORE UPDATE con touch_updated_at. */
function conTrigger(): Set<string> {
  const out = new Set<string>();
  for (const { sql } of migraciones) {
    for (const m of sql.matchAll(
      /create trigger\s+\w+\s+before update on (\w+)[\s\S]{0,120}?touch_updated_at\(\)/g,
    )) {
      out.add(m[1]);
    }
  }
  return out;
}

describe("el contrato de touch_updated_at", () => {
  const declaradas = tablas();
  const disparadas = conTrigger();

  it("se detectaron las tablas con trigger", () => {
    // Si el matching se rompe, los tests de abajo pasan sin mirar nada, que es
    // peor que no tenerlos.
    expect(disparadas.size).toBeGreaterThan(0);
    expect([...disparadas].sort()).toEqual(
      ["agendas", "lista", "notes", "profiles"].filter((t) => disparadas.has(t)),
    );
  });

  it.each([...disparadas])("%s declara updated_at", (tabla) => {
    const cuerpo = declaradas.get(tabla);
    expect(cuerpo, `no encontré la definición de ${tabla}`).toBeDefined();
    expect(cuerpo).toMatch(/^\s*updated_at\s+timestamptz/m);
  });

  it("touch_updated_at asigna new.updated_at", () => {
    const sql = migraciones.map((m) => m.sql).join("\n");
    const cuerpo = sql.match(
      /create or replace function touch_updated_at[\s\S]*?\$\$([\s\S]*?)\$\$/,
    )?.[1];
    expect(cuerpo).toContain("new.updated_at");
  });
});

describe("las migraciones están en orden", () => {
  it("numeradas y sin huecos", () => {
    // Un hueco significa que hay una migración aplicada que no está en el repo,
    // o al revés. Cualquiera de las dos es un problema difícil de debuggear.
    const numeros = migraciones.map((m) => Number(m.nombre.slice(0, 4)));
    expect(numeros).toEqual(
      Array.from({ length: numeros.length }, (_, i) => numeros[0] + i),
    );
  });
});
