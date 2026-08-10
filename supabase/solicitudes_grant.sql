-- La tabla solicitudes nunca tuvo GRANT para service_role. La mayoría de las
-- rutas la consultan con el cliente anon (supabase), por eso no se había
-- notado, pero /api/mi-horario y /api/cron/convertir-certificados la
-- consultan con supabaseAdmin (service_role) y fallan con
-- "permission denied for table solicitudes".
GRANT ALL ON TABLE solicitudes TO authenticated;
GRANT ALL ON TABLE solicitudes TO service_role;
