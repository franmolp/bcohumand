-- Integración con BCO Turnos: qué empleados aparecen en el staff de BCO Turnos.
-- Todos sí, menos el equipo de limpieza (se cambia desde la ficha del empleado).
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS usa_bco_turnos boolean NOT NULL DEFAULT true;
UPDATE usuarios SET usa_bco_turnos = false WHERE equipo_id IN (SELECT id FROM equipos WHERE nombre ILIKE '%limpieza%');
