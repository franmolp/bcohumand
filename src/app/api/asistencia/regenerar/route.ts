import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { supabase } from '@/lib/supabase'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { computeChip, getTeamType, DEFAULT_CONFIG, AsistenciaConfig } from '@/lib/asistencia'
import { isRecepcion } from '@/lib/gaps'
import { esCancelada } from '@/lib/citas'

export const maxDuration = 60

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  const bearerSecret = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null
  const isInternal = bearerSecret && bearerSecret === process.env.CRON_SECRET

  if (!isInternal) {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    const isAdmin = session.rol === 'admin' || session.rol === 'Admin'
    if (!isAdmin) return NextResponse.json({ error: 'Prohibido' }, { status: 403 })
  }

  const body = await req.json()
  const { fechaInicio, fechaFin, usuarioId } = body as {
    fechaInicio: string; fechaFin: string; usuarioId?: string
  }

  if (!fechaInicio || !fechaFin) {
    return NextResponse.json({ error: 'fechaInicio y fechaFin requeridos' }, { status: 400 })
  }

  // Nunca procesar hoy ni fechas futuras — cap a AYER en hora Argentina. OJO: en
  // Vercel new Date() es UTC, y de tarde/noche en Argentina (UTC-3) eso ya es el
  // día siguiente; "ayer UTC" podía ser HOY en Argentina y se procesaba el día en
  // curso con las citas de BCO (que conoce los turnos) pero sin las fichadas de
  // HikVision todavía, marcándolo "Sin turnos/Sin fichada" con datos incompletos.
  const hoyAR = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' })
  const ayerAR = new Date(hoyAR + 'T12:00:00Z'); ayerAR.setUTCDate(ayerAR.getUTCDate() - 1)
  const ayerStr = ayerAR.toISOString().split('T')[0]
  const fechaFinEfectiva = fechaFin > ayerStr ? ayerStr : fechaFin
  // Rango a BORRAR = el pedido completo (incluye hoy/futuro), para limpiar filas
  // que hayan quedado de una corrida vieja con el bug de arriba. Se reinsertan solo
  // los días <= ayer, así hoy y el futuro quedan SIN registro => la vista muestra
  // "Sin datos" hasta que el día cierre y lleguen las fichadas.
  const fechaFinBorrar = fechaFin

  if (fechaFinEfectiva < fechaInicio) {
    // El rango pedido es íntegramente hoy/futuro: no hay nada que procesar, pero
    // igual limpiamos cualquier registro no-manual que haya quedado de antes.
    let delQ = supabaseAdmin
      .from('asistencia_procesada')
      .delete()
      .gte('fecha', fechaInicio)
      .lte('fecha', fechaFinBorrar)
      .or('editado_manual.is.null,editado_manual.eq.false')
    if (usuarioId) delQ = delQ.eq('usuario_id', usuarioId)
    await delQ
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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    filters: (q: any) => any
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
  const [horariosRes, rawRes, primerTurnoRes, solicitudesRes, citasDetalleRes] = await Promise.all([
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
    // Detalle de citas (una fila por cita, con su estado). Lo llena BCO Turnos; sirve
    // para contar las citas REALES excluyendo canceladas/no-show, porque el cant_citas
    // de primer_turno_dia viene de BCO incluyendo las canceladas.
    paginate<{ usuario_id: string; fecha: string; estado: string | null }>(
      'fresha_citas_detalle', 'usuario_id, fecha, estado',
      q => q.gte('fecha', fechaInicio).lte('fecha', fechaFinEfectiva)
    ),
  ])

  // Construir mapas. horarios_base puede traer más de una fila el mismo día
  // (horario partido, ej. 9-12 y 15-20) — se suman las horas de todos los
  // bloques para no perder plata en el cálculo de presentismo/liquidación, y
  // inicio/fin quedan como el rango exterior (primer inicio, último fin) para
  // mostrar en pantalla. OJO: la detección de "llegada tarde"/"salida
  // temprana" en computeChip todavía compara contra ese rango exterior como si
  // fuera un solo turno continuo — en un día con horario partido puede no
  // marcar tarde/temprano correctamente dentro del hueco entre bloques.
  const horarioMap = new Map<string, { inicio: string; fin: string; horas: number }>()
  for (const h of horariosRes.data ?? []) {
    const key = `${h.usuario_id}|${h.fecha}`
    const existente = horarioMap.get(key)
    if (!existente) {
      horarioMap.set(key, { inicio: h.inicio_base, fin: h.fin_base, horas: h.horas_base ?? 0 })
    } else {
      horarioMap.set(key, {
        inicio: h.inicio_base < existente.inicio ? h.inicio_base : existente.inicio,
        fin: h.fin_base > existente.fin ? h.fin_base : existente.fin,
        horas: existente.horas + (h.horas_base ?? 0),
      })
    }
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

  // Conteo de citas REALES por uid|fecha desde el detalle: total de filas y cuántas NO
  // están canceladas. Si hay detalle para ese día, manda este conteo (excluye canceladas);
  // si no hay detalle, se cae al cant_citas de primer_turno_dia.
  const citasRealesMap = new Map<string, number>()
  const tieneDetalle = new Set<string>()
  for (const c of citasDetalleRes.data ?? []) {
    const key = `${c.usuario_id}|${c.fecha}`
    tieneDetalle.add(key)
    if (!esCancelada(c.estado)) citasRealesMap.set(key, (citasRealesMap.get(key) ?? 0) + 1)
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
    const d = new Date(dateStr + 'T12:00:00')
    const dow = d.getDay() || 7  // 1=Lun … 7=Dom
    const thursday = new Date(d)
    thursday.setDate(d.getDate() + (4 - dow))
    const yearStart = new Date(thursday.getFullYear(), 0, 1)
    return Math.ceil(((thursday.getTime() - yearStart.getTime()) / 86400000 + 1) / 7)
  }

  const records: Record<string, unknown>[] = []

  for (const usuario of usuarios) {
    const equipoRaw = usuario.equipos as { nombre: string } | { nombre: string }[] | null
    const equipoNombre = !equipoRaw ? null
      : Array.isArray(equipoRaw) ? (equipoRaw[0]?.nombre ?? null)
      : equipoRaw.nombre
    const teamType = getTeamType(equipoNombre, config)
    const esRecepcion = equipoNombre ? isRecepcion(equipoNombre) : false

    for (const fecha of dias) {
      const key = `${usuario.id}|${fecha}`
      const horario = horarioMap.get(key) ?? null
      const fichadas = rawMap.get(key) ?? []
      const turnoData = primerTurnoMap.get(key) ?? null
      const solicitud = solicitudMap.get(key) ?? null

      // No generar fila si no hay datos
      if (!horario && fichadas.length === 0 && !solicitud) continue

      // Citas REALES del día (para decidir "Sin turnos" vs "Sin fichada"):
      // - Si hay detalle de citas ese día (BCO), se cuentan las NO canceladas. Así, si
      //   todas sus citas se cancelaron (no fue a trabajar), quedan 0 => "Sin turnos".
      // - Si no hay detalle, se cae al cant_citas de primer_turno_dia (que BCO manda
      //   incluyendo canceladas, pero es lo único disponible en ese caso).
      // "Sin fichada" solo con citas reales > 0; null/0/vacío => 0 => "Sin turnos".
      const cantCitas = tieneDetalle.has(key)
        ? (citasRealesMap.get(key) ?? 0)
        : (Number(turnoData?.cant_citas) || 0)

      const result = computeChip({
        horario: horario ? { inicio: horario.inicio, fin: horario.fin, horas: horario.horas } : null,
        fichadas,
        primerTurno: turnoData?.primer_turno ?? null,
        cantCitas,
        solicitudTipo: solicitud?.tipo ?? null,
        solicitudEstado: (solicitud?.estado ?? null) as 'pending' | 'approved' | 'rejected' | null,
        teamType,
        config,
        esRecepcion,
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
      .lte('fecha', fechaFinBorrar)
  }

  // Preservar registros editados manualmente (en todo el rango pedido, incl. hoy/futuro)
  const userIds = usuarios.map(u => u.id)
  const { data: manuales } = await supabaseAdmin
    .from('asistencia_procesada')
    .select('usuario_id, fecha')
    .in('usuario_id', userIds)
    .gte('fecha', fechaInicio)
    .lte('fecha', fechaFinBorrar)
    .eq('editado_manual', true)

  const manualSet = new Set((manuales ?? []).map(r => `${r.usuario_id}|${r.fecha}`))

  // Borrar solo los no editados manualmente, en todo el rango pedido. Al reinsertar
  // solo días <= ayer, los registros de hoy/futuro quedan borrados y no se recrean
  // (así se limpian los que hubieran quedado de una corrida vieja con datos a medias).
  const { error: delErr } = await supabaseAdmin
    .from('asistencia_procesada')
    .delete()
    .in('usuario_id', userIds)
    .gte('fecha', fechaInicio)
    .lte('fecha', fechaFinBorrar)
    .or('editado_manual.is.null,editado_manual.eq.false')

  if (delErr) return NextResponse.json({ error: delErr.message }, { status: 500 })

  // No pisar los editados manualmente
  const toInsert = records.filter(r => !manualSet.has(`${r.usuario_id}|${r.fecha}`))

  const BATCH = 500
  for (let i = 0; i < toInsert.length; i += BATCH) {
    const { error: insErr } = await supabaseAdmin.from('asistencia_procesada').insert(toInsert.slice(i, i + BATCH))
    if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 })
  }

  // Invalidar el cache de informes de los meses regenerados (la ocupación/días
  // presentes de la productividad depende de asistencia_procesada). El uso diario
  // regenera el mes en curso, que no se cachea; solo invalida al tocar meses pasados.
  const mesesReproc = new Set<string>()
  let curMes = fechaInicio.slice(0, 7)
  const finMes = fechaFinEfectiva.slice(0, 7)
  for (let i = 0; i < 60 && curMes <= finMes; i++) {
    mesesReproc.add(curMes)
    const [yy, mm] = curMes.split('-').map(Number)
    const next = new Date(Date.UTC(yy, mm, 1))
    curMes = `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, '0')}`
  }
  if (mesesReproc.size) await supabaseAdmin.from('informes_cache').delete().in('mes', [...mesesReproc])

  return NextResponse.json({ procesados: toInsert.length })
}
