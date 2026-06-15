import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { getSession } from '@/lib/auth'
import { crearNotificacion } from '@/lib/notificaciones'

function fmtF(iso: string): string { const [, m, d] = iso.split('-'); return `${parseInt(d)}/${parseInt(m)}` }
function buildMsg(fechaInicio: string, fechaFin: string | null, moderador: string, comentario: string | null): string {
  const fecha = fechaFin && fechaFin !== fechaInicio ? `${fmtF(fechaInicio)} → ${fmtF(fechaFin)}` : fmtF(fechaInicio)
  return comentario ? `${fecha} · ${comentario}` : `${fecha} · Por ${moderador}`
}

const EDITABLE_FIELDS = [
  'tipo', 'dias', 'fecha_inicio', 'fecha_fin', 'motivo', 'estado',
  'comentario_admin', 'certificado_adjunto', 'subtipo_horario',
  'horario_anterior', 'horario_nuevo', 'fecha_compensacion',
]

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const isAdmin    = session.rol === 'admin' || session.rol === 'Admin'
  const isHR       = session.rol === 'HR'
  const canManage  = isAdmin || isHR

  try {
    const body = await request.json()

    // Empleado: solo puede actualizar certificado_adjunto en su propia Ausencia por Salud aprobada
    if (!canManage) {
      if (!body.certificado_adjunto) {
        return NextResponse.json({ error: 'Sin permisos' }, { status: 403 })
      }

      const { data: sol } = await supabase
        .from('solicitudes')
        .select('usuario_id, tipo, estado')
        .eq('id', id)
        .single()

      if (!sol || sol.usuario_id !== session.id) {
        return NextResponse.json({ error: 'Sin permisos' }, { status: 403 })
      }
      if (sol.tipo !== 'Ausencia por Salud') {
        return NextResponse.json({ error: 'Solo aplica a Ausencia por Salud' }, { status: 400 })
      }

      const { data, error } = await supabase
        .from('solicitudes')
        .update({ certificado_adjunto: body.certificado_adjunto })
        .eq('id', id)
        .select()
        .single()

      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      return NextResponse.json(data)
    }

    // Admin: aprobar / rechazar (acción rápida)
    if (body.action === 'approve' || body.action === 'reject') {
      const estado = body.action === 'approve' ? 'approved' : 'rejected'

      const { data, error } = await supabase
        .from('solicitudes')
        .update({
          estado,
          moderador:            session.nombre,
          comentario_admin:     body.comentario_admin || null,
          hora_ultima_actividad: new Date().toISOString(),
        })
        .eq('id', id)
        .select()
        .single()

      if (error) return NextResponse.json({ error: error.message }, { status: 500 })

      // Notificar al empleado dueño de la solicitud
      if (data?.usuario_id && data.usuario_id !== session.id) {
        await crearNotificacion({
          usuario_id: data.usuario_id,
          titulo: estado === 'approved'
            ? `Tu solicitud de ${data.tipo} fue aprobada`
            : `Tu solicitud de ${data.tipo} fue rechazada`,
          mensaje: buildMsg(data.fecha_inicio, data.fecha_fin ?? null, session.nombre, body.comentario_admin ?? null),
          tipo: estado === 'approved' ? 'solicitud_aprobada' : 'solicitud_rechazada',
        })
      }

      return NextResponse.json(data)
    }

    // Admin: edición completa con historial
    const { data: old, error: fetchErr } = await supabase
      .from('solicitudes')
      .select('*')
      .eq('id', id)
      .single()

    if (fetchErr || !old) return NextResponse.json({ error: 'No encontrada' }, { status: 404 })

    const updates: Record<string, unknown> = {
      moderador:             session.nombre,
      hora_ultima_actividad: new Date().toISOString(),
    }

    // ediciones es jsonb — ya llega como array, no necesita JSON.parse
    let edicionesArr: unknown[] = Array.isArray(old.ediciones) ? old.ediciones : []

    for (const campo of EDITABLE_FIELDS) {
      if (!(campo in body)) continue
      const newVal = body[campo] ?? null
      const oldVal = old[campo] ?? null
      if (String(newVal) !== String(oldVal)) {
        updates[campo] = newVal
        edicionesArr.push({
          campo,
          valorAnterior: oldVal,
          valorNuevo:    newVal,
          editadoPor:    session.nombre,
          fecha:         new Date().toISOString(),
        })
      }
    }

    updates.ediciones = edicionesArr  // jsonb acepta el array directamente

    const { data, error } = await supabase
      .from('solicitudes')
      .update(updates)
      .eq('id', id)
      .select()
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    const estadoNuevo = updates.estado as string | undefined
    const comentNuevo = updates.comentario_admin as string | null | undefined
    const comentCambio = 'comentario_admin' in updates && comentNuevo !== (old.comentario_admin ?? null)

    if (data?.usuario_id && data.usuario_id !== session.id) {
      if (estadoNuevo && estadoNuevo !== old.estado && (estadoNuevo === 'approved' || estadoNuevo === 'rejected')) {
        // Estado cambió a aprobada/rechazada
        await crearNotificacion({
          usuario_id: data.usuario_id,
          titulo: estadoNuevo === 'approved'
            ? `Tu solicitud de ${data.tipo} fue aprobada`
            : `Tu solicitud de ${data.tipo} fue rechazada`,
          mensaje: buildMsg(data.fecha_inicio, data.fecha_fin ?? null, session.nombre, body.comentario_admin ?? null),
          tipo: estadoNuevo === 'approved' ? 'solicitud_aprobada' : 'solicitud_rechazada',
        })
      } else if (comentCambio && comentNuevo) {
        // Solo cambió el comentario
        await crearNotificacion({
          usuario_id: data.usuario_id,
          titulo: `${session.nombre} comentó tu solicitud de ${data.tipo}`,
          mensaje: comentNuevo,
          tipo: 'solicitud_modificada',
        })
      } else if (Object.keys(updates).some(k => k !== 'moderador' && k !== 'hora_ultima_actividad' && k !== 'ediciones')) {
        // Otros campos editados
        await crearNotificacion({
          usuario_id: data.usuario_id,
          titulo: `Tu solicitud de ${data.tipo} fue modificada`,
          mensaje: `Por ${session.nombre}`,
          tipo: 'solicitud_modificada',
        })
      }
    }

    return NextResponse.json(data)
  } catch {
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { data: sol } = await supabase
    .from('solicitudes')
    .select('usuario_id, estado')
    .eq('id', id)
    .single()

  if (!sol) return NextResponse.json({ error: 'No encontrada' }, { status: 404 })

  const isAdmin    = session.rol === 'admin' || session.rol === 'Admin'
  const isHR       = session.rol === 'HR'
  const canManage  = isAdmin || isHR

  if (!canManage && sol.usuario_id !== session.id) {
    return NextResponse.json({ error: 'Sin permisos' }, { status: 403 })
  }
  if (!canManage && sol.estado !== 'pending') {
    return NextResponse.json({ error: 'Solo se pueden eliminar solicitudes pendientes' }, { status: 400 })
  }

  const { error } = await supabase.from('solicitudes').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
