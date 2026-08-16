-- Permite asignar una salida de caja (retiros_caja) a una empleada específica
-- cuando en realidad es un servicio/consumo interno (ej. se hizo las uñas) que
-- hay que descontarle en la liquidación del mes — no un retiro personal del
-- admin. Se refleja como un adelanto "de servicio" para esa empleada: le
-- queda visible a ella y al admin con fecha, pero NO cuenta para el límite
-- mensual de adelantos en efectivo.

-- adelantos: nueva columna para distinguir "efectivo" (lo de siempre) de
-- "servicio" (generado desde Caja), y referencia opcional al retiro que lo originó.
ALTER TABLE adelantos ADD COLUMN IF NOT EXISTS tipo TEXT NOT NULL DEFAULT 'efectivo';
ALTER TABLE adelantos ADD COLUMN IF NOT EXISTS retiro_caja_id UUID REFERENCES retiros_caja(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_adelantos_retiro_caja ON adelantos(retiro_caja_id);

-- retiros_caja: a qué empleada (si corresponde) se le asigna este retiro personal
ALTER TABLE retiros_caja ADD COLUMN IF NOT EXISTS empleado_id UUID;
ALTER TABLE retiros_caja ADD COLUMN IF NOT EXISTS empleado_nombre TEXT;
