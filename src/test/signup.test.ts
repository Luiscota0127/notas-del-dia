import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * El nombre en el alta.
 *
 * Sin esto, el profile se arma con el prefijo del correo: alguien entra, la ve
 * como "luiscota" en la agenda, y tiene que ir a Ajustes a cambiarlo. Mientras
 * tanto, la otra persona la ve con ese nombre.
 *
 * El nombre va en `options.data` de `signInWithOtp`, que Supabase guarda en
 * `raw_user_meta_data` y de donde lo lee el trigger `handle_new_user`.
 *
 * Y hay una trampa que conviene fijar: ese metadata SOLO se aplica cuando la
 * cuenta se crea. Si el correo ya existe, Supabase lo ignora en silencio. Por eso
 * la pantalla dice "solo la primera vez" en vez de prometer que se cambia el
 * nombre — si no, alguien escribe su nombre, no pasa nada, y piensa que está roto.
 */

const raiz = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const leer = (...p: string[]) => readFileSync(join(raiz, ...p), "utf8");

const acciones = leer("src", "app", "login", "acciones.ts");
const form = leer("src", "components", "LoginForm.tsx");

describe("el nombre viaja al crear la cuenta", () => {
  it("va en options.data, que es donde lo lee el trigger", () => {
    expect(acciones).toMatch(/options:\s*\{[\s\S]*\.\.\.\(data \? \{ data \} : \{\}\)/);
  });

  it("se corta a 60 caracteres antes de mandarlo", () => {
    // La columna de profiles.name no tiene límite en la base; el límite está en
    // el input. Si alguien lo manda por otro lado, esto es lo que evita un
    // nombre de 4000 caracteres en la agenda.
    expect(acciones).toContain("slice(0, 60)");
  });

  it("solo se manda en el modo crear", () => {
    expect(form).toMatch(/nombre: creando \? nombre : undefined/);
  });

  it("la pantalla aclara que el nombre es solo de la primera vez", () => {
    // Sin esto, alguien que ya tiene cuenta escribe su nombre, no ocurre nada, y
    // la app parece estar rota.
    expect(form).toContain("solo se usa la primera vez");
  });
});

describe("volver a entrar no pide nombre", () => {
  it("el modo entrar es el que arranca", () => {
    // Volver es el caso frecuente: arrancar en "crear cuenta" le cobra un clic
    // extra a quien solo quiere entrar.
    expect(form).toMatch(/useState\(false\)/);
  });

  it("el campo de nombre solo existe en el modo crear", () => {
    expect(form).toMatch(/\{creando && \(\s*<div>\s*<label htmlFor="nombre"/);
  });
});

describe("el switch entre modos", () => {
  it("hay un botón para pasar de un modo al otro", () => {
    expect(form).toContain("Crear una cuenta");
    expect(form).toContain("Ya tengo cuenta, entrar");
  });

  it("limpia el error al cambiar de modo", () => {
    // Si no, queda "esa clave no es correcta" de un modo pegado en el otro.
    expect(form).toMatch(/setCreando\(!creando\);\s*setError\(null\)/);
  });
});
