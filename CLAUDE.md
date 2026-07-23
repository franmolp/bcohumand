# Instrucciones del proyecto

## Idioma
Siempre responder en español. Nunca usar inglés en los mensajes al usuario.

## Git
- La rama principal es `main`. Nunca hacer push a `master`.
- Siempre hacer push a `main` al terminar cada tarea: `git push -u origin main`
- Vercel despliega a producción automáticamente desde `main`. No pushear a `production`.

## Supabase SQL
- Cada vez que se crea una tabla nueva, incluir siempre al final del SQL los GRANTs necesarios:
  ```sql
  GRANT ALL ON TABLE nombre_tabla TO authenticated;
  GRANT ALL ON TABLE nombre_tabla TO service_role;
  ```
- Si la tabla usa secuencias (SERIAL/BIGSERIAL), agregar también:
  ```sql
  GRANT USAGE, SELECT ON SEQUENCE nombre_tabla_id_seq TO authenticated;
  ```
