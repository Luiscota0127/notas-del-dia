import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * El service worker no se puede testear en Node: no hay `caches`, ni
 * `self`, ni `fetch` con Service Worker semantics. Lo que sí se puede es leer el
 * código y verificar las reglas que, si faltan, dejan la app rota de una forma
 * que no se ve hasta un deploy.
 */

const raiz = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

// El archivo se genera desde sw.src.js, con la VERSION ya resuelta. Se genera
// acá para que el test no dependa de que alguien corriera el build antes.
const { generar, versionar } = await import("../../scripts/gen-sw.mjs");
const sw = generar();

describe("el service worker está versionado", () => {
  it("tiene una constante VERSION con un valor", () => {
    expect(sw).toMatch(/const VERSION\s*=\s*"v[0-9a-z]+"/);
  });

  it("la VERSION sale del contenido, no de que alguien se acuerde", () => {
    // El bug que esto evita: una VERSION escrita a mano que alguien no sube. La
    // app sigue abriendo con el bundle viejo y nadie ve nada raro.
    expect(sw).not.toMatch(/const VERSION\s*=\s*"v3"/);
    expect(sw).toMatch(/const VERSION = "v[a-z0-9]{6,}"/);
  });

  it("cambia la VERSION si cambia una coma del archivo", () => {
    const a = versionar('const VERSION = "";\nconst X = 1;');
    const b = versionar('const VERSION = "";\nconst X = 2;');
    expect(a).not.toBe(b);
  });

  it("es estable: el mismo contenido da la misma VERSION", () => {
    // Si no fuera estable, cada build borraría el cache del cliente y la app
    // offline se rompería en cada deploy.
    const a = versionar('const VERSION = "";\nconst X = 1;');
    const b = versionar('const VERSION = "";\nconst X = 1;');
    expect(a).toBe(b);
  });

  it("el archivo versionado se genera antes del build, no se sube a git", () => {
    const gitignore = readFileSync(join(raiz, ".gitignore"), "utf8");
    expect(gitignore).toContain("public/sw.js");
    // El fuente sí se versiona: es el que tiene el código.
    expect(readFileSync(join(raiz, "sw.src.js"), "utf8")).toContain("const VERSION");
  });

  it("el nombre del cache incluye la version", () => {
    // Sin esto, un deploy nuevo no borra el cache viejo y la app queda
    // sirviendo un bundle anterior para siempre.
    expect(sw).toMatch(/CACHE\s*=\s*`notas-shell-\$\{VERSION\}`/);
  });

  it("borra los caches viejos en activate", () => {
    expect(sw).toContain("notas-shell-");
    expect(sw).toMatch(/caches\.delete/);
  });

  it("llama a skipWaiting", () => {
    // Sin skipWaiting, la versión nueva espera a que se cierre la app. Si el
    // usuario nunca la cierra, nunca actualiza.
    expect(sw).toContain("skipWaiting");
  });
});

describe("el service worker no cachea lo que no debe", () => {
  it("ignora los POST", () => {
    // Cachear un POST devuelve la respuesta vieja y el autoguardado miente.
    expect(sw).toMatch(/request\.method\s*!==\s*"GET"/);
  });

  it("ignora otros orígenes", () => {
    // Supabase está en otro dominio. Cachearlo es mostrar datos viejos.
    expect(sw).toMatch(/url\.origin\s*!==\s*self\.location\.origin/);
  });

  it("no cachea /api/", () => {
    // La sonda de diagnóstico, si devuelve cacheado, miente.
    expect(sw).toMatch(/\/api\//);
  });

  it("solo cachea respuestas OK", () => {
    // Un 404 cacheado es un 404 para siempre.
    expect(sw).toMatch(/respuesta\.ok\s*&&/);
  });
});

describe("la estrategia de cada tipo de request", () => {
  it("navegación: red primero con fallback", () => {
    expect(sw).toContain("esNavegacion");
    expect(sw).toContain("redPrimero");
    // El fallback tiene que existir: sin red y sin cache, la app no abre.
    expect(sw).toContain("Sin conexión");
  });

  it("estáticos con hash: cache primero", () => {
    expect(sw).toContain("cachePrimero");
    expect(sw).toContain("/_next/static/");
  });

  it("el shell se precachea en install, no en fetch", () => {
    expect(sw).toMatch(/addEventListener\("install"/);
    expect(sw).toMatch(/cache\.addAll\(SHELL\)/);
  });
});

/**
 * El precache NO puede contener rutas con sesión.
 *
 * `cache.addAll` sigue los redirects, y con la sesión cerrada `/`, `/hoy` y
 * `/mandado` responden 307 a `/login`. Lo que quedaba bajo esas claves era el
 * HTML del login: 9206 bytes idénticos, medido en producción. Y como addAll
 * corre una sola vez, en la primera visita de cualquiera —que es deslogueada—
 * ese login quedaba cacheado para siempre, aunque después hubiera sesión.
 *
 * Estos tests existen porque el bug no se ve: la app abre, se ven estilos, y lo
 * que falla es que sin red no aparecen las notas.
 */
describe("el precache solo tiene archivos sin sesión", () => {
  const bloque = sw.slice(sw.indexOf("const SHELL"), sw.indexOf("];", sw.indexOf("const SHELL")));

  it("no precachea /, ni /hoy, ni /mandado", () => {
    expect(bloque).not.toContain('"/"');
    expect(bloque).not.toContain('"/hoy"');
    expect(bloque).not.toContain('"/mandado"');
    expect(bloque).not.toContain('"/semana"');
    expect(bloque).not.toContain('"/login"');
  });

  it("sí precachea los estáticos que no dependen de la sesión", () => {
    expect(bloque).toContain("/manifest.webmanifest");
    expect(bloque).toContain("/icon-512.png");
  });
});

describe("cada ruta se cachea por separado", () => {
  it("nadie escribe en la clave compartida /shell", () => {
    // Una sola entrada para toda navegación es "la última página que se vio".
    // Sin red, /mandado devolvía la nota que estaba abierta: el SW respondía
    // 200 y la app se rompía después, al pedir el RSC de otra ruta.
    //
    // Busca `cache.put("/shell"` y no la palabra "shell": los comentarios
    // cuentan la historia de por qué ya no existe, y un test que falla por un
    // comentario obliga a borrar la explicación.
    expect(sw).not.toContain('cache.put("/shell"');
    expect(sw).not.toContain('cache.match("/shell")');
  });

  it("cachea el HTML bajo el pathname de la request", () => {
    expect(sw).toMatch(/cache\.put\(url\.pathname,/);
  });

  it("cachea el payload RSC, que App Router pide por aparte", () => {
    // Sin esto, la navegación cliente pide el segmento y la página queda en
    // blanco aunque el HTML haya salido del cache.
    expect(sw).toContain("next-router-prefetch");
    expect(sw).toContain("rscKey");
  });
});

describe("el registro", () => {
  const registro = readFileSync(
    join(raiz, "src", "components", "ServiceWorkerRegister.tsx"),
    "utf8",
  );

  it("no se registra en desarrollo", () => {
    // En dev el shell cambia constantemente. Un SW registrado deja sirviendo un
    // bundle viejo y el error parece un bug de la app.
    expect(registro).toContain('process.env.NODE_ENV !== "production"');
  });

  it("registra con scope raiz", () => {
    expect(registro).toContain('"/sw.js"');
    expect(registro).toContain('scope: "/"');
  });

  it("espera al load", () => {
    expect(registro).toContain('"load"');
  });
});
