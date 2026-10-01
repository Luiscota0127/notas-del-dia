import { describe, expect, it } from "vitest";

import {
  ANTICIPACION_MINUTOS,
  clavesViejas,
  elegirPendientes,
  leToca,
  recordatoriosDe,
  textoDelAviso,
  VENTANA_MINUTOS,
  VIEJO_MINUTOS,
  type Nota,
} from "@/lib/recordatorio";

/**
 * Los recordatorios.
 *
 * Lo que se prueba acá es la parte que no se puede probar a ojo: la deduplicación
 * y la ventana de tiempo. Un aviso duplicado o que nunca llega se ven en cinco
 * minutos de uso normal; una regla mal puesta se ve recién en producción, con
 * el cron corriendo cada 5 minutos y nadie mirando.
 */

const HOY = "2026-09-01";

function nota(body: string, fecha = HOY, userId = "u1"): Nota {
  return { userId, userName: "Nahomi", agendaId: "ag1", fecha, body };
}

/** "7:30am" → 450. Para escribir los casos en hora legible. */
const h = (hora: string) => {
  const m = /^(\d{1,2}):(\d{2})(am|pm)$/.exec(hora)!;
  return (Number(m[1]) % 12) * 60 + Number(m[2]) + (m[3] === "pm" ? 720 : 0);
};

describe("qué líneas tienen hora", () => {
  it("agarra las que el parser reconhece como hora", () => {
    const n = nota("☐ 7:30am publicar ventas y promo\n☐ comprar café");
    // "Ahora" son las 7:25: la línea de las 7:30 está dentro de la ventana.
    const r = recordatoriosDe(n, h("7:25am"), HOY);
    expect(r).toHaveLength(1);
    expect(r[0].hora).toBe("7:30am");
    expect(r[0].texto).toBe("publicar ventas y promo");
    expect(r[0].minutos).toBe(450);
  });

  it("ignora las líneas sin hora", () => {
    // "comprar café" tiene hora de reloj pero no hora de agenda: no se avisa.
    const r = recordatoriosDe(nota("☐ comprar café a las 5"), h("5:00pm"), HOY);
    expect(r).toHaveLength(0);
  });

  it("una línea que es solo la hora no genera aviso", () => {
  // Es el momento en que más probable es que se escriba: la hora primero, el
  // texto después. Si "☐ 12:10pm " soltaba aviso, saltaría un toast sin nada
  // que decir y la línea quedaría marcada: el texto que viniera después no
  // volvería a avisar nunca.
  const r = recordatoriosDe(nota("☐ 12:10pm "), 731, HOY);
  expect(r).toHaveLength(0);
});

it("la misma línea con texto sí avisa", () => {
  const r = recordatoriosDe(nota("☐ 12:10pm comprar pan"), 731, HOY);
  expect(r).toHaveLength(1);
  expect(r[0].texto).toBe("comprar pan");
});

it("ignora las líneas ya marcadas", () => {
    // Una tarea hecha no se recuerda. Es lo que hace que el contador y el aviso
    // no se contradigan.
    const r = recordatoriosDe(nota("☑ 7:30am ya la hice"), h("7:25am"), HOY);
    expect(r).toHaveLength(0);
  });

  it("agarra los rangos", () => {
    const r = recordatoriosDe(nota("☐ 7:00pm a 9:00pm luis didi"), h("6:55pm"), HOY);
    expect(r).toHaveLength(1);
    expect(r[0].hora).toBe("7:00pm");
  });

  it("agarra las horas con punto", () => {
    const r = recordatoriosDe(nota("☐ 6:00 p.m. ejercicio"), h("5:55pm"), HOY);
    expect(r).toHaveLength(1);
  });

  it("no agarra una hora imposible", () => {
    const r = recordatoriosDe(nota("☐ 25:00pm nada"), 700, HOY);
    expect(r).toHaveLength(0);
  });

  it("no requiere checkbox: una línea con hora también cuenta", () => {
    // La referencia tiene "7:30am publicar ventas" SIN checkbox. Si el aviso
    // exigiera `kind === "check"`, esa línea —que es de las que ella escribe—
    // nunca se recordaría.
    const r = recordatoriosDe(nota("7:30am publicar ventas y promo"), h("7:25am"), HOY);
    expect(r).toHaveLength(1);
  });
});

