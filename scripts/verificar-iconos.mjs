// Verifica que el cuadrado del ícono tenga los cuatro bordes completos, sin
// esquinas cortadas. El ojo no sirve: un borde de un píxel de diferencia no se
// ve en una captura de 512px.
import { readFileSync } from "node:fs";
import { inflateSync } from "node:zlib";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const raiz = join(dirname(fileURLToPath(import.meta.url)), "..", "public");

/** Decodifica un PNG RGBA sin filtro interlineado (el que genera el script). */
function leerPNG(buf) {
  let pos = 8; // saltea la firma
  let ancho = 0;
  let alto = 0;
  const idat = [];

  while (pos < buf.length) {
    const largo = buf.readUInt32BE(pos);
    const tipo = buf.subarray(pos + 4, pos + 8).toString("ascii");
    const datos = buf.subarray(pos + 8, pos + 8 + largo);

    if (tipo === "IHDR") {
      ancho = datos.readUInt32BE(0);
      alto = datos.readUInt32BE(4);
    } else if (tipo === "IDAT") {
      idat.push(datos);
    } else if (tipo === "IEND") break;

    pos += 12 + largo;
  }

  const crudo = inflateSync(Buffer.concat(idat));
  const px = Buffer.alloc(ancho * alto * 4);
  const stride = ancho * 4;

  for (let y = 0; y < alto; y++) {
    const filtro = crudo[y * (stride + 1)];
    // El script escribe filtro 0 (none). Cualquier otro cosa no lo soportamos.
    if (filtro !== 0) throw new Error(`filtro ${filtro} en la línea ${y}, no soportado`);
    crudo.copy(px, y * stride, y * (stride + 1) + 1, (y + 1) * (stride + 1));
  }

  return { ancho, alto, px };
}

const ACENTO = [0xf5, 0x9e, 0x0b];
const FONDO = [0x11, 0x11, 0x11];

function colorEn(img, x, y) {
  const o = (y * img.ancho + x) * 4;
  return [img.px[o], img.px[o + 1], img.px[o + 2]];
}

const cerca = (a, b, tol = 12) =>
  Math.abs(a[0] - b[0]) <= tol && Math.abs(a[1] - b[1]) <= tol && Math.abs(a[2] - b[2]) <= tol;

for (const nombre of ["icon-192.png", "icon-512.png", "icon-maskable-512.png"]) {
  const img = leerPNG(readFileSync(join(raiz, nombre)));
  const { ancho, alto } = img;

  // Encontrar el cuadrado: filas y columnas con píxeles de acento.
  let minX = ancho, maxX = -1, minY = alto, maxY = -1;
  for (let y = 0; y < alto; y++) {
    for (let x = 0; x < ancho; x++) {
      if (cerca(colorEn(img, x, y), ACENTO)) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }

  const anchoSq = maxX - minX + 1;
  const altoSq = maxY - minY + 1;

  // Cada borde: recorrer un lado y contar cuántos píxeles son acento.
  const mide = (xs, ys) => {
    let n = 0, t = 0;
    for (let i = 0; i < xs.length; i++) {
      t++;
      if (cerca(colorEn(img, xs[i], ys[i]), ACENTO)) n++;
    }
    return { completos: n, total: t, pct: Math.round((n / t) * 100) };
  };

  const arriba = [];
  const abajo = [];
  for (let x = minX; x <= maxX; x++) {
    arriba.push(x, minY);
    abajo.push(x, maxY);
  }

  const izquierda = [];
  const derecha = [];
  for (let y = minY; y <= maxY; y++) {
    izquierda.push(minX, y);
    derecha.push(maxX, y);
  }

  const lados = {
    arriba: mide(arriba[0] ? arriba.filter((_, i) => i % 2 === 0) : [], arriba.filter((_, i) => i % 2 === 1)),
    abajo: mide(abajo.filter((_, i) => i % 2 === 0), abajo.filter((_, i) => i % 2 === 1)),
    izquierda: mide(izquierda.filter((_, i) => i % 2 === 0), izquierda.filter((_, i) => i % 2 === 1)),
    derecha: mide(derecha.filter((_, i) => i % 2 === 0), derecha.filter((_, i) => i % 2 === 1)),
  };

  // El maskable tiene que tener fondo en los bordes del archivo.
  const esquinas = {
    supIzq: cerca(colorEn(img, 0, 0), FONDO) || cerca(colorEn(img, 0, 0), ACENTO),
    supDer: cerca(colorEn(img, ancho - 1, 0), FONDO) || cerca(colorEn(img, ancho - 1, 0), ACENTO),
  };

  console.log(`\n${nombre}  ${ancho}x${alto}`);
  console.log(`  cuadrado: ${anchoSq}x${altoSq} en (${minX},${minY})-(${maxX},${maxY})`);
  console.log(`  ${nombre.includes("maskable") ? "fondo en esquinas: " + JSON.stringify(esquinas) : "(transparente, correcto para 'any')"}`);
  for (const [lado, r] of Object.entries(lados)) {
    const ok = r.pct === 100;
    console.log(`  ${lado.padEnd(10)} ${r.completos}/${r.total} = ${r.pct}%  ${ok ? "OK" : "<<< CORTADO"}`);
  }
}
