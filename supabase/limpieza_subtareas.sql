-- Subtareas del plan de limpieza: una tarea (ej. Cocina) puede tener subtareas
-- (ej. Microondas), cada una se tilda por separado. Las subtareas cuelgan de una
-- tarea "padre" (parent_id) y heredan cuándo aplica (día/fecha) de esa tarea.
ALTER TABLE limpieza_tareas ADD COLUMN IF NOT EXISTS parent_id BIGINT REFERENCES limpieza_tareas(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_limpieza_tareas_parent ON limpieza_tareas(parent_id) WHERE parent_id IS NOT NULL;
