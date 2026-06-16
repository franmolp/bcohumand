import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { getSession } from '@/lib/auth'

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const isAdmin = session.rol === 'admin' || session.rol === 'Admin'
  if (!isAdmin) return NextResponse.json({ error: 'Solo admins' }, { status: 403 })

  const { id } = await params
  const body = await request.json().catch(() => ({}))

  // Allow author to edit their own contenido
  const { data: post } = await supabaseAdmin.from('muro_posts').select('usuario_id').eq('id', id).single()
  if (!post) return NextResponse.json({ error: 'No encontrado' }, { status: 404 })
  if (body.contenido !== undefined && post.usuario_id !== session.id && !isAdmin)
    return NextResponse.json({ error: 'Sin permiso' }, { status: 403 })

  const updates: Record<string, unknown> = {}
  if (body.contenido !== undefined) updates.contenido = body.contenido.trim()
  if (body.cerrado !== undefined) updates.cerrado = body.cerrado
  if (body.resultados_publicados !== undefined) updates.resultados_publicados = body.resultados_publicados

  const { error } = await supabaseAdmin.from('muro_posts').update(updates).eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const isAdmin = session.rol === 'admin' || session.rol === 'Admin'
  const { id } = await params

  // Allow author or admin to delete
  const { data: post } = await supabaseAdmin.from('muro_posts').select('usuario_id').eq('id', id).single()
  if (!post) return NextResponse.json({ error: 'No encontrado' }, { status: 404 })
  if (!isAdmin && post.usuario_id !== session.id) return NextResponse.json({ error: 'Sin permiso' }, { status: 403 })

  const { error } = await supabaseAdmin.from('muro_posts').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
