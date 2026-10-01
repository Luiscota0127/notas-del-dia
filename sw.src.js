/*
 * Service worker de notas-del-dia.
 *
 * Hace tres cosas y ninguna más:
 *   1. precachea el shell (HTML, CSS, JS, íconos) para que la app abra sin red,
 *   2. cache-first para estáticos con hash (nunca cambian),
 *   3. network-first para navegación, con fallback al shell.
 *
 * NO cachea respuestas de Supabase. Los datos van a IndexedDB, no al Cache del
 * SW: cachear SQL sobre red es la forma más rápida de mostrarle a alguien la
 * nota de ayer cuando quería la de hoy.
 *
 * VERSION: cambiarlo SIEMPRE que cambie el shell. Un SW con la misma versión no
 * reinstala nada, y la app queda sirviendo un bundle viejo para siempre. Es el
 * error clásico y no se ve en desarrollo.
 */

/*
 * VERSION: la calcula `scripts/gen-sw.mjs` como un hash de este archivo. Está en
 * blanco acá a propósito — el generador lo completa — y `public/sw.js` queda
 * ignorado por git.
 *
 * Antes era un string que alguien tenía que acordarse de subir. Un service
 * worker con la misma versión no reinstala nada: la app abre, se ve bien, y el
 * iPhone sigue con el bundle viejo para siempre. Es un bug invisible que
 * dependía de la memoria.
 */
const VERSION = "";
const CACHE = `notas-shell-${VERSION}`;

/* El shell. SOLO archivos sin sesión.

   "/", "/hoy" y "/mandado" NO van acá, y es lo más importante de este archivo.
   Con la sesión cerrada las tres responden 307 a /login, y cache.addAll sigue el
   redirect: lo que queda bajo esas claves es el HTML del login. Medido: 9206
   bytes idénticos en las dos rutas, que es la misma página.

   Y como addAll solo corre en el install —una vez, en la primera visita de
   cualquiera, que es deslogueada— el shell cacheado era el login para siempre,
   aunque después la persona entrara con sesión. Nunca se actualizaba.

   Las rutas con sesión no se precachean. Se resuelven en runtime contra la red,
   y sin red lo que hay son los datos de IndexedDB (`src/lib/cache.ts`), que es
   justamente para qué existe el cache: el HTML sin red no sirve de nada si
   encima es la pantalla equivocada. */
const SHELL = [
  "/manifest.webmanifest",
  "/icon-192.png",
  "/icon-512.png",
  "/icon-maskable-512.png",
];

self.addEventListener("install", (evento) => {
  evento.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      // addAll es atómico: si un archivo falta, no se instala el SW. Prefiero eso
      // a un shell a medio cachear que deja la app sin estilos.
      await cache.addAll(SHELL);
      // skipWaiting: la versión nueva entra sin esperar a que se cierre la app.
      // Sin esto, el usuario queda en la versión vieja hasta que la cierra, y si
      // nunca la cierra, nunca actualiza.
      await self.skipWaiting();
    })(),
  );
});

/*
 * Purgar los datos de la sesión que cerró.
 *
 * Sin esto, el borrado del logout se deshace en la misma visita: el SW sigue
 * registrado, y la navegación siguiente a /login vuelve a cachear HTML bajo su
 * ruta. Un minuto después del logout, el teléfono ya tiene la respuesta otra vez.
 *
 * Se borra el HTML de navegación y los payloads RSC —los dos llevan la nota ya
 * renderizada con la sesión de quien la pidió— y NO se borra el shell. Los chunks
 * de JS y CSS son los mismos para cualquiera y no llevan datos de nadie; tirarlos
 * deja la PWA sin poder abrir sin red, que es peor que el problema que se busca
 * resolver.
 */
self.addEventListener("message", (evento) => {
  if (evento.data?.type !== "purgar-datos") return;

  evento.waitUntil(
    (async () => {
      for (const nombre of await caches.keys()) {
        if (!nombre.startsWith("notas-shell-")) continue;
        const cache = await caches.open(nombre);

        for (const req of await cache.keys()) {
          const ruta = new URL(req.url).pathname;
          if (ruta.startsWith("/_next/static/")) continue;
          if (/^\/(icon-|manifest)/.test(ruta)) continue;
          await cache.delete(req);
        }
      }
    })(),
  );
});

self.addEventListener("activate", (evento) => {
  evento.waitUntil(
    (async () => {
      // Borrar los caches de versiones viejas. Sin esto, cada deploy deja un
      // cache muerto ocupando espacio.
      const nombres = await caches.keys();
      await Promise.all(
        nombres.filter((n) => n.startsWith("notas-shell-") && n !== CACHE).map((n) => caches.delete(n)),
      );
      await self.clients.claim();
    })(),
  );
});

/** ¿Es una navegación? Entonces lo que importa es el HTML. */
function esNavegacion(request) {
  return request.mode === "navigate";
}

