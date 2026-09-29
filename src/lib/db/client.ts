import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "./types";

/**
 * Ponytail: un solo cliente de browser, memoizado a nivel de módulo. Crear uno por
 * render pierde el refresh de sesión y abre una conexión Realtime nueva cada vez.
 */
let cached: ReturnType<typeof createBrowserClient<Database>> | undefined;

export function hasSupabaseEnv() {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );
}

export function createClient() {
  if (cached) return cached;
  cached = createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
  return cached;
}
