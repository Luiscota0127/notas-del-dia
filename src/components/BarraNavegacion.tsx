"use client";

import Link from "next/link";
import { useState } from "react";

import { Buscador } from "./Buscador";
import { Calendario, useContadores } from "./Calendario";
import { useAtajos, useNavegacionFecha } from "@/lib/hooks/useAtajos";
import { formatLong, fromISODate, todayISO } from "@/lib/format";

/**
 * Andamiaje de F3: calendario, navegación por día, atajos y buscador.
 * El editor no sabe nada de esto.
 */
export function BarraNavegacion({
  agendaId,
  fecha,
  cuerpos,
  me,
  partner,
  nombreAgenda,
}: {
  agendaId: string;
  fecha: string;
  /**
   * Los bodies de un rango alrededor de la fecha. Los contadores del calendario
   * se derivan de acá con useContadores, así que no hace falta un segundo array
   * `dias` server-side: sería el mismo dato dos veces.
   */
  cuerpos: Record<string, string>;
  me: { id: string; name: string; color?: string };
  partner: { id: string; name: string; color?: string } | null;
  /** Se muestra arriba: con varias agendas abiertas, saber cuál es cuál importa. */
  nombreAgenda?: string;
}) {
  const nav = useNavegacionFecha(agendaId, fecha);
  const [buscadorAbierto, setBuscadorAbierto] = useState(false);
  const [menuAbierto, setMenuAbierto] = useState(false);

  useAtajos({
    hoy: nav.hoy,
    anterior: nav.anterior,
    siguiente: nav.siguiente,
    ayer: nav.ayer,
    manana: nav.manana,
    semana: nav.semana,
    buscar: () => setBuscadorAbierto(true),
  });

  // El calendario muestra el mes de la fecha abierta.
  const d = fromISODate(fecha);
  const contadores = useContadores(
    cuerpos,
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`,
    iso(new Date(d.getFullYear(), d.getMonth() + 1, 0)),
  );

  const ir = (f: string) => nav.ir(f);
  const esHoy = fecha === todayISO();

  return (
    <>
      {/* El nombre de la agenda, arriba de todo y siempre.
          Antes solo aparecía dentro del menú móvil y como parte del texto "Ajustes
          de X" en el sidebar: en ninguna de las dos partes estaba arriba de
          nada, y con más de una agenda abierta no se sabía cuál se estaba
          mirando sin abrir el menú.

          Va DENTRO de la cabecera pegajosa en móvil y no como una barra aparte:
          dos barras pegajosas encimadas se comen la pantalla, y en un iPhone
          cada línea cuenta. */}
      {nombreAgenda && (
        <div className="hidden md:block md:col-span-full border-b border-line px-4 py-2">
          <span className="text-sm font-medium truncate">{nombreAgenda}</span>
        </div>
      )}

      {/* iPhone: cabecera compacta + menú. No hay sidebar, no entra. */}
      <header className="md:hidden border-b border-line sticky top-0 bg-bg z-20">
        {nombreAgenda && (
          <div className="px-3 pt-2 text-xs text-dim truncate">{nombreAgenda}</div>
        )}
        <div className="flex items-center gap-2 px-3 py-2">
          <Link
            href={`/${agendaId}/${todayISO()}${nav.demo}`}
            className="text-sm font-medium hover:text-accent shrink-0"
          >
            {esHoy ? "Hoy" : formatCorto(fecha)}
          </Link>
          <span className="text-dim text-sm truncate flex-1">
            {esHoy ? formatLong(fecha) : ""}
          </span>
          <button
            type="button"
            onClick={() => setBuscadorAbierto(true)}
            aria-label="Buscar"
            className="w-9 h-9 flex items-center justify-center text-dim hover:text-fg shrink-0"
          >
            <IconoBuscar />
          </button>
          <button
            type="button"
            onClick={() => setMenuAbierto(!menuAbierto)}
            aria-label="Menú"
            aria-expanded={menuAbierto}
            className="w-9 h-9 flex items-center justify-center text-dim hover:text-fg shrink-0"
          >
            <IconoMenu abierto={menuAbierto} />
          </button>
        </div>
      </header>

      {menuAbierto && (
        <div className="md:hidden p-4 border-b border-line flex flex-col gap-4">
          <Calendario dias={contadores} fecha={fecha} onIr={ir} />
          <div className="flex gap-2">
            <button type="button" onClick={nav.anterior} className="btn-ghost text-sm flex-1">
              ←
            </button>
            <button type="button" onClick={nav.hoy} className="btn-ghost text-sm flex-1">
              Hoy
            </button>
            <button type="button" onClick={nav.siguiente} className="btn-ghost text-sm flex-1">
              →
            </button>
          </div>
          <div className="flex flex-col gap-2">
            <Link
              href={`/${agendaId}/mandado${nav.demo}`}
              className="text-sm text-dim hover:text-accent"
            >
              Mandado
            </Link>
            <Link
              href={`/${agendaId}/semana${nav.demo}`}
              className="text-sm text-dim hover:text-accent"
            >
              Ver la semana
            </Link>
            <Link href="/agendas" className="text-sm text-dim hover:text-accent">
              Cambiar de agenda
            </Link>
          </div>
        </div>
      )}

      {/* Escritorio: sidebar fijo. */}
      <aside className="hidden md:block p-4 sticky top-0 h-dvh self-start flex flex-col">
        <Calendario dias={contadores} fecha={fecha} onIr={ir} />

        <div className="mt-4 flex flex-col gap-2 text-sm">
          <div className="flex gap-1">
            <button
              type="button"
              onClick={nav.anterior}
              aria-label="Día anterior"
              className="btn-ghost flex-1"
            >
              ←
            </button>
            <button type="button" onClick={nav.hoy} className="btn-ghost flex-1">
              Hoy
            </button>
            <button
              type="button"
              onClick={nav.siguiente}
              aria-label="Día siguiente"
              className="btn-ghost flex-1"
            >
              →
            </button>
          </div>
          <Link
            href={`/${agendaId}/semana${nav.demo}`}
            className="text-dim hover:text-accent"
          >
            Ver la semana
          </Link>
          <button
            type="button"
            onClick={() => setBuscadorAbierto(true)}
            className="text-dim hover:text-accent text-left"
          >
            Buscar
            <kbd className="text-dim text-xs ml-1">Ctrl K</kbd>
          </button>
          <Link
            href={`/${agendaId}/mandado${nav.demo}`}
            className="text-dim hover:text-accent font-medium"
          >
            Mandado
          </Link>

          {nombreAgenda && (
            <div className="mt-4 pt-3 border-t border-line flex flex-col gap-1 text-sm">
              {/* Sin el nombre: ya está arriba de todo. */}
              <Link
                href={`/${agendaId}/ajustes${nav.demo}`}
                className="text-dim hover:text-accent"
              >
                Ajustes de la agenda
              </Link>
              <Link href="/agendas" className="text-dim hover:text-accent">
                Cambiar de agenda
              </Link>
              <Link href="/ajustes" className="text-dim hover:text-accent">
                {me.name}
                {partner ? ` y ${partner.name}` : ""}
              </Link>
            </div>
          )}
        </div>
      </aside>

      {/* key en el contador: cada apertura remonta el Buscador, así el texto y
          la selección arrancan vacíos sin un setState en un efecto. */}
      <Buscador
        key={buscadorAbierto ? "abierto" : "cerrado"}
        agendaId={agendaId}
        bodies={cuerpos}
        abierto={buscadorAbierto}
        onCerrar={() => setBuscadorAbierto(false)}
        sufijo={nav.demo}
      />
    </>
  );
}

function iso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function formatCorto(fecha: string): string {
  const d = fromISODate(fecha);
  const mes = ["ENE","FEB","MAR","ABR","MAY","JUN","JUL","AGO","SEP","OCT","NOV","DIC"][d.getMonth()];
  return `${d.getDate()} ${mes.toLowerCase()}`;
}

// SVG inline de 3 líneas, no una librería de iconos.
function IconoBuscar() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <circle cx="7" cy="7" r="5" stroke="currentColor" strokeWidth="1.5" />
      <path d="M11 11L15 15" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

function IconoMenu({ abierto }: { abierto: boolean }) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      {abierto ? (
        <path d="M3 3L13 13M13 3L3 13" stroke="currentColor" strokeWidth="1.5" />
      ) : (
        <path d="M2 4H14M2 8H14M2 12H14" stroke="currentColor" strokeWidth="1.5" />
      )}
    </svg>
  );
}
