import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * El logout tiene que borrar lo que quedó en el teléfono.
 *
 * ## El bug que esto fija
 *
 * `cerrarSesion` está en un archivo con `"use server"` arriba. Las Server Actions
 * CORREN EN EL SERVIDOR, y en el servidor no existen `caches`, `indexedDB` ni
 * `localStorage`. Los dos bloques de `borrarTodoLocal()` están envueltos en
 * try/catch que se traga todo, así que el logout "salía bien" —la sesión se
 * cerraba, la redirección a /login pasaba— y el teléfono se quedaba con el HTML
 * de la nota de la persona anterior.
 *
 * Con dos personas y un teléfono compartido no es una amenaza: es el caso de uso.
 *
 * Estos tests leen el código porque el comportamiento depende de DÓNDE se ejecuta,
 * y eso no se puede simular en Node.
 */

const raiz = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const acciones = readFileSync(join(raiz, "src", "app", "ajustes", "acciones.ts"), "utf8");

/** El cuerpo de `cerrarSesion`, hasta la llave que la cierra. */
function cuerpoDeCerrarSesion(): string {
  const i = acciones.indexOf("export async function cerrarSesion");
  expect(i, "no está cerrarSesion").toBeGreaterThan(-1);
  // Hasta el final del comentario del bloque siguiente.
  const fin = acciones.indexOf("borrarTodoLocal", i);
  return acciones.slice(i, fin);
}

describe("el logout corre en el servidor", () => {
  it("el archivo es una Server Action", () => {
    expect(acciones.trimStart().startsWith('"use server"')).toBe(true);
  });

  it("cerrarSesion NO toca Cache Storage ni IndexedDB desde adentro", () => {
    // Si estas dos aparecen en el cuerpo de la action, el borrado está pasando en
    // el servidor, donde esas APIs no existen. Tiene que estar en el cliente.
    const cuerpo = cuerpoDeCerrarSesion();
    expect(cuerpo, "cerrarSesion está borrando cache en el servidor").not.toContain("caches");
    expect(cuerpo, "cerrarSesion está borrando IndexedDB en el servidor").not.toContain(
      "indexedDB",
    );
  });

  it("la Server Action no llama a la función que borra en el navegador", () => {
    // `borrarTodoLocal` era local de la action: por lo de arriba, no hacía nada.
    const cuerpo = cuerpoDeCerrarSesion();
    expect(cuerpo).not.toContain("borrarTodoLocal");
  });
});

describe("el borrado está en un componente de cliente", () => {
  const cliente = readFileSync(
    join(raiz, "src", "components", "BorrarLocal.tsx"),
    "utf8",
  );

  it("es un componente de cliente", () => {
    expect(cliente).toContain('"use client"');
  });

  it("borra Cache Storage e IndexedDB", () => {
    expect(cliente).toContain("caches.keys()");
    expect(cliente).toContain("borrarTodo");
  });

  it("conserva los estáticos: sin shell la PWA no abre sin red", () => {
    // El shell son JS y CSS: son los mismos para cualquiera y no llevan datos.
    expect(cliente).toContain("/_next/static/");
    expect(cliente).toMatch(/icon-|manifest/);
  });

  it("está en el layout raíz, no en Ajustes", () => {
    // Después del logout ya no hay sesión: `/ajustes` rebota a `/login` por el
    // proxy y el componente no llegaría a montarse. El layout corre siempre.
    const layout = readFileSync(join(raiz, "src", "app", "layout.tsx"), "utf8");
    expect(layout).toContain("BorrarLocal");
  });

  it("el signal se lee de la URL y se consume una sola vez", () => {
    // Si el flag quedara en la URL, volver a abrir el link dispararía el borrado
    // otra vez y en otro dispositivo.
    expect(cliente).toContain('get("salir")');
    expect(cliente).toContain("replaceState");
    expect(cliente).toContain('delete("salir")');
  });
});

describe("el service worker no puede reescribir lo borrado", () => {
  const sw = readFileSync(join(raiz, "sw.src.js"), "utf8");

  it("hay un mensaje para purgar y el SW lo atiende", () => {
    // Sin esto, el logout borra el HTML y la navegación siguiente lo vuelve a
    // cachear: el borrado se deshace en la misma visita.
    expect(sw).toContain("message");
    expect(sw).toContain("purgar");
  });

  it("el SW borra también los payloads RSC", () => {
    // Los RSC llevan el texto de la nota igual que el HTML. Borrar solo el HTML
    // deja la nota en el caché de todos modos.
    expect(sw).toMatch(/__rsc__/);
  });
});