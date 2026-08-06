import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { getSession } from '@/lib/auth'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const isAdmin = session.rol === 'admin' || session.rol === 'Admin'
  if (!isAdmin) {
    const { data: exp } = await supabaseAdmin
      .from('pedidos_exportadores')
      .select('usuario_id')
      .eq('usuario_id', session.id)
      .maybeSingle()
    if (!exp) return NextResponse.json({ error: 'Sin permisos' }, { status: 403 })
  }

  const { id } = await params
  const body = await request.json().catch(() => ({}))
  const { proveedor_id } = body // number | null

  // Verify the cycle exists and is open
  const { data: ciclo } = await supabaseAdmin
    .from('pedidos_ciclos')
    .select('estado')
    .eq('id', id)
    .single()

  if (!ciclo) return NextResponse.json({ error: 'Ciclo no encontrado' }, { status: 404 })
  if (ciclo.estado !== 'abierto') return NextResponse.json({ error: 'El ciclo no está abierto' }, { status: 400 })

  // Fetch all non-archived items in this cycle with their product's proveedor
  const { data: items } = await supabaseAdmin
    .from('pedidos_items')
    .select('id, producto:pedidos_productos(proveedor_id)')
    .eq('ciclo_id', id)
    .eq('archivado', false)

  if (!items?.length) return NextResponse.json({ ok: true, afectados: 0 })

  // Filter items matching the requested proveedor_id
  const itemIds = items.filter(i => {
    const prod = Array.isArray(i.producto) ? i.producto[0] : i.producto
    const pId = (prod as { proveedor_id: number | null } | null)?.proveedor_id ?? null
    if (proveedor_id === null) return pId === null
    return pId === proveedor_id
  }).map(i => i.id)

  if (!itemIds.length) return NextResponse.json({ ok: true, afectados: 0 })

  const { error } = await supabaseAdmin
    .from('pedidos_items')
    .update({
      archivado: true,
      estado: 'ordenado',
      archivado_por: session.nombre,
      archivado_en: new Date().toISOString(),
    })
    .in('id', itemIds)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, afectados: itemIds.length })
}
