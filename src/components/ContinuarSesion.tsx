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
 *
 * ponytail: esperar a onAuthStateChange y, si ya había sesión, refrescar. Sin
 * un endpoint extra: el cliente de Supabase ya sabe la respuesta.
 */
export function ContinuarSesion() {
  const router = useRouter();
  const [listo, setListo] = useState(false);
  const intento = useRef(0);

  useEffect(() => {
    const supabase = createClient();

    // onAuthStateChange cubre el canje del token: Supabase dispara INITIAL_SESSION
    // y después SIGNED_IN cuando el link se procesa.
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((evento) => {
      if (evento === "SIGNED_IN" || evento === "INITIAL_SESSION") {
        setListo(true);
        // replace, no push: el link del magic no debe quedar en el historial.
        router.replace("/hoy");
        // refresh: el server component vuelve a leer la cookie y deja de mandar
        // a /login.
        router.refresh();
      }
    });

    return () => subscription.unsubscribe();
  }, [router]);

  useEffect(() => {
    // El caso "ya tenías sesión y volvés al login" no dispara SIGNED_IN, solo
    // INITIAL_SESSION, y puede llegar antes de que el router esté listo. Un
    // reintento corto y ningún otro caso lo resuelve.
    if (listo) return;
    const id = setTimeout(async () => {
      if (intento.current++ > 3) return;
      const { data } = await createClient().auth.getSession();
      if (data.session) {
        router.replace("/hoy");
        router.refresh();
      }
    }, 800);
    return () => clearTimeout(id);
  }, [listo, router]);

  return null;
}
