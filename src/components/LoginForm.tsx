"use client";

import { useState } from "react";

import { pedirLink } from "@/app/login/acciones";

/**
 * El login pide correo y, si la app tiene clave de acceso, también la clave.
 *
 * Dos modos en la misma pantalla y no dos rutas. Volver es el caso frecuente —
 * una persona que ya tiene cuenta— y arranca en "Entrar", así que no paga un clic
 * extra. Crear cuenta es el paso raro, y por eso pide nombre: sin nombre el
 * profile se arma con el prefijo del correo y los demás la ven como "luiscota".
 *
 * El envío del magic link pasa por una server action: la clave se valida en el
 * servidor y nunca llega al bundle. Ver el comentario de `acciones.ts` para por
 * qué no hacerlo en el cliente.
 */
export function LoginForm({ requiereClave }: { requiereClave: boolean }) {
  const [creando, setCreando] = useState(false);
  const [email, setEmail] = useState("");
  const [nombre, setNombre] = useState("");
  const [clave, setClave] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);

    const r = await pedirLink({
      email,
      nombre: creando ? nombre : undefined,
      clave,
      origen: window.location.origin,
    });

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
      {creando && (
        <div>
          <label htmlFor="nombre" className="sr-only">
            Cómo te llamamos
          </label>
          <input
            id="nombre"
            required
            maxLength={60}
            autoComplete="name"
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            placeholder="Cómo te llamamos"
            className="input"
          />
        </div>
      )}

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

      <div className="border-t border-line pt-3">
        <button
          type="button"
          onClick={() => {
            setCreando(!creando);
            setError(null);
          }}
          className="text-dim text-sm hover:text-accent text-left"
        >
          {creando ? "Ya tengo cuenta, entrar" : "Crear una cuenta"}
        </button>
        {creando && (
          <p className="text-dim text-sm mt-1">
            El nombre solo se usa la primera vez. Después lo cambiás en Ajustes.
          </p>
        )}
      </div>
    </form>
  );
}
