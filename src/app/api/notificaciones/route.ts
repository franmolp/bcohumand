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

  if (countOnly) {
    const { data: unread, count } = await supabaseAdmin
      .from('notificaciones')
      .select('titulo', { count: 'exact' })
      .eq('usuario_id', session.id)
      .eq('leida', false)
      .order('created_at', { ascending: false })
      .limit(1)
    return NextResponse.json({ count: count ?? 0, titulo: unread?.[0]?.titulo ?? null })
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

  const { id } = await request.json().catch(() => ({}))
  if (!id) return NextResponse.json({ error: 'id requerido' }, { status: 400 })

  // Obtener el título de esta notificación para borrar el batch completo
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
