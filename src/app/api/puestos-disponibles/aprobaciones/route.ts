import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase-admin'

function puedeAprobar(rol: string): boolean {
  return rol === 'admin' || rol === 'Admin' || rol === 'Encargada'
}

export async function GET(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  if (!puedeAprobar(session.rol)) return NextResponse.json({ error: 'Prohibido' }, { status: 403 })

  const { searchParams } = new URL(req.url)
  const estado = searchParams.get('estado') ?? 'pending'

  const { data, error } = await supabaseAdmin
    .from('solicitudes_puesto')
    .select('id, usuario_id, equipo_nombre, tipo_recurso, fecha, hora_inicio, hora_fin, lane, estado, motivo, resuelto_por, resuelto_en, created_at')
    .eq('estado', estado)
    .order('fecha', { ascending: estado === 'pending' })
    .order('created_at', { ascending: estado === 'pending' ? true : false })
    .limit(500)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const usuarioIds = [...new Set((data ?? []).flatMap(s => [s.usuario_id, s.resuelto_por]).filter(Boolean))] as string[]
  const { data: usuarios } = usuarioIds.length
    ? await supabaseAdmin.from('usuarios').select('id, nombre').in('id', usuarioIds)
    : { data: [] as { id: string; nombre: string }[] }
  const nombreMap = new Map((usuarios ?? []).map(u => [u.id, u.nombre]))

  const solicitudes = (data ?? []).map(s => ({
    ...s,
    empleado_nombre: nombreMap.get(s.usuario_id) ?? '—',
    resuelto_por_nombre: s.resuelto_por ? (nombreMap.get(s.resuelto_por) ?? '—') : null,
  }))

  return NextResponse.json(solicitudes)
}