describe("la ventana de aviso", () => {
  it("avisa antes de la hora, no en el minuto exacto", () => {
    // 9:55 mirando la línea de las 10:10: 15 minutos adelante, fuera de ventana.
    const lejos = recordatoriosDe(nota("☐ 10:10am algo"), h("9:55am"), HOY);
    expect(lejos).toHaveLength(0);

    // 10:00 mirando las 10:10: entra, porque avisar en el minuto es tarde.
    // Este es exactamente el borde de ANTICIPACION_MINUTOS.
    const justo = recordatoriosDe(nota("☐ 10:10am algo"), h("10:00am"), HOY);
    expect(justo).toHaveLength(1);

    // 10:05: todavía dentro.
    const dentro = recordatoriosDe(nota("☐ 10:10am algo"), h("10:05am"), HOY);
    expect(dentro).toHaveLength(1);
  });

  it("la ventana es más ancha que los 5 minutos del cron", () => {
    // Si fuera más angosta, entre dos corridas del cron hay minutos sin
    // revisar y el aviso se pierde. Este es el número que lo evita.
    expect(VENTANA_MINUTOS).toBeGreaterThanOrEqual(5);
    expect(ANTICIPACION_MINUTOS).toBe(VENTANA_MINUTOS);
  });

  it("no manda avisos de hace una hora", () => {
    // A las 6:00pm no tiene sentido un toast diciendo "6:00pm something".
    const r = recordatoriosDe(
      nota("☐ 2:00pm vieja"),
      h("6:00pm"),
      HOY,
    );
    expect(r).toHaveLength(0);
  });

  it("todavía avisa de una línea que acaba de pasar", () => {
    const r = recordatoriosDe(nota("☐ 5:55pm hace poco"), h("6:00pm"), HOY);
    expect(r).toHaveLength(1);
  });

  it("no mira notas de días pasados", () => {
    const r = recordatoriosDe(nota("☐ 7:30am vieja", "2026-08-31"), 600, HOY);
    expect(r).toHaveLength(0);
  });

  it("una nota de mañana todavía no entra", () => {
    // Son las 23:00 y la línea dice "7:00am" de mañana: faltan 8 horas.
    const r = recordatoriosDe(nota("☐ 7:00am manana", "2026-09-02"), h("11:00pm"), HOY);
    expect(r).toHaveLength(0);
  });

  it("una nota de mañana entra cuando la hora ya pasó de ese día", () => {
    // El ejecutor recalcula "ahora" con la fecha de la nota. Si no, una nota de
    // mañana avisaría siempre en el mismo minuto de la noche anterior.
    const r = recordatoriosDe(nota("☐ 7:00am manana", "2026-09-02"), h("7:05am"), "2026-09-02");
    expect(r).toHaveLength(1);
  });

  it("el límite de viejez es el mismo para días futuros", () => {
    expect(VIEJO_MINUTOS).toBeGreaterThan(0);
  });
});

describe("a quién le toca", () => {
  const conLuis = {
    fecha: HOY,
    linea: "☐ 7:30amalgo (Luis)",
    hora: "7:30am",
    minutos: 450,
    texto: "algo (Luis)",
    responsables: ["Luis"],
    clave: "k",
  };

  it("con 'all' le avisa de todo", () => {
    expect(leToca(conLuis, "all", "Nahomi")).toBe(true);
  });

  it("con 'none' no le avisa de nada", () => {
    expect(leToca(conLuis, "none", "Nahomi")).toBe(false);
  });

  it("con 'mine' le avisa de lo suyo", () => {
    expect(leToca({ ...conLuis, responsables: ["Nahomi"] }, "mine", "Nahomi")).toBe(true);
  });

  it("con 'mine' no le avisa de lo de la pareja", () => {
    expect(leToca(conLuis, "mine", "Nahomi")).toBe(false);
  });

  it("una línea sin responsables es de la casa: avisa a los dos", () => {
    // Si no fuera así, con 'mine' nadie recibiría las tareas sin nombre, que
    // son la mayoría.
    const sinNombre = { ...conLuis, responsables: [] };
    expect(leToca(sinNombre, "mine", "Nahomi")).toBe(true);
    expect(leToca(sinNombre, "mine", "Luis")).toBe(true);
  });
});

