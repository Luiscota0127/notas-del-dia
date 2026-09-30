import { existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * Verificar rutas contra el árbol real de App Router.
 *
 * En App Router el nombre de la carpeta ES la URL, y eso no falla en el build:
 * un link a una ruta que ya no existe compila, pasa los tests, y se descubre
 * cuando alguien lo toca.
 *
 * `/hoy` estuvo borrada después del cambio a agendas, y el ícono de inicio del
 * iPhone abría un 404 durante semanas sin que ningún test lo notara.
 */

const app = join(process.cwd(), "src", "app");

/** Busca un subdirectorio por nombre exacto. */
function buscarLiteral(dir: string, nombre: string): string | null {
  if (!existsSync(join(dir, nombre))) return null;
  const ruta = join(dir, nombre);
  return statSync(ruta).isDirectory() ? ruta : null;
}

/**
 * ¿Hay una `page.tsx` que sirva este path?
 *
 * OJO con lo que esto NO verifica. Un segmento dinámico matchea cualquier valor,
 * así que `/lo-que-sea` cae dentro de `/[agenda]` y esta función devuelve `true`.
 * Y técnicamente es cierto: la ruta existe, y devuelve 404 en runtime porque no
 * hay ninguna agenda con ese id. Por eso, para rutas que se escriben en un
 * archivo estático —el manifest, un link de la barra— hay que usar
 * `existeRutaEstatica`, que además exige que no dependan de un parámetro.
 */
export function existeRuta(pathname: string): boolean {
  const limpio = pathname.split("?")[0].replace(/\/+$/, "");
  if (limpio === "") return existsSync(join(app, "page.tsx"));

  let dir = app;
  for (const segmento of limpio.split("/").filter(Boolean)) {
    let encontrado = buscarLiteral(dir, segmento);
    if (!encontrado) {
      // Segundo intento: un `[param]` sirve cualquier valor de ese segmento.
      for (const hijo of readdirSync(dir)) {
        if (!/^\[.*\]$/.test(hijo)) continue;
        const ruta = join(dir, hijo);
        if (statSync(ruta).isDirectory()) {
          encontrado = ruta;
          break;
        }
      }
    }
    if (!encontrado) return false;
    dir = encontrado;
  }
  return existsSync(join(dir, "page.tsx"));
}

/**
 * ¿Es una ruta que se puede escribir en un archivo estático?
 *
 * Todos los segmentos tienen que ser literales. Un `[param]` se resuelve en
 * runtime, así que un `start_url` o un href con un parámetro hardcodeado no
 * puede funcionar: la agenda no existe hasta que alguien la cree.
 */
export function existeRutaEstatica(pathname: string): boolean {
  const limpio = pathname.split("?")[0].replace(/\/+$/, "");
  if (limpio === "") return existsSync(join(app, "page.tsx"));

  const segmentos = limpio.split("/").filter(Boolean);
  if (segmentos.some((s) => /^\[.*\]$/.test(s) || s.startsWith("("))) return false;

  let dir = app;
  for (const segmento of segmentos) {
    const encontrado = buscarLiteral(dir, segmento);
    if (!encontrado) return false;
    dir = encontrado;
  }
  return existsSync(join(dir, "page.tsx"));
}
