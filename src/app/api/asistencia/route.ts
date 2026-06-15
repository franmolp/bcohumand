import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase-admin'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const mes = searchParams.get('mes')
  const empleadoParam = searchParams.get('empleado')
  const equipoParam = searchParams.get('equipo')

  const isAdmin     = session.rol === 'admin' || session.rol === 'Admin'
  const isHR        = session.rol === 'HR'
  const isEncargada = session.rol === 'Encargada'

  let query = supabaseAdmin.from('asistencia_procesada').select('*')

  if (mes) {
    const [year, month] = mes.split('-').map(Number)
    const lastDay = new Date(year, month, 0).getDate()
    const fechaInicio = `${mes}-01`
    const fechaFin = `${mes}-${String(lastDay).padStart(2, '0')}`
    query = query.gte('fecha', fechaInicio).lte('fecha', fechaFin)
  }

  if (!isAdmin && !isHR && !isEncargada) {
    query = query.eq('usuario_id', session.id)
  } else {
    if (empleadoParam) {
      query = query.eq('usuario_id', empleadoParam)
    } else if (isEncargada || isHR) {
      // HR y Encargada ven todos sin filtro adicional
    } else if (equipoParam) {
      const { data: users } = await supabaseAdmin
        .from('usuarios')
        .select('id')
        .eq('equipo_id', parseInt(equipoParam, 10))
      if (users && users.length > 0) {
        query = query.in('usuario_id', users.map(u => u.id))
      } else {
        return NextResponse.json([])
      }
    }
  }

  query = query.order('fecha', { ascending: true }).limit(10000)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json(data ?? [])
}
