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

  if (error) {
    return { ok: false, motivo: "auth" as const, mensaje: mensajeLegible(error, email) };
  }
  return { ok: true as const };
}

/**
 * El mensaje de error, en castellano y con qué hacer.
 *
 * `error.message` de Supabase es un string en inglés pensado para developers
 * ("Error sending confirmation email"). Mostrándoselo a quien intenta entrar lo
 * único que comunica es que la app está rota, y no dice nada de que lo que está
 * roto es una configuración del servidor —algo que sí tiene arreglo y no depende
 * de ella.
 *
 * Los 500 de "enviar el correo" son SIEMPRE el SMTP: credenciales, remitente sin
 * verificar, o cuota. No es el código de la app y no se arregla desde el teléfono.
 */
function mensajeLegible(
  error: { message: string; status?: number; code?: string },
  email: string,
): string {
  const m = (error.message ?? "").toLowerCase();

  // 429 y rate limit: poco probable después de poner SMTP propio, pero el
  // mensaje de Supabase no siempre trae el código en `status`.
  if (error.status === 429 || m.includes("rate limit") || m.includes("too many")) {
    return "Mandamos demasiados correos hace poco. Esperá unos minutos y probá otra vez.";
  }

  // El dominio del remitente sin verificar es LA causa más común cuando se
  // agrega SMTP propio: Resend y Brevo rechazan el envío con un 500 y Supabase lo
  // reporta así, sin decir cuál de los dos es.
  if (
    m.includes("sending confirmation email") ||
    m.includes("sending email") ||
    m.includes("smtp")
  ) {
    return "No pudimos mandar el correo. Es un problema del servidor de correo, no tuyo. Probá en un rato.";
  }

  // La URL de redirect no está en la lista de permitidos: el link llegaría pero
  // no volvería a la app. Es un ajuste del panel, y el mensaje de Supabase no lo
  // aclara.
  if (m.includes("redirect") || m.includes("not allowed") || m.includes("site_url")) {
    return "La dirección de la app no está autorizada para este correo. Hay que agregarla en Supabase.";
  }

  // Fallo de signup: con el signup apagado, un correo nuevo no se puede crear.
  if (m.includes("signups not allowed") || m.includes("not allowed to sign up")) {
    return `No se pueden crear cuentas nuevas. Si ${email} todavía no tiene cuenta, hay que habilitarlas en Supabase.`;
  }

  // Cualquier otra cosa: el texto de Supabase sirve, porque ya se revisó que no
  // sea ninguno de los casos de arriba.
  return error.message || "No pudimos mandar el correo. Probá otra vez.";
}
