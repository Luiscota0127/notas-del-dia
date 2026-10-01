"use client";

import { useEffect, useState } from "react";

import {
  deberiaOfrecerInstalar,
  descartarInstalacion,
  fueDescartada,
  SEGUNDOS_PARA_CERRAR,
} from "@/lib/instalar";

/**
 * "Agregá la app a la pantalla de inicio."
 *
 * Solo aparece en Safari iOS, y solo una vez. Es un aviso, no un modal: no
 * bloquea la nota, que es lo que la persona estaba haciendo.
 *
 * Por qué solo iOS: en Chrome y Edge hay `beforeinstallprompt` y el propio
 * navegador ofrece instalarla en su menú, así que un nudge propio sería
 * redundante. En iOS no existe eso: si no le decís a la persona que use
 * Compartir → Agregar a pantalla de inicio, no lo va a descubrir nunca.
 *
 * Desaparece sola a los `SEGUNDOS_PARA_CERRAR`. Un aviso que espera un toque y
 * no lo recibe se convierte en decoración permanente, que es peor que no
 * avisar: entrena a la persona a ignorar lo que hay en pantalla.
 */
export function AvisoInstalar() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // En demo no tiene sentido: no es la app real.
    if (new URLSearchParams(window.location.search).get("demo") === "1") return;

    const mostrar = () =>
      setVisible(
        deberiaOfrecerInstalar({
          userAgent: navigator.userAgent,
          maxTouchPoints: navigator.maxTouchPoints,
          standaloneIos: Boolean((navigator as { standalone?: boolean }).standalone),
          displayModeStandalone: window.matchMedia("(display-mode: standalone)").matches,
          descartada: fueDescartada(),
        }),
      );

    mostrar();
    // El modo standalone cambia al instalar: sin esto, alguien que instala
    // mientras la app está abierta en Safari ve el aviso en la próxima carga.
    const mq = window.matchMedia("(display-mode: standalone)");
    mq.addEventListener("change", mostrar);

    const cerrar = setTimeout(() => {
      setVisible((v) => {
        if (v) descartarInstalacion();
        return false;
      });
    }, SEGUNDOS_PARA_CERRAR * 1000);

    return () => {
      mq.removeEventListener("change", mostrar);
      clearTimeout(cerrar);
    };
  }, []);

  if (!visible) return null;

  return (
    <div
      className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-bg"
      style={{
        // El notch de abajo y el gesto de home: sin esto el botón queda debajo.
        paddingBottom: "calc(0.75rem + env(safe-area-inset-bottom))",
        paddingTop: "0.75rem",
        paddingLeft: "1rem",
        paddingRight: "1rem",
      }}
    >
      <div className="mx-auto flex max-w-lg items-center gap-3">
        <p className="min-w-0 flex-1 text-sm">
          Agregala a la pantalla de inicio:{" "}
          <span className="text-dim">Compartir → Agregar a pantalla de inicio</span>.
        </p>
        <button
          type="button"
          onClick={() => {
            descartarInstalacion();
            setVisible(false);
          }}
          className="btn-ghost text-sm text-dim shrink-0"
        >
          Ahora no
        </button>
      </div>
    </div>
  );
}
