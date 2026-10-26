-- Muro Social: tipo de post "invitación" con imagen + confirmación de asistencia (RSVP)
-- y campo de dieta/restricción. Idempotente: se puede correr varias veces.

-- Imagen de la tarjeta de invitación (URL pública del bucket 'muro').
ALTER TABLE muro_posts ADD COLUMN IF NOT EXISTS imagen_url TEXT;

-- Respuestas de asistencia. Una por (post, usuario); se puede cambiar (upsert).
CREATE TABLE IF NOT EXISTS muro_rsvp (
  id          BIGSERIAL PRIMARY KEY,
  post_id     BIGINT NOT NULL REFERENCES muro_posts(id) ON DELETE CASCADE,
  usuario_id  UUID NOT NULL,
  asiste      BOOLEAN NOT NULL,          -- true = confirma asistencia, false = no puede ir
  restriccion TEXT,                      -- dieta / restricción especial (opcional)
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (post_id, usuario_id)
);
CREATE INDEX IF NOT EXISTS idx_muro_rsvp_post ON muro_rsvp(post_id);

GRANT ALL ON TABLE muro_rsvp TO authenticated;
GRANT ALL ON TABLE muro_rsvp TO service_role;
GRANT USAGE, SELECT ON SEQUENCE muro_rsvp_id_seq TO authenticated;

-- Bucket público para las imágenes de invitaciones. La subida se hace con
-- service_role (bypassa RLS); al ser público, las imágenes se leen por URL.
INSERT INTO storage.buckets (id, name, public)
VALUES ('muro', 'muro', true)
ON CONFLICT (id) DO NOTHING;
