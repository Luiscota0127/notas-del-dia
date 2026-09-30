-- 0005_agendas.sql
--
-- De "una libreta por persona" a "N agendas con miembros".
--
-- La decisión que toma este archivo: NO existe el concepto de libreta personal.
-- La libreta personal es una agenda con un solo miembro. Así el código tiene un
-- solo tipo de documento en vez de dos, y "compartir con alguien" es la única
-- manera de que haya más de una persona — que es justamente lo que se pidió.
--
-- Antes:  notes(user_id, date)  con unique(user_id, date)
-- Ahora:  notes(agenda_id, date) con unique(agenda_id, date)
--
-- RE-EJECUTABLE. Todo lleva IF EXISTS / IF NOT EXISTS a propósito: esta
-- migración se aplicó a mano en el SQL Editor, y no hay forma de saber si el
-- intento anterior hizo rollback completo o dejó la base a medias. Correrla dos
-- veces tiene que ser un no-op, no un error.

-- ---------------------------------------------------------------------------
-- Tablas
-- ---------------------------------------------------------------------------
create table if not exists agendas (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (char_length(btrim(name)) between 1 and 60),
  color       text not null default '#f59e0b',
  created_by  uuid not null references profiles(id) on delete cascade,
  created_at  timestamptz not null default now()
);

comment on table agendas is
  'Una agenda compartida. La libreta personal de cada quien es una agenda con un solo miembro.';

create table if not exists agenda_miembros (
  agenda_id  uuid not null references agendas(id) on delete cascade,
  profile_id uuid not null references profiles(id) on delete cascade,
  rol        text not null default 'miembro' check (rol in ('dueno', 'miembro')),
  joined_at  timestamptz not null default now(),
  primary key (agenda_id, profile_id)
);

-- La lista de agendas de una persona es su pantalla de inicio. Este índice la
-- resuelve sin sort y es el hot path de cada carga.
create index if not exists agenda_miembros_perfil on agenda_miembros (profile_id, agenda_id);

create table if not exists agenda_invitaciones (
  id          uuid primary key default gen_random_uuid(),
  agenda_id   uuid not null references agendas(id) on delete cascade,
  email       text not null,
  invited_by  uuid not null references profiles(id) on delete cascade,
  created_at  timestamptz not null default now(),
  unique (agenda_id, email)
);

create index if not exists agenda_invitaciones_email on agenda_invitaciones (email);

drop trigger if exists agendas_touch on agendas;
create trigger agendas_touch before update on agendas
  for each row execute function touch_updated_at();

-- ---------------------------------------------------------------------------
-- Helpers de RLS
-- ---------------------------------------------------------------------------
-- security definer OBLIGATORIO, y no por prolijidad: sin esto, la policy de
-- agendas consulta agenda_miembros, que tiene su propia RLS que consulta
-- agendas. Postgres lo detecta y tira "infinite recursion detected in policy".
-- Con security definer la función corre como el dueño y saltea la RLS.
create or replace function es_miembro(p_agenda uuid, p_uid uuid)
returns boolean
language sql security definer set search_path = public stable as $$
  select exists (
    select 1 from agenda_miembros m
    where m.agenda_id = p_agenda and m.profile_id = p_uid
  );
$$;

create or replace function es_dueno(p_agenda uuid, p_uid uuid)
returns boolean
language sql security definer set search_path = public stable as $$
  select exists (
    select 1 from agenda_miembros m
    where m.agenda_id = p_agenda and m.profile_id = p_uid and m.rol = 'dueno'
  );
$$;

-- ---------------------------------------------------------------------------
-- Trigger de alta: cada persona nueva recibe su agenda personal
-- ---------------------------------------------------------------------------
-- Se extiende handle_new_user en vez de agregar otro trigger, para que el alta
-- sea una sola transacción: profile, agenda y membresía, o nada.
create or replace function handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_agenda uuid;
begin
  insert into profiles (id, name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'name', split_part(new.email, '@', 1))
  )
  on conflict (id) do nothing;

  -- La libreta personal no es un caso especial: es una agenda con un dueño y
  -- ningún invitado. Invitar es agregar miembros, que ya existe.
  insert into agendas (name, created_by)
  values ('Mi libreta', new.id)
  returning id into v_agenda;

  insert into agenda_miembros (agenda_id, profile_id, rol)
  values (v_agenda, new.id, 'dueno');

  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Backfill: las personas que ya existen
