-- pedidos_items_auditoria ya existe en producción (referenciada en
-- src/app/api/pedidos/ciclos/[id]/items/*, src/app/api/pedidos/auditoria) pero,
-- como pasó con pedidos_stock_auditoria, no tiene un archivo de migración
-- commiteado ni GRANT para service_role. Este script es idempotente: si la
-- tabla ya existe no la toca, y el GRANT no rompe nada si ya estaba.
CREATE TABLE IF NOT EXISTS pedidos_items_auditoria (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id UUID NOT NULL,
  usuario_id UUID NOT NULL,
  accion TEXT NOT NULL,
  detalle TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_pedidos_items_auditoria_item ON pedidos_items_auditoria(item_id);

GRANT ALL ON TABLE pedidos_items_auditoria TO authenticated;
GRANT ALL ON TABLE pedidos_items_auditoria TO service_role;
