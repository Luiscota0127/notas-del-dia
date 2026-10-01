import { describe, expect, it } from "vitest";

import {
  estadoDe,
  faltaPara,
  hayQuePedir,
  INTERVALO_REVISADA,
  yaAvisadoEnSesion,
  type Soporte,
} from "@/lib/permiso-notificaciones";

/**
 * El permiso de notificaciones.
 *
 * Lo que se prueba es la decisión, no la API: `Notification.requestPermission()`
 * no se puede llamar en un test sin mocks, y lo que importa decidir es qué
 * mostrarle a la persona y cuándo.
 *
 * El caso que más importa es iOS: sin instalar la app NO HAY notificaciones, y
 * decir "no soportado" hace que alguien que puede habilitarlas renuncie.
 */

const base: Soporte = {
  hayApi: true,
  esSafariIos: false,
  instalada: false,
  permiso: "default",
};

describe("el estado del permiso", () => {
  it("sin API es 'nunca' y no se pregunta", () => {
    expect(estadoDe({ ...base, hayApi: false })).toBe("nunca");
  });

  it("con permiso ya dado, listo", () => {
    expect(estadoDe({ ...base, permiso: "granted" })).toBe("granted");
  });

  it("sin decidir, hay que pedir", () => {
    expect(estadoDe({ ...base, permiso: "default" })).toBe("pedir");
  });

  it("denegado es 'nunca': preguntar de nuevo no hace nada", () => {
    // El navegador ignora un segundo pedido. Mostrar el botón sería prometer
    // algo que el navegador va a rechazar en silencio.
    expect(estadoDe({ ...base, permiso: "denied" })).toBe("nunca");
  });
});

describe("iOS: instalar es lo que habilita", () => {
  const ios = { ...base, esSafariIos: true };

  it("sin instalar, el aviso dice que hay que instalar", () => {
    // El error clásico: reportarlo como "no soportado" y perder a la persona
    // que sí podía activar las notificaciones.
    expect(estadoDe({ ...ios, instalada: false })).toBe("ios-instalada");
  });

  it("instalada y con permiso, listo", () => {
    expect(estadoDe({ ...ios, instalada: true, permiso: "granted" })).toBe("granted");
  });

  it("instalada pero sin decidir, hay que pedir", () => {
    expect(estadoDe({ ...ios, instalada: true, permiso: "default" })).toBe("pedir");
  });

  it("instalada y denegada, no se vuelve a preguntar", () => {
    expect(estadoDe({ ...ios, instalada: true, permiso: "denied" })).toBe("nunca");
  });
});

describe("cuándo mostrar el botón de pedir", () => {
  it("solo cuando hay algo que pedir", () => {
    expect(hayQuePedir("pedir")).toBe(true);
    expect(hayQuePedir("ios-instalada")).toBe(true);
  });

  it("nunca cuando ya está listo o ya no hay caso", () => {
    expect(hayQuePedir("granted")).toBe(false);
    expect(hayQuePedir("nunca")).toBe(false);
  });
});

describe("cuánto falta para avisar", () => {
  it("a las 7:20, la línea de las 7:30 todavía no toca", () => {
    // Faltan 10 minutos, y la anticipación es 10: en el borde, entra.
    expect(faltaPara(450, 440, 10)).toBe(600_000);
  });

  it("a las 7:00, la línea de las 7:30 no toca", () => {
    expect(faltaPara(450, 420, 10)).toBeUndefined();
  });

  it("a las 7:35 ya pasó la hora y sigue avisando", () => {
    // 5 minutos de atraso: todavía vale avisar. Un `undefined` acá perdería el
    // aviso entero si la app se abrió tarde. El número sale negativo porque es la
    // distancia a una hora que ya pasó.
    expect(faltaPara(450, 455, 10)).toBe(-300_000);
  });

  it("una línea de hace mucho no avisa", () => {
    expect(faltaPara(120, 700, 10)).toBeDefined();
  });

  it("el intervalo de revisada es menor que la ventana", () => {
    // Si la app espera más que la anticipación entre revisadas, se saltea la
    // línea: abre la ventana y para cuando vuelve a mirar ya pasó.
    expect(INTERVALO_REVISADA / 60_000).toBeLessThanOrEqual(10);
  });
});

describe("la deduplicación de la sesión", () => {
  it("una clave ya vista no se repite", () => {
    const vistos = new Set(["ag1|2026-09-01|7:30am|0"]);
    expect(yaAvisadoEnSesion(vistos, "ag1|2026-09-01|7:30am|0")).toBe(true);
  });

  it("una línea nueva sí se avisa", () => {
    const vistos = new Set(["ag1|2026-09-01|7:30am|0"]);
    expect(yaAvisadoEnSesion(vistos, "ag1|2026-09-01|1:00pm|3")).toBe(false);
  });

  it("sin memoria, avisa: la sesión nueva no sabe nada", () => {
    // A propósito. La deduplicación de verdad la hace el servidor; esto es solo
    // para no repetir el mismo toast en la misma sesión.
    expect(yaAvisadoEnSesion(new Set(), "ag1|2026-09-01|7:30am|0")).toBe(false);
  });
});