import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { fmtFechaLarga } from '@/lib/fecha'
import { deArticulo } from '@/lib/gaps'
import { crearNotificacion } from '@/lib/notificaciones'

function puedeAprobar(rol: string): boolean {
  return rol === 'admin' || rol === 'Admin' || rol === 'Encargada'
}

// Deshace una aprobación: la solicitud queda cancelada y el puesto vuelve a estar
// disponible para que otra persona lo pida (por si la empleada aprobada se arrepiente).
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  if (!puedeAprobar(session.rol)) return NextResponse.json({ error: 'Prohibido' }, { status: 403 })

  const { id } = await params

  const { data: solicitud } = await supabaseAdmin
    .from('solicitudes_puesto')
    .select('id, usuario_id, equipo_nombre, tipo_recurso, fecha, hora_inicio, hora_fin, estado')
    .eq('id', id)
    .single()

  if (!solicitud) return NextResponse.json({ error: 'No encontrada' }, { status: 404 })
  if (solicitud.estado !== 'approved') return NextResponse.json({ error: 'Solo se puede deshacer una aprobación' }, { status: 400 })

  const { error } = await supabaseAdmin
    .from('solicitudes_puesto')
    .update({ estado: 'cancelled', motivo: 'Aprobación deshecha por administración', resuelto_por: session.id, resuelto_en: new Date().toISOString() })
    .eq('id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const tipo = solicitud.tipo_recurso as 'mesa' | 'box'
  const fechaTxt = fmtFechaLarga(solicitud.fecha)
  const horarioTxt = `${solicitud.hora_inicio.slice(0, 5)} a ${solicitud.hora_fin.slice(0, 5)}`
  await crearNotificacion({
    usuario_id: solicitud.usuario_id,
    titulo: 'Se deshizo tu puesto aprobado',
    mensaje: `La aprobación ${deArticulo(tipo)} de ${solicitud.equipo_nombre} del ${fechaTxt}, de ${horarioTxt}, fue anulada. El puesto vuelve a estar disponible para otra persona.`,
    tipo: 'puesto_deshecho',
    url: '/dashboard/espacio-trabajo',
  }).catch(() => {})

  return NextResponse.json({ ok: true })
}