/** ¿Un estático con hash en el nombre? Es inmutable, se cachea para siempre. */
function esEstaticoImmutable(url) {
  return (
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.startsWith("/icon-") ||
    url.pathname.endsWith(".png") ||
    url.pathname.endsWith(".woff2")
  );
}

self.addEventListener("fetch", (evento) => {
  const request = evento.request;
  const url = new URL(request.url);

  // Solo same-origin. Las requests a Supabase y a cualquier otro host pasan
  // derecho: cachearlas sería mostrar datos viejos.
  if (url.origin !== self.location.origin) return;

  // Los POST de las server actions nunca se cachean. Cachear un POST devuelve
  // la respuesta vieja y el autoguardado miente.
  if (request.method !== "GET") return;

  if (esNavegacion(request)) {
    evento.respondWith(redPrimero(request));
    return;
  }

  if (esEstaticoImmutable(url)) {
    evento.respondWith(cachePrimero(request));
    return;
  }

  // /api/* es la sonda de diagnóstico. Dejarla pasar siempre: si devuelve datos
  // viejos, el diagnóstico miente.
  if (url.pathname.startsWith("/api/")) return;
});

async function cachePrimero(request) {
  const cache = await caches.open(CACHE);
  const guardado = await cache.match(request);
  if (guardado) return guardado;

  const respuesta = await fetch(request);
  // Solo cachear respuestas OK. Un 404 cacheado es un 404 para siempre.
  if (respuesta.ok) cache.put(request, respuesta.clone());
  return respuesta;
}

async function redPrimero(request) {
  const cache = await caches.open(CACHE);
  const url = new URL(request.url);

  try {
    const respuesta = await fetch(request);

    // Cachear por ruta, no en una clave "/shell" compartida.
    //
    // La versión anterior guardaba TODA navegación buena bajo "/shell", o sea una
    // sola entrada: "la última página que se vio". Sin red, /mandado devolvía la
    // nota que estaba abierta, y /hoy devolvía la lista de mandado. El SW
    // respondía 200 y la app se rompía más adelante, al pedir el segmento RSC
    // de una ruta que no era la que le habían servido.
    //
    // Ahora cada ruta tiene su HTML. Sin red se sirve el de esa misma ruta, que
    // es lo único que puede servir bien.
    if (respuesta.ok && respuesta.type === "basic" && !url.pathname.startsWith("/api/")) {
      cache.put(url.pathname, respuesta.clone());
    }

    // Los payloads RSC de esta misma ruta. App Router los pide por aparte para
    // pintar después de una navegación cliente, y sin ellos la página carga y se
    // queda en blanco. La clave es la ruta con el prefijo "rsc:" para que no
    // choque con el HTML de la misma ruta.
    const rsc = request.headers.get("rsc") || request.headers.get("next-router-prefetch");
    if (rsc && respuesta.ok) {
      cache.put(rscKey(url), respuesta.clone());
    }

    return respuesta;
  } catch {
    return desdeCache(request, url, cache);
  }
}

const rscKey = (url) => new Request(url.origin + "/__rsc__" + url.pathname);

/**
 * Sin red. Tres pasos y un mensaje honesto.
 *
 * No hay un shell universal que servir: cada ruta es una página distinta con sus
 * datos. Lo que hay son los archivos estáticos, que sí son los mismos para todos,
 * y los datos, que están en IndexedDB.
 */
async function desdeCache(request, url, cache) {
  // 1. Lo que se pidió antes, exacto.
  const exacto = await cache.match(request);
  if (exacto) return exacto;

  // 2. El payload RSC de esta ruta, si se cacheó.
  const rsc = await cache.match(rscKey(url));
  if (rsc) return rsc;

  // 3. El HTML de esta misma ruta, si se cacheó en una visita anterior.
  const html = await cache.match(url.origin + url.pathname);
  if (html) return html;

  // 4. Nada. Decirlo es mejor que servir la página de otro lado.
  return new Response(
    "<!doctype html><meta charset=utf-8><title>Sin conexión</title>" +
      '<body style="background:#111;color:#e4e4e7;font-family:system-ui;padding:2rem">' +
      "<h1>Sin conexión</h1><p>Esta pantalla no se descargó todavía. Abrila con internet una vez y después anda sin señal.</p>",
    { headers: { "Content-Type": "text/html; charset=utf-8" }, status: 200 },
  );
}

/*
 * Notificaciones. Es el canal 2 de F4; el toast in-app (canal 1) no pasa por acá.
 * La función todavía no se dispara: F4 la implementa.
 */
self.addEventListener("notificationclick", (evento) => {
  evento.notification.close();
  const url = evento.notification.data?.url ?? "/";
  evento.waitUntil(
    (async () => {
      const clientes = await self.clients.matchAll({ type: "window" });
      // Si la app ya está abierta, la enfocamos en vez de abrir otra pestaña.
      for (const cliente of clientes) {
        if (cliente.url.includes(url) && "focus" in cliente) return cliente.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow(url);
    })(),
  );
});
