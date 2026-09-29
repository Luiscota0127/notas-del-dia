"use client";

import { useState } from "react";

import { createClient } from "@/lib/db/client";

export function LoginForm() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);

    const { error } = await createClient().auth.signInWithOtp({
      email,
      options: {
        // Vuelve a /login para que el proxy cierre el ciclo: entra sin sesión,
        // cae acá, magic link, y vuelve con la cookie puesta.
        //
        // El origen sale de la barra de direcciones, no de una constante: la app
        // puede estar en 3005 en local y en un dominio en producción, y un
        // redirectTo mal puesto hace que Supabase rechace el link.
        emailRedirectTo: `${window.location.origin}/login`,
      },
    });

    setBusy(false);
    if (error) return setError(error.message);
    setSent(true);
  }

  if (sent) {
    return (
      <div>
        <p>Te mandé un correo a {email}.</p>
        <p className="text-dim mt-2">
          Abrilo en este mismo teléfono para que la sesión quede acá.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-3">
      <label htmlFor="email" className="sr-only">
        Tu correo
      </label>
      <input
        id="email"
        type="email"
        required
        autoComplete="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="tucorreo@ejemplo.com"
        className="input"
      />
      <button type="submit" disabled={busy} className="btn">
        {busy ? "Mandando…" : "Mandarme un link"}
      </button>
      {error && (
        <p role="alert" className="text-dim">
          {error}
        </p>
      )}
    </form>
  );
}
