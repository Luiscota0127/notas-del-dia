# Desactivar la confirmación de email (temporal)

**Supabase → Authentication → Providers → Email → *Confirm email*: OFF**

Guardá. Hago falta unos segundos para que aplique.

## Qué cambia

Con la confirmación apagada, `signInWithOtp` crea el usuario si no existe y
devuelve la sesión en la misma respuesta, sin correo. El login pasa a ser un
código de un solo uso que Supabase devuelve directo al cliente.

## Por qué es solo para probar

Es una ventana de desarrollo, no la configuración final. Tu esposa va a usar un
iPhone y necesita un correo que llegue de verdad. **Volvé a prenderlo cuando
terminemos la verificación**, y te aviso si me olvido.

Con confirmación apagada, cualquiera que sepa un correo puede entrar como esa
persona. Para dos personas en una red doméstica eso importa poco, pero no lo
dejes así indefinido.

## Mientras tanto

Con esto puedo verificar de punta a punta:

- Login real con sesión
- Crear la primera nota y ver que persiste en Postgres
- Autoguardado con debounce
- Vista Semana con datos
- Aislamiento entre dos cuentas ← **esto necesita un segundo correo**
