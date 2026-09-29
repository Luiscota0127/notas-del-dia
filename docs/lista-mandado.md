# La lista de mandado: migración pendiente

## Qué falta

Correr **`supabase/migrations/0004_lista.sql`** en el SQL Editor de Supabase.

Es una sola migración, la última. Crea una tabla (`lista`) y sus policies.

## Por qué una tabla nueva y no una nota más

Una nota es de un usuario y de un día (`unique (user_id, date)`). La lista de
mandado es de los dos y no caduca. Meterla en `notes` obligaría a romper una de
las dos reglas.

Sigue siendo **texto libre**: un `text` como `notes.body`, el mismo parser, el
mismo editor. Lo único nuevo es la regla de quién puede leerla.

## Las RLS de esta tabla son distintas a propósito

En `notes`, cada quien lee solo lo suyo. En `lista`, los dos leen y escriben:

```sql
create policy "leer la lista" on lista
  for select using (exists (select 1 from profiles where profiles.id = auth.uid()));
```

La membresía es tener un `profile`. Es lo mismo que decir "sos de la casa".

**No hay policy de `delete`**: nadie puede borrar la lista entera por la API. Es
un documento que no se tira, y borrarlo desde un celular con un tap sería un
accidente irreversible.

## Después

Avisame y verifico:

- El editor de la lista renderiza y el checkbox tilda
- El autoguardado escribe en la tabla
- La lista aparece igual para los dos (esto es lo nuevo: hay que probarlo con
  dos sesiones)

## Nota sobre el modo demo

`/mandado` pide sesión, así que sin login no se puede ver todavía. Si querés
mirarlo antes de aplicar la migración, decímelo y le agrego un atajo `?demo=1`
como el de las notas.
