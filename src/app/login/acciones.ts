"use server";

import { createClient } from "@supabase/supabase-js";

import { claveDeAcceso } from "@/lib/acceso";

/**
 * Pide el magic link, pero solo después de validar la clave de acceso.
 *
 * Todo esto vive en el servidor a propósito. Las dos alternativas obvias son
 * peores:
 *
 *   - Validar en el cliente: la clave viaja en el bundle y cualquiera que abra
 *     las herramientas de desarrollo la lee. Sería peor que no tenerla.
 *   - Pedir el link y después validar: cada intento con clave incorrecta quema
 *     rate limit de Supabase, que son unas pocas emails por hora COMPARTIDAS
 *     entre las dos cuentas. Con signup abierto, un desconocido puede agotarlo y
 *     dejarte sin poder entrar. Es el daño concreto que estamos tapando.
 *
 * Limitación honesta: esto cierra la puerta de la UI, no la de la API. Alguien
 * que hable directo con el endpoint de auth de Supabase puede saltearlo. Para
 * cerrarla de verdad hay que apagar el signup en el panel —y eso, con el signup
 * apagado, impide invitar a terceros, porque el invitado no podría crear su
 * cuenta. Es el punto donde esta app deja de ser de dos personas.
 */

const sinClave = { ok: true as const };

export async function pedirLink({
  email,
  nombre,
  clave,
  origen,
}: {
  email: string;
  /** Solo se usa al CREAR la cuenta. Ver la nota de `enviar`. */
  nombre?: string;
  clave: string;
  /** `window.location.origin`, que lo pasa el cliente. El link tiene que volver
   *  a un origen que Supabase tenga permitido, y ese lo sabe Supabase, no la app. */
  origen: string;
}): Promise<{ ok: boolean; motivo?: "clave" | "auth"; mensaje?: string }> {
  const esperado = claveDeAcceso();

  // Sin clave configurada no hay puerta. Así el desarrollo local y cualquier
  // despliegue propio no quedan trancados por forgotten una variable.
  if (!esperado) {
    const r = await enviar(email, nombre, origen);
    return r.ok ? sinClave : r;
  }

  if (clave.trim() !== esperado) {
    return { ok: false, motivo: "clave" };
  }

  return enviar(email, nombre, origen);
}

async function enviar(email: string, nombre: string | undefined, origen: string) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anon) {
    return { ok: false, motivo: "auth" as const, mensaje: "La app no está configurada." };
  }

  // El nombre va en `options.data`, que Supabase guarda en
  // `raw_user_meta_data`. El trigger `handle_new_user` lo lee de ahí para armar el
  // profile — y si no está, cae al prefijo del correo, que es "luiscota" y no el
  // nombre que la persona quiere que vean los demás.
  //
  // Solo se aplica al crear la cuenta. Si el correo ya existe, Supabase ignora
  // el metadata: por eso la pantalla dice que el nombre es para la primera vez,
  // y no promete algo que no hace.
  const data = nombre?.trim() ? { name: nombre.trim().slice(0, 60) } : undefined;

  const supabase = createClient(url, anon);
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      // Vuelve a /login para que el proxy cierre el ciclo: entra sin sesión,
      // cae ahí, magic link, y vuelve con la cookie puesta.
      emailRedirectTo: `${origen}/login`,
      ...(data ? { data } : {}),
    },
  });

  if (error) return { ok: false, motivo: "auth" as const, mensaje: error.message };
  return { ok: true as const };
}
