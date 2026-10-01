import type { Metadata, Viewport } from "next";

import { ThemeScript } from "./ajustes/ToggleTema";
import { AvisoInstalar } from "@/components/AvisoInstalar";
import { BandaConexion } from "@/components/BandaConexion";
import { BorrarLocal } from "@/components/BorrarLocal";
import { ServiceWorkerRegister } from "@/components/ServiceWorkerRegister";
import "./globals.css";

export const metadata: Metadata = {
  title: "Notas del Día",
  description: "La libreta de pendientes de la casa.",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "Notas",
    // F5. Se puede activar ya: no cuesta nada y evita el "flash" de Safari.
    statusBarStyle: "black-translucent",
  },
};

export const viewport: Viewport = {
  themeColor: "#111111",
  // F5: viewport-fit=cover + los env() de abajo para el notch y el Dynamic Island.
  width: "device-width",
  initialScale: 1,
  // NO maximum-scale: bloquear el zoom rompe la accesibilidad.
  viewportFit: "cover",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    // suppressHydrationWarning es necesario y no es un parche: el ThemeScript
    // cambia data-theme ANTES de que React hidrate (es lo que evita el flash
    // blanco). React ve un atributo distinto al que él renderizó y avisa. El
    // atributo lo controla el script, no React, así que el warning es ruido.
    <html lang="es" data-theme="dark" suppressHydrationWarning>
      <head>
        {/* Antes de pintar: evita el flash blanco al recargar en tema claro. */}
        <ThemeScript />
      </head>
      <body
        style={{
          paddingTop: "env(safe-area-inset-top)",
          paddingLeft: "env(safe-area-inset-left)",
          paddingRight: "env(safe-area-inset-right)",
        }}
      >
        {children}
        {/* Borra Cache Storage e IndexedDB después de cerrar sesión. Va en el
            layout y no en Ajustes porque después del logout ya no hay sesión, y
            `/ajustes` rebotaría a /login antes de montar nada. No renderiza nada. */}
        <BorrarLocal />
        {/* Sin esto no hay PWA instalable en iOS. No renderiza nada. */}
        <ServiceWorkerRegister />
        {/* Solo aparece sin red. Vacía la cola cuando vuelve. */}
        <BandaConexion />
        {/* Solo en Safari iOS, y una sola vez. No renderiza nada en el resto. */}
        <AvisoInstalar />
      </body>
    </html>
  );
}
