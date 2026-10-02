import { redirect } from "next/navigation";

import { ContinuarSesion } from "@/components/ContinuarSesion";
import { LoginForm } from "@/components/LoginForm";
import { hayClaveDeAcceso } from "@/lib/acceso";
import { hasSupabaseEnv } from "@/lib/db/client";
import { getUser } from "@/lib/db/queries";

export const metadata = { title: "Entrar — Notas del Día" };

export default async function LoginPage() {
  const user = await getUser();
  if (user) redirect("/agendas");

  return (
    // El login va centrado. Antes estaba pegado a la izquierda como Ajustes y
    // Agendas, con un comentario que decía que así no se leía como otra app.
    // Se revierte esa decisión, y la razón original sigue sirviendo con otro
    // arreglo: lo que molestaba era el ANCHO, que saltaba de `max-w-sm` a
    // `max-w-lg` al pasar de una pantalla a otra. El ancho se mantiene igual en
    // todas; lo que cambia es que ahora el bloque está en el medio.
    //
    // El login es una tarea sola y aislada: no es una pantalla dentro de la app
    // a la que se llega navegando, es una puerta. Centrarla dice eso.
    //
    // Solo horizontal. Un `items-center` vertical pelearía con el teclado de
    // iPhone, que recorta la mitad de la pantalla y dejaría el campo de correo
    // justo debajo del borde.
    <main className="p-4 md:p-8 max-w-lg mx-auto">
      <h1 className="text-xl mb-1">Notas del Día</h1>
      <p className="text-dim mb-8">La libreta de pendientes de la casa.</p>

        {/* El servidor no puede ver el token del magic link todavía. Este
            componente lo canjea del lado del cliente y, si hay sesión, manda a
            /agendas. Sin esto, el link deja al usuario parado acá. */}
        <ContinuarSesion />

        {hasSupabaseEnv() ? (
          <LoginForm requiereClave={hayClaveDeAcceso()} />
        ) : (
          <SinConfigurar />
        )}
    </main>
  );
}

// Solo aparece si faltan las env vars. Decir "Mandarme un link" y que no pase
// nada sería peor que esto.
function SinConfigurar() {
  return (
    <div className="p-3 text-sm border border-line">
      <p className="mb-2">
        <strong>Supabase sin configurar.</strong> Copia <code>.env.example</code> a{" "}
        <code>.env.local</code> y completa las dos variables.
      </p>
      <p className="text-dim">
        Después corre <code>0001_init.sql</code> y <code>0002_realtime.sql</code> desde
        el SQL Editor del proyecto.
      </p>
    </div>
  );
}