-- ---------------------------------------------------------------------------
-- El trigger de arriba solo corre para altas nuevas. Los profiles que ya están
-- necesitan su agenda, y las notas que ya escribieron necesitan a dónde ir.
insert into agendas (name, created_by)
select 'Mi libreta', p.id
from profiles p
where not exists (select 1 from agendas a where a.created_by = p.id);

insert into agenda_miembros (agenda_id, profile_id, rol)
select a.id, a.created_by, 'dueno'
from agendas a
where not exists (
  select 1 from agenda_miembros m where m.agenda_id = a.id and m.profile_id = a.created_by
);

-- ---------------------------------------------------------------------------
-- notes: de persona a agenda
-- ---------------------------------------------------------------------------
--
-- EL ORDEN IMPORTA. Este bloque falló la primera vez con
--   2BP01: cannot drop column user_id because other objects depend on it
-- porque se dropea la columna antes que las policies.
--
-- DROP COLUMN se lleva automáticamente los índices y constraints que dependen
-- SOLO de esa columna, pero NO se lleva las policies. Hay que tirarlas a mano
-- primero. Y el índice hay que dropearlo explícitamente igual, porque después
-- del DROP COLUMN ya no existe y un `drop index` sin if exists fallaría.
drop policy if exists "own notes" on notes;
drop index if exists notes_user_date_desc;
alter table notes drop constraint if exists notes_user_id_date_key;

alter table notes add column if not exists agenda_id uuid references agendas(id) on delete cascade;

-- El mudado de datos va en un bloque que chequea si la columna sigue ahí.
--
-- Sin esto la migración NO es re-ejecutable a pesar de los IF EXISTS: si un
-- intento anterior llegó a dropear user_id, el UPDATE que la referencia falla
-- con "column does not exist" y no hay forma de distinguishing ese caso del
-- primero. El bloque convierte una falla en un no-op.
--
-- Subquery y no un UPDATE ... FROM: si una persona llegara a tener dos agendas,
-- el join devolvería dos filas y Postgres elige una al azar. Con LIMIT 1 y
-- orden por fecha, la que se elige es la más antigua y siempre es la misma.
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'notes'
      and column_name = 'user_id'
  ) then
    update notes n
    set agenda_id = (
      select a.id from agendas a
      where a.created_by = n.user_id
      order by a.created_at asc
      limit 1
    )
    where n.agenda_id is null;
  end if;
end;
$$;

alter table notes alter column agenda_id set not null;

alter table notes drop column if exists user_id;

create unique index if not exists notes_agenda_date on notes (agenda_id, date);
create index if not exists notes_agenda_date_desc on notes (agenda_id, date desc);

-- ---------------------------------------------------------------------------
-- lista: de singleton global a una por agenda
-- ---------------------------------------------------------------------------
drop policy if exists "leer la lista" on lista;
drop policy if exists "escribir la lista" on lista;
drop policy if exists "actualizar la lista" on lista;
drop index if exists lista_singleton;

alter table lista add column if not exists agenda_id uuid references agendas(id) on delete cascade;

-- La lista que ya existe era global y compartida por la pareja. Va a la agenda
-- más antigua, que es la primera libreta personal que se creó. Es una decisión
-- arbitraria y está anotada como tal: si al importar preferís otra, es cambiar
-- el ORDER BY.
update lista
set agenda_id = (select id from agendas order by created_at asc limit 1)
where agenda_id is null;

alter table lista alter column agenda_id set not null;

create unique index if not exists lista_agenda_singleton on lista (agenda_id);

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table agendas enable row level security;
alter table agenda_miembros enable row level security;
alter table agenda_invitaciones enable row level security;

-- agendas --------------------------------------------------------------------
drop policy if exists "leer mis agendas" on agendas;
create policy "leer mis agendas" on agendas
  for select using (es_miembro(id, auth.uid()));

drop policy if exists "crear agenda" on agendas;
create policy "crear agenda" on agendas
  for insert with check (created_by = auth.uid());

