import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase-admin'

export const dynamic = 'force-dynamic'

type Fila = { mes: string; ventas: number; gastos: number; sueldos: number }

// Las métricas arrancan en junio 2026: antes no hay nada cargado. Se muestran los
// meses desde acá hacia adelante; cuando pase el tiempo, la ventana móvil de 12
// meses ya empieza después de esta fecha y este piso deja de recortar nada.
const INICIO_METRICAS = '2026-06'

// Serie de los últimos 12 meses para el gráfico de Contabilidad: ventas netas y
// remanente (ventas − gastos − sueldos) por mes. En el mes en curso agrega la
// proyección (estimado a fin de mes según el ritmo de los días transcurridos).
export async function GET() {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  if (!['admin', 'Admin'].includes(session.rol)) return NextResponse.json({ error: 'Prohibido' }, { status: 403 })

  const { data, error } = await supabaseAdmin.rpc('informe_historico', { meses: 12 })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const tz = 'America/Argentina/Buenos_Aires'
  const hoyStr = new Date().toLocaleDateString('en-CA', { timeZone: tz }) // YYYY-MM-DD
  const mesActual = hoyStr.slice(0, 7)
  const [ay, am] = mesActual.split('-').map(Number)
  const diasDelMes = new Date(ay, am, 0).getDate()
  const diaHoy = parseInt(hoyStr.slice(8, 10), 10)

  const filas = (data ?? []).filter((f: Fila) => f.mes >= INICIO_METRICAS)

  // Ratio sueldos/ventas de los meses YA cerrados (con sueldos cargados), para estimar
  // los sueldos del mes en curso (que todavía no se liquidaron) en proporción a las
  // ventas proyectadas. Se promedian los meses cerrados disponibles.
  const ratios: number[] = []
  for (const f of filas as Fila[]) {
    const esActual = f.mes === mesActual
    if (!esActual && f.ventas > 0 && f.sueldos > 0) ratios.push(f.sueldos / f.ventas)
  }
  const ratioSueldos = ratios.length ? ratios.reduce((a, b) => a + b, 0) / ratios.length : null

  const meses = (filas as Fila[]).map((f: Fila) => {
    const ventas = Math.round(f.ventas || 0)
    const gastos = Math.round(f.gastos || 0)
    const sueldos = Math.round(f.sueldos || 0)
    const remanente = ventas - gastos - sueldos
    const esActual = f.mes === mesActual
    // Proyección solo del mes en curso (aún incompleto): escala por días transcurridos.
    const factor = esActual && diaHoy > 0 && diaHoy < diasDelMes ? diasDelMes / diaHoy : 1
    const ventasProyeccion = esActual ? Math.round(ventas * factor) : ventas
    const gastosProyeccion = esActual ? Math.round(gastos * factor) : gastos
    // Sueldos estimados del mes en curso: proporción histórica sueldos/ventas × ventas
    // proyectadas. Si no hay meses cerrados con sueldos, se cae a escalar por días.
    const sueldosEstimados = esActual
      ? (ratioSueldos != null ? Math.round(ratioSueldos * ventasProyeccion) : Math.round(sueldos * factor))
      : sueldos
    const remanenteProyeccion = esActual
      ? ventasProyeccion - gastosProyeccion - sueldosEstimados
      : remanente
    return {
      mes: f.mes,
      ventas,
      gastos,
      sueldos,
      remanente,
      esActual,
      ventasProyeccion,
      sueldosEstimados,
      remanenteProyeccion,
    }
  })

  return NextResponse.json({ meses, mesActual })
}
