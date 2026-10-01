# F4: recordatorios

Los tres canales. Son deliberados y se complementan: cada uno cubre un caso que
los otros dos no cubren.

| Canal | Dónde vive | App abierta | App en background | App cerrada |
|---|---|---|---|---|
| 1. Toast | `src/lib/hooks/useAvisos.ts` | sí | no | no |
| 2. Notificación del sistema | el mismo hook | sí | sí | no |
| 3. Email | `supabase/functions/notify` | sí | sí | **sí** |

El 3 es el que importa en iPhone. Las Web Notifications no llegan con la app en
background, así que sin email un recordatorio se pierde en el bolsillo. Ese canal
corre en el servidor con `pg_cron`, disparado por `0003_cron.sql` cada 5 minutos.

> **El login y los recordatorios usan SMTP distintos.** El login pasa por el SMTP
> que configuraste en **Authentication → Providers → Email** del panel de Supabase.
> Los recordatorios van por `SMTP_URL`, un secreto propio de la Function. Son dos
> cosas separadas: arreglar el login no arregla los recordatorios y al revés.
>
> Si el login devuelve 500 "Error sending confirmation email", el problema es el
> del panel: [`smtp-no-envia.md`](smtp-no-envia.md).

## Qué hay que instalar

Esto **no funciona hasta que se corran los pasos de abajo**. La Function es
idempotente, así que correrla de más no manda emails de más: se puede probar
tranquilo y reintentar si algo falla.

### 1. La migración

```
supabase/migrations/0009_notificado-por-agenda.sql
```

Va en el SQL Editor del proyecto. Es re-ejecutable.

Lo que hace: `profiles.notified` nació cuando las notas eran por persona
(`notes.user_id`). Desde `0005` son por agenda, y la clave vieja
`"<fecha>|<hora>|<línea>"` no distinguía de quién era la línea. Las dos personas de
una agenda compartían las mismas claves, y la que avisara primero le ganaba la
fila a la otra: **un recordatorio se mandaba una sola vez para las dos**.

La clave nueva es `"<agenda>|<fecha>|<hora>|<línea>"`.

### 2. La Edge Function

```
supabase functions deploy notify --no-verify-jwt
```

`--no-verify-jwt` es obligatorio y está anotado en el código: el webhook llega
desde `pg_cron` y no como un cronId de `@supabase`, así que hay que autenticar por
secret propio. Sin el flag, Supabase rechaza el request antes de que la Function
llegue a verlo.

### 3. Los secretos

Con `supabase secrets set`:

| Secreto | Qué es |
|---|---|
| `SMTP_URL` | Endpoint HTTP del proveedor. Resend: `https://api.resend.com/emails` |
| `SMTP_TOKEN` | API key del proveedor |
| `EMAIL_FROM` | Remitente. El proveedor tiene que tener ese dominio verificado |
| `NOTIFY_SECRET` | Lo que la Function exige como bearer token |
| `APP_URL` | La URL de producción, para armar el link a la nota |

`SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY` los pone Supabase solo.

### 4. El cron en la base

En el SQL Editor, una vez, con el ref del proyecto y un secret fuerte:

```sql
alter database postgres set "app.settings.notify_url"    = 'https://<ref>.supabase.co/functions/v1/notify';
alter database postgres set "app.settings.notify_secret" = '<NOTIFY_SECRET>';
```

Después, `0003_cron.sql` desde el SQL Editor.

**`0003_cron.sql` dice `<ANON_KEY>` en su comentario y hay que cambiarlo.** La anon
key se puede leer desde el bundle del navegador. Con `NOTIFY_SECRET` propio no
importa, pero si se deja la anon ahí, cualquiera que abra las devtools puede
disparar la Function.

## Probarlo sin esperar a la hora

La Function se puede llamar a mano. Con la nota ya escrita y una hora dentro de
la ventana (10 minutos antes de una línea con hora):

```bash
curl -X POST https://<ref>.supabase.co/functions/v1/notify \
  -H "Authorization: Bearer <NOTIFY_SECRET>" \
  -H "Content-Type: application/json" \
  -d '{}'
```

Devuelve `{ "enviados": 1, "personas": 2, "errores": [] }`.

- `enviados: 0` con una línea a punto: o la línea ya se mandó (mirá
  `profiles.notified`), o la hora está fuera de la ventana de 10 minutos.
- `errores` con contenido: el SMTP rechazó. Lo que falló **no** queda marcado, así
  que la próxima corrida lo reintenta.

Para probar el toast (canal 1) sin backend: `/casa/<fecha>?demo=1` y escribir una
línea cuya hora sea dentro de los próximos 10 minutos. En demo corre el toast pero
no la notificación del sistema.

## Por qué la deduplicación está donde está

`profiles.notified`, en vez de una tabla aparte: son unas pocas claves por día y
una tabla para eso es schema de más.

La deduplicación es lo que hace que la Function pueda correr cada 5 minutos sin
espiar. También es lo que hace seguro reintentar cuando el SMTP falla.

`podar_notified()` recorta las claves viejas por edad. Lo corre la propia Function,
no un cron aparte: una cosa menos que instalar.

## Si no llegan los emails

En orden, porque es casi siempre lo primero:

1. **`{ "enviados": 0 }`** → la Function corrió pero no eligió nada. O la ventana
   de 10 minutos, o ya estaba marcado en `notified`, o `profiles.notify` es
   `"none"` para esa persona.
2. **`{"error": "no autorizado"}`** → el secret no coincide. Es el paso 3 o el 4.
3. **Correo en `errores`** → el SMTP lo rechazó. Casi siempre es `EMAIL_FROM` sin
   verificar en el proveedor.
4. **El cron no dispara** → `select * from cron.job;` y ver si
   `notas-recordatorios` está. Requiere plan Pro; en free `pg_cron` está limitado.
5. **Llega tarde** → la Function corre cada 5 minutos, así que el aviso puede
   tener hasta 5 minutos de retraso. La anticipación de 10 minutos es lo que
   absorbe eso.