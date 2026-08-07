import { supabaseAdmin } from '@/lib/supabase-admin'
import { tipoRecurso, defaultCapacity, findGapsForDay, toMin, minToStr, overlaps, restarAprobados, decomponerGap } from '@/lib/gaps'

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
  turno: 'Mañana' | 'Tarde' | null
  tipo_recurso: 'mesa' | 'box'
  cantidad: number
  mi_solicitud: 'none' | 'pending'
  solicitud_id: string | null
}

const CONFIG_KEY_EQUIPOS = 'puestos_equipos'

// IDs de equipo habilitados por el admin para la dinámica de puestos libres.
// Sin configurar todavía = ninguno habilitado (opt-in explícito, no todos por defecto).
export async function getEquiposHabilitadosPuestos(): Promise<number[]> {
  const { data } = await supabaseAdmin.from('configuracion').select('valor').eq('clave', CONFIG_KEY_EQUIPOS).single()
  const val = data?.valor as { equipoIds?: number[] } | null
  return val?.equipoIds ?? []
}

export async function setEquiposHabilitadosPuestos(equipoIds: number[]): Promise<void> {
  await supabaseAdmin.from('configuracion').upsert({ clave: CONFIG_KEY_EQUIPOS, valor: { equipoIds } }, { onConflict: 'clave' })
}

// Resuelve el equipo del usuario por nombre y confirma que esté habilitado por el admin.
// Se usa tanto para gatear el acceso (nav, page.tsx) como antes de calcular/crear solicitudes.
export async function resolverAccesoPuestos(
  equipoUsuario: string
): Promise<{ ok: true; equipoId: number; equipoNombre: string; tipo: 'mesa' | 'box' } | { ok: false; error: string; status: number }> {
  if (!equipoUsuario) return { ok: false, error: 'No tenés un equipo asignado', status: 400 }

  const [{ data: equipoRow }, habilitados] = await Promise.all([
    supabaseAdmin.from('equipos').select('id, nombre').eq('nombre', equipoUsuario).single(),
    getEquiposHabilitadosPuestos(),
  ])
  if (!equipoRow) return { ok: false, error: 'Tu equipo no está configurado correctamente. Avisale a un admin.', status: 400 }
  if (!habilitados.includes(equipoRow.id)) {
    return { ok: false, error: 'Esta función todavía no está habilitada para tu equipo', status: 403 }
  }

  const tipo = tipoRecurso(equipoUsuario) ?? 'mesa'
  return { ok: true, equipoId: equipoRow.id, equipoNombre: equipoRow.nombre, tipo }
}

