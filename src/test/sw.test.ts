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
const sw = readFileSync(join(raiz, "public", "sw.js"), "utf8");

describe("el service worker está versionado", () => {
  it("tiene una constante VERSION", () => {
    expect(sw).toMatch(/const VERSION\s*=\s*"v\d+"/);
  });

  it("el nombre del cache incluye la version", () => {
    // Sin esto, un deploy nuevo no borra el cache viejo y la app queda
    // sirviendo un bundle anterior para siempre. Es el error clásico.
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
  it("navegación: red primero con fallback al shell", () => {
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
