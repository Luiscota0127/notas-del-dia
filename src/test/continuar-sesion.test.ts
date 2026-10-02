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

/**
 * El link que no sirve.
 *
 * Los magic links son de un solo uso: abrir el mismo correo en dos dispositivos
 * invalida el token del segundo. El síntoma era una pantalla muda en /login con
 * un token muerto pegado en la barra, sin ninguna forma de saber que había que
 * pedir otro link. Parece una app colgada.
 *
 * La pista de que el token no sirvió es el hash pegado: en `@supabase/auth-js`,
 * `_getSessionFromURL` limpia `window.location.hash` solo cuando el canje tiene
 * éxito.
 */
describe("un link que no sirve se avisa, no se ignora", () => {
  it("detecta el token en el hash y en el query", () => {
    expect(componente).toContain("hayTokenEnLaUrl");
    expect(componente).toContain('hash.includes("access_token")');
    // El SDK también redirige con #error=... cuando el link venció, así que
    // ese caso tiene que contar como link, no como visita normal.
    expect(componente).toContain('hash.includes("error")');
    expect(componente).toContain('search.includes("code=")');
  });

  it("solo avisa si hay un token en la URL", () => {
    // Una visita normal a /login no tiene token: no hay nada que avisar, y
    // hacerlo convertiría cada login en un error.
    expect(componente).toMatch(/if \(hayTokenEnLaUrl\(\)\) \{[\s\S]*setLinkMuerto\(true\)/);
  });

  it("pregunta por el token al fallar, no al montar", () => {
    // El token puede llegar DESPUÉS de que la página ya esté en /login. Si la
    // comprobación se hiciera una sola vez al montar, ahí daría "no había
    // link", el aviso no aparecería nunca, y quedaría la pantalla muda otra
    // vez: el bug exacto que se está arreglando.
    const fallo = componente.indexOf("intento.current++ > 10");
    const pregunta = componente.indexOf("hayTokenEnLaUrl()", fallo);
    expect(fallo).toBeGreaterThan(-1);
    expect(pregunta).toBeGreaterThan(fallo);

    // Y no puede quedar una captura por adelantado que se pueda quedar vieja.
    expect(componente).not.toContain("veniamoDeUnLink");
  });

  it("el mensaje dice qué hacer, no solo qué pasó", () => {
    expect(componente).toContain("Ese link ya se usó o se venció");
    expect(componente).toContain("Mandate otro");
  });

  it("limpia el token muerto de la barra", () => {
    expect(componente).toContain("limpiarTokenDeLaUrl");
    expect(componente).toContain('window.history.replaceState(null, "", window.location.pathname)');
  });

  it("limpia con replaceState, no reescribiendo la URL", () => {
    // Con location.href would a page load: recargaría /login con el mismo
    // token roto y el aviso volvería a aparecer en bucle.
    expect(componente).not.toMatch(/location\.href\s*=/);
  });

  it("limpia SOLO cuando falló, nunca antes", () => {
    // El orden importa: si limpiara el hash al montar, se llevaría por delante
    // un token válido que todavía no terminó de canjearse y rompería el link
    // justo en el caso en que funciona.
    // Ojo con el patrón: `limpiarTokenDeLaUrl()` aparece DENTRO de su propia
    // definición (`function limpiarTokenDeLaUrl() {`). Con el punto y coma ya
    // es la invocación, que es lo que se quiere medir.
    const llamada = componente.indexOf("limpiarTokenDeLaUrl();");
    expect(llamada).toBeGreaterThan(-1);
    // La llamada vive dentro del cuerpo del setInterval, no en el efecto que
    // se arma al montar: es decir, DESPUÉS de haber preguntado por la sesión.
    expect(llamada).toBeGreaterThan(componente.indexOf("setInterval"));
  });

  it("avisa con role=alert para que se anuncie sin buscarlo", () => {
    expect(componente).toContain('role="alert"');
  });
});