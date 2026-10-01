/*
 * notify — el canal 3: el email que llega con la app cerrada.
 *
 * Corre en el servidor, disparada por pg_cron cada 5 minutos (`0003_cron.sql`).
 * Es el único canal que funciona cuando el teléfono está en un cajón: las Web
 * Notifications de iOS no llegan en background, y el toast in-app no existe si la
 * app está cerrada. Por esto no es un extra, es la red de seguridad.
 *
 * ## Por qué es idempotente
 *
 * El cron corre cada 5 minutos y no sabe si el aviso anterior salió. La
 * deduplicación está en `profiles.notified`: una clave ya guardada no se manda
 * otra vez. Correrla de más no manda emails de más, y eso permite reintentar sin
 * miedo cuando el SMTP falla — que es lo que pasaba con el SMTP de desarrollo de
 * Supabase.
 *
 * ## Por qué el parser va adentro y no en el cliente
 *
 * "Qué línea hay que recordar" tiene que ser la MISMA regla que usa el
 * navegador. Si viviera en dos lugares, la app podría mostrar una cosa y el email
 * otra, o mandar un aviso de una línea que ya se tachó.
 *
 * La lógica está en `src/lib/recordatorio.ts` y se IMPORTA desde acá. No hay copia
 * manual: Deno resuelve rutas relativas y el archivo es TypeScript puro sin
 * imports de Next, así que el mismo código corre en los dos lados.
 *
 * Lo que sí tiene que ser explícito acá es el `parseNote`, que también se
 * importa. Si algún día `recordatorio.ts` gana un import de React o de
 * `@/lib/...`, esto deja de resolver y hay que revisarlo.
 *
 * ## El SMTP
 *
 * `SMTP_URL` tiene que ser propio (Resend, Brevo, Postmark). Con el de desarrollo
 * de Supabase el rate limit es de unas horas por IP y el servicio se corta a
 * mitad de uso.
 *
 * Enviar es `fetch` contra el endpoint HTTP del proveedor, no una librería de
 * nodemailer: son cuatro headers y un cuerpo, y meter un cliente SMTP entero en
 * Deno por eso es más código del que ahorra.
 */

import {
  clavesViejas,
  elegirPendientes,
  recordatoriosDe,
  textoDelAviso,
  type Nota,
  type PreferenciaAviso,
} from "../../../src/lib/recordatorio.ts";

/* ---------------------------------------------------------------------------
 * Config
 * ------------------------------------------------------------------------ */

const SMTP_URL = Deno.env.get("SMTP_URL") ?? "";
const SMTP_TOKEN = Deno.env.get("SMTP_TOKEN") ?? "";
const EMAIL_FROM = Deno.env.get("EMAIL_FROM") ?? "notas@ejemplo.com";
const APP_URL = Deno.env.get("APP_URL") ?? "";

/** La ventana de fechas que se miran: ayer, hoy y mañana. */
const DIAS_ALREDEDOR = 1;

/* ---------------------------------------------------------------------------
 * Auth
 * ------------------------------------------------------------------------ */

/**
 * `0003_cron.sql` manda un secret por header, porque el webhook llega desde
 * Supabase y no como un cronId de `@supabase`.
 *
 * Comparación en tiempo constante: el endpoint es público y comparar con `===`
 * sobre strings filtra el secreto byte a byte por el tiempo de respuesta.
 */
function autorizado(req) {
  const esperado = Deno.env.get("NOTIFY_SECRET");
  if (!esperado) return false;
  const recibido = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (recibido.length !== esperado.length) return false;
  let dif = 0;
  for (let i = 0; i < esperado.length; i++) {
    dif |= recibido.charCodeAt(i) ^ esperado.charCodeAt(i);
  }
  return dif === 0;
}

/* ---------------------------------------------------------------------------
 * Main
 * ------------------------------------------------------------------------ */

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "solo POST" }, 405);
  if (!autorizado(req)) return json({ error: "no autorizado" }, 401);

  try {
    return json(await correr());
  } catch (e) {
    // Se loguea entero: si esto falla en cron, nadie lo ve salvo los logs de la
    // Function, y un error silencioso acá es un recordatorio que nunca llega.
    console.error("notify fallo:", e);
    return json({ error: String(e) }, 500);
  }
});

