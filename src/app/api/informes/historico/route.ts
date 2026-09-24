import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase-admin'

export const dynamic = 'force-dynamic'

type Fila = { mes: string; ventas: number; gastos: number; sueldos: number }

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

  const meses = (data ?? []).map((f: Fila) => {
    const ventas = Math.round(f.ventas || 0)
    const gastos = Math.round(f.gastos || 0)
    const sueldos = Math.round(f.sueldos || 0)
    const remanente = ventas - gastos - sueldos
    const esActual = f.mes === mesActual
    // Proyección solo del mes en curso (aún incompleto): escala por días.
    const factor = esActual && diaHoy > 0 && diaHoy < diasDelMes ? diasDelMes / diaHoy : 1
    return {
      mes: f.mes,
      ventas,
      gastos,
      sueldos,
      remanente,
      esActual,
      // En el mes en curso los sueldos todavía no se cargan, así que el remanente
      // proyectado se calcula como ventas − gastos (igual criterio que la tarjeta).
      ventasProyeccion: esActual ? Math.round(ventas * factor) : ventas,
      remanenteProyeccion: esActual ? Math.round((ventas - gastos) * factor) : remanente,
    }
  })

  return NextResponse.json({ meses, mesActual })
}
