import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

import type { Database } from "./types";

/**
 * Cliente de servidor. Uno por request: las cookies cambian entre requests, así
 * que memoizarlo filtraría sesiones.
 *
 * Next 16: `cookies()` devuelve una Promise, también en proxy.ts.
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options);
            }
          } catch {
            // Server Component: no puede escribir cookies. El proxy refresca la
            // sesión, así que se ignora sin romper nada.
          }
        },
      },
    },
  );
}
