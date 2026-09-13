-- Concurso de menciones en reseñas de Google: cada reseña 4-5★ que nombra a una
-- empleada le suma una mención. Se acumulan durante el mes (deduplicadas por
-- review_key estable) y se muestra un ranking. El admin puede revisar/corregir
-- las asignaciones y prender/apagar el concurso.
--
-- Se toma SIEMPRE la versión ORIGINAL de la reseña: cada review_key se inserta una
-- sola vez; si la clienta después edita el comentario, el texto/menciones no se
-- pisan (no se puede recuperar el original desde Google, así que guardamos el que
-- capturamos primero).
CREATE TABLE IF NOT EXISTS google_menciones (
  id BIGSERIAL PRIMARY KEY,
  review_key TEXT UNIQUE NOT NULL,      -- clave estable de la reseña (review_id/link o hash por autor)
  author TEXT,
  avatar TEXT,
  rating INT,
  texto TEXT,
  fecha_texto TEXT,                     -- fecha relativa que devuelve Google ("hace una semana")
  mes TEXT NOT NULL,                    -- 'YYYY-MM' del concurso al que cuenta
  asignados JSONB NOT NULL DEFAULT '[]'::jsonb,   -- usuario_id[] confirmados (lo que cuenta)
  detectados JSONB NOT NULL DEFAULT '[]'::jsonb,  -- usuario_id[] auto-detectados (referencia)
  revisado BOOLEAN NOT NULL DEFAULT false,        -- el admin ya confirmó esta reseña
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_google_menciones_mes ON google_menciones(mes);

GRANT ALL ON TABLE google_menciones TO authenticated;
GRANT ALL ON TABLE google_menciones TO service_role;
GRANT USAGE, SELECT ON SEQUENCE google_menciones_id_seq TO authenticated;
-- El insert lo hace supabaseAdmin (service_role), así que también necesita la secuencia.
GRANT USAGE, SELECT ON SEQUENCE google_menciones_id_seq TO service_role;
