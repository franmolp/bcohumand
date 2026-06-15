import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { getSession } from '@/lib/auth'

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { id } = await params
  const { opcion_id } = await request.json().catch(() => ({}))
  if (!opcion_id) return NextResponse.json({ error: 'opcion_id requerido' }, { status: 400 })

  // Check not already voted
  const { data: existing } = await supabaseAdmin
    .from('muro_encuesta_votos')
    .select('id')
    .eq('post_id', id)
    .eq('usuario_id', session.id)
    .maybeSingle()

  if (existing) return NextResponse.json({ error: 'Ya votaste en esta encuesta' }, { status: 409 })

  // Check poll not closed
  const { data: post } = await supabaseAdmin.from('muro_posts').select('cerrado').eq('id', id).single()
  if (post?.cerrado) return NextResponse.json({ error: 'La encuesta está cerrada' }, { status: 403 })

  const { error } = await supabaseAdmin
    .from('muro_encuesta_votos')
    .insert({ post_id: +id, opcion_id, usuario_id: session.id })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
