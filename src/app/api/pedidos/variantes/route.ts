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
  if (!isAdmin) return NextResponse.json({ error: 'Sin permisos' }, { status: 403 })

  const body = await request.json().catch(() => ({}))
  const { producto_id, nombre, stock_actual, stock_minimo } = body

  if (!producto_id || !nombre?.trim()) {
    return NextResponse.json({ error: 'producto_id y nombre requeridos' }, { status: 400 })
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
