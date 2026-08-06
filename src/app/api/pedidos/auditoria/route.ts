import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { getSession } from '@/lib/auth'

export async function GET(request: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const isAdmin = session.rol === 'admin' || session.rol === 'Admin'
  if (!isAdmin) return NextResponse.json({ error: 'Sin permisos' }, { status: 403 })

  const itemId = new URL(request.url).searchParams.get('item_id')
  if (!itemId) return NextResponse.json({ error: 'item_id requerido' }, { status: 400 })

  const { data, error } = await supabaseAdmin
    .from('pedidos_items_auditoria')
    .select('id, accion, detalle, created_at, usuario_id')
    .eq('item_id', itemId)
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const userIds = [...new Set((data ?? []).map(r => r.usuario_id))]
  const { data: usuarios } = userIds.length
    ? await supabase.from('usuarios').select('id, nombre').in('id', userIds)
    : { data: [] as { id: string; nombre: string }[] }

  const userMap: Record<string, string> = {}
  for (const u of usuarios ?? []) userMap[u.id] = u.nombre

  return NextResponse.json(
    (data ?? []).map(r => ({ ...r, usuario_nombre: userMap[r.usuario_id] ?? 'Usuario' }))
  )
}
