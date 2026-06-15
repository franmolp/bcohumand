import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { requireAuth } from '@/lib/auth'

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireAuth()
    const isAdmin = session.rol === 'Admin' || session.rol === 'admin' || session.rol === 'HR'
    const { id } = await params

    const { data: existing } = await supabaseAdmin.from('compras').select('usuario_id').eq('id', id).single()
    if (!existing) return NextResponse.json({ error: 'No encontrado' }, { status: 404 })
    if (!isAdmin && existing.usuario_id !== session.id) return NextResponse.json({ error: 'Sin permiso' }, { status: 403 })

    const body = await request.json()
    const { fecha, proveedor_id, proveedor_nombre, monto, numero_factura, detalle, estado_pago, foto_url } = body

    const { data, error } = await supabaseAdmin
      .from('compras')
      .update({
        fecha,
        proveedor_id: proveedor_id || null,
        proveedor_nombre: proveedor_nombre?.trim() || null,
        monto: Number(monto),
        numero_factura: numero_factura?.trim() || null,
        detalle: detalle?.trim() || null,
        estado_pago,
        ...(foto_url !== undefined ? { foto_url } : {}),
      })
      .eq('id', id)
      .select('*')
      .single()
    if (error) throw error
    return NextResponse.json(data)
  } catch {
    return NextResponse.json({ error: 'Error al actualizar' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireAuth()
    const isAdmin = session.rol === 'Admin' || session.rol === 'admin' || session.rol === 'HR'
    const { id } = await params

    const { data: existing } = await supabaseAdmin.from('compras').select('usuario_id').eq('id', id).single()
    if (!existing) return NextResponse.json({ error: 'No encontrado' }, { status: 404 })
    if (!isAdmin && existing.usuario_id !== session.id) return NextResponse.json({ error: 'Sin permiso' }, { status: 403 })

    const { error } = await supabaseAdmin.from('compras').delete().eq('id', id)
    if (error) throw error
    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: 'Error al eliminar' }, { status: 500 })
  }
}
