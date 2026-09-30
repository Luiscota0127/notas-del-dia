"use client";

import { useEffect, useRef } from "react";

import { AGENDA_DEMO } from "@/lib/demo";
import { createClient } from "@/lib/db/client";

/**
 * Realtime: avisar cuando otra persona escribe en el mismo documento.
 *
 * Sin esto, dos personas en la misma agenda se pisan sin enterarse. El
 * autoguardado manda el body entero, así que el último que escribe gana y el
 * otro pierde lo suyo sin señal.
 *
 * Con realtime el caso normal —uno escribe, el otro mira— se resuelve solo: el
 * que mira recibe el cambio y lo ve aparecer. No hace falta que recargue ni que
 * se entere de nada.
 *
 * El caso difícil es cuando los dos escriben a la vez. Ahí no hay merge que
 * haga: el texto libre es la fuente de verdad y el guardado es de cuerpo
 * completo. Lo que hace este hook es NO pisar lo que la persona está escribiendo
 * y avisarle que hay algo de la otra persona. Que decida ella.
 *
 * ponytail: una suscripción por documento, no una tabla entera. Filtrar por
 * agenda y fecha en el subscribe es lo que evita recibir los cambios de todos
 * los días de todas las agendas.
 */
export function useCambiosEnVivo({
  tabla,
  agendaId,
  fecha,
  onCambio,
}: {
  tabla: "notes" | "lista";
  agendaId: string;
  /** Ignorado para la lista, que no es por día. */
  fecha?: string;
  /** Recibe el body nuevo. Que NO escriba en el estado, solo avisar. */
  onCambio: (body: string) => void;
}) {
  // El callback cambia en cada render (típico de un closure sobre body). Guardarlo
  // en un ref evita resuscribir la suscripción 60 veces por minuto mientras se
  // escribe.
  const cb = useRef(onCambio);
  useEffect(() => {
    cb.current = onCambio;
  });

  const filtro = fecha ? `agenda_id=eq.${agendaId},date=eq.${fecha}` : `agenda_id=eq.${agendaId}`;

  useEffect(() => {
    // La agenda de demo no existe en la base. Suscribirse igual dejaría el
    // cliente esperando eventos que nunca llegan, y en desarrollo se ve un
    // canal colgado sin explicación.
    if (!agendaId || agendaId === AGENDA_DEMO) return;

    const supabase = createClient();

    const canal = supabase
      .channel(`${tabla}:${agendaId}:${fecha ?? "-"}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: tabla, filter: filtro },
        (evento) => {
          const nuevo = evento.new as { body?: unknown } | undefined;
          if (typeof nuevo?.body !== "string") return;
          cb.current(nuevo.body);
        },
      )
      .subscribe();

    return () => {
      // removeChannel y no solo unsubscribe: el canal queda en memoria del
      // cliente si no se saca, y al cambiar de fecha se acumulan.
      void supabase.removeChannel(canal);
    };
  }, [tabla, agendaId, fecha, filtro]);
}
