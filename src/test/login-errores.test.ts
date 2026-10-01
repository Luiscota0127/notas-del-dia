import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * El mensaje de error del login.
 *
 * Importa por una razón concreta: a tu esposa le salió "Error sending confirmation
 * email", un string en inglés de la API de Supabase. No dice qué pasó, no dice si
 * tiene algo que ver con eso, y hace que una app que funciona parezca rota.
 *
 * Estos tests fijan el texto para los fallos que se pueden dar. La fuente de
 * verdad es que un 500 de "enviar el correo" NUNCA es un problema del teléfono de
 * quien entra: es el SMTP del servidor, y se arregla en el panel.
 */

const raiz = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const acciones = readFileSync(join(raiz, "src", "app", "login", "acciones.ts"), "utf8");

describe("el error no muestra el texto crudo de Supabase", () => {
  it("el mensaje pasa por una función que traduce", () => {
    expect(acciones).toContain("mensajeLegible");
  });

  it("no devuelve `error.message` sin pasar por ahí", () => {
    // Si alguien reintroduce el `return { mensaje: error.message }`, el primer
    // fallo de este test lo agarra.
    expect(acciones).not.toMatch(/mensaje:\s*error\.message\s*;?\s*\n\s*\}/);
  });

  it("cada mensaje dice qué hacer, no solo qué pasó", () => {
    // La guía de copy del proyecto: un error incluye el siguiente paso.
    // Los mensajes están partidos en varias líneas, así que se juntan los
    // concatenados antes de mirar.
    const cuerpo = acciones.slice(acciones.indexOf("function mensajeLegible"));
    // Los mensajes están partidos en varias líneas y uno interpola el correo, así
    // que se juntan los concatenados con comillas y con plantillas.
    const conMensaje = [
      ...cuerpo.matchAll(/return\s+((?:"[^"]*"\s*\+?\s*)+);/g),
      ...cuerpo.matchAll(/return\s+(`[^`]*`);/g),
    ].map((m) => m[1].replace(/"\s*\+\s*"/g, "").replace(/[`"]/g, ""));
    expect(conMensaje.length).toBeGreaterThanOrEqual(4);
    for (const m of conMensaje) {
      const diceQueHacer =
        /Probá|Esperá|revisá|Revisala|agregarla|habilitarlas|arregla/i.test(m);
      expect(diceQueHacer, `el mensaje no dice qué hacer: "${m}"`).toBe(true);
    }
  });
});

describe("los fallos que se pueden dar", () => {
  it("cubre el 500 de SMTP, que es el que pasó", () => {
    // El caso verificado contra la API real: 500 unexpected_failure con
    // "Error sending confirmation email".
    expect(acciones).toContain("sending confirmation email");
  });

  it("cubre el rate limit", () => {
    expect(acciones).toContain("rate limit");
    expect(acciones).toContain("429");
  });

  it("cubre la URL de redirect no autorizada", () => {
    // Síntoma: el correo llega pero el link no vuelve a la app. Es un ajuste del
    // panel y el mensaje de Supabase no dice eso.
    expect(acciones).toContain("redirect");
    expect(acciones).toMatch(/autorizada/i);
  });

  it("cubre el signup apagado con un correo nuevo", () => {
    expect(acciones).toContain("signups not allowed");
  });

  it("un fallo desconocido conserva el mensaje de Supabase", () => {
    // Con un caso raro, un texto que no conozco puede servir más que uno que
    // supongo. Prefiero eso a tragármelo y mostrar "algo salió mal".
    expect(acciones).toMatch(/return error\.message \|\|/);
  });
});

describe("el mensaje de la UI no tapa el del servidor", () => {
  const form = readFileSync(join(raiz, "src", "components", "LoginForm.tsx"), "utf8");

  it("usa `r.mensaje` cuando viene", () => {
    expect(form).toContain("r.mensaje");
  });

  it("el fallback es un problema del servidor, no de quien entra", () => {
    expect(form).toMatch(/No pude mandar el correo\. Probá/);
  });
});