import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { defaultCapacity, findGapsForDay, restarAprobados, toMin, minToStr, overlaps, conArticulo } from '@/lib/gaps'
import { fmtFechaLarga } from '@/lib/fecha'
import { resolverAccesoPuestos } from '@/lib/puestos'
import { crearNotificaciones, getAdminAndEncargadaIds } from '@/lib/notificaciones'

export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const acceso = await resolverAccesoPuestos(session.equipo)
  if (!acceso.ok) return NextResponse.json({ error: acceso.error }, { status: acceso.status })
  const tipo = acceso.tipo

  const body = await req.json().catch(() => ({})) as { id?: string }
  const partes = body.id?.split('|') ?? []
  if (partes.length !== 4) return NextResponse.json({ error: 'Puesto inválido' }, { status: 400 })
  const [fecha, equipoIdStr, horaInicio, horaFin] = partes
  const equipoId = Number(equipoIdStr)
  const start = toMin(horaInicio)
  const end = toMin(horaFin)
  if (!fecha || Number.isNaN(equipoId) || Number.isNaN(start) || Number.isNaN(end)) {
    return NextResponse.json({ error: 'Puesto inválido' }, { status: 400 })
  }

  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' })
  if (fecha < today) return NextResponse.json({ error: 'Esa fecha ya pasó' }, { status: 400 })

  if (acceso.equipoId !== equipoId) {
    return NextResponse.json({ error: 'Ese puesto no pertenece a tu equipo' }, { status: 403 })
  }
  const equipoRow = { id: acceso.equipoId, nombre: acceso.equipoNombre }

  const { data: me } = await supabaseAdmin.from('usuarios').select('nombre').eq('id', session.id).single()

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

  const misTurnosDia = shiftsDia.filter(t => t.usuario_id === session.id)
  const sePisaConTurnoPropio = misTurnosDia.some(t => overlaps(start, end, toMin(t.inicio), toMin(t.fin)))
  if (sePisaConTurnoPropio) {
    return NextResponse.json({ error: 'Ese horario se pisa con un turno que ya tenés asignado' }, { status: 409 })
  }

  const solicitudesExistentes = (solicitudesRes.data ?? []) as { id: string; usuario_id: string; hora_inicio: string; hora_fin: string; lane: number; estado: string }[]

  // Revalidar server-side que el hueco sigue libre — nunca confiar en lo que mandó el cliente.
  // Se resta lo ya aprobado (puede haber partido un hueco en dos) y se busca algún carril que
  // todavía contenga completo el horario pedido.
  const gapsCrudos = findGapsForDay(shiftsDia, capacity)
  const aprobadosDia = solicitudesExistentes
    .filter(s => s.estado === 'approved')
    .map(s => ({ lane: s.lane, start: toMin(s.hora_inicio.slice(0, 5)), end: toMin(s.hora_fin.slice(0, 5)) }))
  const gapsLibres = restarAprobados(gapsCrudos, aprobadosDia)
  const lanesDisponibles = [...new Set(
    gapsLibres.filter(g => g.start <= start && g.end >= end).map(g => g.lane)
  )]
  if (lanesDisponibles.length === 0) {
    return NextResponse.json({ error: 'Ese puesto ya no está disponible' }, { status: 409 })
  }

  const yaLoPidioEllaMisma = solicitudesExistentes.some(s =>
    s.usuario_id === session.id && s.estado === 'pending' && lanesDisponibles.includes(s.lane) &&
    overlaps(start, end, toMin(s.hora_inicio.slice(0, 5)), toMin(s.hora_fin.slice(0, 5)))
  )
  if (yaLoPidioEllaMisma) return NextResponse.json({ error: 'Ya solicitaste este puesto' }, { status: 409 })

  // Preferir el carril con menos solicitudes pendientes (idealmente uno libre de pedidos) para
  // repartir entre las mesas/boxes libres en vez de amontonar todo en la primera
  const pendientesPorLane = new Map<number, number>(lanesDisponibles.map(l => [l, 0]))
  for (const s of solicitudesExistentes) {
    if (s.estado === 'pending' && lanesDisponibles.includes(s.lane) &&
        overlaps(start, end, toMin(s.hora_inicio.slice(0, 5)), toMin(s.hora_fin.slice(0, 5)))) {
      pendientesPorLane.set(s.lane, (pendientesPorLane.get(s.lane) ?? 0) + 1)
    }
  }
  const lane = [...pendientesPorLane.entries()].sort((a, b) => a[1] - b[1] || a[0] - b[0])[0][0]

  const { data: creada, error } = await supabaseAdmin
    .from('solicitudes_puesto')
    .insert({
      usuario_id: session.id,
      equipo_id: equipoId,
      equipo_nombre: equipoRow.nombre,
      tipo_recurso: tipo,
      fecha,
      hora_inicio: minToStr(start),
      hora_fin: minToStr(end),
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
      mensaje: `${me?.nombre ?? session.nombre} solicitó cubrir ${conArticulo(tipo)} el ${fmtFechaLarga(fecha)} de ${horaInicio} a ${horaFin}.`,
      tipo: 'puesto_solicitado',
      url: '/dashboard/espacio-trabajo?tab=aprobaciones',
    }).catch(() => {})
  }

  return NextResponse.json(creada)
}
