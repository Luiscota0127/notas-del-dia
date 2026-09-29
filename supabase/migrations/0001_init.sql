-- 0001_init.sql
-- Notas del Día: dos tablas, y solo dos.
-- Contrato: el texto libre es la fuente de verdad. notes.body es un text y nada
-- más. No hay tabla de tareas.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------------
create table profiles (
  id         uuid primary key references auth.users on delete cascade,
  name       text not null,
  color      text not null default '#f59e0b',
  -- preferencia de avisos: "all" (mía y de la pareja), "mine", "none"
  notify     text not null default 'all' check (notify in ('all', 'mine', 'none')),
  -- dedup de los emails de recordatorio. Claves "<fecha>|<hora>|<línea>".
  -- Vive acá, y no en una tabla aparte, para no inflar el schema.
  notified   jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

comment on column profiles.notified is
  'Claves de recordatorios ya enviados, para no repetir. Formato: <fecha>|<hora>|<linea>.';

-- ---------------------------------------------------------------------------
-- notes
-- ---------------------------------------------------------------------------
-- Una nota por usuario por día. Cada quien tiene su libreta, igual que en Notion.
create table notes (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references profiles(id) on delete cascade,
  date       date not null,
  body       text not null default '',
  updated_at timestamptz not null default now(),
  unique (user_id, date)
);

-- Índice para el listado descendente de la vista Semana. El unique (user_id, date)
-- ya cubre el filtro por usuario, pero no el orden inverso.
create index notes_user_date_desc on notes (user_id, date desc);

-- updated_at automático. El cliente manda el body entero; la DB controla el reloj.
create or replace function touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger notes_touch before update on notes
  for each row execute function touch_updated_at();

create trigger profiles_touch before update on profiles
  for each row execute function touch_updated_at();

-- ---------------------------------------------------------------------------
-- Seed del profile
-- ---------------------------------------------------------------------------
-- El login es por magic link, así que no hay INSERT de profile en el cliente.
-- Sin este trigger, el primer insert en notes fallaría por foreign key.
create or replace function handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into profiles (id, name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'name', split_part(new.email, '@', 1))
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
-- La base de datos es la frontera de seguridad. No se filtra nada en el cliente.
alter table profiles enable row level security;
alter table notes enable row level security;

create policy "own profile" on profiles
  for all
  using (id = auth.uid())
  with check (id = auth.uid());

create policy "own notes" on notes
  for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- La vista "Ambas" NO es una policy más permisiva: son dos queries, una por uid.
-- La pareja es el otro profile: select * from profiles where id <> auth.uid().
