-- 0006_fix-policy-invitaciones.sql
--
-- Arregla la policy de "leer mi invitación", que rompía /agendas y
-- /[agenda]/ajustes con un 404.
--
-- Qué pasaba: la policy comparaba contra
--
--     lower(email) = lower((select email from auth.users where id = auth.uid()))
--
-- El rol que evalúa las policies no tiene SELECT sobre auth.users. Postgres no
-- lo rechaza al crear la policy —esa sí se creó— pero explota en CADA consulta
-- con "permission denied for table users". La query de invitaciones tiraba, el
-- error subía por la page, y la pantalla moría.
--
-- El detalle que la hace difícil de debuggear: el síntoma es un 404, no un 500.
-- Un error de permisos y una agenda que no existen se ven iguales desde afuera.
--
-- El arreglo es una función security definer: corre como el dueño, saltea los
-- permisos del rol, y devuelve lo mismo.
--
-- Este archivo es idempotente: se puede correr las veces que haga falta.

create or replace function mi_email(p_uid uuid)
returns text
language sql security definer set search_path = public stable as $$
  select email from auth.users where id = p_uid;
$$;

drop policy if exists "leer mi invitación" on agenda_invitaciones;

create policy "leer mi invitación" on agenda_invitaciones
  for select using (
    mi_email(auth.uid()) is not null
    and lower(email) = lower(mi_email(auth.uid()))
  );

-- ---------------------------------------------------------------------------
-- Comprobación
-- ---------------------------------------------------------------------------
-- Después de correr esto, estas dos consultas tienen que devolver [] y no un
-- error de permisos:
--
--   select * from agenda_invitaciones;
--
-- Con la session de tu usuario:
--
--   select * from agenda_miembros where agenda_id = '<alguna agenda>';
