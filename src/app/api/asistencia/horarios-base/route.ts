import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase-admin'

// Devuelve el horario base PROGRAMADO por día del mes (de horarios_base), para
// mostrarlo en la ficha aunque no haya un registro de asistencia procesado ese
// día (ej. días futuros, francos programados, o días sin fichada). Si un día
// tiene horario partido (varias filas), se agrega al rango exterior:
// inicio = primer inicio, fin = último fin.
export async function GET(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const mes = searchParams.get('mes')
  const empleadoParam = searchParams.get('empleado')
  const isAdmin = session.rol === 'admin' || session.rol === 'Admin'
  const isHR = session.rol === 'HR'

  if (!mes) return NextResponse.json({ error: 'Falta mes' }, { status: 400 })
  const [year, month] = mes.split('-').map(Number)
  const lastDay = new Date(year, month, 0).getDate()
  const desde = `${mes}-01`
  const hasta = `${mes}-${String(lastDay).padStart(2, '0')}`

  let query = supabaseAdmin
    .from('horarios_base')
    .select('usuario_id, fecha, inicio_base, fin_base')
    .gte('fecha', desde)
    .lte('fecha', hasta)
    .limit(10000)

  if (!isAdmin && !isHR) {
    query = query.eq('usuario_id', session.id)
  } else if (empleadoParam) {
    query = query.eq('usuario_id', empleadoParam)
  }

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Agregar por usuario+fecha al rango exterior
  const map = new Map<string, { usuario_id: string; fecha: string; inicio_base: string; fin_base: string }>()
  for (const h of data ?? []) {
    const key = `${h.usuario_id}|${h.fecha}`
    const ex = map.get(key)
    if (!ex) {
      map.set(key, { usuario_id: h.usuario_id, fecha: h.fecha, inicio_base: h.inicio_base, fin_base: h.fin_base })
    } else {
      if (h.inicio_base < ex.inicio_base) ex.inicio_base = h.inicio_base
      if (h.fin_base > ex.fin_base) ex.fin_base = h.fin_base
    }
  }

  return NextResponse.json(Array.from(map.values()))
}
