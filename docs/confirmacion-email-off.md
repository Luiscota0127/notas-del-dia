# Desactivar la confirmación de email — URGENTE

## La app ya está en internet

**https://notas-del-dia.vercel.app**

Con la confirmación apagada, **cualquiera que sepa un correo entra como esa
persona**. Pide un link, no tiene que confirmar nada, y entra a leer y escribir
las notas. Antes esto era una ventana de desarrollo en la red de casa; ahora es
una invitación abierta a cualquiera que adivine `luiscota2701@gmail.com`.

Encenderlo es un paso de un minuto:

**Supabase → Authentication → Providers → Email → *Confirm email*: ON**

Lo único que cambia del lado de ella es que la primera vez tiene que abrir el
correo y tocar el link. Que es de todas formas lo que ya hacía.

## Qué pasaba con la confirmación apagada

`signInWithOtp` creaba el usuario si no existía y devolvía la sesión en la misma
respuesta, sin correo. El login pasaba a ser un código de un solo uso que
Supabase devolvía directo al cliente, y por eso no se podía probar el flujo
real de correo con la girlfriend.

Se apagó para poder verificar punta a punta el login, la persistencia en
Postgres, el autoguardado con debounce y la vista Semana. Todo eso ya está
verificado. No hay razón para seguir así.

## Mientras tanto

Con esto se puede verificar:

- Login real con sesión
- Crear la primera nota y ver que persiste en Postgres
- Autoguardado con debounce
- Vista Semana con datos
- Aislamiento entre dos cuentas ← **esto necesita un segundo correo**