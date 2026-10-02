import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * El cierre del magic link.
 *
 * El bug que rompía el login entero: `INITIAL_SESSION` se dispara SIEMPRE, en
 * cada carga, y en el caso del magic link llega cuando todavía NO hay sesión —
 * la detección del fragmento de la URL va después.
 *
 * El componente lo tomaba por "ya entró" y redirigía a /agendas. Sin cookie, el
 * proxy rebotaba a /login, y como `listo` ya era `true` el reintento no corría
 * nunca. El token se quedaba en la URL sin procesarse.
 *
 * El síntoma era el peor posible: el correo llegaba, el link tenía el token
 * correcto, y no pasaba absolutamente nada.
 */

const raiz = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const leer = (...p: string[]) => readFileSync(join(raiz, ...p), "utf8");

const componente = leer("src", "components", "ContinuarSesion.tsx");

describe("INITIAL_SESSION no es 'ya entraste'", () => {
  it("nunca redirige por INITIAL_SESSION", () => {
    // La forma original del bug. Si vuelve a aparecer, el login se rompe igual.
    expect(componente).not.toMatch(
      /evento === "SIGNED_IN" \|\| evento === "INITIAL_SESSION"/,
    );
  });

  it("solo SIGNED_IN dispara el redirect", () => {
    expect(componente).toMatch(/if \(evento !== "SIGNED_IN"\) return;/);
  });

  it("el redirect está dentro del manejador de SIGNED_IN", () => {
    const i = componente.indexOf('if (evento !== "SIGNED_IN") return;');
    const redirect = componente.indexOf('router.replace("/agendas")', i);
    expect(i).toBeGreaterThan(-1);
    expect(redirect).toBeGreaterThan(i);
    // Y no puede haber otro redirect fuera de ese bloque.
    expect(componente.split('router.replace("/agendas")').length - 1).toBe(2);
  });
});

describe("el reintento no se desactiva antes de tiempo", () => {
  it("pregunta hasta que la sesión exista de verdad", () => {
    // El canje del hash es asíncrono: un solo intento a los 800ms puede caer
    // antes de que termine. Setear `listo` en el primer SIGNED_IN es correcto;
    // lo que estaba mal era hacerlo también en INITIAL_SESSION.
    expect(componente).toContain("setInterval");
    expect(componente).toMatch(/getSession\(\)/);
  });

  it("se detiene solo, para no preguntar eternamente", () => {
    expect(componente).toMatch(/intento\.current\+\+ > \d+/);
    expect(componente).toContain("clearInterval(id)");
  });

  it("no reintenta si ya se resolvió", () => {
    expect(componente).toMatch(/if \(listo\) return;/);
  });
});

describe("el redirect es replace y refresca", () => {
  it("replace, no push: el token no debe quedar en el historial", () => {
    // Con push, el botón "atrás" del navegador vuelve a /login#access_token=…,
    // y el token — que es una credencial — queda en el historial.
    expect(componente).toContain('router.replace("/agendas")');
    expect(componente).not.toContain('router.push("/agendas")');
  });

  it("refresh: el server component tiene que volver a leer la cookie", () => {
    expect(componente).toContain("router.refresh()");
  });
});