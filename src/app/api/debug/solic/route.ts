import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { supabase } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

// Endpoint temporal de debug — eliminar después de diagnosticar
export async function GET() {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const isAdmin = session.rol === 'admin' || session.rol === 'Admin'
  if (!isAdmin) return NextResponse.json({ error: 'Solo admin' }, { status: 403 })

  const hoy = new Date().toISOString().split('T')[0]
  const mesInicio = hoy.substring(0, 7) + '-01'

  // Con supabaseAdmin (service_role) — debería fallar con "permission denied"
  const { data: adminData, error: adminErr } = await supabaseAdmin
    .from('solicitudes')
    .select('id, tipo, estado, fecha_inicio')
    .limit(5)

  // Con supabase (anon key) — debería funcionar como regenerar
  const { data: anonData, error: anonErr } = await supabase
    .from('solicitudes')
    .select('id, usuario_id, tipo, estado, fecha_inicio, fecha_fin, motivo, comentario_admin')
    .in('estado', ['approved', 'pending'])
    .lte('fecha_inicio', hoy)
    .or(`fecha_fin.gte.${mesInicio},fecha_fin.is.null`)
    .limit(20)

  return NextResponse.json({
    session: { id: session.id, rol: session.rol },
    serviceRole: { count: adminData?.length ?? 0, error: adminErr?.message },
    anonKey: { count: anonData?.length ?? 0, error: anonErr?.message, data: anonData },
    params: { mesInicio, hoy },
  })
}
