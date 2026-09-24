-- Totales mensuales para el gráfico de "Ventas netas (últimos 12 meses)" de Contabilidad.
-- Devuelve, por mes (YYYY-MM en horario Argentina), las ventas netas (Loyverse),
-- los gastos (compras) y los sueldos (liquidaciones), para calcular el remanente
-- (ventas − gastos − sueldos). Una sola consulta agregada en SQL: no hay que traer
-- miles de tickets al servidor de la app.
CREATE OR REPLACE FUNCTION informe_historico(meses INT DEFAULT 12)
RETURNS TABLE (mes TEXT, ventas NUMERIC, gastos NUMERIC, sueldos NUMERIC)
LANGUAGE sql
STABLE
AS $$
  WITH tz AS (
    SELECT date_trunc('month', (now() AT TIME ZONE 'America/Argentina/Buenos_Aires'))::date AS mes_actual
  ),
  rango AS (
    SELECT mes_actual,
           (mes_actual - ((GREATEST(meses, 1) - 1) || ' months')::interval)::date AS desde
    FROM tz
  ),
  lista AS (
    SELECT to_char(gs, 'YYYY-MM') AS mes
    FROM rango, generate_series(rango.desde, rango.mes_actual, '1 month') AS gs
  ),
  ventas AS (
    SELECT to_char((receipt_date AT TIME ZONE 'America/Argentina/Buenos_Aires'), 'YYYY-MM') AS mes,
           sum(COALESCE(total_money, 0)) AS total
    FROM loyverse_tickets
    WHERE (receipt_date AT TIME ZONE 'America/Argentina/Buenos_Aires')
          >= (SELECT desde FROM rango)
    GROUP BY 1
  ),
  gastos AS (
    SELECT to_char(fecha, 'YYYY-MM') AS mes, sum(COALESCE(monto, 0)) AS total
    FROM compras
    WHERE fecha >= (SELECT desde FROM rango)
    GROUP BY 1
  ),
  sueldos AS (
    SELECT to_char(make_date(anio, mes, 1), 'YYYY-MM') AS mes, sum(COALESCE(bruto, 0)) AS total
    FROM liquidaciones_bruto
    WHERE make_date(anio, mes, 1) >= (SELECT desde FROM rango)
    GROUP BY 1
  )
  SELECT l.mes,
         COALESCE(v.total, 0)::numeric AS ventas,
         COALESCE(g.total, 0)::numeric AS gastos,
         COALESCE(s.total, 0)::numeric AS sueldos
  FROM lista l
  LEFT JOIN ventas  v ON v.mes = l.mes
  LEFT JOIN gastos  g ON g.mes = l.mes
  LEFT JOIN sueldos s ON s.mes = l.mes
  ORDER BY l.mes;
$$;

GRANT EXECUTE ON FUNCTION informe_historico(INT) TO authenticated;
GRANT EXECUTE ON FUNCTION informe_historico(INT) TO service_role;
