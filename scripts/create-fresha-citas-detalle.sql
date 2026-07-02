-- Tabla de detalle de citas importadas desde Fresha
-- Ejecutar en Supabase → SQL Editor

CREATE TABLE IF NOT EXISTS fresha_citas_detalle (
  id           bigserial PRIMARY KEY,
  usuario_id   uuid        NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  nombre_empleada text     NOT NULL,
  fecha        date        NOT NULL,
  estado       text        NOT NULL DEFAULT 'confirmada',
  categoria    text        NOT NULL DEFAULT '',
  servicio     text        NOT NULL DEFAULT '',
  duracion_min integer     NOT NULL DEFAULT 0,
  franja_inicio time,
  franja_fin   time,
  venta_neta   numeric(10,2) NOT NULL DEFAULT 0,
  created_at   timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_fcd_fecha       ON fresha_citas_detalle (fecha);
CREATE INDEX IF NOT EXISTS idx_fcd_usuario_fecha ON fresha_citas_detalle (usuario_id, fecha);
