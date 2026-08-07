import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { fmtFechaLarga } from '@/lib/fecha'
import { crearNotificacion, crearNotificaciones } from '@/lib/notificaciones'

function puedeAprobar(rol: string): boolean {
  return rol === 'admin' || rol === 'Admin' || rol === 'Encargada'
}

function esAdmin(rol: string): boolean {
  return rol === 'admin' || rol === 'Admin'
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  if (!puedeAprobar(session.rol)) return NextResponse.json({ error: 'Prohibido' }, { status: 403 })

  const { id } = await params
  const body = await req.json().catch(() => ({})) as { accion?: 'approve' | 'reject'; motivo?: string }
  if (body.accion !== 'approve' && body.accion !== 'reject') {
    return NextResponse.json({ error: 'Acción inválida' }, { status: 400 })
  }

  const { data: solicitud } = await supabaseAdmin
    .from('solicitudes_puesto')
    .select('id, usuario_id, equipo_id, equipo_nombre, tipo_recurso, fecha, hora_inicio, hora_fin, lane, estado')
    .eq('id', id)
    .single()

  if (!solicitud) return NextResponse.json({ error: 'No encontrada' }, { status: 404 })
  if (solicitud.estado !== 'pending') return NextResponse.json({ error: 'Esta solicitud ya fue resuelta' }, { status: 400 })

  const nuevoEstado = body.accion === 'approve' ? 'approved' : 'rejected'

  const { error } = await supabaseAdmin
    .from('solicitudes_puesto')
    .update({ estado: nuevoEstado, motivo: body.motivo || null, resuelto_por: session.id, resuelto_en: new Date().toISOString() })
    .eq('id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const tipo = solicitud.tipo_recurso as 'mesa' | 'box'
  const fechaTxt = fmtFechaLarga(solicitud.fecha)
  const horarioTxt = `${solicitud.hora_inicio.slice(0, 5)} a ${solicitud.hora_fin.slice(0, 5)}`

  if (body.accion === 'approve') {
    await crearNotificacion({
      usuario_id: solicitud.usuario_id,
      titulo: 'Puesto aprobado',
      mensaje: `Te aprobaron ${tipo === 'box' ? 'el box solicitado' : 'la mesa solicitada'} el ${fechaTxt} de ${horarioTxt}.`,
      tipo: 'puesto_aprobado',
      url: '/dashboard/espacio-trabajo',
    }).catch(() => {})

    // Otras solicitudes pendientes para el mismo puesto (mismo carril/horario exacto) quedan cubiertas
    const { data: otras } = await supabaseAdmin
      .from('solicitudes_puesto')
      .select('id, usuario_id')
      .eq('equipo_id', solicitud.equipo_id)
      .eq('fecha', solicitud.fecha)
      .eq('lane', solicitud.lane)
      .eq('hora_inicio', solicitud.hora_inicio)
      .eq('hora_fin', solicitud.hora_fin)
      .eq('estado', 'pending')
      .neq('id', id)

    if (otras && otras.length > 0) {
      await supabaseAdmin
        .from('solicitudes_puesto')
        .update({ estado: 'rejected', motivo: 'El puesto ya fue cubierto por otra persona', resuelto_por: session.id, resuelto_en: new Date().toISOString() })
        .in('id', otras.map(o => o.id))

      await crearNotificaciones(otras.map(o => o.usuario_id), {
        titulo: 'Puesto ya cubierto',
        mensaje: `Lamentablemente, el turno que solicitaste (${fechaTxt} de ${horarioTxt}) ya fue cubierto por otra persona.`,
        tipo: 'puesto_rechazado',
        url: '/dashboard/espacio-trabajo',
      }).catch(() => {})
    }
  } else {
    await crearNotificacion({
      usuario_id: solicitud.usuario_id,
      titulo: 'Puesto rechazado',
      mensaje: `Lamentablemente, el turno que solicitaste (${fechaTxt} de ${horarioTxt}) no fue aprobado${body.motivo ? `: ${body.motivo}` : '.'}`,
      tipo: 'puesto_rechazado',
      url: '/dashboard/espacio-trabajo',
    }).catch(() => {})
  }

  return NextResponse.json({ ok: true })
}

// Borrado definitivo — solo admin, para limpiar solicitudes de prueba en cualquier estado
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  if (!esAdmin(session.rol)) return NextResponse.json({ error: 'Prohibido' }, { status: 403 })

  const { id } = await params
  const { error } = await supabaseAdmin.from('solicitudes_puesto').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
