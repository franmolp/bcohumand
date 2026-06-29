-- ─── Tabla de efemérides ─────────────────────────────────────────────────────
-- anio NULL = recurrente todos los años
-- anio = XXXX = solo ese año (para feriados con traslados)
CREATE TABLE IF NOT EXISTS efemerides (
  id        SERIAL PRIMARY KEY,
  titulo    TEXT NOT NULL,
  mes       INTEGER NOT NULL CHECK (mes BETWEEN 1 AND 12),
  dia       INTEGER NOT NULL CHECK (dia BETWEEN 1 AND 31),
  anio      INTEGER DEFAULT NULL,
  tipo      TEXT NOT NULL DEFAULT 'efemeride'
              CHECK (tipo IN ('feriado', 'cerrado', 'profesional', 'aniversario')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE efemerides ENABLE ROW LEVEL SECURITY;
CREATE POLICY "efemerides_read_all" ON efemerides FOR SELECT USING (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON efemerides TO service_role;
GRANT USAGE, SELECT ON SEQUENCE efemerides_id_seq TO service_role;

-- ─── Agregar categoría a eventos_especiales ───────────────────────────────────
ALTER TABLE eventos_especiales
  ADD COLUMN IF NOT EXISTS categoria TEXT NOT NULL DEFAULT 'evento'
    CHECK (categoria IN ('evento', 'local_cerrado'));

-- ─── Feriados 2026 ────────────────────────────────────────────────────────────
INSERT INTO efemerides (titulo, mes, dia, anio, tipo) VALUES
('Año Nuevo',                                        1,  1,  2026, 'cerrado'),
('Carnaval',                                         2,  16, 2026, 'feriado'),
('Carnaval',                                         2,  17, 2026, 'feriado'),
('Puente turístico',                                 3,  23, 2026, 'feriado'),
('Día de la Memoria por la Verdad y la Justicia',    3,  24, 2026, 'feriado'),
('Día del Veterano / Jueves Santo',                  4,  2,  2026, 'feriado'),
('Viernes Santo',                                    4,  3,  2026, 'feriado'),
('Día del Trabajador',                               5,  1,  2026, 'cerrado'),
('Revolución de Mayo',                               5,  25, 2026, 'feriado'),
('Día de Güemes',                                    6,  15, 2026, 'feriado'),
('Día de la Bandera',                                6,  20, 2026, 'feriado'),
('Día de la Independencia',                          7,  9,  2026, 'feriado'),
('Puente turístico',                                 7,  10, 2026, 'feriado'),
('Paso a la Inmortalidad del Gral. San Martín',      8,  17, 2026, 'feriado'),
('Día del Respeto a la Diversidad Cultural',         10, 12, 2026, 'feriado'),
('Día de la Soberanía Nacional',                     11, 23, 2026, 'feriado'),
('Puente turístico',                                 12, 7,  2026, 'feriado'),
('Inmaculada Concepción de María',                   12, 8,  2026, 'feriado'),
('Navidad',                                          12, 25, 2026, 'cerrado');

-- ─── Días profesionales (recurrentes) ────────────────────────────────────────
INSERT INTO efemerides (titulo, mes, dia, tipo) VALUES
('Día de la Manicura',                    5,  14, 'profesional'),
('Día de la Peluquera / Peluquero',       8,  25, 'profesional'),
('Día de la Secretaria / Recepcionista',  9,  4,  'profesional'),
('Día de la Esteticista / Cosmetóloga',   9,  21, 'profesional'),
('Día Internacional del Masajista',       12, 5,  'profesional');

-- ─── Aniversario Beauty Co. (recurrente) ─────────────────────────────────────
INSERT INTO efemerides (titulo, mes, dia, tipo) VALUES
('Aniversario Beauty Co.', 10, 30, 'aniversario');
