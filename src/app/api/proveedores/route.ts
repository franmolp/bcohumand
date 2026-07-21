import { NextRequest, NextResponse } from 'next/server'
import { supabase, supabaseAdmin } from '@/lib/supabase'
import { requireAuth } from '@/lib/auth'

export async function GET() {
  try {
    const session = await requireAuth()
    const isAdmin = session.rol === 'Admin' || session.rol === 'admin'

    let query = supabaseAdmin
      .from('proveedores')
      .select('*')
      .eq('activo', true)
      .order('nombre', { ascending: true })

    if (!isAdmin) {
      query = query.or('solo_admin.is.null,solo_admin.eq.false') as typeof query
    }

    const { data, error } = await query
    if (error) throw error
    return NextResponse.json(data)
  } catch {
    return NextResponse.json({ error: 'Error al obtener proveedores' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await requireAuth()
    const allowed = ['Admin', 'admin', 'HR', 'Compras', 'Encargada']
    if (!allowed.includes(session.rol)) return NextResponse.json({ error: 'Sin acceso' }, { status: 403 })

    const { nombre, contacto } = await request.json()
    if (!nombre?.trim()) return NextResponse.json({ error: 'Nombre requerido' }, { status: 400 })

    const { data, error } = await supabaseAdmin
      .from('proveedores')
      .insert({ nombre: nombre.trim(), contacto: contacto?.trim() || null })
      .select()
      .single()
    if (error) throw error
    return NextResponse.json(data, { status: 201 })
  } catch {
    return NextResponse.json({ error: 'Error al crear proveedor' }, { status: 500 })
  }
}
