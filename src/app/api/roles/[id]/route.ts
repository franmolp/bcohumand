import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { requireAdmin } from '@/lib/auth'

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAdmin()
    const { id } = await params
    const { nombre, descripcion, permisos } = await request.json()
    if (!nombre?.trim()) return NextResponse.json({ error: 'Nombre requerido' }, { status: 400 })
    const { data, error } = await supabaseAdmin
      .from('roles')
      .update({ nombre: nombre.trim(), descripcion: descripcion?.trim() || null, permisos: permisos || null })
      .eq('id', id).select().single()
    if (error) throw error
    return NextResponse.json(data)
  } catch (e: unknown) {
    let msg: string
    if (e instanceof Error) {
      msg = e.message
    } else if (e && typeof e === 'object') {
      const err = e as Record<string, unknown>
      msg = String(err.message || err.details || err.code || JSON.stringify(e))
    } else {
      msg = 'Error al actualizar rol'
    }
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAdmin()
    const { id } = await params
    const { error } = await supabaseAdmin.from('roles').delete().eq('id', id)
    if (error) throw error
    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: 'Error al eliminar rol' }, { status: 500 })
  }
}
