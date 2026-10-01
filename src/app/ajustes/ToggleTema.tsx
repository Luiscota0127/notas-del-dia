"use client";

import { useSyncExternalStore } from "react";

/**
 * Tema claro/oscuro.
 *
 * El <html> es la fuente de verdad: el ThemeScript del layout ya puso el tema
 * correcto antes de pintar. Este botón lo lee y lo cambia, sin estado propio.
 *
 * useSyncExternalStore porque el tema vive FUERA de React (en el DOM y en
 * localStorage). Es exactamente para eso: leer un valor externo sin duplicarlo en
 * un useState que se desincroniza.
 *
 * ponytail: sin next-themes. Esto es 30 líneas y la biblioteca pesa más.
 */
export function ToggleTema() {
  const tema = useSyncExternalStore(suscribir, leerTema, () => "dark" as const);

  function cambiar() {
    const nuevo = tema === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = nuevo;
    localStorage.setItem("tema", nuevo);
    // next-themes dispara un evento propio; acá se avisa a los suscriptores.
    window.dispatchEvent(new Event("tema-cambia"));
  }

  return (
    <button
      type="button"
      onClick={cambiar}
      aria-label={tema === "dark" ? "Cambiar a tema claro" : "Cambiar a tema oscuro"}
      className="btn-ghost"
    >
      {tema === "dark" ? "Oscuro · cambiar a claro" : "Claro · cambiar a oscuro"}
    </button>
  );
}

function leerTema(): "dark" | "light" {
  return document.documentElement.dataset.theme === "light" ? "light" : "dark";
}

function suscribir(callback: () => void): () => void {
  window.addEventListener("tema-cambia", callback);
  // El observer cubre los cambios hechos desde Ajustes en otra pestaña.
  const obs = new MutationObserver(callback);
  obs.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  return () => {
    window.removeEventListener("tema-cambia", callback);
    obs.disconnect();
  };
}

/**
 * Corre antes de que pinte la página. Sin esto hay un flash blanco al recargar en
 * tema claro: el HTML llega con el tema oscuro por defecto y el efecto del
 * cliente llega después.
 *
 * Inline y síncrono a propósito. Es la única forma de evitar el flash.
 */
export function ThemeScript() {
  // Solo se consulta lo que la persona eligió. NO se mira `prefers-color-scheme`.
  //
  // Antes, sin preferencia guardada, se seguía al sistema y un equipo en claro
  // abría la app en claro. `visual.md` fija oscuro como la dirección —"#111111,
  // el look de Notion"—, y el objetivo declarado es que ella abra la app y no
  // note el cambio. Si la primera apertura depende de un ajuste del sistema que
  // no elegimos, el cambio se nota. El toggle de Ajustes sigue funcionando.
  const js = `try{if(localStorage.getItem("tema")==="light"){document.documentElement.dataset.theme="light"}}catch(e){}`;
  return <script dangerouslySetInnerHTML={{ __html: js }} />;
}
