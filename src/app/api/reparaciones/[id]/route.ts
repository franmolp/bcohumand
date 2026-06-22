import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { crearNotificacion } from '@/lib/notificaciones'

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const isAdmin = session.rol === 'admin' || session.rol === 'Admin' || session.rol === 'encargada' || session.rol === 'Encargada'
  if (!isAdmin) return NextResponse.json({ error: 'Prohibido' }, { status: 403 })

  const { estado, comentario_admin } = await req.json()
  const update: Record<string, unknown> = {}
  if (estado) update.estado = estado
  if (typeof comentario_admin !== 'undefined') update.comentario_admin = comentario_admin || null
  if (estado === 'resuelto') update.resuelto_en = new Date().toISOString()
  if (estado && estado !== 'resuelto') update.resuelto_en = null

  const { data, error } = await supabaseAdmin
    .from('reparaciones')
    .update(update)
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Notify the employee when status changes (skip if they set it themselves — always admin here)
  if (estado && data.usuario_id) {
    const estadoLabels: Record<string, string> = {
      resuelto:  'Reparación resuelta',
      rechazado: 'Reparación rechazada',
      pendiente: 'Reparación en revisión',
    }
    const titulo = estadoLabels[estado] ?? 'Actualización de reparación'
    const msg = comentario_admin?.trim()
      ? `${data.titulo} · ${comentario_admin.trim()}`
      : data.titulo
    await crearNotificacion({
      usuario_id: data.usuario_id,
      titulo,
      mensaje: msg,
      tipo: 'reparacion_actualizada',
    }).catch(() => {})
  }

  return NextResponse.json(data)
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const isAdmin = session.rol === 'admin' || session.rol === 'Admin' || session.rol === 'encargada' || session.rol === 'Encargada'

  if (!isAdmin) {
    // Employee: can only cancel their own pending requests
    const { data: rep } = await supabaseAdmin
      .from('reparaciones')
      .select('usuario_id, estado')
      .eq('id', id)
      .single()
    if (!rep || rep.usuario_id !== session.id)
      return NextResponse.json({ error: 'Prohibido' }, { status: 403 })
    if (rep.estado !== 'pendiente')
      return NextResponse.json({ error: 'Solo podés cancelar solicitudes pendientes' }, { status: 403 })
  }

  const { error } = await supabaseAdmin.from('reparaciones').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
