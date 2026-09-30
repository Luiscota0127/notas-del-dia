// Genera los íconos de la PWA desde un SVG, sin editor gráfico.
//
// Por qué un script y no un PNG dibujado a mano: los íconos tienen que poder
// regenerarse. Si mañana se cambia el acento, se corre el script y se commitear
// el resultado. Un PNG editado en un editor gráfico se desincroniza del código y
// nadie se acuerda de regenerarlo.
//
// Escribo PNG a mano porque es lo único que no necesita dependencias: zlib viene
// en node, y un PNG sin comprimir (stored blocks) es válido y loLee cualquier
// navegador. Un icono de 512x512 en RGBA sin comprimir pesa ~1 MB, que es mucho
// para un ícono; por eso comprimo con zlib, que sí está en node.

import { deflateSync } from "node:zlib";
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const aqui = dirname(fileURLToPath(import.meta.url));
const publicDir = join(aqui, "..", "public");

// Los tokens de globals.css. Si cambian, cambian acá: el ícono no puede tener
// un color que la app no usa.
const FONDO = [0x11, 0x11, 0x11, 0xff];
const ACENTO = [0xf5, 0x9e, 0x0b, 0xff];
const TEXTO = [0xe4, 0xe4, 0xe7, 0xff];

/** CRC32, para los chunks del PNG. */
const TABLA_CRC = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = TABLA_CRC[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function chunk(tipo, datos) {
  const largo = Buffer.alloc(4);
  largo.writeUInt32BE(datos.length);
  const cuerpo = Buffer.concat([Buffer.from(tipo, "ascii"), datos]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(cuerpo));
  return Buffer.concat([largo, cuerpo, crc]);
}

/** RGBA de ancho x alto a PNG. */
function aPNG(ancho, alto, pixeles) {
  const firma = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(ancho, 0);
  ihdr.writeUInt32BE(alto, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type: RGBA
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace

  // Cada scanline lleva un byte de filtro (0 = none) al principio.
  const crudo = Buffer.alloc(alto * (ancho * 4 + 1));
  for (let y = 0; y < alto; y++) {
    const offset = y * (ancho * 4 + 1);
    crudo[offset] = 0;
    pixeles.copy(crudo, offset + 1, y * ancho * 4, (y + 1) * ancho * 4);
  }

  const idat = deflateSync(crudo, { level: 9 });

  return Buffer.concat([
    firma,
    chunk("IHDR", ihdr),
    chunk("IDAT", idat),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

/**
 * El ícono: un `☐` de la referencia dibujado con líneas, no con una tipografía.
 *
 * Dibujo a mano y no renderizo el carácter porque el ancho de `☐` depende de la
 * fuente del sistema: en Windows mide una cosa, en iOS otra, y el ícono tiene que
 * ser idéntico en todos lados.
 */
function dibujar(ancho, { relleno = 0, escala = 1 } = {}) {
  const px = Buffer.alloc(ancho * ancho * 4);
  const poner = (x, y, color) => {
    if (x < 0 || y < 0 || x >= ancho || y >= ancho) return;
    const o = (y * ancho + x) * 4;
    px[o] = color[0];
    px[o + 1] = color[1];
    px[o + 2] = color[2];
    px[o + 3] = color[3];
  };

  const cx = ancho / 2;
  const cy = ancho / 2;

  // Relleno: el "maskable" necesita fondo completo hasta los bordes, porque iOS
  // recorta en círculo y sin fondo quedan esquinas transparentes.
  if (relleno) {
    for (let y = 0; y < ancho; y++) for (let x = 0; x < ancho; x++) poner(x, y, FONDO);
  }

  // El cuadrado del checkbox: cuatro bordes, cada uno con su propio loop. Un
  // loop anidado con `x1 - t` producía un extremo más grueso en la esquina
  // inferior derecha: los bordes horizontales y verticales se solapaban de a más.
  const lado = Math.round(ancho * 0.42 * escala);
  const grosor = Math.max(2, Math.round(ancho * 0.045 * escala));

  // Bordes como índices enteros inclusivos, derivados del ancho. Calcular x1
  // con Math.round(cx + lado / 2) dejaba el último píxel del lado derecho fuera
  // del loop y el borde quedaba 77% corto: el ojo no lo ve, el script sí.
  const x0 = Math.round(cx - lado / 2);
  const y0 = Math.round(cy - lado / 2);
  const x1 = x0 + lado - 1;
  const y1 = y0 + lado - 1;

  // Los cuatro bordes, cada uno con su propio loop. El borde derecho se pinta
  // desde x1 HACIA la izquierda con `x1 - t`, así que x1 tiene que ser el último
  // píxel del cuadrado, no uno más allá.
  for (let x = x0; x <= x1; x++) {
    for (let t = 0; t < grosor; t++) {
      poner(x, y0 + t, ACENTO);
      poner(x, y1 - t, ACENTO);
    }
  }
  for (let y = y0; y <= y1; y++) {
    for (let t = 0; t < grosor; t++) {
      poner(x0 + t, y, ACENTO);
      poner(x1 - t, y, ACENTO);
    }
  }

  // El check adentro: dos trazos con extremos redondeados.
  const s = lado * 0.52;
  const brazo = s * 0.42;
  const pata = s * 0.58;
  const trazo = Math.max(2, Math.round(ancho * 0.055 * escala));

  const anchoV = brazo + pata;
  const vx = cx - anchoV / 2;
  const vy = cy - lado * 0.02;
  const radio = trazo / 2;

  // Disco de radio `r`: los extremos redondeados sin una librería de vectores.
  const disco = (px, py, r) => {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (dx * dx + dy * dy <= r * r) poner(Math.round(px + dx), Math.round(py + dy), TEXTO);
      }
    }
  };

  // Trazo de (0,0) a (dx,dy), con tapas redondeadas.
  const linea = (x1, y1, x2, y2) => {
    const pasos = Math.ceil(Math.hypot(x2 - x1, y2 - y1));
    if (pasos === 0) return disco(x1, y1, radio);
    for (let i = 0; i <= pasos; i++) {
      const t = i / pasos;
      disco(x1 + (x2 - x1) * t, y1 + (y2 - y1) * t, radio);
    }
  };

  // Brazo corto: baja a la derecha hasta el vértice.
  const ax = vx;
  const ay = vy - lado * 0.2;
  const bx = vx + brazo;
  const by = vy + lado * 0.14;
  // Pata larga: sube a la derecha desde el vértice.
  const cx2 = vx + anchoV;
  const cy2 = vy - lado * 0.3;

  linea(ax, ay, bx, by);
  linea(bx, by, cx2, cy2);

  return aPNG(ancho, ancho, px);
}

mkdirSync(publicDir, { recursive: true });

const salidas = [
  ["icon-192.png", dibujar(192)],
  ["icon-512.png", dibujar(512)],
  // Maskable: iOS recorta en círculo y deja 10% de margen en cada lado. El
  // "any" con el cuadrado al 42% se vería cortado.
  ["icon-maskable-512.png", dibujar(512, { relleno: 1, escala: 0.62 })],
];

for (const [nombre, buf] of salidas) {
  writeFileSync(join(publicDir, nombre), buf);
  console.log(`${nombre}  ${(buf.length / 1024).toFixed(1)} kB`);
}
