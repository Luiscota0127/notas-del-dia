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

const VERSION = "v2";
const CACHE = `notas-shell-${VERSION}`;

/* El shell. Son los archivos que existen siempre, sin hash.
   Los _next/static/* con hash los mete el runtime cache-first.

   "/shell" NO está acá a propósito: se cachea en la primera navegación con red,
   porque sirve de fallback para cualquier ruta sin conexión. Precachearlo con una
   URL inventada no funciona. */
const SHELL = [
  "/",
  "/hoy",
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
  try {
    const respuesta = await fetch(request);

    // Cachear el shell con red, para tener un fallback si después no hay.
    if (respuesta.ok && respuesta.type === "basic") {
      cache.put("/shell", respuesta.clone());
    }
    return respuesta;
  } catch {
    // Sin red.

    // 1. La URL exacta, si se pidió antes.
    const exacto = await cache.match(request);
    if (exacto) return exacto;

    // 2. La misma ruta SIN query string. Navegar a /2026-09-01?demo=1 pide
    //    /2026-09-01?demo=1, que nunca se cacheó; sin este paso caería al shell
    //    aunque /2026-09-01 esté cacheada.
    const url = new URL(request.url);
    const sinQuery = new Request(url.origin + url.pathname, { headers: request.headers });
    const porRuta = await cache.match(sinQuery);
    if (porRuta) return porRuta;

    // 3. El shell: la última navegación buena, que es de donde salen los chunks.
    const shell = await cache.match("/shell");
    if (shell) return shell;

    // 4. La raíz precacheada.
    const inicio = await cache.match("/");
    if (inicio) return inicio;

    return new Response(
      "<!doctype html><meta charset=utf-8><title>Sin conexión</title>" +
        '<body style="background:#111;color:#e4e4e7;font-family:system-ui;padding:2rem">' +
        "<h1>Sin conexión</h1><p>La app todavía no se descargó. Abrila con internet una vez.</p>",
      { headers: { "Content-Type": "text/html; charset=utf-8" }, status: 200 },
    );
  }
}

/*
 * Notificaciones. Es el canal 2 de F4; el toast in-app (canal 1) no pasa por acá.
 * La función todavía no se dispara: F4 la implementa.
 */
self.addEventListener("notificationclick", (evento) => {
  evento.notification.close();
  const url = evento.notification.data?.url ?? "/hoy";
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
