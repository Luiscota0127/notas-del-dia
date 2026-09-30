import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * La clave de acceso no puede llegar al bundle del navegador.
 *
 * Ese es el motivo de que la validación viva en una server action y no en el
 * login: una clave validada en el cliente está en el JavaScript que se descarga,
 * y se lee con un clic en "ver fuente". Sería peor que no tenerla, porque
 * además da la sensación de que la app está cerrada.
 *
 * Estos tests miran el código, no el bundle compilado: no hay build en el ciclo
 * de tests. Fijan la regla que hace que el bundle salga limpio, que es lo que
 * puede romperse por accidente.
 */

const raiz = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const leer = (...p: string[]) => readFileSync(join(raiz, ...p), "utf8");

const acceso = leer("src", "lib", "acceso.ts");
const acciones = leer("src", "app", "login", "acciones.ts");
const form = leer("src", "components", "LoginForm.tsx");
const page = leer("src", "app", "login", "page.tsx");

describe("la clave no viaja al cliente", () => {
  it("la acción del login es una server action", () => {
    expect(acciones.startsWith('"use server"')).toBe(true);
  });

  it("la variable se lee en un módulo de servidor, sin NEXT_PUBLIC_", () => {
    // Con el prefijo, Next mete el VALOR en el bundle y se lee con un clic en
    // "ver fuente". Sería peor que no tener clave.
    expect(acceso).toContain("process.env.ACCESO_CLAVE");
    expect(acceso).not.toContain("NEXT_PUBLIC_ACCESO_CLAVE");
  });

  it("el formulario no toca la clave", () => {
    // Si el cliente comparara, tendría la clave a mano.
    //
    // Busco los nombres de los helpers, no la palabra "acceso": esa aparece en
    // los textos de la pantalla ("Clave de acceso") y la primera versión de este
    // test fallaba por mis propios comentarios.
    expect(form).not.toContain("ACCESO_CLAVE");
    expect(form).not.toContain("@/lib/acceso");
    expect(form).not.toContain("hayClaveDeAcceso");
    expect(form).not.toContain("claveDeAcceso");
    expect(form).not.toMatch(/clave\s*===|===\s*clave/);
  });

  it("el envío del link pasa por la acción, no por el cliente de Supabase", () => {
    expect(form).toContain("pedirLink");
    expect(form).not.toContain("createClient");
    expect(form).not.toContain("signInWithOtp");
  });

  it("la página solo pasa un booleano al formulario", () => {
    expect(page).toContain("hayClaveDeAcceso()");
    expect(page).not.toContain("ACCESO_CLAVE");
  });
});

describe("sin clave configurada no hay puerta", () => {
  it("la acción deja pasar cuando la variable no está", () => {
    // Si alguien despliega sin la variable, la app queda trancada para siempre.
    // El default tiene que ser abierta.
    expect(acciones).toMatch(/if \(!esperado\) \{/);
    expect(acciones).not.toMatch(/if \(esperado\) \{\s*return \{ ok: false/);
  });

  it("el campo de clave solo aparece si hace falta", () => {
    expect(form).toContain("requiereClave &&");
  });

  it("hayClaveDeAcceso es cierto solo si hay valor", () => {
    // Una variable puesta pero vacía no es una puerta: sería un campo que pide
    // una clave que nunca va a coincidir.
    expect(acceso).toMatch(/return v \? v : undefined;/);
  });
});
