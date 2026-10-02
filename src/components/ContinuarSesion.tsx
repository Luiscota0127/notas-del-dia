"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { createClient } from "@/lib/db/client";

/**
 * Cierra el ciclo del magic link.
 *
 * El problema: /login decide si hay sesión en el servidor, y eso corre ANTES de
 * que el JavaScript procese el token de la URL. El servidor no lo ve, renderiza
 * el login, y después el cliente canjea el token y pone la cookie… pero nadie
 * vuelve a preguntar, así que la pantalla queda en login con la sesión ya creada.
 *
 * Con la confirmación de email apagada el token viene en el hash o en el query;
 * con confirmación prendida hay que abrir el correo y caer acá de nuevo. En los
 * dos casos el canje es del lado del cliente.
 */
export function ContinuarSesion() {
  const router = useRouter();
  const [listo, setListo] = useState(false);
  const intento = useRef(0);

  useEffect(() => {
    const supabase = createClient();

    // onAuthStateChange cubre el canje del token: Supabase dispara
    // INITIAL_SESSION al arrancar y SIGNED_IN cuando el link se procesa.
    //
    // La clave de todo esto: **INITIAL_SESSION no significa "hay sesión"**.
    // Se dispara siempre, en cada carga, y en el caso del magic link llega
    // cuando todavía NO hay sesión — la detección del fragmento de la URL va
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

      setListo(true);
      // replace, no push: el link del magic no debe quedar en el historial.
      router.replace("/agendas");
      // refresh: el server component vuelve a leer la cookie y deja de mandar
      // a /login.
      router.refresh();
    });

    return () => subscription.unsubscribe();
  }, [router]);

  useEffect(() => {
    // El caso "ya tenías sesión y volvés al login" no dispara SIGNED_IN, solo
    // INITIAL_SESSION. Y el canje del hash es asíncrono, así que hay que
    // preguntar más de una vez hasta que la sesión exista de verdad.
    if (listo) return;

    const id = setInterval(async () => {
      if (intento.current++ > 10) {
        clearInterval(id);
        return;
      }
      const { data } = await createClient().auth.getSession();
      if (data.session) {
        setListo(true);
        clearInterval(id);
        router.replace("/agendas");
        router.refresh();
      }
    }, 500);

    return () => clearInterval(id);
  }, [listo, router]);

  return null;
}