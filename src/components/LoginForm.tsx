"use client";

import { useState } from "react";

import { pedirLink } from "@/app/login/acciones";

/**
 * El login pide correo y, si la app tiene clave de acceso, también la clave.
 *
 * El envío del magic link pasa por una server action: la clave se valida en el
 * servidor y nunca llega al bundle. Ver el comentario de `acciones.ts` para por
 * qué no hacerlo en el cliente.
 */
export function LoginForm({ requiereClave }: { requiereClave: boolean }) {
  const [email, setEmail] = useState("");
  const [clave, setClave] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);

    const r = await pedirLink({ email, clave, origen: window.location.origin });

    setBusy(false);
    if (r.ok) return setSent(true);

    if (r.motivo === "clave") return setError("Esa clave no es correcta.");
    setError(r.mensaje ?? "No pude mandar el correo.");
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
      <div>
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
      </div>

      {requiereClave && (
        <div>
          <label htmlFor="clave" className="sr-only">
            Clave de acceso
          </label>
          <input
            id="clave"
            type="password"
            required
            autoComplete="current-password"
            value={clave}
            onChange={(e) => setClave(e.target.value)}
            placeholder="Clave de acceso"
            className="input"
          />
        </div>
      )}

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
