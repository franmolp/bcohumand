import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { getSession } from '@/lib/auth'
import { crearNotificacion, crearNotificaciones } from '@/lib/notificaciones'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { id } = await params

  const { data: comentarios, error } = await supabaseAdmin
    .from('muro_comentarios')
    .select('id, parent_id, usuario_id, contenido, created_at')
    .eq('post_id', id)
    .order('created_at', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!comentarios?.length) return NextResponse.json([])

  const autorIds = [...new Set(comentarios.map(c => c.usuario_id))]
  const { data: autores } = await supabase.from('usuarios').select('id, nombre, foto_perfil').in('id', autorIds)

  const autorMap: Record<string, string> = {}
  const fotoMap: Record<string, string | null> = {}
  for (const a of autores ?? []) { autorMap[a.id] = a.nombre; fotoMap[a.id] = (a as { foto_perfil?: string | null }).foto_perfil ?? null }

  const withAutor = comentarios.map(c => ({ ...c, autor: { id: c.usuario_id, nombre: autorMap[c.usuario_id] ?? 'Usuario', foto_perfil: fotoMap[c.usuario_id] ?? null } }))

  // Build tree: top-level with nested replies
  const topLevel = withAutor.filter(c => !c.parent_id)
  const replies = withAutor.filter(c => !!c.parent_id)

  return NextResponse.json(
    topLevel.map(c => ({
      ...c,
      respuestas: replies.filter(r => r.parent_id === c.id),
    }))
  )
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { id } = await params
  const { contenido, parent_id } = await request.json().catch(() => ({}))

  if (!contenido?.trim()) return NextResponse.json({ error: 'El comentario no puede estar vacío' }, { status: 400 })

  const { data, error } = await supabaseAdmin
    .from('muro_comentarios')
    .insert({ post_id: +id, parent_id: parent_id ?? null, usuario_id: session.id, contenido: contenido.trim() })
    .select('id, parent_id, usuario_id, contenido, created_at')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Notificar al autor del post (si no es quien comenta)
  const { data: post } = await supabaseAdmin
    .from('muro_posts')
    .select('usuario_id, contenido')
    .eq('id', id)
    .single()

  if (post && post.usuario_id !== session.id) {
    const preview = post.contenido.length > 50 ? post.contenido.slice(0, 50) + '…' : post.contenido
    await crearNotificacion({
      usuario_id: post.usuario_id,
      titulo: `${session.nombre} comentó tu publicación`,
      mensaje: `"${preview}"`,
      tipo: 'mural_respuesta',
    })
  }

  // Notificar a usuarios mencionados con @Nombre
  const { data: allUsers } = await supabase.from('usuarios').select('id, nombre').eq('estado_cuenta', 'activo')
  const normStr = (s: string) => s.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  const normContent = normStr(contenido.trim())
  const mentionedIds: string[] = []
  for (const u of allUsers ?? []) {
    if (u.id === session.id) continue
    const search = `@${normStr(u.nombre)}`
    const matchIdx = normContent.indexOf(search)
    if (matchIdx !== -1) {
      const after = normContent[matchIdx + search.length]
      if (after === undefined || !/[a-záéíóúüñ]/.test(after)) mentionedIds.push(u.id)
    }
  }
  if (mentionedIds.length) {
    const preview = contenido.trim().length > 80 ? contenido.trim().slice(0, 80) + '…' : contenido.trim()
    await crearNotificaciones(mentionedIds, {
      titulo: `${session.nombre} te mencionó en un comentario`,
      mensaje: preview,
      tipo: 'mural_mencion',
    }).catch(() => {})
  }

  const { data: me } = await supabase.from('usuarios').select('foto_perfil').eq('id', session.id).single()
  return NextResponse.json({ ...data, autor: { id: session.id, nombre: session.nombre, foto_perfil: (me as { foto_perfil?: string | null } | null)?.foto_perfil ?? null }, respuestas: [] }, { status: 201 })
}
