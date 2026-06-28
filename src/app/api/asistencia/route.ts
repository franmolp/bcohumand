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

  const records = data ?? []
  if (records.length === 0) return NextResponse.json([])

  // Enriquecer con tipo, motivo y comentario_admin de solicitudes
  const userIds = [...new Set(records.map(r => r.usuario_id).filter(Boolean))]
  const fechas = records.map(r => r.fecha).filter(Boolean) as string[]
  const minFecha = fechas.reduce((a, b) => a < b ? a : b)
  const maxFecha = fechas.reduce((a, b) => a > b ? a : b)

  const { data: solicitudes } = await supabaseAdmin
    .from('solicitudes')
    .select('usuario_id, tipo, motivo, comentario_admin, fecha_inicio, fecha_fin')
    .in('usuario_id', userIds)
    .in('estado', ['approved', 'pending'])
    .lte('fecha_inicio', maxFecha)
    .or(`fecha_fin.gte.${minFecha},fecha_fin.is.null`)

  const enriched = records.map(r => {
    const sol = (solicitudes ?? []).find(s =>
      s.usuario_id === r.usuario_id &&
      r.fecha >= s.fecha_inicio &&
      r.fecha <= (s.fecha_fin ?? s.fecha_inicio)
    )
    return {
      ...r,
      tipo_ausencia: sol?.tipo ?? null,
      motivo: sol?.motivo ?? null,
      comentario_admin: sol?.comentario_admin ?? null,
    }
  })

  return NextResponse.json(enriched)
}
