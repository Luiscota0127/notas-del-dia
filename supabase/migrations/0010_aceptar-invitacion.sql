-- 0010_aceptar-invitacion.sql
--
-- Arregla el compartir agendas, que estaba roto en los DOS pasos.
--
-- El síntoma era "no veo las agendas compartidas", y detrás había dos fallas
-- distintas. Ninguna de las dos se veía desde la app: la invitación se filtraba
-- en silencio y "Unirme" fallaba en silencio.
--
-- 1. La invitación no se veía.
--    getInvitacionesPara() hace la consulta con `agendas (...)` embebido para
--    traer el nombre. Pero la RLS de `agendas` solo deja leer las agendas de las
--    que uno es MIEMBRO, y al recibir una invitación todavía no lo es. El join
--    vuelve `agenda: null`, y /agendas filtra las invitaciones sin agenda:
--
--      const pendientes = invitaciones.filter((i) => i.agenda && ...)
--
--    O sea: la invitación existía, se leía bien, y se descartaba antes de
--    dibujarse. Por eso no aparecía ninguna.
--
-- 2. "Unirme" no funcionaba.
--    La policy de insert en agenda_miembros exige es_dueno(agenda_id, auth.uid()).
--    Quien acepta una invitación no es el dueño, así que el insert se rechazaba
--    siempre. El dueño podía invitar; nadie podía unirse nunca.
--
-- El arreglo NO es aflojar las policies. Sigue siendo cierto que un miembro no
-- puede ampliar la agenda a espaldas de los demás, y eso tiene que seguir siendo
-- cierto.
--
-- Son dos funciones security definer, que corren como el dueño y saltean la
-- RLS, pero con la autorización DENTRO de la función:
--
--   - invitaciones_pendientes() solo devuelve invitaciones direcciones al correo
--     del usuario de la sesión.
--   - aceptar_invitation() solo une si hay una invitación real para ese correo.
--
-- La seguridad no se pierde: se mueve del policy a la función, que es el único
-- lugar donde se puede comprobar contra auth.users sin que el rol reviente.
--
-- Idempotente: se puede correr las veces que haga falta.

-- ---------------------------------------------------------------------------
-- El correo del usuario de la sesión.
--
-- Se repite la definición de 0006 para que este archivo se pueda correr solo.
-- ---------------------------------------------------------------------------
create or replace function mi_email(p_uid uuid)
returns text
language sql security definer set search_path = public stable as $$
  select email from auth.users where id = p_uid;
$$;

-- ---------------------------------------------------------------------------
-- Invitaciones que te hicieron y todavía no aceptaste.
--
-- Devuelve el nombre de la agenda aunque no seas miembro: es lo único que se
-- necesita para dibujar "Te invitaron a X" con su botón de Unirme.
-- ---------------------------------------------------------------------------
create or replace function invitaciones_pendientes()
returns table (
  invitacion_id   uuid,
  agenda_id       uuid,
  agenda_nombre   text,
  agenda_color    text,
  invited_by      uuid,
  invited_at      timestamptz
)
language sql security definer set search_path = public stable as $$
  select i.id, a.id, a.name, a.color, i.invited_by, i.created_at
  from agenda_invitaciones i
  join agendas a on a.id = i.agenda_id
  where mi_email(auth.uid()) is not null
    and lower(i.email) = lower(mi_email(auth.uid()))
    -- Ya sos miembro: es basura de un intento anterior que no llegó a borrar la
    -- fila, y mostrarla sería pedirle a alguien que se una a algo en lo que ya
    -- está. El filtro va acá y no en la app para que no dependa de que la app
    -- se acuerde.
    and not exists (
      select 1 from agenda_miembros m
      where m.agenda_id = i.agenda_id
        and m.profile_id = auth.uid()
    )
  order by i.created_at asc;
$$;

-- ---------------------------------------------------------------------------
-- Unirse a la agenda.
--
-- Devuelve true si te_sumó, false si no había invitación para tu correo. False
-- no es un error: es "no podías", y la app lo trata como invited.
-- ---------------------------------------------------------------------------
create or replace function aceptar_invitation(p_agenda uuid)
returns boolean
language plpgsql security definer set search_path = public as $$
declare
  v_email text;
begin
  v_email := mi_email(auth.uid());
  if v_email is null then
    return false;
  end if;

  -- Sin invitación para este correo no se entra. Es el mismo chequeo que
  -- impide aflojar la policy de agenda_miembros: cualquiera puede llamar la
  -- función, pero no puede unirse a nada que no lo hayan invitado.
  if not exists (
    select 1 from agenda_invitaciones i
    where i.agenda_id = p_agenda
      and lower(i.email) = lower(v_email)
  ) then
    return false;
  end if;

  -- El profile lo crea el trigger handle_new_user. Si falta, se crea acá para
  -- que el insert de abajo no reviente por la foreign key y la invitación no se
  -- consuma sin efecto.
  insert into profiles (id, name)
  values (auth.uid(), 'Yo')
  on conflict (id) do nothing;

  insert into agenda_miembros (agenda_id, profile_id, rol)
  values (p_agenda, auth.uid(), 'miembro')
  on conflict (agenda_id, profile_id) do nothing;

  delete from agenda_invitaciones
  where agenda_id = p_agenda
    and lower(email) = lower(v_email);

  return true;
end;
$$;

-- ---------------------------------------------------------------------------
-- Comprobación
-- ---------------------------------------------------------------------------
-- Con la sesión de la persona invitada, tiene que devolver la fila:
--
--   select * from invitaciones_pendientes();
--
-- Con la sesión de quien NO fue invitado, tiene que devolver vacío y no un error
-- de permisos:
--
--   select * from invitaciones_pendientes();
--
-- Y después de unirse:
--
--   select aceptar_invitation('<agenda_id>');   -- true
--   select * from agenda_miembros where agenda_id = '<agenda_id>';  -- aparece
--   select * from invitaciones_pendientes();    -- vacía