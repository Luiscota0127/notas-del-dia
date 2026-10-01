/**
 * Contraste WCAG.
 *
 * Existe porque el `visual.md` pide contraste AA y nunca se midió. "Se ve bien"
 * en una pantalla con el brillo al máximo no es un dato.
 *
 * Todo puro y sin dependencias: son cuatro fórmulas de la spec, y una dependencia
 * para calcular un ratio sería más código del que calcula.
 */

/** `#e4e4e7` o `#fff` → `[228, 228, 231]`. `null` si no es un hex de 3 o 6. */
export function hexToRgb(hex: string): [number, number, number] | null {
  const limpio = hex.trim().replace(/^#/, "");
  const corto =
    limpio.length === 3 || limpio.length === 4
      ? limpio
          .slice(0, 3)
          .split("")
          .map((c) => c + c)
          .join("")
      : limpio.slice(0, 6);

  if (!/^[0-9a-fA-F]{6}$/.test(corto)) return null;
  return [
    parseInt(corto.slice(0, 2), 16),
    parseInt(corto.slice(2, 4), 16),
    parseInt(corto.slice(4, 6), 16),
  ];
}

/**
 * Luminancia relativa, tal cual la define la spec.
 *
 * El pedazo importante es el `0.04045`: los canales por debajo de ese valor van
 * con una fórmula lineal y los de arriba con una exponencial. Es la razón por la
 * que el contraste de un gris medio no es "el promedio de sus canales": el ojo
 * no percibe la luz de forma lineal.
 */
export function luminancia([r, g, b]: [number, number, number]): number {
  const lineal = (c: number) => {
    const s = c / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lineal(r) + 0.7152 * lineal(g) + 0.0722 * lineal(b);
}

/** Ratio de contraste entre dos colores, de 1 (idénticos) a 21 (blanco/negro). */
export function contraste(a: string, b: string): number | null {
  const ca = hexToRgb(a);
  const cb = hexToRgb(b);
  if (!ca || !cb) return null;
  const la = luminancia(ca);
  const lb = luminancia(cb);
  const claro = Math.max(la, lb);
  const oscuro = Math.min(la, lb);
  return (claro + 0.05) / (oscuro + 0.05);
}

/** Los umbrales de la spec. */
export const UMBRAL = {
  /** Texto normal, hasta 18pt. */
  texto: 4.5,
  /** Texto grande: 24px, o 18.66px si está en negrita. */
  textoGrande: 3,
  /** Bordes y elementos de interfaz: 1.4.11. No es texto. */
  noTexto: 3,
} as const;
