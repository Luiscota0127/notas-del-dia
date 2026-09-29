import { NextResponse, type NextRequest } from "next/server";

import { hasSupabaseEnv } from "@/lib/db/client";
import { createClient } from "@/lib/db/server";

/**
 * Refresca la sesión de Supabase y redirige según haya login o no.
 *
 * La sesión vive en la cookie de refresh. El cliente de browser también la
 * refresca, pero solo desde una pestaña abierta; esto es lo que la mantiene
 * válida entre visitas.
 *
 * ponytail: no valida permisos. Las RLS de Postgres son la frontera real; acá
 * solo se decide a dónde mandar a la gente, que es una preocupación de
 * navegación.
 */
export async function proxy(request: NextRequest) {
  // Sin env vars no hay Supabase que consultar. createServerClient tira con
  // undefined, y eso sería un 500 en cada ruta. El login muestra el mensaje de
  // "sin configurar"; el resto de la app todavía no tiene nada que proteger.
  if (!hasSupabaseEnv()) return NextResponse.next({ request });

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const isPublic = request.nextUrl.pathname.startsWith("/login");

  if (!user && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    return NextResponse.redirect(url);
  }

  if (user && isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = "/hoy";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return NextResponse.next({ request });
}

export const config = {
  matcher: [
    // Todo menos estáticos. El service worker tiene que pasar o rompería el
    // precache del shell.
    "/((?!_next/static|_next/image|favicon.ico|sw.js|manifest.webmanifest|icon-.*\\.png).*)",
  ],
};
