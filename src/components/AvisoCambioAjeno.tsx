"use client";

/**
 * "Tu pareja guardó algo mientras escribías."
 *
 * Aparece solo cuando hubo una colisión de verdad: el otro guardó mientras esta
 * persona tenía cambios sin subir. No es un aviso genérico de "hay cambios", es
 * una decisión pendiente, y por eso ofrece las dos opciones en vez de aplicar
 * una sola.
 *
 * Por qué NO se aplica automáticamente el texto del otro: el autoguardado manda
 * el body entero, así que entre las dos versiones hay trabajo de alguien. No hay
 * merge que sirva con texto libre, y elegir por la persona cuál conservar es
 * justamente perder lo que la app vino a evitar.
 */
export function AvisoCambioAjeno({
  onTomar,
  onDescartar,
}: {
  /** Cargar lo que guardó el otro, descartando lo que estaba sin guardar. */
  onTomar: () => void;
  /** Descartar lo del otro y seguir con lo propio. */
  onDescartar: () => void;
}) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="border border-line rounded p-2.5 mb-2 text-sm flex flex-wrap items-center gap-2"
    >
      <span className="min-w-0">La otra persona guardó algo mientras escribías.</span>
      <span className="flex gap-2 shrink-0 ml-auto">
        <button type="button" onClick={onTomar} className="btn-ghost text-sm">
          Cargar lo suyo
        </button>
        <button type="button" onClick={onDescartar} className="btn-ghost text-sm text-dim">
          Seguir con lo mío
        </button>
      </span>
    </div>
  );
}
