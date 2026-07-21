import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { getSession } from '@/lib/auth'

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; iid: string }> }
) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { iid } = await params
  const isAdmin = session.rol === 'admin' || session.rol === 'Admin'

  const { data: item } = await supabaseAdmin
    .from('pedidos_items')
    .select('usuario_id, ciclo_id, ciclo:pedidos_ciclos(estado)')
    .eq('id', iid)
    .single()

  if (!item) return NextResponse.json({ error: 'Item no encontrado' }, { status: 404 })
  if (!isAdmin && item.usuario_id !== session.id) {
    return NextResponse.json({ error: 'Sin permisos' }, { status: 403 })
  }

  const ciclo = item.ciclo as { estado: string } | null
  if (!isAdmin && ciclo?.estado !== 'abierto') {
    return NextResponse.json({ error: 'El pedido ya está cerrado' }, { status: 400 })
  }

  const body = await request.json().catch(() => ({}))
  const { cantidad, unidad, notas, urgente, estado } = body

  const update: Record<string, unknown> = {}
  if (cantidad !== undefined && !isNaN(Number(cantidad)) && Number(cantidad) > 0) update.cantidad = Number(cantidad)
  if (unidad?.trim()) update.unidad = unidad.trim()
  if (notas !== undefined) update.notas = notas?.trim() ?? null
  if (urgente !== undefined) update.urgente = urgente === true
  if (isAdmin && estado && ['pendiente', 'ordenado', 'recibido'].includes(estado)) update.estado = estado

  if (!Object.keys(update).length) {
    return NextResponse.json({ error: 'Nada para actualizar' }, { status: 400 })
  }

  const { error } = await supabaseAdmin
    .from('pedidos_items')
    .update(update)
    .eq('id', iid)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; iid: string }> }
) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { iid } = await params
  const isAdmin = session.rol === 'admin' || session.rol === 'Admin'

  const { data: item } = await supabaseAdmin
    .from('pedidos_items')
    .select('usuario_id, ciclo_id, ciclo:pedidos_ciclos(estado)')
    .eq('id', iid)
    .single()

  if (!item) return NextResponse.json({ error: 'Item no encontrado' }, { status: 404 })
  if (!isAdmin && item.usuario_id !== session.id) {
    return NextResponse.json({ error: 'Sin permisos' }, { status: 403 })
  }

  const ciclo = item.ciclo as { estado: string } | null
  if (!isAdmin && ciclo?.estado !== 'abierto') {
    return NextResponse.json({ error: 'El pedido ya está cerrado' }, { status: 400 })
  }

  const { error } = await supabaseAdmin.from('pedidos_items').delete().eq('id', iid)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
