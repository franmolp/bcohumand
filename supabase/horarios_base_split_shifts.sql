-- Permite que una empleada tenga más de un turno el mismo día (horario partido,
-- ej. 9-12 y 15-20). Hasta ahora horarios_base tenía una restricción única sobre
-- (usuario_id, fecha) que obligaba a guardar un solo bloque por día — cuando
-- Fresha traía un horario partido, la importación se quedaba con uno de los dos
-- bloques y perdía el otro (afectaba tanto la pantalla de Ocupación/Mis Horarios
-- como el cálculo de horas de asistencia).
--
-- Busca la restricción única existente sobre esas dos columnas (sea cual sea su
-- nombre) y la elimina. horarios_base sigue teniendo su propio "id" como clave
-- primaria (usado por /api/horarios-base/[id] para editar/borrar filas puntuales),
-- así que esto no rompe nada de eso.
DO $$
DECLARE
  conname text;
BEGIN
  SELECT tc.constraint_name INTO conname
  FROM information_schema.table_constraints tc
  JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
  WHERE tc.table_name = 'horarios_base'
    AND tc.constraint_type = 'UNIQUE'
  GROUP BY tc.constraint_name
  HAVING array_agg(kcu.column_name ORDER BY kcu.column_name) = ARRAY['fecha', 'usuario_id']
  LIMIT 1;

  IF conname IS NOT NULL THEN
    EXECUTE format('ALTER TABLE horarios_base DROP CONSTRAINT %I', conname);
  END IF;
END $$;

-- Mantiene rápidas las consultas por usuario+fecha aunque ya no sean únicas
CREATE INDEX IF NOT EXISTS idx_horarios_base_usuario_fecha ON horarios_base(usuario_id, fecha);
