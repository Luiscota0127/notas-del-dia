"use client";

import { useOnline, useVaciarCola } from "@/lib/hooks/useCache";

/**
 * Banda de "sin conexión".
 *
 * Aparece SOLO cuando no hay red, y con red no se ve nada: la app tiene que
 * verse exactamente igual que antes de que existiera el modo offline. Una banda
 * permanente sería ruido.
 *
 * El texto dice qué pasa, no solo qué pasó: "se guarda en el teléfono y sube
 * cuando vuelva la señal" es la diferencia entre preocuparse y no.
 */
export function BandaConexion() {
  const online = useOnline();
  // Necesita estar montado para que la cola se vacíe sola al volver la red.
  useVaciarCola(online);

  if (online) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed inset-x-0 top-0 z-50 px-4 py-2 text-sm text-center"
      style={{
        background: "var(--color-accent)",
        color: "#111111",
        // Safe area: en iPhone la banda queda debajo del notch sin esto.
        paddingTop: "calc(0.5rem + env(safe-area-inset-top))",
      }}
    >
      Sin conexión. Lo que escribas se guarda en el teléfono y sube cuando
      vuelva la señal.
    </div>
  );
}
