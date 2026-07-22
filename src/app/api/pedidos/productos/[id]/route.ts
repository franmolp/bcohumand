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
  if (!isAdmin) return NextResponse.json({ error: 'Sin permisos' }, { status: 403 })

  const { id } = await params
  const body = await request.json().catch(() => ({}))
  const { nombre, marca, categoria, proveedor_id, unidad, activo } = body

  const update: Record<string, unknown> = {}
  if (nombre?.trim()) update.nombre = nombre.trim()
  if (marca !== undefined) update.marca = marca?.trim() || 'Sin marca'
  if (categoria && CATEGORIAS.includes(categoria)) update.categoria = categoria
  if (proveedor_id !== undefined) update.proveedor_id = proveedor_id ?? null
  if (unidad?.trim()) update.unidad = unidad.trim()
  if (activo !== undefined) update.activo = activo === true

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
