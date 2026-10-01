-- 0009_notificado-por-agenda.sql
--
-- Los recordatorios. Prepara `profiles.notified` para el modelo de agendas.
--
-- EL PROBLEMA QUE RESUELVE
--
-- `profiles.notified` nació en 0001, cuando las notas eran por persona
-- (`notes.user_id`). Desde 0005 las notas son por agenda, y la clave de dedup
-- quedó con la forma vieja: "<fecha>|<hora>|<línea>".
--
-- Con dos personas escribiendo en la misma agenda, esa clave no distingue de
-- quién es la línea. Las dos tendrías las mismas 5 claves, y la que avisara
-- primero le ganaría la fila a la otra: un recordatorio se mandaría una sola
-- vez para las dos, o se mandaría dos veces si las líneas coincidieran.
--
-- Se cambia la clave a "<agenda>|<fecha>|<hora>|<línea>". Con el id de agenda
-- adelante, dos agendas del mismo día no se pisan, y las dos personas reciben
-- su aviso.
--
-- RE-EJECUTABLE. Se aplicó a mano en el SQL Editor; correrla dos veces tiene que
-- ser un no-op.

-- ---------------------------------------------------------------------------
-- Las claves viejas no sirven
--
-- Se vacían en vez de migrarse: son de la era "por persona" y no hay forma
-- confiable de saber a qué agenda pertenecían. Vaciar es seguro —lo peor que
-- pasa es que se mande un aviso repetido de hoy— mientras que traducirlas a
-- ciegas dejaría claves que bloquean avisos que nunca se mandaron.
update profiles set notified = '{}'::jsonb
 where notified is not null and notified <> '{}'::jsonb;

comment on column profiles.notified is
  'Claves de recordatorios ya enviados. Formato: <agenda_id>|<fecha>|<hora>|<linea>. El id de agenda va adelante porque las notas son por agenda desde 0005 y sin él las dos personas de una agenda comparten clave.';

-- ---------------------------------------------------------------------------
-- Podar lo viejo
--
-- `notified` crece para siempre sin este recorte: una línea por día por persona.
-- No es una urgencia (son unos cientos de bytes) pero el campo es jsonb y se
-- lee entero en cada corrida de la Function, así que acota el trabajo.
--
-- Las claves se podan por EDAD, mirando el pedazo de fecha de la clave, y no por
-- "las que no son de hoy": la ventana de la Function abarca el día anterior
-- (las 11:59pm de ayer siguen avisando a las 00:05), así que un recorte por día
-- dejaría avisos sin mandar en ese cruce de medianoche.
create or replace function podar_notified(p_dias integer default 3)
returns void
language sql security definer set search_path = public as $$
  update profiles p
     set notified = (
       select coalesce(jsonb_object_agg(clave, valor), '{}'::jsonb)
         from jsonb_each(p.notified) as par(clave, valor)
        -- El segundo pedazo de "agenda|fecha|hora|línea" es la fecha. Se
        -- compara como texto: ISO ordena igual que cronológicamente, y evita
        -- traer la fecha a timestamp solo para dos días de diferencia.
        where split_part(clave, '|', 2)::date >= (current_date - p_dias)
     )
   where p.notified is not null;
$$;

-- Lo corre la propia Function, no un cron aparte: una cosa menos que instalar y
-- un solo lugar donde se decide qué se poda.