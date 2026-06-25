import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { getSession } from '@/lib/auth'

export async function DELETE(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const isAdmin = session.rol === 'admin' || session.rol === 'Admin'
  if (!isAdmin) return NextResponse.json({ error: 'Sin permiso' }, { status: 403 })

  const { id } = await params
  const hoy = new Date().toLocaleDateString('en-CA')

  const { data: palabra } = await supabaseAdmin
    .from('juegos_palabras')
    .select('fecha')
    .eq('id', id)
    .single()

  if (palabra && palabra.fecha <= hoy)
    return NextResponse.json({ error: 'No se puede eliminar una palabra pasada o de hoy' }, { status: 400 })

  const { error } = await supabaseAdmin.from('juegos_palabras').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
