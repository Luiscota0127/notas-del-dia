"use client";

import { useEffect } from "react";

/**
 * Registra el service worker.
 *
 * Sin esto, la app no es instalable en iOS: Safari no ofrece "Agregar a la
 * pantalla de inicio" como PWA sin un service worker registrado.
 *
 * ponytail: 20 líneas y nada más. No hay librería, no hay Workbox. Un shell de
 * cinco archivos no justifica un build.
 *
 * En desarrollo NO se registra, y es a propósito: el SW cachea el shell y en dev
 * el shell cambia constantly. Registrarse en dev deja sirviendo un bundle viejo
 * y el error parece un bug de la app.
 */
export function ServiceWorkerRegister() {
  useEffect(() => {
    // Solo en producción. Ver la nota de arriba.
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;

    // Esperar al load: registrarlo durante el load compite por el ancho de
    // banda con los primeros recursos, y en un celular con 4G eso se nota.
    const registrar = () => {
      navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {
        // Silencio a propósito. Un SW que no registra deja la app funcionando
        // con red; un error rojo en la consola no le agrega nada a quien la usa.
      });
    };

    if (document.readyState === "complete") registrar();
    else window.addEventListener("load", registrar, { once: true });

    return () => window.removeEventListener("load", registrar);
  }, []);

  return null;
}
