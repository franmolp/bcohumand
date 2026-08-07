import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { tipoRecurso, defaultCapacity, findGapsForDay, toMin, overlaps } from '@/lib/gaps'
import { fmtFechaLarga } from '@/lib/fecha'
import { crearNotificaciones, getAdminAndEncargadaIds } from '@/lib/notificaciones'

export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const tipo = tipoRecurso(session.equipo)
  if (!tipo) return NextResponse.json({ error: 'Esta sección es solo para manicura y masajes/depilación' }, { status: 403 })

  const body = await req.json().catch(() => ({})) as { id?: string }
  const partes = body.id?.split('|') ?? []
  if (partes.length !== 5) return NextResponse.json({ error: 'Puesto inválido' }, { status: 400 })
  const [fecha, equipoIdStr, laneStr, horaInicio, horaFin] = partes
  const equipoId = Number(equipoIdStr)
  const lane = Number(laneStr)
  if (!fecha || Number.isNaN(equipoId) || Number.isNaN(lane)) {
    return NextResponse.json({ error: 'Puesto inválido' }, { status: 400 })
  }

  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' })
  if (fecha < today) return NextResponse.json({ error: 'Esa fecha ya pasó' }, { status: 400 })

  const { data: me } = await supabaseAdmin.from('usuarios').select('equipo_id, nombre').eq('id', session.id).single()
  if (!me?.equipo_id || me.equipo_id !== equipoId) {
    return NextResponse.json({ error: 'Ese puesto no pertenece a tu equipo' }, { status: 403 })
  }

  const { data: equipoRow } = await supabaseAdmin.from('equipos').select('id, nombre').eq('id', equipoId).single()
  if (!equipoRow) return NextResponse.json({ error: 'Equipo no encontrado' }, { status: 400 })

  // Revalidar server-side que el hueco sigue libre — nunca confiar en lo que mandó el cliente
  const [configRes, miembrosRes, horariosRes, solicitudesRes] = await Promise.all([
    supabaseAdmin.from('configuracion').select('valor').eq('clave', 'espacio_trabajo').single(),
    supabaseAdmin.from('usuarios').select('id').eq('equipo_id', equipoId).eq('estado_cuenta', 'activo'),
    supabaseAdmin.from('horarios_base').select('usuario_id, inicio_base, fin_base').eq('fecha', fecha),
    supabaseAdmin
      .from('solicitudes_puesto')
      .select('id, usuario_id, hora_inicio, hora_fin, lane, estado')
      .eq('equipo_id', equipoId)
      .eq('fecha', fecha)
      .in('estado', ['pending', 'approved']),
  ])

  const capacidadesOverride = (configRes.data?.valor as { capacidades?: Record<string, number> } | null)?.capacidades ?? {}
  const capacity = capacidadesOverride[equipoRow.nombre] ?? defaultCapacity(equipoRow.nombre)

  const miembroIds = new Set((miembrosRes.data ?? []).map(u => u.id as string))
  const normalizeTime = (t: string) => (t ? t.slice(0, 5) : t)
  const shiftsDia = (horariosRes.data ?? [])
    .filter(h => miembroIds.has(h.usuario_id as string))
    .map(h => ({ usuario_id: h.usuario_id as string, inicio: normalizeTime(h.inicio_base as string), fin: normalizeTime(h.fin_base as string) }))

  const gaps = findGapsForDay(shiftsDia, capacity)
  const start = toMin(horaInicio)
  const end = toMin(horaFin)
  const gapValido = gaps.some(g => g.lane === lane && g.start === start && g.end === end)
  if (!gapValido) {
    return NextResponse.json({ error: 'Ese puesto ya no está disponible' }, { status: 409 })
  }

  const misTurnosDia = shiftsDia.filter(t => t.usuario_id === session.id)
  const sePisaConTurnoPropio = misTurnosDia.some(t => overlaps(start, end, toMin(t.inicio), toMin(t.fin)))
  if (sePisaConTurnoPropio) {
    return NextResponse.json({ error: 'Ese horario se pisa con un turno que ya tenés asignado' }, { status: 409 })
  }

  const solicitudesExistentes = (solicitudesRes.data ?? []) as { id: string; usuario_id: string; hora_inicio: string; hora_fin: string; lane: number; estado: string }[]

  const yaAprobado = solicitudesExistentes.some(s =>
    s.estado === 'approved' && s.lane === lane && overlaps(start, end, toMin(s.hora_inicio.slice(0, 5)), toMin(s.hora_fin.slice(0, 5)))
  )
  if (yaAprobado) return NextResponse.json({ error: 'Ese puesto ya fue cubierto por otra persona' }, { status: 409 })

  const yaLoPidioEllaMisma = solicitudesExistentes.some(s =>
    s.usuario_id === session.id && s.estado === 'pending' && s.lane === lane &&
    toMin(s.hora_inicio.slice(0, 5)) === start && toMin(s.hora_fin.slice(0, 5)) === end
  )
  if (yaLoPidioEllaMisma) return NextResponse.json({ error: 'Ya solicitaste este puesto' }, { status: 409 })

  const { data: creada, error } = await supabaseAdmin
    .from('solicitudes_puesto')
    .insert({
      usuario_id: session.id,
      equipo_id: equipoId,
      equipo_nombre: equipoRow.nombre,
      tipo_recurso: tipo,
      fecha,
      hora_inicio: horaInicio,
      hora_fin: horaFin,
      lane,
      estado: 'pending',
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const encargadaIds = await getAdminAndEncargadaIds()
  if (encargadaIds.length) {
    await crearNotificaciones(encargadaIds, {
      titulo: 'Nueva solicitud de puesto',
      mensaje: `${me.nombre} solicitó cubrir un ${tipo} de ${equipoRow.nombre} el ${fmtFechaLarga(fecha)} de ${horaInicio} a ${horaFin}.`,
      tipo: 'puesto_solicitado',
      url: '/dashboard/espacio-trabajo?tab=aprobaciones',
    }).catch(() => {})
  }

  return NextResponse.json(creada)
}
