import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase-admin'

export const dynamic = 'force-dynamic'

// Endpoint temporal de debug — eliminar después de diagnosticar
export async function GET() {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const isAdmin = session.rol === 'admin' || session.rol === 'Admin'
  if (!isAdmin) return NextResponse.json({ error: 'Solo admin' }, { status: 403 })

  // 1. Todas las solicitudes sin filtros (limitado a 20)
  const { data: todas, error: e1 } = await supabaseAdmin
    .from('solicitudes')
    .select('id, usuario_id, tipo, estado, fecha_inicio, fecha_fin, motivo, comentario_admin')
    .order('fecha_inicio', { ascending: false })
    .limit(20)

  // 2. Solo approved/pending
  const { data: aprobadas, error: e2 } = await supabaseAdmin
    .from('solicitudes')
    .select('id, usuario_id, tipo, estado, fecha_inicio, fecha_fin, motivo, comentario_admin')
    .in('estado', ['approved', 'pending'])
    .limit(20)

  // 3. Con el filtro de fecha que usa el enrichment (mes actual)
  const hoy = new Date().toISOString().split('T')[0]
  const mesInicio = hoy.substring(0, 7) + '-01'
  const { data: conFiltro, error: e3 } = await supabaseAdmin
    .from('solicitudes')
    .select('id, usuario_id, tipo, estado, fecha_inicio, fecha_fin, motivo, comentario_admin')
    .in('estado', ['approved', 'pending'])
    .lte('fecha_inicio', hoy)
    .or(`fecha_fin.gte.${mesInicio},fecha_fin.is.null`)
    .limit(20)

  return NextResponse.json({
    session: { id: session.id, rol: session.rol },
    todasSinFiltro: { count: todas?.length ?? 0, error: e1?.message, data: todas },
    soloAprobadas: { count: aprobadas?.length ?? 0, error: e2?.message, data: aprobadas },
    conFiltroFecha: { count: conFiltro?.length ?? 0, error: e3?.message, data: conFiltro, params: { mesInicio, hoy } },
  })
}
