import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { getSession } from '@/lib/auth'

export async function GET() {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const [prodsRes, variantesRes] = await Promise.all([
    supabaseAdmin
      .from('pedidos_productos')
      .select('*, proveedor:proveedores(id, nombre)')
      .order('categoria')
      .order('nombre'),
    supabaseAdmin
      .from('pedidos_variantes')
      .select('producto_id')
      .eq('activo', true),
  ])

  if (prodsRes.error) return NextResponse.json({ error: prodsRes.error.message }, { status: 500 })

  const variantCount: Record<string, number> = {}
  for (const v of (variantesRes.data ?? [])) {
    variantCount[v.producto_id] = (variantCount[v.producto_id] ?? 0) + 1
  }

  const data = (prodsRes.data ?? []).map(p => ({
    ...p,
    variantes_count: variantCount[p.id] ?? 0,
  }))

  return NextResponse.json(data)
}

export async function POST(request: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const isAdmin = session.rol === 'admin' || session.rol === 'Admin'

  const body = await request.json().catch(() => ({}))
  const { nombre, marca, categoria, proveedor_id, unidad } = body

  const CATEGORIAS = ['cocina', 'limpieza', 'manicuria', 'masajes', 'cejas_pestanas', 'depilacion', 'peluqueria']
  if (!nombre?.trim()) return NextResponse.json({ error: 'Nombre requerido' }, { status: 400 })
  if (!CATEGORIAS.includes(categoria)) return NextResponse.json({ error: 'Categoría inválida' }, { status: 400 })

  // Non-admin: check they have permission for this category
  if (!isAdmin) {
    const { data: perm } = await supabaseAdmin
      .from('pedidos_permisos')
      .select('categoria')
      .eq('usuario_id', session.id)
      .eq('categoria', categoria)
      .maybeSingle()
    if (!perm) return NextResponse.json({ error: 'Sin permisos para esta categoría' }, { status: 403 })
  }

  const { data, error } = await supabaseAdmin
    .from('pedidos_productos')
    .insert({
      nombre: nombre.trim(),
      marca: marca?.trim() || 'Sin marca',
      categoria,
      proveedor_id: proveedor_id ?? null,
      unidad: unidad ?? 'unidad',
      activo: true,
    })
    .select('*, proveedor:proveedores(id, nombre)')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
