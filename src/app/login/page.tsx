import { redirect } from "next/navigation";

import { ContinuarSesion } from "@/components/ContinuarSesion";
import { LoginForm } from "@/components/LoginForm";
import { hasSupabaseEnv } from "@/lib/db/client";
import { getUser } from "@/lib/db/queries";

export const metadata = { title: "Entrar — Notas del Día" };

export default async function LoginPage() {
  const user = await getUser();
  if (user) redirect("/agendas");

  return (
    <main className="min-h-dvh flex items-center justify-center p-6">
      <div className="w-full max-w-sm">
        <h1 className="text-2xl mb-1">Notas del Día</h1>
        <p className="text-dim mb-8">La libreta de pendientes de la casa.</p>

        {/* El servidor no puede ver el token del magic link todavía. Este
            componente lo canjea del lado del cliente y, si hay sesión, manda a
            /agendas. Sin esto, el link deja al usuario parado acá. */}
        <ContinuarSesion />

        {hasSupabaseEnv() ? <LoginForm /> : <SinConfigurar />}
      </div>
    </main>
  );
}

// Solo aparece si faltan las env vars. Decir "Mandarme un link" y que no pase
// nada sería peor que esto.
function SinConfigurar() {
  return (
    <div className="p-3 text-sm border border-line">
      <p className="mb-2">
        <strong>Supabase sin configurar.</strong> Copiá <code>.env.example</code> a{" "}
        <code>.env.local</code> y completá las dos variables.
      </p>
      <p className="text-dim">
        Después corré <code>0001_init.sql</code> y <code>0002_realtime.sql</code> desde
        el SQL Editor del proyecto.
      </p>
    </div>
  );
}
