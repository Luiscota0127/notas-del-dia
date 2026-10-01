"use client";

import { useEffect } from "react";

/**
 * El borrado de lo que queda en el teléfono, después de cerrar sesión.
 *
 * ## Por qué esto es un componente y no está en la Server Action
 *
 * `cerrarSesion` es una Server Action y corre EN EL SERVIDOR. Ahí no existen
 * `caches`, `indexedDB` ni `localStorage`. El borrado estaba escrito adentro de la
 * action, envuelto en try/catch que se tragaba el error: el logout "salía bien" y
 * el teléfono se quedaba con el HTML de la nota de la persona anterior.
 *
 * Esto se verifica en `src/test/logout.test.ts`, que falla si alguien vuelve a
 * poner el borrado adentro de la action.
 *
 * ## Qué se borra y qué no
 *
 * Se borra el HTML de navegación y los payloads RSC: los dos llevan la nota ya
 * renderizada, con la sesión de quien la pidió.
 *
 * NO se borran los estáticos —los chunks de JS y CSS, los íconos, el manifest—:
 * son los mismos para cualquiera y no llevan datos de nadie. Tirarlos dejaría la
 * PWA sin shell y sin poder abrir sin red hasta la próxima visita con señal, que
 * es un problema mucho peor que el que estamos resolviendo.
 */

/**
 * Avisa al service worker que purgue lo suyo.
 *
 * Sin esto el borrado se deshace en la misma visita: al logout sigue habiendo un
 * service worker registrado, y la navegación siguiente a `/login` o a la pantalla
 * de inicio vuelve a cachear el HTML. El SW tiene que hacer su parte él mismo.
 */
async function purgarServiceWorker() {
  try {
    if (!("serviceWorker" in navigator)) return;
    const registro = await navigator.serviceWorker.ready;
    const workers = [registro.active, registro.waiting, registro.installing].filter(
      Boolean,
    );
    const objetivo = workers[0] ?? navigator.serviceWorker.controller;
    if (!objetivo) return;
    objetivo.postMessage({ type: "purgar-datos" });
  } catch {
    // Sin service worker no hay nada que purgar. La sesión ya salió igual.
  }
}

async function borrarCacheStorage() {
  try {
    if (typeof caches === "undefined") return;

    for (const nombre of await caches.keys()) {
      if (!nombre.startsWith("notas-shell-")) continue;
      const cache = await caches.open(nombre);
      for (const req of await cache.keys()) {
        const ruta = new URL(req.url).pathname;

        // El shell: JS, CSS, íconos, manifest. Identicos para cualquiera.
        if (ruta.startsWith("/_next/static/")) continue;
        if (/^\/(icon-|manifest)/.test(ruta)) continue;

        // Todo lo demás de esta navegación sí lleva datos: el HTML con la nota y
        // los payloads RSC, que el SW guarda bajo `/__rsc__<ruta>`.
        await cache.delete(req);
      }
    }
  } catch {
    // Cache Storage bloqueado en modo privado. La sesión ya salió igual.
  }
}

async function borrarIndexedDB() {
  try {
    const { borrarTodo } = await import("@/lib/cache");
    await borrarTodo();
  } catch {
    // IndexedDB bloqueado en modo privado. La sesión ya salió igual.
  }
}

/**
 * Se corre una vez al montar, en el layout raíz.
 *
 * ## Por qué en el layout y no en Ajustes
 *
 * Porque después del logout ya no hay sesión: `requireUser()` en `/ajustes`
 * rebota a `/login` por el proxy, y un componente montado ahí no llegaría a
 * ejecutarse. El layout raíz corre siempre, con sesión o sin ella.
 *
 * ## Por qué lee la URL y no recibe un prop
 *
 * El signal es un `?salir=1` en la URL, porque el estado no cruza el redirect de
 * una Server Action a otra página. Y tiene que consumirse una sola vez: se saca
 * del historial apenas se lee, así que no queda pegado ni vuelve a disparar si el
 * usuario abre el link otra vez.
 */
export function BorrarLocal() {
  useEffect(() => {
    const url = new URL(window.location.href);
    if (url.searchParams.get("salir") !== "1") return;

    // Primero se saca el flag, antes de borrar nada. Si el borrado falla, el
    // siguiente intento no tiene que depender de que la URL siga ahí.
    url.searchParams.delete("salir");
    window.history.replaceState({}, "", url.pathname + (url.search || "") + url.hash);

    // El SW va primero: es el que puede reescribir el cache mientras las otras
    // dos cosas corren.
    void (async () => {
      await purgarServiceWorker();
      await Promise.all([borrarCacheStorage(), borrarIndexedDB()]);
    })();
  }, []);

  return null;
}