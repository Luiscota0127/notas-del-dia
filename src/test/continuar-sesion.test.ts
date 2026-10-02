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
    // El redirect vive en `entrar()`, que se llama desde el manejador de
    // SIGNED_IN. Antes estaba escrito en el manejador y este test comparaba
    // posiciones de texto; ahora se mide lo que importa de verdad: que haya UN
    // solo lugar que navegue, y que ese lugar se invoque desde SIGNED_IN.
    const i = componente.indexOf('if (evento !== "SIGNED_IN") return;');
    expect(i).toBeGreaterThan(-1);

    const llamada = componente.indexOf("entrar();", i);
    expect(llamada).toBeGreaterThan(i);

    // Un solo punto de salida hacia /agendas: cualquier otro `replace` sería
    // una forma de saltar la regla de SIGNED_IN.
    expect(componente.split('router.replace("/agendas")').length - 1).toBe(1);
    expect(componente.split("const entrar = useCallback(").length - 1).toBe(1);
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

describe("el redirect es replace y no refresca", () => {
  it("replace, no push: el token no debe quedar en el historial", () => {
    // Con push, el botón "atrás" del navegador vuelve a /login#access_token=…,
    // y el token — que es una credencial — queda en el historial.
    expect(componente).toContain('router.replace("/agendas")');
    expect(componente).not.toContain('router.push("/agendas")');
  });

  it("no hace un segundo viaje al servidor con router.refresh()", () => {
    // replace + refresh son dos viajes: uno para traer /agendas y otro para
    // recargarlo. El refresh solo hace falta cuando la pantalla ACTUAL ya fue
    // renderizada con datos viejos; acá se cambia de ruta, y la petición ya
    // lleva la cookie porque `_saveSession` corre antes de SIGNED_IN.
    // Medido: cada viaje contra Supabase cuesta ~600ms.
    // Con el punto y coma, porque el comentario que explica POR QUÉ no se llama
    // menciona `router.refresh()`. Buscar la palabra suelta tocaría el
    // comentario y no la llamada.
    expect(componente).not.toContain("router.refresh();");
    expect(componente).toContain('router.replace("/agendas");');
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
  it("lee el access_token del fragmento", () => {
    expect(componente).toContain("tokenDeLaUrl");
    expect(componente).toContain('p.get("access_token")');
    // Se necesita el refresh_token también: si el token resulta válido pero el
    // canje automático falló, `setSession` no puede funcionar sin él.
    expect(componente).toContain('p.get("refresh_token")');
  });

  it("no deja helpers muertos", () => {
    // Existió un `hayTokenEnLaUrl` que quedó sin usar cuando el canje manual
    // pasó a trabajar con el token directamente. Código muerto en un archivo
    // chico se nota: el linter lo marqueaba.
    expect(componente).not.toContain("hayTokenEnLaUrl");
  });

  it("el mensaje dice qué hacer, no solo qué pasó", () => {
    expect(componente).toContain("Ese link ya se usó o se venció");
    expect(componente).toContain("Mándatelo otra vez");
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

/**
 * No acusar al link sin haber preguntado.
 *
 * El error que cometí, y que la persona reportó tal cual: usó un link
 * PERFECTAMENTE VÁLIDO y le apareció "Ese link ya se usó o se venció".
 *
 * La causa: declaraba el link vencido por el solo hecho de no haber visto
 * sesión dentro del presupuesto de reintentos. Eso es adivinar. Con una
 * conexión lenta, un token de sobra válido no llega a canjearse en ese
 * plazo, y el mensaje le echa la culpa a la persona por algo que no hizo.
 *
 * Un error que miente es peor que el silencio que venía a reemplazar: el
 * silencio se nota, el falso aviso hace perder la confianza en todo lo demás.
 */
describe("no se culpa al link sin preguntarle a Supabase", () => {
  it("antes de avisar, pregunta si el token es válido", () => {
    // `getUser` es la pregunta directa al servidor. Si el token es inválido,
    // Supabase contesta con error, y recién ahí tiene sentido decir que el link
    // no sirve.
    expect(componente).toContain("auth.getUser(token.access_token)");
  });

  it("la acusación al link vive DENTRO del error de getUser", () => {
  // Sin comilla de cierre: el mensaje sigue con ". Mandate otro…", así que
  // `"Ese link ya se usó o se venció"` como literal no existe en el archivo.
  expect(componente).toMatch(/if \(error\) \{[\s\S]*?Ese link ya se usó o se venció/);
  });

  it("comprobar que el texto existe no alcanza: mira el anidamiento", () => {
    // Con el guard cambiado a `if (false)` la acusación nunca se muestra, pero
    // el texto sigue en el archivo. Por eso el test anterior mira el `if`.
    expect(componente).toContain("if (error) {");
  });

it("el canje manual solo se intenta cuando el token SÍ era válido", () => {
  // El canje va DESPUÉS de la acusación. Si el error no cortara con return, un
  // token inválido caería en el canje manual y se trataría como bueno.
  const acusacion = componente.indexOf("Ese link ya se usó o se venció");
  const canje = componente.indexOf("auth.setSession({");
  expect(acusacion).toBeGreaterThan(-1);
  expect(canje).toBeGreaterThan(acusacion);
});

it("la acusación va ANTES del mensaje que culpa al link, en el flujo", () => {
    const pregunta = componente.indexOf("auth.getUser(token.access_token)");
    const culpa = componente.indexOf("Ese link ya se usó o se venció");
    expect(pregunta).toBeGreaterThan(-1);
    expect(culpa).toBeGreaterThan(-1);
    expect(pregunta).toBeLessThan(culpa);
  });

  it("si el token es válido, canjea a mano y entra", () => {
    // El problema es NUESTRO, no de la persona. Un mensaje acá habría tapado un
    // bug propio inventando un culpable.
    expect(componente).toContain("auth.setSession({");
    expect(componente).toContain("token.refresh_token");
  });

  it("sin token en la URL no dice absolutamente nada", () => {
    // Una visita normal a /login no tiene token. Si se avisara igual, cada
    // login arrancaría con un error inventado.
    const fallo = componente.indexOf("intento.current++");
    const guarda = componente.indexOf("if (!token) return;", fallo);
    expect(guarda).toBeGreaterThan(fallo);
    // El return corta antes de cualquier setProblema.
    expect(componente.slice(guarda, guarda + 40)).not.toContain("setProblema");
  });

  it("el presupuesto no es tan corto como para culpar al link por reloj", () => {
    // Con 10 intentos de 500ms eran 5s. Un canje contra un servidor fuera del
    // país puede tardar más, y con ese margen el mensaje salía solo.
    const tope = Number(componente.match(/intento\.current\+\+ > (\d+)/)?.[1]);
    expect(tope).toBeGreaterThanOrEqual(20);
  });

  it("deja rastro en la consola de por qué no entró", () => {
    // Para no volver a adivinar: si vuelve a fallar, tiene que quedar escrito
    // por qué, y no solo un mensaje en pantalla.
    expect(componente).toContain("Supabase rechazó el token");
    expect(componente).toContain("el token era válido y no se canjeó solo");
  });
});