/**
 * La clave de acceso.
 *
 * Vive acá y no en la página del login para que haya un solo lugar que lee la
 * variable, y para que ese lugar seaobviously de servidor: si este módulo lo
 * importara un componente cliente, Next lo dejaría en `undefined` y la puerta se
 * abriría sola sin que nadie se entere.
 *
 * Sin prefijo `NEXT_PUBLIC_` a propósito. Con el prefijo, Next mete el VALOR
 * dentro del bundle de JavaScript y cualquiera que abra las herramientas de
 * desarrollo lo lee. Sería peor que no tener clave: además de no proteger nada,
 * da la sensación de que la app está cerrada.
 */

export function claveDeAcceso(): string | undefined {
  const v = process.env.ACCESO_CLAVE?.trim();
  return v ? v : undefined;
}

/** Que la puerta esté abierta a propósito cuando no hay clave puesta. */
export function hayClaveDeAcceso(): boolean {
  return claveDeAcceso() !== undefined;
}
