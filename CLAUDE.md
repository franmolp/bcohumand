# Instrucciones del proyecto

## Idioma
Siempre responder en español. Nunca usar inglés en los mensajes al usuario.

## Fechas
- Los días de la semana y los meses van SIEMPRE con la inicial en mayúscula, en todos lados ("Lun", "Lunes", "Enero", "Ene"), también en medio de una oración.
- `toLocaleDateString`/`toLocaleString` en español los devuelven en minúscula: pasar el resultado por `mayusFecha` (`src/lib/mayus-fecha.ts`). Las listas de nombres escritas a mano, ya con mayúscula.

## Interfaz (reglas obligatorias para todo lo nuevo o lo que se toque)
- Para elegir entre opciones usar SIEMPRE un desplegable, nunca una fila de botones/píldoras:
  - Una opción: `<select>` nativo.
  - Varias opciones: `SelectorMultiple` (`src/components/SelectorMultiple.tsx`), un desplegable con tildes.
- Fechas: NUNCA `<input type="date">` suelto. Usar `CampoFecha` (`src/components/CampoFecha.tsx`): muestra la fecha con mayúscula ("Mié 23 Dic 2026"), abre el selector nativo y no se pasa del ancho en iOS (el input nativo de iOS ignora el ancho y se desborda).
- Probar cada pantalla nueva también en tamaño iPhone (390 px) antes de subir.

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
