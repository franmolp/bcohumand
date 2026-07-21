import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { getSession } from '@/lib/auth'

export async function GET() {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { data, error } = await supabaseAdmin
    .from('pedidos_productos')
    .select('*, proveedor:proveedores(id, nombre)')
    .order('categoria')
    .order('nombre')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}

export async function POST(request: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const isAdmin = session.rol === 'admin' || session.rol === 'Admin'
  if (!isAdmin) return NextResponse.json({ error: 'Sin permisos' }, { status: 403 })

  const body = await request.json().catch(() => ({}))
  const { nombre, categoria, proveedor_id, unidad } = body

  const CATEGORIAS = ['cocina', 'limpieza', 'manicuria', 'masajes', 'cejas_pestanas', 'depilacion', 'peluqueria']
  if (!nombre?.trim()) return NextResponse.json({ error: 'Nombre requerido' }, { status: 400 })
  if (!CATEGORIAS.includes(categoria)) return NextResponse.json({ error: 'Categoría inválida' }, { status: 400 })

  const { data, error } = await supabaseAdmin
    .from('pedidos_productos')
    .insert({
      nombre: nombre.trim(),
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