// Puestos libres (>=3h) para el equipo del usuario, semana actual + próxima, restando
// solicitudes ya aprobadas y excluyendo huecos que se pisan con un turno propio ese día.
// Compartida entre la API /api/puestos-disponibles y la card del Home (server component).
export async function getPuestosDisponibles(
  usuarioId: string,
  equipoUsuario: string
): Promise<{ tipo_recurso: 'mesa' | 'box'; puestos: PuestoDisponible[]; hoy: string } | { error: string; status: number }> {
  const acceso = await resolverAccesoPuestos(equipoUsuario)
  if (!acceso.ok) return { error: acceso.error, status: acceso.status }
  const { equipoId, equipoNombre, tipo } = acceso
  const equipoRow = { id: equipoId, nombre: equipoNombre }

  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' })
  const hasta = addDays(today, 13) // semana actual + próxima

  const [configRes, miembrosRes, ajustesRes] = await Promise.all([
    supabaseAdmin.from('configuracion').select('valor').eq('clave', 'espacio_trabajo').single(),
    supabaseAdmin.from('usuarios').select('id').eq('equipo_id', equipoRow.id).eq('estado_cuenta', 'activo'),
    supabaseAdmin
      .from('solicitudes_puesto')
      .select('id, usuario_id, fecha, hora_inicio, hora_fin, lane, estado')
      .eq('equipo_id', equipoRow.id)
      .gte('fecha', today)
      .lte('fecha', hasta)
      .in('estado', ['approved', 'pending']),
  ])

  const capacidadesOverride = (configRes.data?.valor as { capacidades?: Record<string, number> } | null)?.capacidades ?? {}
  const capacity = capacidadesOverride[equipoRow.nombre] ?? defaultCapacity(equipoRow.nombre)

  const miembroIds = (miembrosRes.data ?? []).map(u => u.id as string)
  if (miembroIds.length === 0) return { tipo_recurso: tipo, puestos: [], hoy: today }

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

  type SolicitudExistente = { id: string; usuario_id: string; fecha: string; hora_inicio: string; hora_fin: string; lane: number; estado: string }
  const solicitudesPorFecha = new Map<string, SolicitudExistente[]>()
  for (const s of (ajustesRes.data ?? []) as SolicitudExistente[]) {
    if (!solicitudesPorFecha.has(s.fecha)) solicitudesPorFecha.set(s.fecha, [])
    solicitudesPorFecha.get(s.fecha)!.push(s)
  }

  const puestos: PuestoDisponible[] = []

  for (const [fecha, shiftsDia] of turnosPorFecha.entries()) {
    const gapsCrudos = findGapsForDay(shiftsDia, capacity)
    const misTurnosDia = misTurnosPorFecha.get(fecha) ?? []
    const solicitudesDia = solicitudesPorFecha.get(fecha) ?? []

    // Resta lo ya aprobado (puede partir un hueco en dos) antes de ofrecer nada
    const aprobadosDia = solicitudesDia
      .filter(s => s.estado === 'approved')
      .map(s => ({ lane: s.lane, start: toMin(s.hora_inicio.slice(0, 5)), end: toMin(s.hora_fin.slice(0, 5)) }))
    const gapsLibres = restarAprobados(gapsCrudos, aprobadosDia)

    // Descompone en turnos fijos (mañana/tarde) cuando el hueco cubre uno entero, para no
    // ofrecer "todo el día" como un solo bloque gigante; y fusiona por carril para no mostrar
    // el mismo horario repetido varias veces cuando hay más de una mesa/box libre a la vez.
    const grupos = new Map<string, { start: number; end: number; label: 'Mañana' | 'Tarde' | null; lanes: number[] }>()
    for (const gap of gapsLibres) {
      for (const pieza of decomponerGap(gap, tipo)) {
        const sePisaConTurnoPropio = misTurnosDia.some(t => overlaps(pieza.start, pieza.end, toMin(t.inicio), toMin(t.fin)))
        if (sePisaConTurnoPropio) continue

        const key = `${pieza.start}-${pieza.end}-${pieza.label}`
        if (!grupos.has(key)) grupos.set(key, { start: pieza.start, end: pieza.end, label: pieza.label, lanes: [] })
        grupos.get(key)!.lanes.push(gap.lane)
      }
    }

    for (const { start, end, label, lanes } of grupos.values()) {
      const miSolicitudPendiente = solicitudesDia.find(s =>
        s.usuario_id === usuarioId && s.estado === 'pending' && lanes.includes(s.lane) &&
        overlaps(start, end, toMin(s.hora_inicio.slice(0, 5)), toMin(s.hora_fin.slice(0, 5)))
      )

      puestos.push({
        id: `${fecha}|${equipoRow.id}|${minToStr(start)}|${minToStr(end)}`,
        fecha,
        hora_inicio: minToStr(start),
        hora_fin: minToStr(end),
        horas: Math.round((end - start) / 60 * 10) / 10,
        turno: label,
        tipo_recurso: tipo,
        cantidad: lanes.length,
        mi_solicitud: miSolicitudPendiente ? 'pending' : 'none',
        solicitud_id: miSolicitudPendiente?.id ?? null,
      })
    }
  }

  puestos.sort((a, b) => (a.fecha + a.hora_inicio).localeCompare(b.fecha + b.hora_inicio))

  return { tipo_recurso: tipo, puestos, hoy: today }
}
