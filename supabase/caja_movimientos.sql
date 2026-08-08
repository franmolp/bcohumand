-- Movimientos individuales de caja (pay-ins/pay-outs) de cada turno, importados desde
-- Loyverse (campo "cash_movements" de /v1.0/shifts). Reemplaza el chequeo agregado de
-- "paid_out del turno vs sobres+compras del día" por un cruce uno a uno.
CREATE TABLE IF NOT EXISTS loyverse_movimientos_caja (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shift_id TEXT NOT NULL,
  fecha DATE NOT NULL,
  tipo TEXT NOT NULL CHECK (tipo IN ('PAY_IN', 'PAY_OUT')),
  monto NUMERIC(12,2) NOT NULL,
  comentario TEXT,
  employee_id TEXT,
  movimiento_en TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_loyverse_movimientos_caja_fecha ON loyverse_movimientos_caja(fecha);
CREATE INDEX IF NOT EXISTS idx_loyverse_movimientos_caja_shift ON loyverse_movimientos_caja(shift_id);

GRANT ALL ON TABLE loyverse_movimientos_caja TO authenticated;
GRANT ALL ON TABLE loyverse_movimientos_caja TO service_role;
