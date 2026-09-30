import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Realtime necesita dos sesiones autenticadas y un canal de Supabase vivo. Eso no
 * se puede probar en Node, y hacerlo en el navegador con dos perfiles es caro
 * para lo que Returns: cuatro reglas de cableado.
 *
 * Lo que sí se puede —y es lo que rompió— es leer el código y fijar que:
 *   1. la suscripción filtra por agenda, no escucha la tabla entera,
 *   2. no se pisa lo que la persona está escribiendo,
 *   3. el canal se saca al cambiar de fecha,
 *   4. no se suscribe a la agenda de demo, que no existe.
 */

const raiz = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const hook = readFileSync(join(raiz, "src", "lib", "hooks", "useRealtime.ts"), "utf8");
const cache = readFileSync(join(raiz, "src", "lib", "hooks", "useCache.ts"), "utf8");

describe("la suscripción filtra por documento", () => {
  it("no escucha la tabla entera", () => {
    // Sin filtro, cada cambio de cualquier agenda llega a todos los editores
    // abiertos: es ruido y, peor, un smartphone quemando batería.
    expect(hook).toContain("agenda_id=eq.");
    expect(hook).toContain("date=eq.");
    expect(hook).toMatch(/filter: filtro/);
  });

  it("la lista filtra solo por agenda, porque no es por día", () => {
    expect(hook).toMatch(/fecha \? `agenda_id=eq\.\$\{agendaId\},date=eq\.\$\{fecha\}` : `agenda_id=eq\.\$\{agendaId\}`/);
  });

  it("no se suscribe a la agenda de demo, que no existe", () => {
    expect(hook).toContain("AGENDA_DEMO");
    expect(hook).toMatch(/if \(!agendaId \|\| agendaId === AGENDA_DEMO\) return;/);
  });

  it("saca el canal al cambiar de fecha", () => {
    // Sin removeChannel, los canales viejos se acumulan en memoria del cliente
    // con cada día que se abre.
    expect(hook).toContain("removeChannel");
  });
});

describe("un cambio ajeno no pisa lo que se está escribiendo", () => {
  it("adopta el cambio remoto solo si no hay nada pendiente", () => {
    // El caso normal: uno escribe, el otro mira. No requiere ninguna acción.
    expect(cache).toMatch(/if \(actual !== ultimoGuardado\.current\) \{\s*setAjeno\(remoto\);\s*return;\s*\}/);
  });

  it("con cambios sin guardar, guarda el remoto y avisa en vez de pisar", () => {
    expect(cache).toContain("setAjeno(remoto)");
    expect(cache).toContain("return;");
  });

  it("ignora el eco del propio guardado", () => {
    // Realtime devuelve también lo que uno mismo acaba de guardar. Sin esto, el
    // texto salta mientras se escribe.
    expect(cache).toMatch(/if \(remoto === actual\) return;/);
  });

  it("ofrece las dos salidas, no aplica una sola", () => {
    const aviso = readFileSync(join(raiz, "src", "components", "AvisoCambioAjeno.tsx"), "utf8");
    expect(aviso).toContain("onTomar");
    expect(aviso).toContain("onDescartar");
  });
});

describe("el estado ajeno se puede descartar", () => {
  it("los dos editores reciben el aviso", () => {
    const editor = readFileSync(
      join(raiz, "src", "components", "editor", "NoteEditor.tsx"),
      "utf8",
    );
    const lista = readFileSync(
      join(raiz, "src", "app", "[agenda]", "mandado", "ListaEditor.tsx"),
      "utf8",
    );
    expect(editor).toContain("AvisoCambioAjeno");
    expect(lista).toContain("AvisoCambioAjeno");
  });
});
