# El login devuelve 500: "Error sending confirmation email"

Verificado contra la API real del proyecto el 1 de octubre de 2026. **No es un
bug de la app.** Es el SMTP configurado en el panel de Supabase.

## Cómo se comprobó

Con un correo inexistente, contra `POST /auth/v1/otp` con la anon key:

| Prueba | Resultado |
|---|---|
| `no-es-un-correo` | **400** `invalid format` |
| `prueba-xyz@dominio-que-no-existe-999.com` | **500** `Error sending confirmation email` |
| `prueba.1234@gmail.com` | **500** `Error sending confirmation email` |

Eso descarta de entrada dos cosas:

- **No es el rate limit.** El rate limit da 429, no 500.
- **No es un problema del correo ni del código.** La API valida el formato y
  responde bien; lo que falla es el envío.

Un 500 con `Error sending confirmation email` significa, siempre, que el SMTP que
configuraste **no pudo entregar el correo**.

## Las cuatro causas, en orden de probabilidad

### 1. El remitente no está verificado — la más común

Resend y Brevo **rechazan el envío** si el dominio del remitente no está
verificado. El error llega a Supabase como un 500 genérico, sin decir cuál es el
problema.

En Supabase: **Authentication → Providers → Email → SMTP Settings**. El campo
"SMTP sender" tiene que ser de un dominio que hayas verificado en el proveedor.

Con Resend, el remitente es `onboarding@resend.dev` hasta que verificás el
dominio; con ese, solo te deja enviar a tu propia dirección, no a los correos de
la otra persona.

### 2. Credenciales mal cargadas

Revisar usuario y contraseña en el mismo lugar. Un SMTP propio pide usuario y
contraseña, no una API key: son credenciales distintas.

El puerto suele ser **587** con TLS. Si usás 465, va con SSL.

### 3. Cuota o tarjeta sin verificar

Resend da 100 emails/día en el plan gratuito y pide verificar el dominio con un
DNS antes de mandar a terceros. Brevo es más generosa pero pide confirmar el
correo de la cuenta.

Si el proveedor rechaza por cuota, Supabase lo reporta igual como 500.

### 4. La app no tiene configurado el SMTP todavía

Supabase tiene su propio SMTP de desarrollo, limitado a unas pocas horas por IP
y **compartido entre las dos cuentas**. Si no llegaste a cambiarlo, un rate limit
puede aparecer como 500.

## Cómo revisarlo, en orden

1. **Supabase → Authentication → Providers → Email.** ¿Hay SMTP Settings con
   host, puerto, usuario, contraseña y remitente? ¿O sigue el de desarrollo?

2. **El remitente.** ¿El dominio está verificado en Resend/Brevo? Es el 80% de
   los casos.

3. **Las credenciales.** Usuario y contraseña, no API key. Puerto 587.

4. **Probar el SMTP desde el panel de Supabase.** Hay un botón de envío de
   prueba; si falla ahí, el problema es 100% la configuración del SMTP y no la
   app.

5. **Probar desde la app**, con el correo de tu esposa.

## Comprobarlo sin la app

Mientras revisás, esto te dice si el SMTP responde:

```bash
# En la raíz del repo. Lee el .env.local y arma el pedido.
curl -X POST "$NEXT_PUBLIC_SUPABASE_URL/auth/v1/otp" \
  -H "apikey: $NEXT_PUBLIC_SUPABASE_ANON_KEY" \
  -H "Authorization: Bearer $NEXT_PUBLIC_SUPABASE_ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{"email":"TU_CORREO","options":{"emailRedirectTo":"TU_DOMINIO/login"}}'
```

- **400 `invalid format`** → la API anda; probaste mal el correo.
- **200** → el SMTP funciona. El problema es otro (redirect, signup).
- **500 `Error sending confirmation email`** → es el SMTP. Volvé al punto 2.

## Lo que cambió en la app

El mensaje que le sale a quien intenta entrar ahora es:

> No pudimos mandar el correo. Es un problema del servidor de correo, no tuyo.
> Probá en un rato.

Antes era el texto crudo de la API en inglés, `Error sending confirmation email`,
que no dice si tiene algo que ver con eso y hace parecer rota una app que
funciona. La traducción está en `mensajeLegible()` de
`src/app/login/acciones.ts`, con tests en `src/test/login-errores.test.ts`.

También se distinguishen los casos que sí tienen arreglo distinto: rate limit,
URL de redirect no autorizada, y signup apagado con un correo nuevo.