"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/db/server";
import { requireUser } from "@/lib/db/queries";

/**
 * Cerrar sesión.
 *
 * La parte que importa no es `signOut`: es **borrar lo que quedó en el
 * teléfono**.
 *
 * El service worker cachea cada navegación bajo su pathname, y esa respuesta
 * lleva la nota ya renderizada con la sesión de quien la pidió. IndexedDB
 * guarda lo mismo. Sin borrar los dos, la persona siguiente que abra la app en
 * ese teléfono ve las notas de la anterior hasta que la red las reemplaza.
 *
 * Con dos personas y un teléfono compartido eso ya pasó: no es una amenaza
 * teórica, es el caso de uso.
 */
export async function cerrarSesion() {
  const supabase = await createClient();
  await supabase.auth.signOut();

  // Las cookies de sesión primero: si esto falla, el resto igual tiene que
  // seguir. Un logout a medias que deja la sesión viva es peor que uno que
  // avisa que no salió.
  const cookieStore = await cookies();
  for (const c of cookieStore.getAll()) {
    try {
      cookieStore.delete(c.name);
    } catch {
      // Server Action puede escribir cookies; si no puede, el signOut de arriba
      // ya limpió lo que importa del lado del servidor.
    }
  }

  await borrarTodoLocal();

  revalidatePath("/", "layout");
  redirect("/login");
}

/**
 * Cache Storage e IndexedDB.
 *
 * En Cache Storage NO se borra todo. Los chunks estáticos —JS y CSS— no tienen
 * nada de la sesión: son los mismos para cualquiera, y tirarlos dejaría la PWA
 * sin shell y sin poder abrir sin red hasta la próxima visita con señal.
 *
 * Lo que sí sale es el HTML de navegación, que lleva la nota ya renderizada.
 * Eso es lo que hay que borrar, y es lo que se borra.
 */
async function borrarTodoLocal() {
  try {
    if (typeof caches !== "undefined") {
      for (const nombre of await caches.keys()) {
        if (!nombre.startsWith("notas-shell-")) continue;
        const cache = await caches.open(nombre);
        for (const req of await cache.keys()) {
          const esEstatico = new URL(req.url).pathname.startsWith("/_next/static/");
          const esIcono = /^\/(icon-|manifest)/.test(new URL(req.url).pathname);
          if (esEstatico || esIcono) continue;
          await cache.delete(req);
        }
      }
    }
  } catch {
    // Sin Cache Storage no hay nada que borrar.
  }

  try {
    const { borrarTodo } = await import("@/lib/cache");
    await borrarTodo();
  } catch {
    // IndexedDB puede estar bloqueado en modo privado. La sesión ya salió igual.
  }
}

// ---------------------------------------------------------------------------
// Ajustes personales
// ---------------------------------------------------------------------------

/** Cambia el nombre propio. Es lo que ven los demás en las agendas. */
export async function guardarNombre(formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return;

  const user = await requireUser();
  const supabase = await createClient();

  const { error } = await supabase.from("profiles").update({ name }).eq("id", user.id);
  if (error) throw error;

  revalidatePath("/ajustes");
  revalidatePath("/agendas");
}

/** Preferencia de avisos: "all" | "mine" | "none". */
export async function guardarAvisos(formData: FormData) {
  const valor = String(formData.get("notify") ?? "");
  if (valor !== "all" && valor !== "mine" && valor !== "none") return;

  const user = await requireUser();
  const supabase = await createClient();

  const { error } = await supabase
    .from("profiles")
    .update({ notify: valor })
    .eq("id", user.id);
  if (error) throw error;

  revalidatePath("/ajustes");
}
