import { supabaseAdmin } from '@/lib/supabase-admin'
import { tipoRecurso, defaultCapacity, findGapsForDay, toMin, minToStr, overlaps } from '@/lib/gaps'

function addDays(date: string, n: number): string {
  const d = new Date(date + 'T12:00:00Z')
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

export interface PuestoDisponible {
  id: string
  fecha: string
  hora_inicio: string
  hora_fin: string
  horas: number
  tipo_recurso: 'mesa' | 'box'
  mi_solicitud: 'none' | 'pending'
}

// Puestos libres (>=3h) para el equipo del usuario, semana actual + próxima, restando
// solicitudes ya aprobadas y excluyendo huecos que se pisan con un turno propio ese día.
// Compartida entre la API /api/puestos-disponibles y la card del Home (server component).
export async function getPuestosDisponibles(
  usuarioId: string,
  equipoUsuario: string
): Promise<{ tipo_recurso: 'mesa' | 'box'; puestos: PuestoDisponible[] } | { error: string; status: number }> {
  const tipo = tipoRecurso(equipoUsuario)
  if (!tipo) return { error: 'Esta sección es solo para manicura y masajes/depilación', status: 403 }

  const { data: me } = await supabaseAdmin.from('usuarios').select('equipo_id').eq('id', usuarioId).single()
  if (!me?.equipo_id) return { error: 'No tenés un equipo asignado', status: 400 }

  const { data: equipoRow } = await supabaseAdmin.from('equipos').select('id, nombre').eq('id', me.equipo_id).single()
  if (!equipoRow) return { error: 'Equipo no encontrado', status: 400 }

  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' })
  const hasta = addDays(today, 13) // semana actual + próxima

  const [configRes, miembrosRes, ajustesRes] = await Promise.all([
    supabaseAdmin.from('configuracion').select('valor').eq('clave', 'espacio_trabajo').single(),
    supabaseAdmin.from('usuarios').select('id').eq('equipo_id', equipoRow.id).eq('estado_cuenta', 'activo'),
    supabaseAdmin
      .from('solicitudes_puesto')
      .select('usuario_id, fecha, hora_inicio, hora_fin, lane, estado')
      .eq('equipo_id', equipoRow.id)
      .gte('fecha', today)
      .lte('fecha', hasta)
      .in('estado', ['approved', 'pending']),
  ])

  const capacidadesOverride = (configRes.data?.valor as { capacidades?: Record<string, number> } | null)?.capacidades ?? {}
  const capacity = capacidadesOverride[equipoRow.nombre] ?? defaultCapacity(equipoRow.nombre)

  const miembroIds = (miembrosRes.data ?? []).map(u => u.id as string)
  if (miembroIds.length === 0) return { tipo_recurso: tipo, puestos: [] }

  const { data: horarios } = await supabaseAdmin
    .from('horarios_base')
    .select('usuario_id, fecha, inicio_base, fin_base')
    .in('usuario_id', miembroIds)
    .gte('fecha', today)
    .lte('fecha', hasta)
    .limit(5000)

  const normalizeTime = (t: string) => (t ? t.slice(0, 5) : t)
  type Turno = { usuario_id: string; fecha: string; inicio: string; fin: string }
  const turnos: Turno[] = (horarios ?? []).map(h => ({
    usuario_id: h.usuario_id as string,
    fecha: h.fecha as string,
    inicio: normalizeTime(h.inicio_base as string),
    fin: normalizeTime(h.fin_base as string),
  }))

  const turnosPorFecha = new Map<string, Turno[]>()
  for (const t of turnos) {
    if (!turnosPorFecha.has(t.fecha)) turnosPorFecha.set(t.fecha, [])
    turnosPorFecha.get(t.fecha)!.push(t)
  }

  const misTurnosPorFecha = new Map<string, Turno[]>()
  for (const t of turnos.filter(t => t.usuario_id === usuarioId)) {
    if (!misTurnosPorFecha.has(t.fecha)) misTurnosPorFecha.set(t.fecha, [])
    misTurnosPorFecha.get(t.fecha)!.push(t)
  }

  type SolicitudExistente = { usuario_id: string; fecha: string; hora_inicio: string; hora_fin: string; lane: number; estado: string }
  const solicitudesPorFecha = new Map<string, SolicitudExistente[]>()
  for (const s of (ajustesRes.data ?? []) as SolicitudExistente[]) {
    if (!solicitudesPorFecha.has(s.fecha)) solicitudesPorFecha.set(s.fecha, [])
    solicitudesPorFecha.get(s.fecha)!.push(s)
  }

  const puestos: PuestoDisponible[] = []

  for (const [fecha, shiftsDia] of turnosPorFecha.entries()) {
    const gaps = findGapsForDay(shiftsDia, capacity)
    const misTurnosDia = misTurnosPorFecha.get(fecha) ?? []
    const solicitudesDia = solicitudesPorFecha.get(fecha) ?? []

    for (const gap of gaps) {
      const sePisaConTurnoPropio = misTurnosDia.some(t => overlaps(gap.start, gap.end, toMin(t.inicio), toMin(t.fin)))
      if (sePisaConTurnoPropio) continue

      const yaAprobado = solicitudesDia.some(s =>
        s.estado === 'approved' && s.lane === gap.lane &&
        overlaps(gap.start, gap.end, toMin(s.hora_inicio.slice(0, 5)), toMin(s.hora_fin.slice(0, 5)))
      )
      if (yaAprobado) continue

      const miSolicitudPendiente = solicitudesDia.find(s =>
        s.usuario_id === usuarioId && s.estado === 'pending' && s.lane === gap.lane &&
        toMin(s.hora_inicio.slice(0, 5)) === gap.start && toMin(s.hora_fin.slice(0, 5)) === gap.end
      )

      puestos.push({
        id: `${fecha}|${equipoRow.id}|${gap.lane}|${minToStr(gap.start)}|${minToStr(gap.end)}`,
        fecha,
        hora_inicio: minToStr(gap.start),
        hora_fin: minToStr(gap.end),
        horas: Math.round((gap.end - gap.start) / 60 * 10) / 10,
        tipo_recurso: tipo,
        mi_solicitud: miSolicitudPendiente ? 'pending' : 'none',
      })
    }
  }

  puestos.sort((a, b) => (a.fecha + a.hora_inicio).localeCompare(b.fecha + b.hora_inicio))

  return { tipo_recurso: tipo, puestos }
}
