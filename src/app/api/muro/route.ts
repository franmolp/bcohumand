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

  // '*' (en vez de columnas explícitas) para no romper el muro si la columna
  // imagen_url todavía no se creó (migración muro_invitacion.sql pendiente).
  const { data: posts, error } = await supabaseAdmin
    .from('muro_posts')
    .select('*')
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!posts?.length) return NextResponse.json([])

  const postIds = posts.map(p => p.id)
  const encuestaIds = posts.filter(p => p.tipo === 'encuesta').map(p => p.id)
  const preguntaIds = posts.filter(p => p.tipo === 'pregunta').map(p => p.id)
  const invitacionIds = posts.filter(p => p.tipo === 'invitacion').map(p => p.id)

  const [likesRes, comentRes, opcionesRes, votosRes, respuestasRes, rsvpRes, activosRes] = await Promise.all([
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
    invitacionIds.length
      ? supabaseAdmin.from('muro_rsvp').select('post_id, usuario_id, asiste, restriccion').in('post_id', invitacionIds)
      : Promise.resolve({ data: [] }),
    invitacionIds.length
      ? supabaseAdmin.from('usuarios').select('*', { count: 'exact', head: true }).eq('estado_cuenta', 'activo')
      : Promise.resolve({ count: 0 }),
  ])
  const totalActivos = (activosRes as { count?: number | null }).count ?? 0

  // Build a unified user map covering authors, voters, responders and likers
  const allUserIds = [...new Set([
    ...posts.map(p => p.usuario_id),
    ...(votosRes.data ?? []).map((v: { usuario_id: string }) => v.usuario_id),
    ...(respuestasRes.data ?? []).map((r: { usuario_id: string }) => r.usuario_id),
    ...(rsvpRes.data ?? []).map((r: { usuario_id: string }) => r.usuario_id),
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
      imagen_url: post.imagen_url ?? null,
      rsvp_limite: post.rsvp_limite ?? null,
      created_at: post.created_at,
      cerrado: post.cerrado,
      resultados_publicados: post.resultados_publicados,
      autor: { id: post.usuario_id, nombre: autorMap[post.usuario_id] ?? 'Usuario', foto_perfil: fotoMap[post.usuario_id] ?? null },
      likes_count: likes.length,
      yo_like: (likes as { usuario_id: string }[]).some(l => l.usuario_id === session.id),
      comentarios_count: comentCount,
    }

    if (post.tipo === 'invitacion') {
      const rsvps = (rsvpRes.data ?? []).filter((r: { post_id: number }) => r.post_id === post.id) as { usuario_id: string; asiste: boolean; restriccion: string | null }[]
      const mio = rsvps.find(r => r.usuario_id === session.id)
      const asisten = rsvps.filter(r => r.asiste).length
      const no = rsvps.filter(r => !r.asiste).length
      return {
        ...base,
        mi_rsvp: mio ? { asiste: mio.asiste, restriccion: mio.restriccion ?? null } : null,
        rsvp_asisten: asisten,
        rsvp_no: no,
        rsvp_sin_responder: Math.max(0, totalActivos - rsvps.length),
        // El admin ve el detalle de quién viene y sus restricciones.
        rsvp_lista: isAdmin
          ? rsvps
              .slice()
              .sort((a, b) => Number(b.asiste) - Number(a.asiste))
              .map(r => ({ nombre: autorMap[r.usuario_id] ?? 'Usuario', asiste: r.asiste, restriccion: r.restriccion ?? null }))
          : null,
      }
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
  const { tipo = 'post', contenido, opciones, imagen_url } = body

  // La invitación lleva imagen (el texto es opcional); el resto requiere texto.
  if (tipo === 'invitacion') {
    if (!imagen_url) return NextResponse.json({ error: 'Falta la imagen de la invitación' }, { status: 400 })
  } else if (!contenido?.trim()) {
    return NextResponse.json({ error: 'El contenido es requerido' }, { status: 400 })
  }
  if ((tipo === 'encuesta' || tipo === 'pregunta' || tipo === 'invitacion') && !isAdmin)
    return NextResponse.json({ error: 'Solo admins pueden crear encuestas, preguntas e invitaciones' }, { status: 403 })
  if (tipo === 'encuesta' && (!Array.isArray(opciones) || opciones.filter((o: string) => o?.trim()).length < 2))
    return NextResponse.json({ error: 'Se necesitan al menos 2 opciones' }, { status: 400 })

  // Solo se incluye imagen_url para invitaciones, así una publicación normal sigue
  // funcionando aunque la columna imagen_url todavía no exista (migración pendiente).
  const insertObj: Record<string, unknown> = { usuario_id: session.id, tipo, contenido: contenido?.trim() || '' }
  if (tipo === 'invitacion') {
    insertObj.imagen_url = imagen_url
    if (typeof body.rsvp_limite === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.rsvp_limite)) insertObj.rsvp_limite = body.rsvp_limite
  }
  const { data: post, error } = await supabaseAdmin
    .from('muro_posts')
    .insert(insertObj)
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
      if (tipo === 'invitacion') {
        await crearNotificaciones(ids, {
          titulo: '🎉 Tenés una invitación nueva',
          mensaje: `${session.nombre} publicó una invitación. Entrá al Muro para revisarla y confirmar tu asistencia.`,
          tipo: 'mural_post',
          url: '/dashboard/muro',
        })
      } else {
        const txt = contenido?.trim() || ''
        const preview = txt.length > 60 ? txt.slice(0, 60) + '…' : txt
        const tipoLabel = tipo === 'encuesta' ? 'una encuesta' : tipo === 'pregunta' ? 'una pregunta' : 'una publicación'
        await crearNotificaciones(ids, {
          titulo: `Nueva publicación en el Muro Social`,
          mensaje: `${session.nombre} publicó ${tipoLabel}: "${preview}"`,
          tipo: 'mural_post',
          url: '/dashboard/muro',
        })
      }
    }
  }

  // Notificar solo a usuarios mencionados explícitamente via autocomplete
  const mentionedIds: string[] = Array.isArray(body.mentioned_ids)
    ? (body.mentioned_ids as string[]).filter((id: string) => id !== session.id)
    : []
  if (mentionedIds.length) {
    const mTxt = contenido?.trim() || ''
    const preview = mTxt.length > 80 ? mTxt.slice(0, 80) + '…' : mTxt
    await crearNotificaciones(mentionedIds, {
      titulo: `${session.nombre} te mencionó en el Muro Social`,
      mensaje: preview,
      tipo: 'mural_mencion',
    }).catch(() => {})
  }

  return NextResponse.json({ ok: true, id: post.id }, { status: 201 })
}
