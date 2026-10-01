import { describe, expect, it } from "vitest";

import {
  deberiaOfrecerInstalar,
  esSafariIos,
  estaInstalada,
} from "@/lib/instalar";

/**
 * Detectar Safari iOS es puro manejo de user agent, y es donde está la diferencia
 * entre "la app se instala" y "el nudge promete algo que nunca pasa".
 *
 * Los user agents son reales, de navegadores que no instalan la app. Chrome en
 * iOS usa WebKit —el mismo motor que Safari— pero no respeta el manifest, así
 * que "agregar a inicio" no instala nada.
 */

// UAs reales de Safari en iPhone.
const SAFARI_IOS =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";

// iPadOS 13+ se hace pasar por Mac. Sin esto, el nudge nunca aparece en iPad.
const IPADOS_13 =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Safari/605.1.15";

const CHROME_IOS =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/126.0.0.0 Mobile/15E148 Safari/604.1";

const FIREFOX_IOS =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) FxiOS/127.0 Mobile/15E148 Safari/605.1.15";

const INSTAGRAM_IOS =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 300.0.0.0";

const CHROME_ANDROID =
  "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36";

const CHROME_DESKTOP =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

describe("solo Safari en iOS y iPad", () => {
  it("reconoce Safari en iPhone", () => {
    expect(esSafariIos(SAFARI_IOS, 5)).toBe(true);
  });

  it("reconoce iPadOS, que se hace pasar por Mac", () => {
    // El UA dice Macintosh. Lo único que lo delata es que tiene multitouch.
    expect(/Macintosh/.test(IPADOS_13)).toBe(true);
    expect(esSafariIos(IPADOS_13, 5)).toBe(true);
  });

  it("un Mac de verdad no es un iPad", () => {
    // Mismo user agent, cero puntos de contacto: es una Mac.
    expect(esSafariIos(IPADOS_13, 0)).toBe(false);
  });

  it("Chrome en iOS no, aunque use el mismo motor", () => {
    // WebKit igual, pero no respeta el manifest: ofrecer instalar sería mentir.
    expect(esSafariIos(CHROME_IOS, 5)).toBe(false);
  });

  it("Firefox en iOS tampoco", () => {
    expect(esSafariIos(FIREFOX_IOS, 5)).toBe(false);
  });

  it("Instagram no puede instalar nada, así que no se le ofrece", () => {
    expect(esSafariIos(INSTAGRAM_IOS, 5)).toBe(false);
  });

  it("Android y desktop quedan afuera", () => {
    expect(esSafariIos(CHROME_ANDROID, 5)).toBe(false);
    expect(esSafariIos(CHROME_DESKTOP, 0)).toBe(false);
  });
});

describe("ya instalada", () => {
  it("navigator.standalone cuenta", () => {
    expect(estaInstalada(true, false)).toBe(true);
  });

  it("display-mode: standalone también", () => {
    expect(estaInstalada(false, true)).toBe(true);
  });

  it("ninguno de los dos: no está", () => {
    expect(estaInstalada(false, false)).toBe(false);
  });
});

describe("cuándo ofrecer", () => {
  const base = {
    userAgent: SAFARI_IOS,
    maxTouchPoints: 5,
    standaloneIos: false,
    displayModeStandalone: false,
    descartada: false,
  };

  it("a Safari iOS que no la tiene, sí", () => {
    expect(deberiaOfrecerInstalar(base)).toBe(true);
  });

  it("a quien ya la tiene, no", () => {
    // El nudge sería un icono para abrir lo que ya está abierto.
    expect(deberiaOfrecerInstalar({ ...base, standaloneIos: true })).toBe(false);
    expect(deberiaOfrecerInstalar({ ...base, displayModeStandalone: true })).toBe(false);
  });

  it("a quien ya la descartó, no — y no vuelve", () => {
    // Un aviso que reaparece es peor que no tener aviso: entrena a ignorar.
    expect(deberiaOfrecerInstalar({ ...base, descartada: true })).toBe(false);
  });

  it("a Chrome en Android, no", () => {
    // Chrome tiene su propio prompt y su menú. Ahí el nudge es redundante.
    expect(
      deberiaOfrecerInstalar({ ...base, userAgent: CHROME_ANDROID, maxTouchPoints: 5 }),
    ).toBe(false);
  });
});
