import { NextResponse } from "next/server";

import { hasSupabaseEnv } from "@/lib/db/client";
import { createClient } from "@/lib/db/server";

/**
 * Sonda de diagnóstico del schema. Solo en desarrollo.
 *
 * Verifica contra el proyecto real que las migraciones estén aplicadas: que
 * existan las dos tablas y que la RLS bloquee el acceso sin sesión. Es la
 * forma de saber si falta correr el SQL sin tener que abrir el dashboard.
 */
export async function GET() {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "no existe en producción" }, { status: 404 });
  }

  if (!hasSupabaseEnv()) {
    return NextResponse.json({ error: "faltan env vars" }, { status: 503 });
  }

  const supabase = await createClient();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

  // select sin sesión: si la RLS está activa, devuelve [] o 401. Nunca filas.
  const anon = await fetch(`${url}/rest/v1/notes?select=id&limit=1`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  });

  // insert sin sesión: tiene que ser rechazado. Es la prueba real de la RLS.
  const insert = await fetch(`${url}/rest/v1/notes`, {
    method: "POST",
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
    body: JSON.stringify({
      user_id: "00000000-0000-0000-0000-000000000000",
      date: "1970-01-01",
      body: "sonda",
    }),
  });

  const notas = await supabase.from("notes").select("id").limit(1);
  const profiles = await supabase.from("profiles").select("id").limit(1);

  return NextResponse.json({
    envOk: true,
    /** RLS activa: el insert anónimo tiene que fallar con 42501. */
    rlsActiva: insert.status === 401,
    insertStatus: insert.status,
    insertMensaje: (await insert.json().catch(() => ({}))).message ?? null,
    selectAnonStatus: anon.status,
    notasExiste: !notas.error,
    profilesExiste: !profiles.error,
    errores: {
      notas: notas.error?.message ?? null,
      profiles: profiles.error?.message ?? null,
    },
  });
}
