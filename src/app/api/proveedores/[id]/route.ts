import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { requireAuth } from '@/lib/auth'

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireAuth()
    const isAdmin = session.rol === 'Admin' || session.rol === 'admin' || session.rol === 'HR'
    if (!isAdmin) return NextResponse.json({ error: 'Sin permisos' }, { status: 403 })

    const { id } = await params
    const body = await request.json().catch(() => ({}))
    const { solo_admin, nombre, contacto, activo } = body

    const update: Record<string, unknown> = {}
    if (typeof solo_admin === 'boolean') update.solo_admin = solo_admin
    if (nombre?.trim()) update.nombre = nombre.trim()
    if (contacto !== undefined) update.contacto = contacto?.trim() || null
    if (typeof activo === 'boolean') update.activo = activo

    if (!Object.keys(update).length) {
      return NextResponse.json({ error: 'Nada para actualizar' }, { status: 400 })
    }

    const { data, error } = await supabaseAdmin
      .from('proveedores')
      .update(update)
      .eq('id', id)
      .select()
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(data)
  } catch {
    return NextResponse.json({ error: 'Error al actualizar proveedor' }, { status: 500 })
  }
}