describe("la deduplicación", () => {
  const n = nota("☐ 7:30am publicar");

  it("la clave lleva agenda, fecha, hora y línea", () => {
    // El id de agenda va adelante: desde 0005 las notas son por agenda, y sin él
    // las dos personas de una agenda comparten clave y una se queda sin aviso.
    const r = recordatoriosDe(n, h("7:25am"), HOY);
    expect(r[0].clave).toBe(`ag1|${HOY}|7:30am|0`);
  });

  it("dos agendas del mismo día no comparten clave", () => {
    const a = recordatoriosDe(nota("☐ 7:30am algo"), h("7:25am"), HOY);
    const b = recordatoriosDe(
      { ...nota("☐ 7:30am algo"), agendaId: "ag2" },
      h("7:25am"),
      HOY,
    );
    expect(a[0].clave).not.toBe(b[0].clave);
  });

  it("sin agenda la clave igual es única por fecha", () => {
    // El toast in-app no pasa agendaId y tiene que poder usar la misma función.
    const r = recordatoriosDe(
      { userId: "u1", userName: "N", fecha: HOY, body: "☐ 7:30am algo" },
      h("7:25am"),
      HOY,
    );
    expect(r[0].clave).toBe(`|${HOY}|7:30am|0`);
  });

  it("no manda lo mismo dos veces", () => {
    const r = recordatoriosDe(n, h("7:25am"), HOY);
    const recordatorio = r[0];

    const primera = elegirPendientes(
      [{ recordatorio, nota: n }],
      {},
      "all",
      "Nahomi",
    );
    expect(primera.aEnviar).toHaveLength(1);
    expect(Object.keys(primera.notified)).toHaveLength(1);

    // La segunda pasada, con lo que quedó guardado: no manda nada.
    const segunda = elegirPendientes(
      [{ recordatorio, nota: n }],
      primera.notified,
      "all",
      "Nahomi",
    );
    expect(segunda.aEnviar).toHaveLength(0);
  });

  it("no toca el objeto que recibe", () => {
    const r = recordatoriosDe(n, h("7:25am"), HOY);
    const original = {};
    elegirPendientes([{ recordatorio: r[0], nota: n }], original, "all", "Nahomi");
    expect(original).toEqual({});
  });

  it("no marca como enviado lo que no le toca", () => {
    // Importante: si marcara igual, la línea se perdería para el otro.
    const r = recordatoriosDe(nota("☐ 7:30am suya (Luis)"), h("7:25am"), HOY);
    const res = elegirPendientes(
      [{ recordatorio: r[0], nota: n }],
      {},
      "mine",
      "Nahomi",
    );
    expect(res.aEnviar).toHaveLength(0);
    expect(res.notified).toEqual({});
  });

  it("dos personas reciben la misma línea", () => {
    const r = recordatoriosDe(nota("☐ 7:30am de la casa"), h("7:25am"), HOY);
    const paraNahomi = elegirPendientes([{ recordatorio: r[0], nota: n }], {}, "all", "Nahomi");
    const paraLuis = elegirPendientes([{ recordatorio: r[0], nota: n }], {}, "all", "Luis");
    expect(paraNahomi.aEnviar).toHaveLength(1);
    expect(paraLuis.aEnviar).toHaveLength(1);
  });

  it("las claves viejas se pueden podar", () => {
    const notified = {
      "ag1|2026-09-01|7:30am|0": "2026-09-01",
      "ag1|2026-08-20|7:30am|0": "2026-08-20",
    };
    const viejas = clavesViejas(notified, HOY);
    expect(viejas).toEqual(["ag1|2026-08-20|7:30am|0"]);
  });

  it("podar no borra lo de hoy", () => {
    const notified = { "ag1|2026-09-01|7:30am|0": "2026-09-01" };
    expect(clavesViejas(notified, HOY)).toEqual([]);
  });

  it("una clave con fecha inválida no se toca", () => {
    // Podar a ciegas dejaría la columna sin las claves que sí importan.
    expect(clavesViejas({ "x|y|z": "no-es-fecha" }, HOY)).toEqual([]);
  });
});

describe("el texto del aviso", () => {
  it("pone la hora adelante y el texto después", () => {
    const r = recordatoriosDe(nota("☐ 7:30am publicar ventas"), h("7:25am"), HOY);
    expect(textoDelAviso(r[0])).toBe("7:30am publicar ventas");
  });

  it("agrega de quién es", () => {
    const r = recordatoriosDe(nota("☐ 7:30am algo (Luis)"), h("7:25am"), HOY);
    expect(textoDelAviso(r[0])).toBe("7:30am algo (Luis) · Luis");
  });

  it("es corto: entra en el reloj sin cortarse", () => {
    const r = recordatoriosDe(
      nota("☐ 7:30am una tarea de verdad muy larga para ver si entra o se corta"),
      h("7:25am"),
      HOY,
    );
    expect(textoDelAviso(r[0]).length).toBeLessThan(80);
  });
});

describe("casos borde que rompen la lógica", () => {
  it("una nota vacía no rompe nada", () => {
    expect(recordatoriosDe(nota(""), 600, HOY)).toEqual([]);
  });

  it("solo espacios tampoco", () => {
    expect(recordatoriosDe(nota("   \n  "), 600, HOY)).toEqual([]);
  });

  it("varias líneas con hora en la misma ventana", () => {
    const r = recordatoriosDe(
      nota("☐ 10:00am a\n☐ 10:05am b\n☐ 10:09am c"),
      h("10:00am"),
      HOY,
    );
    expect(r).toHaveLength(3);
  });

  it("la medianoche no se confunde con el mediodía", () => {
    const doce = recordatoriosDe(nota("☐ 12:00am algo"), h("12:00am"), HOY);
    expect(doce[0].minutos).toBe(0);

    const doceM = recordatoriosDe(nota("☐ 12:00pm algo"), h("12:00pm"), HOY);
    expect(doceM[0].minutos).toBe(720);
  });

  it("las 23:59 no se pierden por el rollover", () => {
    const r = recordatoriosDe(nota("☐ 11:59pm dormir"), h("11:55pm"), HOY);
    expect(r).toHaveLength(1);
  });
});