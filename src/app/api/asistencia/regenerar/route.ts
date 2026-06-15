import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { supabase } from '@/lib/supabase'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { computeChip, getTeamType, DEFAULT_CONFIG, AsistenciaConfig } from '@/lib/asistencia'

export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const isAdmin = session.rol === 'admin' || session.rol === 'Admin'
  if (!isAdmin) return NextResponse.json({ error: 'Prohibido' }, { status: 403 })

  const body = await req.json()
  const { fechaInicio, fechaFin, usuarioId } = body as {
    fechaInicio: string; fechaFin: string; usuarioId?: string
  }

  if (!fechaInicio || !fechaFin) {
    return NextResponse.json({ error: 'fechaInicio y fechaFin requeridos' }, { status: 400 })
  }

  // Nunca procesar hoy ni fechas futuras — siempre cap a ayer
  const ayerD = new Date(); ayerD.setDate(ayerD.getDate() - 1)
  const ayerStr = ayerD.toISOString().split('T')[0]
  const fechaFinEfectiva = fechaFin > ayerStr ? ayerStr : fechaFin

  if (fechaFinEfectiva < fechaInicio) {
    return NextResponse.json({ procesados: 0 })
  }

  // Cargar configuración
  const { data: configData } = await supabase
    .from('configuracion')
    .select('valor')
    .eq('clave', 'asistencia')
    .single()
  const config: AsistenciaConfig = configData?.valor
    ? { ...DEFAULT_CONFIG, ...(configData.valor as object) }
    : DEFAULT_CONFIG

  // Solo usuarios con ID de reloj HikVision asignado
  let usuariosQuery = supabase
    .from('usuarios')
    .select('id, nombre, equipos(nombre)')
    .neq('estado_cuenta', 'inactiva')
    .not('reloj', 'is', null)
    .neq('reloj', '')
  if (usuarioId) usuariosQuery = usuariosQuery.eq('id', usuarioId)

  const { data: usuarios, error: usuariosErr } = await usuariosQuery
  if (usuariosErr) return NextResponse.json({ error: usuariosErr.message }, { status: 500 })
  if (!usuarios || usuarios.length === 0) return NextResponse.json({ procesados: 0 })

  function paginate<T extends Record<string, unknown>>(
    table: string, select: string,
    filters: (q: ReturnType<typeof supabaseAdmin.from>) => ReturnType<typeof supabaseAdmin.from>
  ): Promise<{ data: T[]; error: null }> {
    return (async () => {
      const all: T[] = []
      const PAGE = 900
      let from = 0
      while (true) {
        const { data, error } = await filters(supabaseAdmin.from(table).select(select)).range(from, from + PAGE - 1)
        if (error || !data || data.length === 0) break
        all.push(...(data as T[]))
        if (data.length < PAGE) break
        from += PAGE
      }
      return { data: all, error: null }
    })()
  }

  // Cargar fuentes de datos en paralelo
  const [horariosRes, rawRes, primerTurnoRes, solicitudesRes] = await Promise.all([
    paginate<{ usuario_id: string; fecha: string; inicio_base: string; fin_base: string; horas_base: number }>(
      'horarios_base', 'usuario_id, fecha, inicio_base, fin_base, horas_base',
      q => q.gte('fecha', fechaInicio).lte('fecha', fechaFinEfectiva)
    ),
    paginate<{ usuario_id: string; fecha: string; hora: string }>(
      'asistencia_raw', 'usuario_id, fecha, hora',
      q => q.gte('fecha', fechaInicio).lte('fecha', fechaFinEfectiva)
    ),
    paginate<{ usuario_id: string; fecha: string; primer_turno: string; cant_citas: number }>(
      'primer_turno_dia', 'usuario_id, fecha, primer_turno, cant_citas',
      q => q.gte('fecha', fechaInicio).lte('fecha', fechaFinEfectiva)
    ),
    supabase.from('solicitudes')
      .select('usuario_id, tipo, fecha_inicio, fecha_fin, estado')
      .in('estado', ['approved', 'pending'])
      .lte('fecha_inicio', fechaFinEfectiva)
      .or(`fecha_fin.gte.${fechaInicio},fecha_fin.is.null`)
      .limit(10000),
  ])

  // Construir mapas
  const horarioMap = new Map<string, { inicio: string; fin: string; horas: number }>()
  for (const h of horariosRes.data ?? []) {
    horarioMap.set(`${h.usuario_id}|${h.fecha}`, { inicio: h.inicio_base, fin: h.fin_base, horas: h.horas_base })
  }

  const rawMap = new Map<string, string[]>()
  for (const r of rawRes.data ?? []) {
    const key = `${r.usuario_id}|${r.fecha}`
    if (!rawMap.has(key)) rawMap.set(key, [])
    rawMap.get(key)!.push(r.hora)
  }

  const primerTurnoMap = new Map<string, { primer_turno: string; cant_citas: number }>()
  for (const pt of primerTurnoRes.data ?? []) {
    primerTurnoMap.set(`${pt.usuario_id}|${pt.fecha}`, {
      primer_turno: pt.primer_turno,
      cant_citas: pt.cant_citas ?? 0,
    })
  }

  // Solicitudes: uid|fecha → { tipo, estado } (approved tiene prioridad sobre pending)
  const solicitudMap = new Map<string, { tipo: string; estado: string }>()
  for (const sol of solicitudesRes.data ?? []) {
    const uid = sol.usuario_id
    if (!uid) continue
    const end = sol.fecha_fin ?? sol.fecha_inicio
    const d = new Date(sol.fecha_inicio + 'T12:00:00')
    const endD = new Date(end + 'T12:00:00')
    while (d <= endD) {
      const dateStr = d.toISOString().split('T')[0]
      if (dateStr >= fechaInicio && dateStr <= fechaFinEfectiva) {
        const key = `${uid}|${dateStr}`
        const existing = solicitudMap.get(key)
        if (!existing || existing.estado === 'pending') {
          solicitudMap.set(key, { tipo: sol.tipo, estado: sol.estado })
        }
      }
      d.setDate(d.getDate() + 1)
    }
  }

  // Generar lista de días
  const dias: string[] = []
  const dCur = new Date(fechaInicio + 'T12:00:00')
  const dEnd = new Date(fechaFinEfectiva + 'T12:00:00')
  while (dCur <= dEnd) {
    dias.push(dCur.toISOString().split('T')[0])
    dCur.setDate(dCur.getDate() + 1)
  }

  const DOW = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado']

  function getSemana(dateStr: string): number {
    const dt = new Date(dateStr + 'T12:00:00')
    const soy = new Date(dt.getFullYear(), 0, 1)
    return Math.ceil(((dt.getTime() - soy.getTime()) / 86400000 + soy.getDay() + 1) / 7)
  }

  const records: Record<string, unknown>[] = []

  for (const usuario of usuarios) {
    const equipoRaw = usuario.equipos as { nombre: string } | { nombre: string }[] | null
    const equipoNombre = !equipoRaw ? null
      : Array.isArray(equipoRaw) ? (equipoRaw[0]?.nombre ?? null)
      : equipoRaw.nombre
    const teamType = getTeamType(equipoNombre, config)

    for (const fecha of dias) {
      const horario = horarioMap.get(`${usuario.id}|${fecha}`) ?? null
      const fichadas = rawMap.get(`${usuario.id}|${fecha}`) ?? []
      const turnoData = primerTurnoMap.get(`${usuario.id}|${fecha}`) ?? null
      const solicitud = solicitudMap.get(`${usuario.id}|${fecha}`) ?? null

      // No generar fila si no hay datos
      if (!horario && fichadas.length === 0 && !solicitud) continue

      const result = computeChip({
        horario: horario ? { inicio: horario.inicio, fin: horario.fin, horas: horario.horas } : null,
        fichadas,
        primerTurno: turnoData?.primer_turno ?? null,
        cantCitas: turnoData?.cant_citas ?? (turnoData ? 1 : 0),
        solicitudTipo: solicitud?.tipo ?? null,
        solicitudEstado: (solicitud?.estado ?? null) as 'pending' | 'approved' | 'rejected' | null,
        teamType,
        config,
      })

      const dt = new Date(fecha + 'T12:00:00')
      records.push({
        usuario_id: usuario.id,
        fecha,
        semana: getSemana(fecha),
        dia_semana: DOW[dt.getDay()],
        horario_base_entrada: horario?.inicio ?? null,
        horario_base_salida: horario?.fin ?? null,
        horas_base: horario?.horas ?? null,
        fichada_entrada: result.fichada_entrada,
        fichada_salida: result.fichada_salida,
        horas_fichadas: result.horas_fichadas,
        estado: result.estado,
        minutos_tarde: result.minutos_tarde,
        minutos_antes: result.minutos_antes,
        tiene_justificacion: result.tiene_justificacion,
        ultima_actualizacion: new Date().toISOString(),
      })
    }
  }

  // Limpiar registros residuales de usuarios sin reloj asignado en el rango
  const [{ data: sinRelojNull }, { data: sinRelojVacio }] = await Promise.all([
    supabase.from('usuarios').select('id').is('reloj', null),
    supabase.from('usuarios').select('id').eq('reloj', ''),
  ])
  const sinRelojIds = [
    ...(sinRelojNull ?? []).map((u: { id: string }) => u.id),
    ...(sinRelojVacio ?? []).map((u: { id: string }) => u.id),
  ]
  if (sinRelojIds.length > 0) {
    await supabaseAdmin
      .from('asistencia_procesada')
      .delete()
      .in('usuario_id', sinRelojIds)
      .gte('fecha', fechaInicio)
      .lte('fecha', fechaFinEfectiva)
  }

  // Preservar registros editados manualmente
  const userIds = usuarios.map(u => u.id)
  const { data: manuales } = await supabaseAdmin
    .from('asistencia_procesada')
    .select('usuario_id, fecha')
    .in('usuario_id', userIds)
    .gte('fecha', fechaInicio)
    .lte('fecha', fechaFinEfectiva)
    .eq('editado_manual', true)

  const manualSet = new Set((manuales ?? []).map(r => `${r.usuario_id}|${r.fecha}`))

  // Borrar solo los no editados manualmente
  const { error: delErr } = await supabaseAdmin
    .from('asistencia_procesada')
    .delete()
    .in('usuario_id', userIds)
    .gte('fecha', fechaInicio)
    .lte('fecha', fechaFinEfectiva)
    .or('editado_manual.is.null,editado_manual.eq.false')

  if (delErr) return NextResponse.json({ error: delErr.message }, { status: 500 })

  // No pisar los editados manualmente
  const toInsert = records.filter(r => !manualSet.has(`${r.usuario_id}|${r.fecha}`))

  const BATCH = 500
  for (let i = 0; i < toInsert.length; i += BATCH) {
    const { error: insErr } = await supabaseAdmin.from('asistencia_procesada').insert(toInsert.slice(i, i + BATCH))
    if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 })
  }

  return NextResponse.json({ procesados: toInsert.length })
}
