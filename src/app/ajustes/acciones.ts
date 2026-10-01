"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/db/server";
import { requireUser } from "@/lib/db/queries";

/**
 * Cerrar sesión.
 *
 * ## Lo que NO hace, y por qué
 *
 * Acá NO se borra Cache Storage ni IndexedDB, aunque parezca que debería. Esta
 * función corre EN EL SERVIDOR: es una Server Action. En el servidor no existen
 * `caches`, `indexedDB` ni `localStorage`, así que el borrado no se podía hacer
 * acá. Estaba escrito, envuelto en try/catch, y no hacía nada.
 *
 * El borrado real está en `src/components/BorrarLocal.tsx`, que corre en el
 * navegador. `src/test/logout.test.ts` falla si alguien lo vuelve a poner acá.
 *
 * ## Por qué importa
 *
 * El service worker cachea cada navegación bajo su pathname, y esa respuesta
 * lleva la nota ya renderizada con la sesión de quien la pidió. IndexedDB guarda
 * lo mismo. Sin borrar los dos, la persona siguiente que abra la app en ese
 * teléfono ve las notas de la anterior.
 *
 * Con dos personas y un teléfono compartido eso no es una amenaza teórica: es el
 * caso de uso.
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

  revalidatePath("/", "layout");

  // `?salir=1` le dice al cliente que tiene que borrar Cache Storage e IndexedDB.
  // Va en `/login` y no en `/ajustes` a propósito: esta action ya cerró la
  // sesión, así que `/ajustes` rebotaría a `/login` por el proxy y el componente
  // de borrado no llegaría a montarse.
  //
  // El flag se descarta solo: `BorrarLocal` lo saca de la URL apenas lo leyó, así
  // que no queda en el historial ni vuelve a disparar en otro dispositivo.
  redirect("/login?salir=1");
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
