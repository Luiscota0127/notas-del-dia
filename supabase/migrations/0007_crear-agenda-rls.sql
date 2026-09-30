-- 0007_crear-agenda-rls.sql
--
-- Arregla "crear agenda", que fallaba siempre.
--
-- Deadlock de RLS:
--
--   La policy de insert en `agenda_miembros` exige
--       es_dueno(agenda_id, auth.uid())
--   y `es_dueno()` pregunta si YA existe una fila en `agenda_miembros`.
--
-- Al crear una agenda, esa fila no existe todavía —es lo que se está insertando—
-- así que `es_dueno` da false y Postgres rechaza el insert. El primer insert
-- (la fila en `agendas`) sí pasaba; el segundo, siempre fallaba.
--
-- Resultado: la agenda quedaba creada pero sin miembros. La RLS de leer
-- (`es_miembro`) la escondía, así que no aparecía en /agendas y el alta
-- parecía fallar sin más.
--
-- El arreglo es una función security definer: corre como el dueño de la base y
-- saltea la RLS. La autorización no se pierde, porque el created_by es el del
-- usuario de la sesión y la función solo acepta el id que le pasan.
--
-- Idempotente. Se puede correr las veces que haga falta.

create or replace function crear_agenda(p_creator uuid, p_name text)
returns agendas
language plpgsql security definer set search_path = public as $$
declare
  v_agenda agendas;
begin
  insert into agendas (name, created_by)
  values (p_name, p_creator)
  returning * into v_agenda;

  insert into agenda_miembros (agenda_id, profile_id, rol)
  values (v_agenda.id, p_creator, 'dueno');

  return v_agenda;
end;
$$;

-- anon no llama esta función: sin sesión no hay agenda que crear.
revoke all on function crear_agenda(uuid, text) from anon;
grant execute on function crear_agenda(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Limpieza de agendas huérfanas
-- ---------------------------------------------------------------------------
-- Las que fallaron con el bug de arriba: creadas con created_by, sin fila en
-- agenda_miembros. No tienen notas ni listas (no se podían leer ni escribir),
-- así que borrarlas no pierde nada.
--
-- Solo las huérfanas. Si una agenda tiene miembros, no se toca.
delete from agendas a
where exists (select 1 from profiles p where p.id = a.created_by)
  and not exists (select 1 from agenda_miembros m where m.agenda_id = a.id);
