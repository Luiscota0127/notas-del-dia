# Verificación de F1 con sesión real

## Estado

- [x] Proyecto creado, `.env.local` con URL y anon key
- [x] `0001_init.sql` y `0002_realtime.sql` aplicadas
      (RLS confirmada: insert anónimo rechazado con `42501`)
- [x] Email provider habilitado, confirmación de email **OFF**
- [x] Puerto movido a **3005** para no chocar con desayunos-web
- [ ] Sesión real abierta
- [ ] Primera nota persistida contra Postgres
- [ ] Autoguardado verificado
- [ ] Vista Semana con datos
- [ ] Aislamiento entre dos cuentas

## Por qué está frenado

**Supabase devuelve `429 email rate limit exceeded`.** El límite del SMTP por
defecto es por IP y por hora, y los intentos de prueba lo agotaron. No es un
problema de configuración: el endpoint de OTP responde bien con un correo
inválido (`400 email_address_invalid`), o sea que el provider está habilitado y
la confirmación apagada.

El rate limit se reinicia solo. Cuando se va, mando el link o el login entra
directo (con la confirmación apagada no hace falta abrir el correo).

Si querés desbloquearlo ya, las opciones son:

1. **Esperar.** Es lo simple, y el límite de Supabase en el plan free es de
   unas pocas horas.
2. **SMTP propio.** Authentication → SMTP con Resend, Brevo o Postmark. Sin
   límite, y es lo que corresponde en producción de todas formas.
3. **Verificar con una API key de servicio** desde un script, sin pasar por el
   flujo de email. Más rápido para probar el aislamiento, pero no ejercita el
   login que usa tu esposa.

## La prueba que más importa

El **aislamiento entre dos cuentas**. La sonda ya confirmó que un insert anónimo
falla con `42501`, pero eso no prueba que dos sesiones autenticadas queden
separadas. Para eso hace falta un segundo correo.

## Recordatorio

**Volver a prender *Confirm email*** cuando termine. Con la confirmación apagada,
cualquiera que sepa un correo puede entrar como esa persona. Está documentado en
`docs/confirmacion-email-off.md`.