async function correr() {
  if (!SMTP_URL) return { enviados: 0, motivo: "falta SMTP_URL" };

  const db = cliente();

  // Hora LOCAL del servidor. La base está en UTC y las notas se escriben con
  // horas locales: sin esta lectura, a las 20:00 la Function creería que son las
  // 23:00 y avisaría tres horas antes.
  const ahora = new Date();
  const hoy = isoLocal(ahora);
  const minutosAhora = ahora.getHours() * 60 + ahora.getMinutes();

  const personas = await perfilesConCorreo(db);
  if (personas.length === 0) return { enviados: 0, personas: 0, motivo: "sin perfiles" };

  const desde = isoLocal(new Date(ahora.getTime() - DIAS_ALREDEDOR * 86_400_000));
  const hasta = isoLocal(new Date(ahora.getTime() + DIAS_ALREDEDOR * 86_400_000));
  const notas = await notasDe(db, desde, hasta);

  let enviados = 0;
  const errores = [];

  for (const persona of personas) {
    // `notify: "none"` es el interruptor de privacidad: ni un email.
    if (persona.notify === "none") continue;
    if (!persona.correo) continue;

    const candidatas = [];
    for (const fila of notas) {
      // Solo las agendas donde es miembro. La Function corre con service_role y
      // no le aplica la RLS, así que este filtro es explícito y no opcional:
      // sin él cada persona recibiría los avisos de las agendas ajenas.
      if (!persona.agendas.has(fila.agendaId)) continue;

      const nota: Nota = {
        userId: persona.id,
        userName: persona.name,
        agendaId: fila.agendaId,
        fecha: fila.fecha,
        body: fila.body,
      };

      for (const recordatorio of recordatoriosDe(nota, minutosAhora, hoy)) {
        candidatas.push({ recordatorio, nota });
      }
    }

    if (candidatas.length === 0) continue;

    const { aEnviar, notified } = elegirPendientes(
      candidatas,
      persona.notified,
      persona.notify as PreferenciaAviso,
      persona.name,
    );
    if (aEnviar.length === 0) continue;

    const enviadas = [];
    for (const recordatorio of aEnviar) {
      try {
        await mandarEmail(persona.correo, recordatorio);
        enviadas.push(recordatorio.clave);
        enviados++;
      } catch (e) {
        // Uno que falla no corta el resto: si el SMTP se cae a mitad de la tanda
        // se pierde UN aviso y no los cinco.
        errores.push({ persona: persona.correo, hora: recordatorio.hora, error: String(e) });
      }
    }

    // Se guarda SOLO lo que salió. Lo que falló no se marca, así que la próxima
    // corrida lo reintenta: es lo correcto para un error de red.
    await guardarNotified(db, persona.id, podar(notified, hoy, enviadas));
  }

  return { enviados, personas: personas.length, errores };
}

/**
 * Lo que NO se manda, se desmarca.
 *
 * `notified` se arma marcando todo lo elegido, y si el envío falló esa clave
 * quedó marcada sin que nadie lo recibiera. Sin esto, un fallo de red del SMTP
 * se convierte en un recordatorio perdido para siempre: la app cree que ya lo
 * mandó y nunca lo reintenta.
 */
function podar(notified, hoy, enviadas) {
  const salida = { ...notified };
  for (const clave of clavesViejas(salida, hoy)) delete salida[clave];
  for (const clave of enviadas) salida[clave] = hoy;
  return salida;
}

/* ---------------------------------------------------------------------------
 * Datos
 * ------------------------------------------------------------------------ */

function cliente() {
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) throw new Error("faltan SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY");
  return { url: url.replace(/\/+$/, ""), key };
}

async function pedir(db, ruta, opciones = {}) {
  const r = await fetch(`${db.url}/rest/v1/${ruta}`, {
    ...opciones,
    headers: {
      apikey: db.key,
      Authorization: `Bearer ${db.key}`,
      "Content-Type": "application/json",
      ...(opciones.headers ?? {}),
    },
  });
  if (!r.ok) throw new Error(`${ruta}: ${r.status} ${(await r.text()).slice(0, 200)}`);
  return r.json();
}

