import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { getSession } from '@/lib/auth'

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { id } = await params
  const body = await request.json().catch(() => ({}))
  const { nombre, stock_actual, stock_minimo, activo } = body

  const update: Record<string, unknown> = {}
  if (nombre?.trim()) update.nombre = nombre.trim()
  if (stock_actual !== undefined) update.stock_actual = stock_actual === '' || stock_actual === null ? null : Number(stock_actual)
  if (stock_minimo !== undefined) update.stock_minimo = stock_minimo === '' || stock_minimo === null ? null : Number(stock_minimo)
  if (activo !== undefined) update.activo = activo === true

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
