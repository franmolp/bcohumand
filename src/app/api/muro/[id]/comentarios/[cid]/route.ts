import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { getSession } from '@/lib/auth'

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string; cid: string }> }) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const isAdmin = session.rol === 'admin' || session.rol === 'Admin'
  const { cid } = await params

  const { data: comentario } = await supabaseAdmin
    .from('muro_comentarios')
    .select('usuario_id')
    .eq('id', cid)
    .single()

  if (!comentario) return NextResponse.json({ error: 'No encontrado' }, { status: 404 })
  if (!isAdmin && comentario.usuario_id !== session.id) return NextResponse.json({ error: 'Sin permiso' }, { status: 403 })

  // Replies cascade via ON DELETE CASCADE
  const { error } = await supabaseAdmin.from('muro_comentarios').delete().eq('id', cid)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
