import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { supabase } from '@/lib/supabase'

export async function GET(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const fecha = searchParams.get('fecha')
  const mes = searchParams.get('mes')
  const empleadoParam = searchParams.get('empleado')

  const isAdmin = session.rol === 'admin' || session.rol === 'Admin'

  let query = supabase.from('asistencia_raw').select('*')

  if (fecha) {
    query = query.eq('fecha', fecha)
  } else if (mes) {
    const [year, month] = mes.split('-').map(Number)
    const lastDay = new Date(year, month, 0).getDate()
    query = query.gte('fecha', `${mes}-01`).lte('fecha', `${mes}-${String(lastDay).padStart(2, '0')}`)
  }

  if (!isAdmin) {
    query = query.eq('usuario_id', session.id)
  } else if (empleadoParam) {
    query = query.eq('usuario_id', empleadoParam)
  }

  query = query.order('fecha', { ascending: true }).order('hora', { ascending: true })

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}
