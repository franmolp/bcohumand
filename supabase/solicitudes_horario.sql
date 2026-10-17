-- Cambio de horario/día: horario que tenía la empleada esos días antes de aprobarse (para volver atrás si se rechaza o se borra)
ALTER TABLE solicitudes ADD COLUMN IF NOT EXISTS horario_previo jsonb;
