-- Asigna una salida de caja de Loyverse (PAY_OUT, tabla loyverse_movimientos_caja)
-- a una empleada específica — para cuando la salida en realidad es un servicio o
-- consumo interno que hay que descontarle en su liquidación (ej. "Gift Claudia
-- (descontar)"). No se guarda como columna en loyverse_movimientos_caja porque esa
-- tabla se borra y reimporta enteramente cada vez que corre el sync de Loyverse —
-- se perdería la asignación. En cambio, esta tabla referencia el movimiento por su
-- combinación estable (fecha, movimiento_en, monto), que no cambia entre reimports.
CREATE TABLE IF NOT EXISTS caja_salidas_asignadas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fecha DATE NOT NULL,
  movimiento_en TIMESTAMPTZ NOT NULL,
  monto NUMERIC(12,2) NOT NULL,
  comentario TEXT,
  empleado_id UUID NOT NULL,
  empleado_nombre TEXT NOT NULL,
  adelanto_id UUID,
  asignado_por UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_caja_salidas_asignadas_unica ON caja_salidas_asignadas(fecha, movimiento_en, monto);

GRANT ALL ON TABLE caja_salidas_asignadas TO authenticated;
GRANT ALL ON TABLE caja_salidas_asignadas TO service_role;
