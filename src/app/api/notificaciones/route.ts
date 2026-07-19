import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { getSession } from '@/lib/auth'
import { crearNotificaciones } from '@/lib/notificaciones'

export async function POST(request: NextRequest) {
  const session = await getSession()
  if (!session || (session.rol !== 'admin' && session.rol !== 'Admin')) return NextResponse.json({ error: 'No autorizado' }, { status: 403 })

  const { titulo, mensaje, destinatario, equipo_id, usuario_id } = await request.json().catch(() => ({}))
  if (!titulo?.trim() || !destinatario) return NextResponse.json({ error: 'Faltan datos' }, { status: 400 })

  let ids: string[] = []
  if (destinatario === 'todos') {
    const { data } = await supabase.from('usuarios').select('id').eq('estado_cuenta', 'activo')
    ids = (data ?? []).map((u: { id: string }) => u.id)
  } else if (destinatario === 'equipo' && equipo_id) {
    const { data } = await supabase.from('usuarios').select('id').eq('equipo_id', equipo_id).eq('estado_cuenta', 'activo')
    ids = (data ?? []).map((u: { id: string }) => u.id)
  } else if (destinatario === 'empleado' && usuario_id) {
    ids = [usuario_id]
  }

  // Siempre incluir al admin para que pueda ver y eliminar lo que envió
  if (!ids.includes(session.id)) ids.push(session.id)

  if (ids.length) {
    await crearNotificaciones(ids, {
      titulo: titulo.trim(),
      mensaje: mensaje?.trim() ?? '',
      tipo: 'aviso',
    })
  }

  return NextResponse.json({ ok: true, enviadas: ids.length })
}

export async function GET(request: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const countOnly = searchParams.get('count') === 'true'
  const isAdmin = session.rol === 'Admin' || session.rol === 'admin'

  // Admin: view=enviadas → list all sent notifications with optional filters
  if (isAdmin && searchParams.get('view') === 'enviadas') {
    const targetUid  = searchParams.get('usuario_id') || null
    const fechaDesde = searchParams.get('fecha_desde') || null
    const fechaHasta = searchParams.get('fecha_hasta') || null
    let q = supabaseAdmin
      .from('notificaciones')
      .select('id, titulo, mensaje, tipo, leida, created_at, usuario_id, usuario:usuarios(nombre)')
      .order('created_at', { ascending: false })
      .limit(300)
    if (targetUid)   q = q.eq('usuario_id', targetUid)
    if (fechaDesde)  q = q.gte('created_at', fechaDesde)
    if (fechaHasta)  q = q.lte('created_at', `${fechaHasta}T23:59:59`)
    const { data, error } = await q
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(data ?? [])
  }

  if (countOnly) {
    const { data: unread } = await supabaseAdmin
      .from('notificaciones')
      .select('titulo, tipo')
      .eq('usuario_id', session.id)
      .eq('leida', false)
      .order('created_at', { ascending: false })

    const count = unread?.length ?? 0
    const titulo = unread?.[0]?.titulo ?? null

    // Mapeo tipo → módulo nav
    const tipoModulo: Record<string, string> = {
      solicitud_nueva: '/dashboard/solicitudes',
      solicitud_aprobada: '/dashboard/solicitudes',
      solicitud_rechazada: '/dashboard/solicitudes',
      solicitud_creada_admin: '/dashboard/solicitudes',
      solicitud_modificada: '/dashboard/solicitudes',
      compra: '/dashboard/compras',
      monotributo: '/dashboard/monotributo',
      mural_post: '/dashboard/muro',
      mural_respuesta: '/dashboard/muro',
      mural_mencion: '/dashboard/muro',
      recibo: '/dashboard/liquidador',
      adelanto_solicitado:        '/dashboard/adelantos',
      adelanto_aprobado:          '/dashboard/adelantos',
      adelanto_rechazado:         '/dashboard/adelantos',
      reconocimiento_pendiente:      '/dashboard/reconocimientos',
      reconocimiento_aprobado:       '/dashboard/reconocimientos',
      reconocimiento_recordatorio:   '/dashboard/reconocimientos',
    }
    const modulos: Record<string, number> = {}
    for (const n of (unread ?? [])) {
      const mod = tipoModulo[n.tipo]
      if (mod) modulos[mod] = (modulos[mod] ?? 0) + 1
    }

    return NextResponse.json({ count, titulo, modulos })
  }

  let { data, error } = await supabaseAdmin
    .from('notificaciones')
    .select('id, titulo, mensaje, tipo, leida, created_at')
    .eq('usuario_id', session.id)
    .order('created_at', { ascending: false })
    .limit(60)

  // Si created_at no existe aún (migración pendiente), fallback por id
  if (error?.message?.includes('created_at')) {
    const res = await supabaseAdmin
      .from('notificaciones')
      .select('id, titulo, mensaje, tipo, leida')
      .eq('usuario_id', session.id)
      .order('id', { ascending: false })
      .limit(60)
    data = (res.data ?? []).map((n: Record<string, unknown>) => ({ ...n, created_at: null }))
    error = res.error
  }

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}

export async function DELETE(request: NextRequest) {
  const session = await getSession()
  if (!session || (session.rol !== 'admin' && session.rol !== 'Admin'))
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 })

  const body = await request.json().catch(() => ({}))
  const { id, single } = body
  if (!id) return NextResponse.json({ error: 'id requerido' }, { status: 400 })

  // single=true → delete just this one row (used from "Enviadas" view)
  if (single) {
    const { error } = await supabaseAdmin.from('notificaciones').delete().eq('id', id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true, eliminadas: 1 })
  }

  // Default: delete the whole batch by título
  const { data: notif } = await supabaseAdmin
    .from('notificaciones')
    .select('titulo, tipo')
    .eq('id', id)
    .single()

  if (!notif) return NextResponse.json({ error: 'Notificación no encontrada' }, { status: 404 })
  if (notif.tipo !== 'aviso') return NextResponse.json({ error: 'Solo se pueden eliminar avisos manuales' }, { status: 403 })

  const { count, error } = await supabaseAdmin
    .from('notificaciones')
    .delete({ count: 'exact' })
    .eq('titulo', notif.titulo)
    .eq('tipo', 'aviso')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, eliminadas: count ?? 0 })
}

export async function PUT(request: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const body = await request.json().catch(() => ({}))

  if (body.all) {
    const { error } = await supabaseAdmin
      .from('notificaciones')
      .update({ leida: true })
      .eq('usuario_id', session.id)
      .eq('leida', false)
    if (error) { console.error('[notif PUT all] error:', error); return NextResponse.json({ error: error.message }, { status: 500 }) }
    return NextResponse.json({ ok: true })
  }

  if (body.id !== undefined && body.id !== null) {
    const { error } = await supabaseAdmin
      .from('notificaciones')
      .update({ leida: true })
      .eq('id', body.id)
      .eq('usuario_id', session.id)
    if (error) { console.error('[notif PUT id] error:', error); return NextResponse.json({ error: error.message }, { status: 500 }) }
    return NextResponse.json({ ok: true })
  }

  return NextResponse.json({ error: 'Parámetro requerido' }, { status: 400 })
}
