import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { getSession } from '@/lib/auth'

export async function GET(request: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const productoId = new URL(request.url).searchParams.get('producto_id')
  if (!productoId) return NextResponse.json({ error: 'producto_id requerido' }, { status: 400 })

  const { data, error } = await supabaseAdmin
    .from('pedidos_variantes')
    .select('*')
    .eq('producto_id', productoId)
    .eq('activo', true)
    .order('nombre')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}

export async function POST(request: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const isAdmin = session.rol === 'admin' || session.rol === 'Admin'

  const body = await request.json().catch(() => ({}))
  const { producto_id, nombre, stock_actual, stock_minimo } = body

  if (!producto_id || !nombre?.trim()) {
    return NextResponse.json({ error: 'producto_id y nombre requeridos' }, { status: 400 })
  }

  if (!isAdmin) {
    const { data: prod } = await supabaseAdmin
      .from('pedidos_productos').select('categoria').eq('id', producto_id).single()
    if (!prod) return NextResponse.json({ error: 'Producto no encontrado' }, { status: 404 })
    const { data: perm } = await supabaseAdmin
      .from('pedidos_permisos').select('categoria')
      .eq('usuario_id', session.id).eq('categoria', prod.categoria).maybeSingle()
    if (!perm) return NextResponse.json({ error: 'Sin permisos para esta categoría' }, { status: 403 })
  }

  const { data, error } = await supabaseAdmin
    .from('pedidos_variantes')
    .insert({
      producto_id,
      nombre: nombre.trim(),
      stock_actual: stock_actual ?? null,
      stock_minimo: stock_minimo ?? null,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
