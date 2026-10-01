// Genera `public/sw.js` desde `sw.src.js`, con la VERSION ya resuelta.
//
// Por qué existe: un service worker con la misma VERSION no reinstala nada, y el
// iPhone sigue sirviendo el bundle viejo para siempre. El error es silencioso —
// la app abre, se ve bien, y simplemente nunca se actualiza— y depender de que
// alguien se acuerde de subir un string es confiar la corrección de un bug
// invisible a la memoria.
//
// La VERSION es un hash del contenido del propio archivo, con la línea de
// VERSION en blanco antes de hashear. Cambia si cambia una sola coma, y solo
// cambia si cambia el archivo.
//
// Por qué el fuente vive aparte y no se reescribe el archivo versionado:
// si `public/sw.js` se regenerara en cada build, git tendría ruido en cada
// commit por un archivo que no cambió de verdad.

import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const raiz = join(dirname(fileURLToPath(import.meta.url)), "..");
const FUENTE = join(raiz, "sw.src.js");
const DESTINO = join(raiz, "public", "sw.js");

/** Reemplaza la VERSION por un hash corto del contenido, en base36. */
export function versionar(contenido) {
  // Se hashea el archivo con la VERSION en blanco: si no, el hash del archivo
  // anterior entraría en el hash del nuevo y nunca se estabilizaría.
  const sinVersion = contenido.replace(/const VERSION = "[^"]*";/, "const VERSION = \"\";");
  const hash = createHash("sha256").update(sinVersion).digest("hex").slice(0, 10);
  return sinVersion.replace(
    /const VERSION = "";/,
    `const VERSION = "v${parseInt(hash, 16).toString(36)}";`,
  );
}

export function generar() {
  const destino = versionar(readFileSync(FUENTE, "utf8"));
  writeFileSync(DESTINO, destino, "utf8");
  return destino;
}

// Correr directo: `node scripts/gen-sw.mjs`
if (process.argv[1] && process.argv[1].endsWith("gen-sw.mjs")) {
  const salida = generar();
  const m = salida.match(/const VERSION = "([^"]+)"/);
  console.log(`public/sw.js generado con VERSION ${m?.[1]}`);
}
