-- 0002_realtime.sql
-- Realtime para que los cambios de la pareja aparezcan en vivo.
-- Con RLS activa (0001), Realtime respeta las policies: cada uno solo recibe
-- eventos de sus propias filas. No hace falta nada más.

alter publication supabase_realtime add table notes;
