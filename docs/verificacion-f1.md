# Verificación de F1 con sesión real

## Estado

- [x] Proyecto creado, `.env.local` con URL y anon key
- [x] `0001_init.sql` y `0002_realtime.sql` aplicadas (RLS confirmada: insert
      anónimo rechazado con `42501`)
- [x] Magic link enviado a `luiscota2701@gmail.com`
- [ ] Sesión abierta en el navegador de pruebas
- [ ] Crear la primera nota y ver que persiste
- [ ] Autoguardado verificado contra la base real
- [ ] Vista Semana con datos
- [ ] Aislamiento: una segunda cuenta que no ve las notas de la primera

## Por qué el punto 6 importa más que los otros

Las RLS ya están verificadas por la sonda (`/api/diag-schema` confirma que el
insert anónimo falla con 42501). Falta la parte que la sonda no puede probar:
que **dos sesiones autenticadas** queden aisladas la una de la otra. Esa es la
prueba de que sirve para algo.

Se necesita un segundo correo. Cuando lo tengas, el flujo es:

1. Sesión A (este correo) → escribir una nota con un texto reconocible
2. Sesión B (otro correo) → abrir el mismo día → no debe ver esa nota
3. Sesión B → escribir → A no la ve

Cada corrida del navegador usa un perfil throwaway, así que las dos sesiones
tienen que convivir en un mismo `--script`, o hay que hacer A, guardar el estado
de la cookie, y pasarlo a la segunda corrida.

## Limitación del magic link

El link llega al inbox, que el runner no puede leer. Dos opciones:

- Abrir el link a mano y pegar la URL de la sesión acá (es un link de
  `supabase.co/auth/v1/verify?...` con el token).
- O desactivar la confirmación de email en Supabase (Authentication → Providers →
  Email → *Confirm email* off) y crear el usuario desde el panel. Más rápido para
  desarrollo, menos seguro: solo para probar.

Para uso real (el de tu esposa en el iPhone) el magic link con confirmación es lo
correcto, así que conviene probarlo así al menos una vez.
