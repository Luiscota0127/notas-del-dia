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
--   alter database postgres set "app.settings.notify_secret" = '<ANON_KEY>';
--
-- La Function declara verify_jwt = false y valida el secret por su cuenta, para
-- poder usar la anon key (que se puede filtrar desde el navegador) en vez de la
-- service_role.
