-- Solicitudes de puestos de trabajo disponibles (mesas de manicura, boxes de masajes/depilación)
-- Un "puesto disponible" se calcula al vuelo a partir de horarios_base (no se persiste); esta
-- tabla registra únicamente el pedido de una empleada para cubrir un hueco puntual.
--
-- lane: número de carril interno (mismo criterio que la vista de Espacio de trabajo) usado
-- solo para distinguir puestos físicos distintos con el mismo horario — nunca se muestra en la UI.
CREATE TABLE IF NOT EXISTS solicitudes_puesto (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id UUID NOT NULL,
  equipo_id INT NOT NULL,
  equipo_nombre TEXT NOT NULL,
  tipo_recurso TEXT NOT NULL CHECK (tipo_recurso IN ('mesa', 'box')),
  fecha DATE NOT NULL,
  hora_inicio TIME NOT NULL,
  hora_fin TIME NOT NULL,
  lane INT NOT NULL DEFAULT 0,
  estado TEXT NOT NULL DEFAULT 'pending' CHECK (estado IN ('pending', 'approved', 'rejected', 'cancelled')),
  motivo TEXT,
  resuelto_por UUID,
  resuelto_en TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_solicitudes_puesto_hueco ON solicitudes_puesto (fecha, equipo_id, lane, hora_inicio, hora_fin);
CREATE INDEX IF NOT EXISTS idx_solicitudes_puesto_usuario ON solicitudes_puesto (usuario_id);
CREATE INDEX IF NOT EXISTS idx_solicitudes_puesto_estado ON solicitudes_puesto (estado);

GRANT ALL ON TABLE solicitudes_puesto TO authenticated;
GRANT ALL ON TABLE solicitudes_puesto TO service_role;
