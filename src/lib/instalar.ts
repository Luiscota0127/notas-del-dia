/**
 * ¿Se puede "agregar a inicio" en este dispositivo?
 *
 * Todo en funciones puras con la firma explícita, sin leer `navigator` adentro.
 * Es lo que hace testeable: la diferencia entre iPhone, iPad, Chrome en iOS y un
 * navegador embebido de Instagram es un detalle del user agent, y esa es
 * exactamente la clase de cosa que hay que poder probar sin un iPhone.
 */

/**
 * ¿Es Safari en iOS o iPadOS?
 *
 * Tres trampas, las tres aprendidas a golpes:
 *
 * 1. iPadOS 13+ se hace pasar por Mac: user agent "Macintosh". Sin mirar el
 *    touch, un iPad no se detecta y el nudge no aparece nunca.
 * 2. Chrome, Firefox y Edge en iOS usan WebKit —el mismo motor— pero NO respetan
 *    el manifest, así que "agregar a inicio" no instala nada. Mostrarles el
 *    nudge es prometer algo que no pasa.
 * 3. Los navegadores embebidos (Instagram, Facebook, WhatsApp) pueden abrir la
 *    app pero no pueden instalarla. Mismo motivo.
 */
export function esSafariIos(userAgent: string, maxTouchPoints: number): boolean {
  const esAppleMovil = /iPad|iPhone|iPod/.test(userAgent);
  const esIpadOs13 = /Macintosh/.test(userAgent) && maxTouchPoints > 1;
  if (!esAppleMovil && !esIpadOs13) return false;

  if (/FBAN|FBAV|Instagram|Line\/|Twitter|LinkedInApp|Snapchat|MicroMessenger|Bytedance/i.test(userAgent)) {
    return false;
  }

  if (/CriOS|FxiOS|EdgiOS|OPiOS|OPT\//.test(userAgent)) return false;

  return /Safari/.test(userAgent);
}

/**
 * ¿Está la app ya en la pantalla de inicio?
 *
 * `navigator.standalone` es el modo propio de iOS; `display-mode: standalone`
 * es el estándar, que además sirve si algún día corre en otro sitio. Con que
 * uno de los dos dé positivo, está instalada.
 */
export function estaInstalada(
  standaloneIos: boolean,
  displayModeStandalone: boolean,
): boolean {
  return standaloneIos || displayModeStandalone;
}

/**
 * ¿Corresponde ofrecer instalar?
 *
 * Tres motivos para NO hacerlo:
 *
 *   1. ya está instalada — el nudge sería un icono para abrir lo que ya está
 *      abierto;
 *   2. la persona ya lo descartó — un aviso que vuelve es peor que ninguno;
 *   3. no es Safari iOS, donde no hay forma de instalarla desde la web.
 */
export function deberiaOfrecerInstalar({
  userAgent,
  maxTouchPoints,
  standaloneIos,
  displayModeStandalone,
  descartada,
}: {
  userAgent: string;
  maxTouchPoints: number;
  standaloneIos: boolean;
  displayModeStandalone: boolean;
  descartada: boolean;
}): boolean {
  if (estaInstalada(standaloneIos, displayModeStandalone)) return false;
  if (descartada) return false;
  return esSafariIos(userAgent, maxTouchPoints);
}

/** Cuánto esperamos antes de guardar el "no" solo. */
export const SEGUNDOS_PARA_CERRAR = 45;

const CLAVE = "instalacion-descartada";

export function fueDescartada(): boolean {
  try {
    return localStorage.getItem(CLAVE) === "1";
  } catch {
    // Modo privado sin localStorage: se ofrece cada vez. Peor que ideal.
    return false;
  }
}

export function descartarInstalacion(): void {
  try {
    localStorage.setItem(CLAVE, "1");
  } catch {
    // idem
  }
}