drop policy if exists "editar mis agendas" on agendas;
create policy "editar mis agendas" on agendas
  for update using (es_miembro(id, auth.uid()));

drop policy if exists "borrar agenda propia" on agendas;
create policy "borrar agenda propia" on agendas
  for delete using (es_dueno(id, auth.uid()));

-- agenda_miembros ------------------------------------------------------------
-- Solo el dueño invita o saca gente. Un miembro no puede ampliar la agenda a
-- espaldas de los demás.
drop policy if exists "leer miembros de mis agendas" on agenda_miembros;
create policy "leer miembros de mis agendas" on agenda_miembros
  for select using (es_miembro(agenda_id, auth.uid()));

drop policy if exists "agregar miembros si soy dueño" on agenda_miembros;
create policy "agregar miembros si soy dueño" on agenda_miembros
  for insert with check (es_dueno(agenda_id, auth.uid()));

drop policy if exists "sacar miembros si soy dueño" on agenda_miembros;
create policy "sacar miembros si soy dueño" on agenda_miembros
  for delete using (es_dueno(agenda_id, auth.uid()));

-- agenda_invitaciones --------------------------------------------------------
drop policy if exists "leer invitaciones que mandé" on agenda_invitaciones;
create policy "leer invitaciones que mandé" on agenda_invitaciones
  for select using (es_dueno(agenda_id, auth.uid()));

drop policy if exists "mandar invitaciones si soy dueño" on agenda_invitaciones;
create policy "mandar invitaciones si soy dueño" on agenda_invitaciones
  for insert with check (es_dueno(agenda_id, auth.uid()));

drop policy if exists "revocar invitaciones" on agenda_invitaciones;
create policy "revocar invitaciones" on agenda_invitaciones
  for delete using (es_dueno(agenda_id, auth.uid()));

-- Y el invitado ve la suya propia, que es como aparece "te invitaron a X" en la
-- app. Sin esta policy, abrir una invitación te daría una pantalla vacía.
drop policy if exists "leer mi invitación" on agenda_invitaciones;
create policy "leer mi invitación" on agenda_invitaciones
  for select using (
    lower(email) = lower((select email from auth.users where id = auth.uid()))
  );

-- notes ----------------------------------------------------------------------
-- Los dos leen y los dos escriben en las agendas donde son miembros. Mismo
-- criterio que tenía `lista`.
drop policy if exists "leer notas de mis agendas" on notes;
create policy "leer notas de mis agendas" on notes
  for select using (es_miembro(agenda_id, auth.uid()));

drop policy if exists "escribir notas de mis agendas" on notes;
create policy "escribir notas de mis agendas" on notes
  for insert with check (es_miembro(agenda_id, auth.uid()));

drop policy if exists "actualizar notas de mis agendas" on notes;
create policy "actualizar notas de mis agendas" on notes
  for update using (es_miembro(agenda_id, auth.uid()))
  with check (es_miembro(agenda_id, auth.uid()));

-- Borrar una nota solo lo puede el dueño de la agenda, y no desde un botón
-- suelto. Con "cualquiera con perfil" un toque mal borraba una semana.
drop policy if exists "borrar notas de mis agendas" on notes;
create policy "borrar notas de mis agendas" on notes
  for delete using (es_dueno(agenda_id, auth.uid()));

-- lista ----------------------------------------------------------------------
drop policy if exists "leer la lista de mis agendas" on lista;
create policy "leer la lista de mis agendas" on lista
  for select using (es_miembro(agenda_id, auth.uid()));

drop policy if exists "escribir la lista de mis agendas" on lista;
create policy "escribir la lista de mis agendas" on lista
  for insert with check (es_miembro(agenda_id, auth.uid()));

drop policy if exists "actualizar la lista de mis agendas" on lista;
create policy "actualizar la lista de mis agendas" on lista
  for update using (es_miembro(agenda_id, auth.uid()))
  with check (es_miembro(agenda_id, auth.uid()));

-- ---------------------------------------------------------------------------
-- Realtime
-- ---------------------------------------------------------------------------
-- Ya estaba en la publication (0002). Sigue funcionando: el filtro de la
-- suscripción pasa de user_id a agenda_id, pero la publication solo necesita
-- saber que la tabla se avisa.
