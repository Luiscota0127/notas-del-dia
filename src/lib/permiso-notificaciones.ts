/**
 * ¿Se pueden mostrar notificaciones del sistema?
 *
 * Misma forma que `instalar.ts`: funciones puras con la firma explícita, sin leer
 * `navigator` adentro. Lo que diferencia un iPhone de un Chrome de escritorio es
 * un detalle del user agent y del estado del permiso, y esa es exactamente la
 * clase de cosa que hay que poder probar sin un iPhone.
 *
 * ## Por qué el permiso se pide en un momento y no al cargar
 *
 * `Notification.requestPermission()` tiene que venir de un gesto de la persona.
 * Si corre al abrir la app, el navegador lo rechaza sin preguntar y no hay
 * segunda oportunidad: el permiso queda en "denegado" para siempre. Por eso
 * `planificarAviso()` devuelve que hay que pedirlo y la UI lo pide desde un
 * botón.
 */

/**
 * La decisión, no el permiso crudo.
 *
 * Son valores distintos a propósito. `Notification.permission` dice
 * "default" cuando todavía no se preguntó, y "default" no dice si hay que
 * preguntar: en iOS sin instalar la respuesta es "instalar la app", no
 * "preguntar el permiso".
 */
export type EstadoPermiso =
  /** Se puede notificar sin preguntar. */
  | "granted"
  /** Hay un botón para pedir el permiso. */
  | "pedir"
  /** En iOS, instalar la app es lo que habilita las notificaciones. */
  | "ios-instalada"
  /** Denegado o sin API: no hay nada que hacer y no se vuelve a preguntar. */
  | "nunca";

export type Soporte = {
  /** ¿Existe la API? */
  hayApi: boolean;
  /** ¿Es Safari en iOS? */
  esSafariIos: boolean;
  /** ¿Está ya en la pantalla de inicio? */
  instalada: boolean;
  /** El permiso actual. */
  permiso: "granted" | "denied" | "default";
};

/**
 * El estado, traducido a una decisión.
 *
 * - `listo`: se puede notificar sin preguntar.
 * - `pedir`: se tiene que pedir, y hay un botón para eso.
 * - `instalada`: en Safari iOS, instalar la app es lo que habilita las
 *   notificaciones. El aviso dice eso, no "no soportado".
 * - `nunca`: denegado o sin API. No se vuelve a preguntar: el navegador ya lo
 *   decidió y preguntar de nuevo es ignorado.
 */
export function estadoDe(soporte: Soporte): EstadoPermiso {
  if (!soporte.hayApi) return "nunca";

  if (soporte.esSafariIos && !soporte.instalada) return "ios-instalada";
  if (soporte.permiso === "granted") return "granted";
  if (soporte.permiso === "denied") return "nunca";
  return "pedir";
}

/** ¿Tiene sentido mostrar el botón de pedir permiso? */
export function hayQuePedir(estado: EstadoPermiso): boolean {
  return estado === "pedir" || estado === "ios-instalada";
}

/**
 * Cuánto falta para un recordatorio, en milisegundos.
 *
 * `undefined` si no hay nada que avisar todavía. El cálculo es sobre la línea, no
 * sobre un reloj: lo que importa es "faltan 8 minutos para las 7:30", no "son las
 * 7:22".
 */
export function faltaPara(
  minutosDeLaLinea: number,
  minutosAhora: number,
  anticipacion: number,
): number | undefined {
  const faltan = minutosDeLaLinea - minutosAhora;
  // Más de `anticipacion` todavía no toca avisar.
  if (faltan > anticipacion) return undefined;
  return faltan * 60_000;
}

/** Cuánto esperar entre revisadas, en ms. */
export const INTERVALO_REVISADA = 30_000;

/**
 * ¿Este recordatorio ya se avisó en ESTA sesión?
 *
 * La deduplicación de verdad es del servidor, en `profiles.notified`. Esto es solo
 * para que al cambiar de día o recargar no se repita el mismo toast: es memoria
 * del navegador y se pierde al cerrar, a propósito.
 */
export function yaAvisadoEnSesion(
  vistos: ReadonlySet<string>,
  clave: string,
): boolean {
  return vistos.has(clave);
}