/**
 * Las personas, con su correo y sus agendas.
 *
 * El correo NO está en `profiles`: vive en `auth.users`, y ni la API de REST ni
 * una sesión normal pueden leer esa tabla. Va por `auth.admin`, que es la única
 * vía con service_role. Por eso es una consulta por persona: con dos personas no
 * se nota, y es la forma de no meter la tabla de auth en el schema.
 */
async function perfilesConCorreo(db) {
  const [profiles, miembros] = await Promise.all([
    pedir(db, "profiles?select=id,name,notify,notified"),
    pedir(db, "agenda_miembros?select=agenda_id,profile_id"),
  ]);

  // Agenda → perfiles. El filtro de membresía sale de acá.
  const deAgenda = new Map();
  for (const m of miembros) {
    const lista = deAgenda.get(m.agenda_id) ?? [];
    lista.push(m.profile_id);
    deAgenda.set(m.agenda_id, lista);
  }

  const salida = [];
  for (const p of profiles) {
    const agendas = new Set();
    for (const [agendaId, ids] of deAgenda) {
      if (ids.includes(p.id)) agendas.add(agendaId);
    }
    salida.push({
      id: p.id,
      name: p.name,
      correo: await correoDe(db, p.id),
      notify: p.notify,
      notified: p.notified ?? {},
      agendas,
    });
  }
  return salida;
}

async function correoDe(db, userId) {
  const r = await fetch(`${db.url}/auth/v1/admin/users/${userId}`, {
    headers: { apikey: db.key, Authorization: `Bearer ${db.key}` },
  });
  if (!r.ok) return undefined;
  const usuario = await r.json();
  return usuario?.email ?? undefined;
}

async function notasDe(db, desde, hasta) {
  const q = new URLSearchParams({
    select: "agenda_id,date,body",
    date: `gte.${desde}`,
    and: `(date.lte.${hasta})`,
    order: "date.asc",
  });
  const filas = await pedir(db, `notes?${q}`);
  return filas.map((n) => ({ agendaId: n.agenda_id, fecha: n.date, body: n.body }));
}

async function guardarNotified(db, profileId, notified) {
  await pedir(db, `profiles?id=eq.${profileId}`, {
    method: "PATCH",
    body: JSON.stringify({ notified }),
  });
}

/* ---------------------------------------------------------------------------
 * El email
 * ------------------------------------------------------------------------ */

/**
 * Un email por recordatorio.
 *
 * Uno por línea y no uno agrupado por día a propósito: si el servidor acepta el
 * primero y rechaza el segundo, con el agrupado se pierde el día entero. Con uno
 * por línea se pierde una línea y las demás llegan.
 */
async function mandarEmail(destinatario, recordatorio) {
  const texto = textoDelAviso(recordatorio);
  // El link va a la nota de ese día. Sin agenda no se puede armar la URL —la ruta
// es /<agenda>/<fecha>— y en ese caso el email lleva solo el texto: mejor un
// aviso sin link que un link roto.
const url =
  APP_URL && recordatorio.agendaId
    ? `${APP_URL}/${recordatorio.agendaId}/${recordatorio.fecha}`
    : "";

  const r = await fetch(SMTP_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${SMTP_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: EMAIL_FROM,
      to: [destinatario],
      // El asunto es el mismo texto. El reloj del teléfono muestra el asunto, y
      // un asunto genérico obliga a abrir el mail para saber de qué era.
      subject: texto.slice(0, 78),
      text: url ? `${texto}\n\n${url}` : texto,
    }),
  });

  if (!r.ok) throw new Error(`smtp ${r.status}: ${(await r.text()).slice(0, 200)}`);
}

/* ---------------------------------------------------------------------------
 * Helpers
 * ------------------------------------------------------------------------ */

/** "YYYY-MM-DD" en hora local del servidor, no UTC. */
function isoLocal(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dia = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dia}`;
}

function json(cuerpo, status = 200) {
  return new Response(JSON.stringify(cuerpo), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}