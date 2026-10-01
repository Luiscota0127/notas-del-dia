-- 0003_cron.sql  (F4 — canal 3: email)
--
-- El email es el único canal que llega con la app cerrada. Corre en el servidor,
-- disparado por pg_cron + pg_net.
--
-- Frecuencia: 5 minutos (requiere plan Pro; en free el cron está limitado).
--
-- La Edge Function es idempotente: deduplica con profiles.notified, así que
-- correrla de más no manda emails de más.

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- El webhook llega desde Supabase, no desde un cronId de @supabase, así que
-- tiene que autenticar por secret de laEdge Function. Reemplazar antes de correr.
create or replace function invoke_notify()
returns net.http_response
language plpgsql security definer set search_path = public as $$
declare
  resp net.http_response;
begin
  select net.http_post(
    url     := current_setting('app.settings.notify_url', true),
    headers := jsonb_build_object(
                 'Content-Type',  'application/json',
                 'Authorization', 'Bearer ' || current_setting('app.settings.notify_secret', true)
               ),
    body    := '{}'::jsonb,
    timeout_milliseconds := 10000
  )
  into resp;

  return resp;
end;
$$;

select cron.schedule(
  'notas-recordatorios',
  '*/5 * * * *',
  $$select invoke_notify()$$
);

-- Cómo configurar (SQL Editor, una vez):
--
--   alter database postgres set "app.settings.notify_url"    = 'https://<ref>.supabase.co/functions/v1/notify';
--   alter database postgres set "app.settings.notify_secret" = '<NOTIFY_SECRET>';
--
-- <NOTIFY_SECRET> es un string largo y propio, NO la anon key. Antes este
-- comentario decía <ANON_KEY> y la Function comparaba eso: la anon key se puede
-- leer desde el bundle del navegador, así que cualquiera que abriera las devtools
-- podía disparar la Function. El secret propio se genera con
-- `openssl rand -hex 32` y se pone también en los secretos de la Function.
--
-- La Function declara verify_jwt = false porque el webhook llega desde pg_cron y
-- no como un cronId de @supabase: no hay a qué validarlo. Valida este secret por
-- su cuenta, en tiempo constante.
--
-- Paso a paso en docs/recordatorios.md.
