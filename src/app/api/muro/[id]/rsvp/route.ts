import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { getSession } from '@/lib/auth'

// Confirmación de asistencia a una invitación del muro. Upsert: se puede cambiar
// la respuesta (venir/no venir) y la restricción mientras la invitación no esté cerrada.
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { id } = await params
  const body = await request.json().catch(() => ({}))
  const asiste = body.asiste
  if (typeof asiste !== 'boolean') return NextResponse.json({ error: 'Falta indicar si asistís' }, { status: 400 })
  const restriccion = typeof body.restriccion === 'string' ? body.restriccion.trim().slice(0, 500) : null

  const { data: post } = await supabaseAdmin
    .from('muro_posts')
    .select('tipo, cerrado, rsvp_limite')
    .eq('id', id)
    .single()
  if (!post) return NextResponse.json({ error: 'No encontrada' }, { status: 404 })
  if (post.tipo !== 'invitacion') return NextResponse.json({ error: 'Esta publicación no es una invitación' }, { status: 400 })
  if (post.cerrado) return NextResponse.json({ error: 'La invitación está cerrada' }, { status: 403 })
  if (post.rsvp_limite) {
    const hoy = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' })
    if (hoy > String(post.rsvp_limite).slice(0, 10)) {
      return NextResponse.json({ error: 'La fecha límite para confirmar ya pasó' }, { status: 403 })
    }
  }

  const { error } = await supabaseAdmin
    .from('muro_rsvp')
    .upsert(
      { post_id: +id, usuario_id: session.id, asiste, restriccion: asiste ? (restriccion || null) : null, updated_at: new Date().toISOString() },
      { onConflict: 'post_id,usuario_id' }
    )
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
