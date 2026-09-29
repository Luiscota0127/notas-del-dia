import type { Metadata, Viewport } from "next";

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
    <html lang="es">
      <body
        style={{
          paddingTop: "env(safe-area-inset-top)",
          paddingLeft: "env(safe-area-inset-left)",
          paddingRight: "env(safe-area-inset-right)",
        }}
      >
        {children}
      </body>
    </html>
  );
}
