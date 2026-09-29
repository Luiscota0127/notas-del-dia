import { describe, expect, it } from "vitest";

import {
  addDays,
  atTime,
  emptyNoteTemplate,
  formatDayHeading,
  formatLong,
  formatMonthHeading,
  fromISODate,
  timeToMinutes,
  toISODate,
  todayISO,
} from "@/lib/format";

describe("fechas: zona horaria", () => {
  it("toISODate usa la fecha local, no UTC", () => {
    // 23:30 local del 29. Si usara toISOString() devolvería el 30 en unhuso
    // horario negativo. Este es el bug que hace que "hoy" salte de día.
    const d = new Date(2026, 8, 29, 23, 30);
    expect(toISODate(d)).toBe("2026-09-29");
  });

  it("fromISODate vuelve a medianoche local", () => {
    const d = fromISODate("2026-09-01");
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(8);
    expect(d.getDate()).toBe(1);
    expect(d.getHours()).toBe(0);
  });

  it("round-trip sin drift", () => {
    expect(toISODate(fromISODate("2026-09-01"))).toBe("2026-09-01");
  });

  it("addDays cruza el mes", () => {
    expect(addDays("2026-09-30", 1)).toBe("2026-10-01");
  });

  it("addDays cruza el año", () => {
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
  });

  it("addDays con negativo", () => {
    expect(addDays("2026-10-01", -1)).toBe("2026-09-30");
  });

  it("todayISO tiene forma YYYY-MM-DD", () => {
    expect(todayISO()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe("encabezados, formato de la referencia", () => {
  it("día: 'MARTES 01 SEP'", () => {
    // 2026-09-01 es martes.
    expect(formatDayHeading("2026-09-01")).toBe("MARTES 01 SEP");
  });

  it("el día de la semana es correcto para todos los 7", () => {
    // 2026-09-06 es domingo.
    const esperado = [
      "DOMINGO 06 SEP",
      "LUNES 07 SEP",
      "MARTES 08 SEP",
      "MIÉRCOLES 09 SEP",
      "JUEVES 10 SEP",
      "VIERNES 11 SEP",
      "SÁBADO 12 SEP",
    ];
    esperado.forEach((want, i) => {
      expect(formatDayHeading(addDays("2026-09-06", i))).toBe(want);
    });
  });

  it("mes: 'SEPTIEMBRE'", () => {
    expect(formatMonthHeading("2026-09-01")).toBe("SEPTIEMBRE");
  });

  it("los 12 meses en mayúsculas", () => {
    const meses = [
      "ENERO", "FEBRERO", "MARZO", "ABRIL", "MAYO", "JUNIO",
      "JULIO", "AGOSTO", "SEPTIEMBRE", "OCTUBRE", "NOVIEMBRE", "DICIEMBRE",
    ];
    meses.forEach((want, i) => {
      expect(formatMonthHeading(`2026-${String(i + 1).padStart(2, "0")}-15`)).toBe(want);
    });
  });

  it("formatLong para aria-labels", () => {
    expect(formatLong("2026-09-01")).toBe("martes 1 de septiembre");
  });
});

describe("plantilla del día nuevo", () => {
  it("es encabezado + blank + checkbox vacío + blank", () => {
    expect(emptyNoteTemplate("2026-09-01")).toBe("MARTES 01 SEP\n\n☐ \n\n");
  });
});

describe("timeToMinutes", () => {
  it("las 4 horas de la nota real", () => {
    expect(timeToMinutes("7:30am")).toBe(7 * 60 + 30);
    expect(timeToMinutes("1:00pm")).toBe(13 * 60);
    expect(timeToMinutes("6:00pm")).toBe(18 * 60);
    expect(timeToMinutes("11:00pm")).toBe(23 * 60);
  });

  it("acepta mayúsculas", () => {
    expect(timeToMinutes("6:00 PM")).toBe(18 * 60);
  });

  it("acepta p.m. con puntos", () => {
    expect(timeToMinutes("6:00 p.m.")).toBe(18 * 60);
  });

  it("12am es medianoche, no mediodía", () => {
    expect(timeToMinutes("12:00am")).toBe(0);
  });

  it("12pm es mediodía, no medianoche", () => {
    expect(timeToMinutes("12:00pm")).toBe(12 * 60);
  });

  it("un solo dígito de hora", () => {
    expect(timeToMinutes("7:05pm")).toBe(19 * 60 + 5);
  });

  it("rechaza lo que no es hora", () => {
    expect(timeToMinutes("7 pm")).toBeUndefined();
    expect(timeToMinutes("")).toBeUndefined();
    expect(timeToMinutes("8:99am")).toBeUndefined();
    expect(timeToMinutes("25:00pm")).toBeUndefined();
  });
});

describe("atTime", () => {
  it("combina fecha y hora en un Date local", () => {
    const d = atTime("2026-09-01", "6:00pm");
    expect(d?.getFullYear()).toBe(2026);
    expect(d?.getDate()).toBe(1);
    expect(d?.getHours()).toBe(18);
    expect(d?.getMinutes()).toBe(0);
  });

  it("undefined si la hora no parsea", () => {
    expect(atTime("2026-09-01", "noche")).toBeUndefined();
  });
});
