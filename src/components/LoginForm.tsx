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
/** El rótulo de cada campo. Visible, no `sr-only`. */
function Rotulo({ htmlFor, children }: { htmlFor: string; children: React.ReactNode }) {
  return (
    <label htmlFor={htmlFor} className="block text-sm text-dim">
      {children}
    </label>
  );
}

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

    if (r.motivo === "clave") {
      // Con el qué hacer, no solo qué pasó: "no es correcta" deja a la persona
      // mirando el teclado sin saber qué hacer.
      return setError("Esa clave no es correcta. Revisala y mandá el link otra vez.");
    }
    setError(r.mensaje ?? "No pude mandar el correo. Prueba de nuevo en un momento.");
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
      {/* El rótulo es visible y el placeholder es un ejemplo, no una etiqueta.
         Con `sr-only` el único nombre del campo era el placeholder, que
         desaparece al escribir: en el correo de una persona con teclado en
         pantalla, el campo queda sin nombre justo cuando se está escribiendo. */}
      {creando && (
        <div className="flex flex-col gap-1">
          <Rotulo htmlFor="nombre">Cómo te llamamos</Rotulo>
          <input
            id="nombre"
            required
            maxLength={60}
            autoComplete="name"
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            placeholder="Tu nombre"
            className="input"
          />
        </div>
      )}

      <div className="flex flex-col gap-1">
        <Rotulo htmlFor="email">Tu correo</Rotulo>
        <input
          id="email"
          type="email"
          required
          autoComplete="email"
          inputMode="email"
          /* El corrector marcando "nombre@ejemplo.com" en rojo mientras se
             escribe es ruido: es un campo donde la ortografía no existe. */
          spellCheck={false}
          autoCapitalize="none"
          autoCorrect="off"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="nombre@ejemplo.com"
          className="input"
        />
      </div>

      {requiereClave && (
        <div className="flex flex-col gap-1">
          <Rotulo htmlFor="clave">Clave de acceso</Rotulo>
          <input
            id="clave"
            type="password"
            required
            autoComplete="current-password"
            value={clave}
            onChange={(e) => setClave(e.target.value)}
            className="input"
          />
        </div>
      )}

      <button type="submit" disabled={busy} className="btn">
        {busy ? "Mandando…" : "Mandarme un link"}
      </button>

      {/* `role="alert"` anuncia apenas aparece, sin necesidad de mover el foco.
          El color NO es `--dim`: un error en gris se confunde con texto
          secundario. El acento es el color que ya significa "acá hay algo". */}
      {error && (
        <p role="alert" className="text-accent text-sm">
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
            El nombre solo se usa la primera vez. Después lo cambias en Ajustes.
          </p>
        )}
      </div>
    </form>
  );
}
