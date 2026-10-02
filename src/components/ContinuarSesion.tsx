"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import { createClient } from "@/lib/db/client";

/**
 * Cierra el ciclo del magic link.
 *
 * El problema: /login decide si hay sesión en el servidor, y eso corre ANTES de
 * que el JavaScript procese el token de la URL. El servidor no lo ve, renderiza
 * el login, y después el cliente canjea el token y pone la cookie... pero nadie
 * vuelve a preguntar, así que la pantalla queda en login con la sesión ya creada.
 *
 * Con la confirmación de email apagada el token viene en el hash o en el query;
 * con confirmación prendida hay que abrir el correo y caer acá de nuevo. En los
 * dos casos el canje es del lado del cliente.
 */

/**
 * El access_token del fragmento, si hay uno.
 *
 * Se devuelve el refresh_token también porque, si el token resulta válido pero
 * el canje automático falló, `setSession` los necesita a los dos.
 */
function tokenDeLaUrl() {
  const bruto = window.location.hash.replace(/^#/, "");
  if (!bruto) return null;

  const p = new URLSearchParams(bruto);
  const access_token = p.get("access_token");
  if (!access_token) return null;

  return { access_token, refresh_token: p.get("refresh_token") ?? "" };
}

/**
 * Saca el token muerto de la URL.
 *
 * Recién cuando ya sabemos que no sirvió. Si se limpiara antes, se llevaría
 * encima un token válido que todavía no terminó de canjearse: el link se
 * rompería justo en el caso en que funciona.
 *
 * `replaceState` y no `location.href`: no deja una entrada en el historial a la
 * que volver con el mismo token roto.
 */
function limpiarTokenDeLaUrl() {
  window.history.replaceState(null, "", window.location.pathname);
}

export function ContinuarSesion() {
  const router = useRouter();
  const [listo, setListo] = useState(false);
  const [problema, setProblema] = useState<string | null>(null);
  const intento = useRef(0);

  // Sale de acá, en un solo lugar, a donde sea que toque ir.
  //
  // useCallback y no una función suelta: los dos efectos la necesitan, y sin
  // esto el linter avisa de que falta como dependencia.
  const entrar = useCallback(() => {
    setListo(true);
    // replace, no push: el link del magic no debe quedar en el historial.
    router.replace("/agendas");
    // refresh: el server component vuelve a leer la cookie y deja de mandar a
    // /login.
    router.refresh();
  }, [router]);

  useEffect(() => {
    const supabase = createClient();

    // onAuthStateChange cubre el canje del token: Supabase dispara
    // INITIAL_SESSION al arrancar y SIGNED_IN cuando el link se procesa.
    //
    // La clave de todo esto: **INITIAL_SESSION no significa "hay sesión"**.
    // Se dispara siempre, en cada carga, y en el caso del magic link llega
    // cuando todavía NO hay sesión; la detección del fragmento de la URL va
    // después.
    //
    // Por eso antes se redirigía con `evento === "INITIAL_SESSION"` incluido:
    // la app saltaba a /agendas sin cookie, el proxy la rebotaba a /login, y
    // como `listo` ya era true el reintento de abajo nunca corría. El token
    // quedaba en la URL sin procesarse nunca. Login roto de punta a punta.
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((evento) => {
      if (evento !== "SIGNED_IN") return;
      entrar();
    });

    return () => subscription.unsubscribe();
  }, [entrar]);

  useEffect(() => {
    // El caso "ya tenías sesión y volvés al login" no dispara SIGNED_IN, solo
    // INITIAL_SESSION. Y el canje del hash es asíncrono, así que hay que
    // preguntar más de una vez hasta que la sesión exista de verdad.
    if (listo) return;

    const id = setInterval(async () => {
      if (intento.current++ > 20) {
        clearInterval(id);

        // Agotado el presupuesto y no hay sesión. NO se da por hecho que el link
        // está muerto: se PREGUNTA a Supabase si el token sirve.
        //
        // Antes se hacía al revés, y era mentira. Se declaraba el link vencido
        // por el solo hecho de no haber visto sesión a los cinco segundos. Con
        // un link perfectamente válido pero una conexión lenta, el canje no
        // había terminado y el mensaje acusaba a la persona de algo que no
        // había hecho. Peor que no avisar nada.
        const token = tokenDeLaUrl();
        if (!token) return;

        const supabase = createClient();

        // 1. ¿El token es válido? Si no lo es, recién ahí se acusa al link.
        const { error } = await supabase.auth.getUser(token.access_token);
        if (error) {
          console.error("[login] Supabase rechazó el token:", error.message);
          limpiarTokenDeLaUrl();
          setProblema(
            "Ese link ya se usó o se venció. Mandate otro desde el formulario de abajo.",
          );
          return;
        }

        // 2. El token es válido: el problema es NUESTRO, no de la persona. Se
        // canjea a mano y se entra. Un mensaje de error acá habría sido
        // inventar un culpable para tapar un bug propio.
        console.warn("[login] el token era válido y no se canjeó solo; se canjea a mano");
        const { error: errorCanje } = await supabase.auth.setSession({
          access_token: token.access_token,
          refresh_token: token.refresh_token,
        });
        if (errorCanje) {
          console.error("[login] falló el canje manual:", errorCanje.message);
          setProblema("No pudimos iniciar sesión. Probá de nuevo en un momento.");
          return;
        }

        limpiarTokenDeLaUrl();
        entrar();
        return;
      }

      const { data } = await createClient().auth.getSession();
      if (data.session) {
        clearInterval(id);
        entrar();
      }
    }, 500);

    return () => clearInterval(id);
  }, [listo, entrar]);

  if (!problema) return null;

  return (
    <p role="alert" className="text-accent text-sm mb-4">
      {problema}
    </p>
  );
}