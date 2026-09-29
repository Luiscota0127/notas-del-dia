-- 0004_lista.sql
-- La lista de mandado: un solo documento compartido por la pareja.
--
-- Por qué una tabla y no una nota más:
--   Una nota es de UN usuario y de UN día (unique (user_id, date)). La lista es
--   de los dos y no caduca. Meterla en notes obligaría a romper una de las dos
--   reglas, y las dos importan.
--
-- Por qué sigue siendo texto libre:
--   Es un text, igual que notes.body. El parser no cambia, el editor no cambia.
--   Lo único nuevo es quién puede leerla.

create table lista (
  id         uuid primary key default gen_random_uuid(),
  -- El body completo. La lista entera en una fila, no una fila por ítem: por
  -- qué cosa seria una tabla "lista_items" que nadie consulta por item.
  body       text not null default '',
  updated_at timestamptz not null default now(),
  --updated_by para el caso de que sea útil saber quién agregó qué último. Se deja
  -- fuera a propósito: nadie lo pregunta, y agregar columnas por si acaso es
  -- sobreingeniería.
  check (char_length(body) <= 20000)
);

comment on table lista is
  'La lista de mandado. Compartida por la pareja. Un solo documento, texto libre.';

-- Una sola fila. El check lo garantiza a nivel de base, no de aplicación.
create unique index lista_singleton on lista ((true));

create trigger lista_touch before update on lista
  for each row execute function touch_updated_at();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
-- Esta es la diferencia con notes: acá los dos leen y los dos escriben.
--
-- Se modela con un rol de "miembro" para no abrir la tabla al mundo. La
-- existencia de la fila en profiles ES la membresía: si estás autenticado y tenés
-- un profile, sos de la casa.
alter table lista enable row level security;

create policy "leer la lista" on lista
  for select
  using (
    exists (select 1 from profiles where profiles.id = auth.uid())
  );

create policy "escribir la lista" on lista
  for insert
  with check (
    exists (select 1 from profiles where profiles.id = auth.uid())
  );

create policy "actualizar la lista" on lista
  for update
  using (
    exists (select 1 from profiles where profiles.id = auth.uid())
  )
  with check (
    exists (select 1 from profiles where profiles.id = auth.uid())
  );

-- Borrar la lista entera no tiene sentido y sería un accident irreversible desde
-- un celular. No hay policy de delete: nadie la puede borrar por la API.
