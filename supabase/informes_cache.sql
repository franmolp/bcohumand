-- Cache de productividad/informes por mes cerrado. El cálculo de /api/informes
-- (ventas por empleada, ocupación, servicios, rentabilidad, KPIs) es pesado: cruza
-- loyverse_tickets, loyverse_pagos, fresha_citas_detalle, asistencia_procesada,
-- compras y liquidaciones_bruto, todo en vivo. Para los meses YA CERRADOS los datos
-- no cambian salvo reimportación, así que se calcula una vez y se guarda acá para
-- leerlo al instante. El mes en curso NUNCA se cachea (siempre se recalcula en vivo).
--
-- Invalidación:
--  · fingerprint = conteos de las tablas fuente del mes. Si al leer no coincide con
--    el guardado (se agregaron/borraron filas), se recalcula. Es una verificación
--    barata (queries head+count, sin transferir filas).
--  · Además las rutas de importación de Loyverse y Fresha borran el snapshot de los
--    meses que tocan. Esto cubre el caso en que se reimporta un mes pasado con montos
--    corregidos sobre los mismos tickets (mismo conteo, distinto valor), que el
--    fingerprint por conteo no detectaría.
CREATE TABLE IF NOT EXISTS informes_cache (
  mes TEXT PRIMARY KEY,              -- 'YYYY-MM'
  payload JSONB NOT NULL,           -- respuesta completa de /api/informes para ese mes
  fingerprint TEXT NOT NULL,        -- conteos de tablas fuente, para detectar cambios
  computed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

GRANT ALL ON TABLE informes_cache TO authenticated;
GRANT ALL ON TABLE informes_cache TO service_role;
