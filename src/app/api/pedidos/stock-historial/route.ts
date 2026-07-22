import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { getSession } from '@/lib/auth'

export async function GET(request: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const url = new URL(request.url)
  const productoId = url.searchParams.get('producto_id')
  const varianteId = url.searchParams.get('variante_id')

  if (!productoId && !varianteId) {
    return NextResponse.json({ error: 'producto_id o variante_id requerido' }, { status: 400 })
  }

  let query = supabaseAdmin
    .from('pedidos_stock_historial')
    .select('id, fecha, stock, usuario_id, created_at')
    .order('fecha', { ascending: true })
    .limit(16)

  if (varianteId) {
    query = query.eq('variante_id', varianteId).is('producto_id', null)
  } else {
    query = query.eq('producto_id', productoId!).is('variante_id', null)
  }

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}

export async function POST(request: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const body = await request.json().catch(() => ({}))
  const { producto_id, variante_id, stock } = body

  if (!producto_id && !variante_id) {
    return NextResponse.json({ error: 'producto_id o variante_id requerido' }, { status: 400 })
  }
  if (stock === undefined || stock === null || isNaN(Number(stock))) {
    return NextResponse.json({ error: 'stock inválido' }, { status: 400 })
  }

  const today = new Date().toISOString().split('T')[0]

  // Check if exists for today
  let checkQuery = supabaseAdmin
    .from('pedidos_stock_historial')
    .select('id')
    .eq('fecha', today)

  if (variante_id) {
    checkQuery = checkQuery.eq('variante_id', variante_id).is('producto_id', null)
  } else {
    checkQuery = checkQuery.eq('producto_id', producto_id).is('variante_id', null)
  }

  const { data: existing } = await checkQuery.maybeSingle()

  if (existing) {
    const { error } = await supabaseAdmin
      .from('pedidos_stock_historial')
      .update({ stock: Number(stock), usuario_id: session.id })
      .eq('id', existing.id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  } else {
    const insert: Record<string, unknown> = {
      stock: Number(stock),
      usuario_id: session.id,
      fecha: today,
      producto_id: variante_id ? null : producto_id,
      variante_id: variante_id ?? null,
    }
    const { error } = await supabaseAdmin.from('pedidos_stock_historial').insert(insert)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
