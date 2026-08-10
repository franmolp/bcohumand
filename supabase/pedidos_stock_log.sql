-- Auditoría y snapshot histórico de cambios de stock (pestaña Inventario, módulo
-- Pedidos). Cada fila referencia producto_id O variante_id (el otro queda NULL) —
-- sin FK porque pedidos_variantes no está en un archivo de migración commiteado.
-- Esta tabla ya existía referenciada en el código (src/app/api/pedidos/stock-*)
-- pero nunca tuvo GRANT para service_role, así que el INSERT fallaba en silencio.
CREATE TABLE IF NOT EXISTS pedidos_stock_auditoria (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  producto_id UUID,
  variante_id UUID,
  usuario_id UUID NOT NULL,
  stock_anterior NUMERIC(10,2),
  stock_nuevo NUMERIC(10,2) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_pedidos_stock_auditoria_producto ON pedidos_stock_auditoria(producto_id);
CREATE INDEX IF NOT EXISTS idx_pedidos_stock_auditoria_variante ON pedidos_stock_auditoria(variante_id);

GRANT ALL ON TABLE pedidos_stock_auditoria TO authenticated;
GRANT ALL ON TABLE pedidos_stock_auditoria TO service_role;

-- Un snapshot por día (fecha) por producto/variante, para graficar la evolución de stock
CREATE TABLE IF NOT EXISTS pedidos_stock_historial (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  producto_id UUID,
  variante_id UUID,
  fecha DATE NOT NULL,
  stock NUMERIC(10,2) NOT NULL,
  usuario_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_pedidos_stock_historial_producto ON pedidos_stock_historial(producto_id);
CREATE INDEX IF NOT EXISTS idx_pedidos_stock_historial_variante ON pedidos_stock_historial(variante_id);

GRANT ALL ON TABLE pedidos_stock_historial TO authenticated;
GRANT ALL ON TABLE pedidos_stock_historial TO service_role;

-- Por las dudas, refuerza el grant en las tablas base de Pedidos también (el
-- pedidos.sql original no las incluía, y si esto es lo que estaba fallando en
-- otras partes del módulo, este GRANT es idempotente y no rompe nada si ya estaban).
GRANT ALL ON TABLE pedidos_productos TO authenticated;
GRANT ALL ON TABLE pedidos_productos TO service_role;
GRANT ALL ON TABLE pedidos_ciclos TO authenticated;
GRANT ALL ON TABLE pedidos_ciclos TO service_role;
GRANT ALL ON TABLE pedidos_items TO authenticated;
GRANT ALL ON TABLE pedidos_items TO service_role;
GRANT ALL ON TABLE pedidos_permisos TO authenticated;
GRANT ALL ON TABLE pedidos_permisos TO service_role;
GRANT ALL ON TABLE pedidos_config TO authenticated;
GRANT ALL ON TABLE pedidos_config TO service_role;
