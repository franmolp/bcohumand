-- Cierres de caja importados desde Loyverse (uno por sesión/turno)
CREATE TABLE IF NOT EXISTS loyverse_cierres (
  id TEXT PRIMARY KEY,
  fecha DATE NOT NULL,
  opened_at TIMESTAMPTZ,
  closed_at TIMESTAMPTZ,
  store_id TEXT,
  starting_cash NUMERIC(12,2) DEFAULT 0,
  actual_cash NUMERIC(12,2) DEFAULT 0,
  expected_cash NUMERIC(12,2) DEFAULT 0,
  cash_payments NUMERIC(12,2) DEFAULT 0,
  paid_in NUMERIC(12,2) DEFAULT 0,
  paid_out NUMERIC(12,2) DEFAULT 0,
  gross_sales NUMERIC(12,2) DEFAULT 0,
  net_sales NUMERIC(12,2) DEFAULT 0,
  refunds NUMERIC(12,2) DEFAULT 0,
  discounts NUMERIC(12,2) DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
GRANT ALL ON TABLE loyverse_cierres TO authenticated;
GRANT ALL ON TABLE loyverse_cierres TO service_role;

-- Retiros de caja registrados manualmente por el admin
-- tipo: 'retiro' = retiro personal (se llevan a casa) | 'sobre' = va a bóveda/caja fuerte del salón
CREATE TABLE IF NOT EXISTS retiros_caja (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fecha DATE NOT NULL,
  monto NUMERIC(12,2) NOT NULL CHECK (monto > 0),
  descripcion TEXT,
  tipo TEXT NOT NULL DEFAULT 'retiro',
  usuario_id UUID NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
GRANT ALL ON TABLE retiros_caja TO authenticated;
GRANT ALL ON TABLE retiros_caja TO service_role;

-- Migración: agregar columna tipo si la tabla ya existe
ALTER TABLE retiros_caja ADD COLUMN IF NOT EXISTS tipo TEXT NOT NULL DEFAULT 'retiro';

-- Ajustes manuales de saldo (para sincronizar cuando los números no cuadran)
CREATE TABLE IF NOT EXISTS caja_ajustes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fecha DATE NOT NULL,
  saldo_nuevo NUMERIC(12,2) NOT NULL,
  motivo TEXT,
  usuario_id UUID NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
GRANT ALL ON TABLE caja_ajustes TO authenticated;
GRANT ALL ON TABLE caja_ajustes TO service_role;
