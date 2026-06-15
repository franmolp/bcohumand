import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { getSession } from '@/lib/auth'
import { crearNotificacion } from '@/lib/notificaciones'

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { id } = await params

  const { data: existing } = await supabaseAdmin
    .from('muro_likes')
    .select('id')
    .eq('post_id', id)
    .eq('usuario_id', session.id)
    .maybeSingle()

  if (existing) {
    await supabaseAdmin.from('muro_likes').delete().eq('id', existing.id)
    return NextResponse.json({ liked: false })
  }

  await supabaseAdmin.from('muro_likes').insert({ post_id: +id, usuario_id: session.id })

  // Notificar al autor del post
  const { data: post } = await supabaseAdmin
    .from('muro_posts')
    .select('usuario_id, contenido')
    .eq('id', id)
    .single()

  if (post && post.usuario_id !== session.id) {
    const preview = post.contenido.length > 50 ? post.contenido.slice(0, 50) + '…' : post.contenido
    await crearNotificacion({
      usuario_id: post.usuario_id,
      titulo: `${session.nombre} le dio Me Gusta a tu publicación`,
      mensaje: `"${preview}"`,
      tipo: 'mural_respuesta',
    })
  }

  return NextResponse.json({ liked: true })
}
