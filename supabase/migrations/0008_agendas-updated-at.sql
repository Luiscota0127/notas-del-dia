-- 0008_agendas-updated-at.sql
--
-- Renombrar una agenda fallaba con 42703 (column does not exist).
--
-- El trigger `agendas_touch` ejecuta touch_updated_at(), que asigna
-- `new.updated_at`. Pero `agendas` se creó con `created_at` y nunca tuvo
-- `updated_at`: el trigger escribía en una columna que no existía.
--
-- Solo se rompía al UPDATE. El INSERT pasaba porque el trigger es BEFORE UPDATE,
-- así que dar de alta una agenda funcionaba y renombrarla no. Error 42703.
--
-- Agregar la columna y no sacar el trigger: las otras dos tablas que se escriben
-- (notes, lista) tienen updated_at, y un trigger que queda sin columna no es un
-- trigger inofensivo — es un UPDATE que va a fallar cada vez que alguien lo
-- descubra dentro de seis meses.
--
-- Idempotente.

alter table agendas
  add column if not exists updated_at timestamptz not null default now();
