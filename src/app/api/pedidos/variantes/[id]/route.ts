import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { getSession } from '@/lib/auth'

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const isAdmin = session.rol === 'admin' || session.rol === 'Admin'

  const { id } = await params
  const body = await request.json().catch(() => ({}))
  const { nombre, stock_actual, stock_minimo, activo, stock_delta } = body

  if (activo === false && !isAdmin) {
    const { data: puedeElim } = await supabaseAdmin
      .from('pedidos_puede_eliminar')
      .select('usuario_id')
      .eq('usuario_id', session.id)
      .maybeSingle()
    if (!puedeElim) return NextResponse.json({ error: 'Sin permisos para eliminar' }, { status: 403 })
  }

  const update: Record<string, unknown> = {}
  if (nombre?.trim()) update.nombre = nombre.trim()
  if (stock_actual !== undefined) update.stock_actual = stock_actual === '' || stock_actual === null ? null : Number(stock_actual)
  if (stock_minimo !== undefined) update.stock_minimo = stock_minimo === '' || stock_minimo === null ? null : Number(stock_minimo)
  if (activo !== undefined) update.activo = activo === true
  if (stock_delta !== undefined) {
    const { data: cur } = await supabaseAdmin.from('pedidos_variantes').select('stock_actual').eq('id', id).single()
    update.stock_actual = (cur?.stock_actual ?? 0) + Number(stock_delta)
  }

  if (!Object.keys(update).length) {
    return NextResponse.json({ error: 'Nada para actualizar' }, { status: 400 })
  }

  const { error } = await supabaseAdmin
    .from('pedidos_variantes')
    .update(update)
    .eq('id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
