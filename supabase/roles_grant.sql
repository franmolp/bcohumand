-- La tabla roles nunca tuvo GRANT para service_role, así que cualquier consulta
-- hecha con supabaseAdmin que incluya un join a roles (ej. rol:roles(nombre))
-- falla con "permission denied for table roles". Esto es exactamente lo que
-- rompía /api/auth/impersonar al listar/elegir empleados, y de paso también
-- afecta en silencio la carga de permisos por rol en dashboard/layout.tsx
-- (ahí el error se ignoraba y solo se perdían los permisos personalizados).
GRANT ALL ON TABLE roles TO authenticated;
GRANT ALL ON TABLE roles TO service_role;
