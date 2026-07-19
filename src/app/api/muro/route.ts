import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { getSession } from '@/lib/auth'
import { crearNotificaciones } from '@/lib/notificaciones'

export async function GET(request: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const isAdmin = session.rol === 'admin' || session.rol === 'Admin'
  const { searchParams } = new URL(request.url)
  const offset = parseInt(searchParams.get('offset') ?? '0')
  const limit = 5

  const { data: posts, error } = await supabaseAdmin
    .from('muro_posts')
    .select('id, tipo, contenido, created_at, cerrado, resultados_publicados, usuario_id')
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!posts?.length) return NextResponse.json([])

  const postIds = posts.map(p => p.id)
  const encuestaIds = posts.filter(p => p.tipo === 'encuesta').map(p => p.id)
  const preguntaIds = posts.filter(p => p.tipo === 'pregunta').map(p => p.id)

  const [likesRes, comentRes, opcionesRes, votosRes, respuestasRes] = await Promise.all([
    supabaseAdmin.from('muro_likes').select('post_id, usuario_id').in('post_id', postIds),
    supabaseAdmin.from('muro_comentarios').select('post_id').in('post_id', postIds),
    encuestaIds.length
      ? supabaseAdmin.from('muro_encuesta_opciones').select('id, post_id, texto, orden').in('post_id', encuestaIds).order('orden')
      : Promise.resolve({ data: [] }),
    encuestaIds.length
      ? supabaseAdmin.from('muro_encuesta_votos').select('post_id, opcion_id, usuario_id').in('post_id', encuestaIds)
      : Promise.resolve({ data: [] }),
    preguntaIds.length
      ? supabaseAdmin.from('muro_pregunta_respuestas').select('post_id, usuario_id, contenido').in('post_id', preguntaIds)
      : Promise.resolve({ data: [] }),
  ])

  // Build a unified user map covering authors, voters, responders and likers
  const allUserIds = [...new Set([
    ...posts.map(p => p.usuario_id),
    ...(votosRes.data ?? []).map((v: { usuario_id: string }) => v.usuario_id),
    ...(respuestasRes.data ?? []).map((r: { usuario_id: string }) => r.usuario_id),
    ...(likesRes.data ?? []).map((l: { usuario_id: string }) => l.usuario_id),
  ])]

  const { data: usuarios } = await supabase.from('usuarios').select('id, nombre, foto_perfil').in('id', allUserIds)
  const autorMap: Record<string, string> = {}
  const fotoMap: Record<string, string | null> = {}
  for (const u of usuarios ?? []) { autorMap[u.id] = u.nombre; fotoMap[u.id] = (u as { foto_perfil?: string | null }).foto_perfil ?? null }

  return NextResponse.json(posts.map(post => {
    const likes = (likesRes.data ?? []).filter((l: { post_id: number }) => l.post_id === post.id)
    const comentCount = (comentRes.data ?? []).filter((c: { post_id: number }) => c.post_id === post.id).length

    const base = {
      id: post.id,
      tipo: post.tipo,
      contenido: post.contenido,
      created_at: post.created_at,
      cerrado: post.cerrado,
      resultados_publicados: post.resultados_publicados,
      autor: { id: post.usuario_id, nombre: autorMap[post.usuario_id] ?? 'Usuario', foto_perfil: fotoMap[post.usuario_id] ?? null },
      likes_count: likes.length,
      yo_like: (likes as { usuario_id: string }[]).some(l => l.usuario_id === session.id),
      comentarios_count: comentCount,
    }

    if (post.tipo === 'encuesta') {
      const opciones = (opcionesRes.data ?? []).filter((o: { post_id: number }) => o.post_id === post.id)
      const votos = (votosRes.data ?? []).filter((v: { post_id: number }) => v.post_id === post.id) as { post_id: number; opcion_id: number; usuario_id: string }[]
      const miVoto = votos.find(v => v.usuario_id === session.id)
      const canSee = isAdmin || post.resultados_publicados
      return {
        ...base,
        opciones: (opciones as { id: number; texto: string }[]).map(o => ({
          id: o.id,
          texto: o.texto,
          votos: canSee ? votos.filter(v => v.opcion_id === o.id).length : undefined,
          // Admin sees who voted each option
          votantes: isAdmin ? votos.filter(v => v.opcion_id === o.id).map(v => autorMap[v.usuario_id] ?? 'Usuario') : undefined,
        })),
        mi_voto: miVoto ? miVoto.opcion_id : null,
        votos_total: canSee ? votos.length : null,
      }
    }

    if (post.tipo === 'pregunta') {
      const respuestas = (respuestasRes.data ?? []).filter((r: { post_id: number }) => r.post_id === post.id) as { usuario_id: string; contenido: string }[]
      const miResp = respuestas.find(r => r.usuario_id === session.id)
      const canSeeAll = isAdmin || post.resultados_publicados
      return {
        ...base,
        mi_respuesta: miResp?.contenido ?? null,
        respuestas_count: isAdmin ? respuestas.length : null,
        respuestas: canSeeAll
          ? respuestas.map(r => ({ autor: autorMap[r.usuario_id] ?? 'Usuario', contenido: r.contenido }))
          : null,
      }
    }

    return base
  }))
}

