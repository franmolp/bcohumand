-- Plan de limpieza: tareas (diarias / semanales por día / puntuales por fecha) y el
-- registro de qué se hizo cada día (para ver el cumplimiento). Lo ve/tilda el equipo
-- "Limpieza"; el admin edita el plan y ve el historial.

CREATE TABLE IF NOT EXISTS limpieza_tareas (
  id BIGSERIAL PRIMARY KEY,
  tipo TEXT NOT NULL CHECK (tipo IN ('diaria', 'semanal', 'puntual')),
  dia_semana INT,                 -- 0=Dom .. 6=Sáb. Solo para tipo 'semanal'
  fecha DATE,                     -- Solo para tipo 'puntual'
  titulo TEXT NOT NULL,
  detalle TEXT,
  horario TEXT,                   -- ej. '6:30–8:30' (informativo)
  orden INT NOT NULL DEFAULT 0,
  activo BOOLEAN NOT NULL DEFAULT true,
  creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_limpieza_tareas_lookup ON limpieza_tareas(tipo, dia_semana, fecha) WHERE activo;

-- Una fila por tarea tildada en un día. Sin fila = pendiente.
CREATE TABLE IF NOT EXISTS limpieza_hechas (
  id BIGSERIAL PRIMARY KEY,
  tarea_id BIGINT NOT NULL REFERENCES limpieza_tareas(id) ON DELETE CASCADE,
  fecha DATE NOT NULL,
  hecho_por UUID,
  hecho_en TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tarea_id, fecha)
);
CREATE INDEX IF NOT EXISTS idx_limpieza_hechas_fecha ON limpieza_hechas(fecha);

GRANT ALL ON TABLE limpieza_tareas TO authenticated;
GRANT ALL ON TABLE limpieza_tareas TO service_role;
GRANT ALL ON TABLE limpieza_hechas TO authenticated;
GRANT ALL ON TABLE limpieza_hechas TO service_role;
GRANT USAGE, SELECT ON SEQUENCE limpieza_tareas_id_seq TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE limpieza_tareas_id_seq TO service_role;
GRANT USAGE, SELECT ON SEQUENCE limpieza_hechas_id_seq TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE limpieza_hechas_id_seq TO service_role;

-- ─── Carga inicial del plan (Beauty Co) — editable después desde la app ───────────
-- Solo se siembra si la tabla está vacía, para no duplicar al re-correr el script.
INSERT INTO limpieza_tareas (tipo, dia_semana, titulo, detalle, horario, orden)
SELECT * FROM (VALUES
  -- Base diaria (todos los días)
  ('diaria', NULL::int, 'Baños', 'Limpieza completa de inodoro, lavamanos, espejos, reposición y piso.', '6:30–8:30', 1),
  ('diaria', NULL::int, 'Cocina', 'Mesada, bacha, mesa, microondas (si está sucio), piso y cestos.', '6:30–8:30', 2),
  ('diaria', NULL::int, 'Salón', 'Mesas, sillas, apoya manos, lámparas y piso.', '6:30–8:30', 3),
  ('diaria', NULL::int, 'Planta alta', 'Camillas, muebles y piso.', '6:30–8:30', 4),
  ('diaria', NULL::int, 'Mostrador', 'Superficies, elementos y piso.', '6:30–8:30', 5),
  ('diaria', NULL::int, 'Peluquería', 'Limpieza completa diaria si trabajó el día anterior.', '6:30–8:30', 6),
  ('diaria', NULL::int, 'Telarañas y orden general', 'Chequeo de telarañas y orden general.', '6:30–8:30', 7),
  ('diaria', NULL::int, 'Plantas', 'Trapo húmedo día por medio.', '6:30–8:30', 8),
  -- Extras por día (0=Dom..6=Sáb)
  ('semanal', 1, 'Esmaltero / Vidrios interiores', 'Esmaltero (cada 15 días): orden y limpieza profunda de esmaltes; o vidrios interiores, intercalado.', '6:30–8:30', 1),
  ('semanal', 1, 'Peluquería FULL', 'Limpieza profunda + manchas de tapizados + cajones + envases.', '8:30–9:30', 2),
  ('semanal', 2, 'Heladera', 'Limpieza completa con lavandina en gel.', '6:30–8:30', 1),
  ('semanal', 3, 'Sector café', 'Dispenser, bandeja, cafetera y utensilios.', '6:30–8:30', 1),
  ('semanal', 3, 'Exterior', 'Vidrios, frente, paredes y cortinas metálicas.', '8:30–9:30', 2),
  ('semanal', 4, 'Escalera', 'Escalones y baranda.', '6:30–8:30', 1),
  ('semanal', 5, 'Televisores', 'Pantalla con alcohol suave y limpieza de partes superiores y traseras.', '6:30–8:30', 1),
  ('semanal', 6, 'Sector café + mostrador interior', 'Café (dispenser, bandeja, cafetera, utensilios) y mostrador interior (muebles, estanterías, canastos y toallas).', '6:30–8:30', 1)
) AS v(tipo, dia_semana, titulo, detalle, horario, orden)
WHERE NOT EXISTS (SELECT 1 FROM limpieza_tareas);
