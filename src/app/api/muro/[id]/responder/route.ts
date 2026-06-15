import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { getSession } from '@/lib/auth'

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { id } = await params
  const { contenido } = await request.json().catch(() => ({}))
  if (!contenido?.trim()) return NextResponse.json({ error: 'La respuesta no puede estar vacía' }, { status: 400 })

  // Check not already answered
  const { data: existing } = await supabaseAdmin
    .from('muro_pregunta_respuestas')
    .select('id')
    .eq('post_id', id)
    .eq('usuario_id', session.id)
    .maybeSingle()

  if (existing) return NextResponse.json({ error: 'Ya respondiste esta pregunta' }, { status: 409 })

  // Check not closed
  const { data: post } = await supabaseAdmin.from('muro_posts').select('cerrado').eq('id', id).single()
  if (post?.cerrado) return NextResponse.json({ error: 'La pregunta está cerrada' }, { status: 403 })

  const { error } = await supabaseAdmin
    .from('muro_pregunta_respuestas')
    .insert({ post_id: +id, usuario_id: session.id, contenido: contenido.trim() })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
