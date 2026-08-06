-- Catálogo maestro de productos pedibles
CREATE TABLE pedidos_productos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre TEXT NOT NULL,
  categoria TEXT NOT NULL, -- cocina | limpieza | manicuria | masajes | cejas_pestanas | depilacion | peluqueria
  proveedor_id INT REFERENCES proveedores(id) ON DELETE SET NULL,
  unidad TEXT NOT NULL DEFAULT 'unidad', -- unidad | kg | litro | caja | pack
  activo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Ciclos de pedido (uno por semana)
CREATE TABLE pedidos_ciclos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre TEXT NOT NULL,
  fecha_apertura DATE NOT NULL,
  fecha_cierre DATE NOT NULL,
  estado TEXT NOT NULL DEFAULT 'abierto', -- abierto | cerrado | enviado
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Items colaborativos de cada ciclo
CREATE TABLE pedidos_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ciclo_id UUID NOT NULL REFERENCES pedidos_ciclos(id) ON DELETE CASCADE,
  producto_id UUID REFERENCES pedidos_productos(id) ON DELETE SET NULL,
  nombre_libre TEXT, -- cuando el producto no está en catálogo
  cantidad NUMERIC(10,2) NOT NULL DEFAULT 1,
  unidad TEXT NOT NULL DEFAULT 'unidad',
  notas TEXT,
  urgente BOOLEAN NOT NULL DEFAULT false,
  usuario_id UUID NOT NULL,
  estado TEXT NOT NULL DEFAULT 'pendiente', -- pendiente | ordenado | recibido
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Permisos de categoría por usuario (qué categorías puede pedir cada una)
CREATE TABLE pedidos_permisos (
  usuario_id UUID NOT NULL,
  categoria TEXT NOT NULL,
  PRIMARY KEY (usuario_id, categoria)
);

-- Configuración global del módulo (singleton, id=1)
CREATE TABLE pedidos_config (
  id INT PRIMARY KEY DEFAULT 1,
  dias_aviso INT NOT NULL DEFAULT 1,
  hora_aviso TEXT NOT NULL DEFAULT '10:00',
  dia_cierre INT NOT NULL DEFAULT 4 -- 0=dom 1=lun 2=mar 3=mié 4=jue 5=vie 6=sáb
);

INSERT INTO pedidos_config (id, dias_aviso, hora_aviso, dia_cierre) VALUES (1, 1, '10:00', 4);
