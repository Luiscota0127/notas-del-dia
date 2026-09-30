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
-- Para dos personas esto se comporta como la lista de mandado. Para seis, es un
-- sistema de agendas de verdad.

-- ---------------------------------------------------------------------------
-- agendas
-- ---------------------------------------------------------------------------
create table agendas (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (char_length(btrim(name)) between 1 and 60),
  color       text not null default '#f59e0b',
  created_by  uuid not null references profiles(id) on delete cascade,
  created_at  timestamptz not null default now()
);

comment on table agendas is
  'Una agenda compartida. La libreta personal de cada quien es una agenda con un solo miembro.';

create trigger agendas_touch before update on agendas
  for each row execute function touch_updated_at();

-- ---------------------------------------------------------------------------
-- agenda_miembros
-- ---------------------------------------------------------------------------
-- La pertenencia es lo que decide todo. No hay boolean "compartida": compartir
-- es agregar un segundo fila acá, y no compartir es tener una sola.
create table agenda_miembros (
  agenda_id  uuid not null references agendas(id) on delete cascade,
  profile_id uuid not null references profiles(id) on delete cascade,
  rol        text not null default 'miembro' check (rol in ('dueno', 'miembro')),
  joined_at  timestamptz not null default now(),
  primary key (agenda_id, profile_id)
);

-- La lista de agendas de una persona es su pantalla de inicio. Este índice la
-- resuelve sin sort y es el hot path de cada carga.
create index agenda_miembros_perfil on agenda_miembros (profile_id, agenda_id);

-- ---------------------------------------------------------------------------
-- agenda_invitaciones
-- ---------------------------------------------------------------------------
-- Una invitación pendiente: alguien con este email puede unirse a la agenda.
create table agenda_invitaciones (
  id          uuid primary key default gen_random_uuid(),
  agenda_id   uuid not null references agendas(id) on delete cascade,
  email       text not null,
  invited_by  uuid not null references profiles(id) on delete cascade,
  created_at  timestamptz not null default now(),
  -- Una invitación por email por agenda: invitar dos veces no crea dos filas.
  unique (agenda_id, email)
);

create index agenda_invitaciones_email on agenda_invitaciones (email);

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
alter table notes add column agenda_id uuid references agendas(id) on delete cascade;

-- Subquery y no un UPDATE ... FROM: si una persona llegara a tener dos agendas,
-- el join devolvería dos filas y Postgres elige una al azar. Con LIMIT 1 y
-- orden por fecha, la que se elige es la más antigua y siempre es la misma.
update notes n
set agenda_id = (
  select a.id from agendas a
  where a.created_by = n.user_id
  order by a.created_at asc
  limit 1
)
where n.agenda_id is null;

alter table notes alter column agenda_id set not null;

alter table notes drop constraint notes_user_id_date_key;
alter table notes drop column user_id;

create unique index notes_agenda_date on notes (agenda_id, date);
create index notes_agenda_date_desc on notes (agenda_id, date desc);

drop index notes_user_date_desc;

-- ---------------------------------------------------------------------------
-- lista: de singleton global a una por agenda
-- ---------------------------------------------------------------------------
alter table lista add column agenda_id uuid references agendas(id) on delete cascade;

-- La lista que ya existe era global y compartida por la pareja. Va a la agenda
-- más antigua, que es la primera libreta personal que se creó. Es una decisión
-- arbitraria y está anotada como tal: si al importar preferís otra, es cambiar
-- el ORDER BY.
update lista set agenda_id = (select id from agendas order by created_at asc limit 1);

alter table lista alter column agenda_id set not null;

drop index lista_singleton;
create unique index lista_agenda_singleton on lista (agenda_id);

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table agendas enable row level security;
alter table agenda_miembros enable row level security;
alter table agenda_invitaciones enable row level security;

drop policy "own notes" on notes;
drop policy "leer la lista" on lista;
drop policy "escribir la lista" on lista;
drop policy "actualizar la lista" on lista;

-- agendas --------------------------------------------------------------------
create policy "leer mis agendas" on agendas
  for select using (es_miembro(id, auth.uid()));

create policy "crear agenda" on agendas
  for insert with check (created_by = auth.uid());

create policy "editar mis agendas" on agendas
  for update using (es_miembro(id, auth.uid()));

create policy "borrar agenda propia" on agendas
  for delete using (es_dueno(id, auth.uid()));

-- agenda_miembros ------------------------------------------------------------
-- Solo el dueño invite o saca gente. Un miembro no puede ampliar la agenda a
-- espaldas de los demás.
create policy "leer miembros de mis agendas" on agenda_miembros
  for select using (es_miembro(agenda_id, auth.uid()));

create policy "agregar miembros si soy dueño" on agenda_miembros
  for insert with check (es_dueno(agenda_id, auth.uid()));

create policy "sacar miembros si soy dueño" on agenda_miembros
  for delete using (es_dueno(agenda_id, auth.uid()));

-- agenda_invitaciones --------------------------------------------------------
-- El dueño ve las invitaciones que él mandó.
create policy "leer invitaciones que mandé" on agenda_invitaciones
  for select using (es_dueno(agenda_id, auth.uid()));

create policy "mandar invitaciones si soy dueño" on agenda_invitaciones
  for insert with check (es_dueno(agenda_id, auth.uid()));

create policy "revocar invitaciones" on agenda_invitaciones
  for delete using (es_dueno(agenda_id, auth.uid()));

-- Y el invitado ve la suya propia, que es como aparece "te invitaron a X" en la
-- app. Sin esta policy, abrir una invitación te daría una pantalla vacía.
create policy "leer mi invitación" on agenda_invitaciones
  for select using (
    lower(email) = lower((select email from auth.users where id = auth.uid()))
  );

-- notes ----------------------------------------------------------------------
-- Los dos leen y los dos escriben en las agendas donde son miembros. Mismo
-- criterio que tenía `lista`.
create policy "leer notas de mis agendas" on notes
  for select using (es_miembro(agenda_id, auth.uid()));

create policy "escribir notas de mis agendas" on notes
  for insert with check (es_miembro(agenda_id, auth.uid()));

create policy "actualizar notas de mis agendas" on notes
  for update using (es_miembro(agenda_id, auth.uid()))
  with check (es_miembro(agenda_id, auth.uid()));

-- Sin policy de delete: una nota no se borra desde el celular por accidente.
create policy "borrar notas de mis agendas" on notes
  for delete using (es_dueno(agenda_id, auth.uid()));

-- lista ----------------------------------------------------------------------
create policy "leer la lista de mis agendas" on lista
  for select using (es_miembro(agenda_id, auth.uid()));

create policy "escribir la lista de mis agendas" on lista
  for insert with check (es_miembro(agenda_id, auth.uid()));

create policy "actualizar la lista de mis agendas" on lista
  for update using (es_miembro(agenda_id, auth.uid()))
  with check (es_miembro(agenda_id, auth.uid()));

-- ---------------------------------------------------------------------------
-- Realtime
-- ---------------------------------------------------------------------------
-- Ya estaba en la publication (0002). Sigue funcionando: el filtro de la
-- suscripción pasa de user_id a agenda_id, pero la publication solo necesita
-- saber que la tabla se avisa.