export async function POST(request: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const isAdmin     = session.rol === 'admin' || session.rol === 'Admin'
  const isHR        = session.rol === 'HR'
  const isEncargada = session.rol === 'Encargada'
  const body = await request.json().catch(() => ({}))
  const { tipo = 'post', contenido, opciones } = body

  if (!contenido?.trim()) return NextResponse.json({ error: 'El contenido es requerido' }, { status: 400 })
  if ((tipo === 'encuesta' || tipo === 'pregunta') && !isAdmin)
    return NextResponse.json({ error: 'Solo admins pueden crear encuestas y preguntas' }, { status: 403 })
  if (tipo === 'encuesta' && (!Array.isArray(opciones) || opciones.filter((o: string) => o?.trim()).length < 2))
    return NextResponse.json({ error: 'Se necesitan al menos 2 opciones' }, { status: 400 })

  const { data: post, error } = await supabaseAdmin
    .from('muro_posts')
    .insert({ usuario_id: session.id, tipo, contenido: contenido.trim() })
    .select('id')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  if (tipo === 'encuesta' && opciones?.length) {
    await supabaseAdmin.from('muro_encuesta_opciones').insert(
      (opciones as string[]).filter(o => o?.trim()).map((texto, i) => ({ post_id: post.id, texto: texto.trim(), orden: i }))
    )
  }

  // Si admin, HR o Encargada publica, notificar a todos
  if (isAdmin || isHR || isEncargada) {
    const { data: users } = await supabase
      .from('usuarios')
      .select('id')
      .eq('estado_cuenta', 'activo')
      .neq('id', session.id)

    const ids = (users ?? []).map((u: { id: string }) => u.id)
    if (ids.length) {
      const preview = contenido.trim().length > 60 ? contenido.trim().slice(0, 60) + '…' : contenido.trim()
      const tipoLabel = tipo === 'encuesta' ? 'una encuesta' : tipo === 'pregunta' ? 'una pregunta' : 'una publicación'
      await crearNotificaciones(ids, {
        titulo: `Nueva publicación en el Muro Social`,
        mensaje: `${session.nombre} publicó ${tipoLabel}: "${preview}"`,
        tipo: 'mural_post',
      })
    }
  }

  // Notificar a usuarios mencionados con @Nombre
  const { data: allUsers } = await supabase.from('usuarios').select('id, nombre').eq('estado_cuenta', 'activo')
  const normStr = (s: string) => s.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  const normContent = normStr(contenido)
  const mentionedIds: string[] = []
  for (const u of allUsers ?? []) {
    if (u.id === session.id) continue
    const search = normStr(u.nombre)
    const idx = normContent.indexOf(search)
    if (idx !== -1) {
      const before = idx > 0 ? normContent[idx - 1] : ' '
      const after = normContent[idx + search.length]
      if (!/[a-záéíóúüñ]/.test(before) && (after === undefined || !/[a-záéíóúüñ]/.test(after))) mentionedIds.push(u.id)
    }
  }
  if (mentionedIds.length) {
    const preview = contenido.trim().length > 80 ? contenido.trim().slice(0, 80) + '…' : contenido.trim()
    await crearNotificaciones(mentionedIds, {
      titulo: `${session.nombre} te mencionó en el Muro Social`,
      mensaje: preview,
      tipo: 'mural_mencion',
    }).catch(() => {})
  }

  return NextResponse.json({ ok: true, id: post.id }, { status: 201 })
}
