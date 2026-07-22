import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { getSession } from '@/lib/auth'

const CATEGORIAS = ['cocina', 'limpieza', 'manicuria', 'masajes', 'cejas_pestanas', 'depilacion', 'peluqueria']

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const isAdmin = session.rol === 'admin' || session.rol === 'Admin'

  const { id } = await params

  // Non-admin can edit products but only in their categories
  if (!isAdmin) {
    const { data: prod } = await supabaseAdmin
      .from('pedidos_productos')
      .select('categoria')
      .eq('id', id)
      .single()
    if (!prod) return NextResponse.json({ error: 'Producto no encontrado' }, { status: 404 })
    const { data: perm } = await supabaseAdmin
      .from('pedidos_permisos')
      .select('categoria')
      .eq('usuario_id', session.id)
      .eq('categoria', prod.categoria)
      .maybeSingle()
    if (!perm) return NextResponse.json({ error: 'Sin permisos para esta categoría' }, { status: 403 })
  }
  const body = await request.json().catch(() => ({}))
  const { nombre, marca, categoria, proveedor_id, unidad, activo, stock_actual, stock_minimo } = body

  const update: Record<string, unknown> = {}
  if (nombre?.trim()) update.nombre = nombre.trim()
  if (marca !== undefined) update.marca = marca?.trim() || 'Sin marca'
  if (categoria && CATEGORIAS.includes(categoria)) update.categoria = categoria
  if (proveedor_id !== undefined) update.proveedor_id = proveedor_id ?? null
  if (unidad?.trim()) update.unidad = unidad.trim()
  if (activo !== undefined) update.activo = activo === true
  if (stock_actual !== undefined) update.stock_actual = stock_actual === null || stock_actual === '' ? null : Number(stock_actual)
  if (stock_minimo !== undefined) update.stock_minimo = stock_minimo === null || stock_minimo === '' ? null : Number(stock_minimo)

  if (!Object.keys(update).length) {
    return NextResponse.json({ error: 'Nada para actualizar' }, { status: 400 })
  }

  const { error } = await supabaseAdmin
    .from('pedidos_productos')
    .update(update)
    .eq('id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
