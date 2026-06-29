import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { getSession } from '@/lib/auth'

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const isAdmin = session.rol === 'admin' || session.rol === 'Admin'
  if (!isAdmin) return NextResponse.json({ error: 'Sin permisos' }, { status: 403 })

  const type = new URL(request.url).searchParams.get('type')

  if (type === 'efemeride') {
    const numId = parseInt(id, 10)
    if (isNaN(numId)) return NextResponse.json({ error: 'ID inválido' }, { status: 400 })
    const { error } = await supabaseAdmin.from('efemerides').delete().eq('id', numId)
    if (error) {
      console.error('[calendario DELETE efemeride]', error.message)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    return NextResponse.json({ ok: true })
  }

  const { error } = await supabaseAdmin.from('eventos_especiales').delete().eq('id', id)
  if (error) {
    console.error('[calendario DELETE]', error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}
