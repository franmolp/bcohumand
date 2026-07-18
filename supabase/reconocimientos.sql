-- ═══════════════════════════════════════════════════════════════════
--  Módulo de Reconocimientos entre Compañeros
--  Ejecutar en el SQL Editor de Supabase
-- ═══════════════════════════════════════════════════════════════════

CREATE TABLE reconocimientos (
  id               UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  id_emisor        UUID        NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  id_receptor      UUID        NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  categoria_pilar  TEXT        NOT NULL CHECK (categoria_pilar IN ('salvavidas', 'buena_vibra', 'iniciativa')),
  mensaje          TEXT        NOT NULL CHECK (char_length(mensaje) >= 50),
  anonimo          BOOLEAN     NOT NULL DEFAULT false,
  estado           TEXT        NOT NULL DEFAULT 'pendiente'
                               CHECK (estado IN ('pendiente', 'aprobado', 'oculto')),
  mes_ciclo        TEXT        NOT NULL,           -- 'YYYY-MM' en zona horaria Argentina
  fecha_creacion   TIMESTAMPTZ NOT NULL DEFAULT now(),
  fecha_moderacion TIMESTAMPTZ,
  moderado_por     UUID        REFERENCES usuarios(id),
  CONSTRAINT no_self_recognition CHECK (id_emisor != id_receptor)
);

-- Índices de consulta frecuente
CREATE INDEX reconocimientos_mes_estado  ON reconocimientos (mes_ciclo, estado);
CREATE INDEX reconocimientos_emisor_mes  ON reconocimientos (id_emisor, mes_ciclo);
CREATE INDEX reconocimientos_receptor    ON reconocimientos (id_receptor);

-- Las operaciones van por supabaseAdmin (service_role), por lo tanto
-- RLS puede quedar sin políticas de usuario; se habilita igual por seguridad.
ALTER TABLE reconocimientos ENABLE ROW LEVEL SECURITY;
