import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { supabase } from '@/lib/supabase'
import { supabaseAdmin } from '@/lib/supabase-admin'

export const dynamic = 'force-dynamic'

const ABSENCE_LABELS: Record<string, string> = {
  'Vacaciones': 'vacaciones',
  'Solicitud de Días': 'licencia',
  'Ausencia Injustificada': 'ausencia injustificada',
}

function normalizar(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
}

function getSemana(dateStr: string): number {
  const d = new Date(dateStr + 'T12:00:00')
  const dow = d.getDay() || 7
  const thursday = new Date(d)
  thursday.setDate(d.getDate() + (4 - dow))
  const yearStart = new Date(thursday.getFullYear(), 0, 1)
  return Math.ceil(((thursday.getTime() - yearStart.getTime()) / 86400000 + 1) / 7)
}

export async function GET(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const isAdmin = session.rol === 'admin' || session.rol === 'Admin'
  const isHR = session.rol === 'HR'
  if (!isAdmin && !isHR) return NextResponse.json({ error: 'Prohibido' }, { status: 403 })

  const { searchParams } = new URL(req.url)
  const mes = searchParams.get('mes')
  if (!mes || !/^\d{4}-\d{2}$/.test(mes)) {
    return NextResponse.json({ error: 'Parámetro mes inválido (YYYY-MM)' }, { status: 400 })
  }
  const [year, month] = mes.split('-').map(Number)
  const lastDay = new Date(year, month, 0).getDate()
  const fechaInicio = `${mes}-01`
  const fechaFin = `${mes}-${String(lastDay).padStart(2, '0')}`

  // 1. Equipo Recepción
  const { data: equipos, error: equiposErr } = await supabase.from('equipos').select('id, nombre')
  if (equiposErr) return NextResponse.json({ error: equiposErr.message }, { status: 500 })
  const recepcionIds = (equipos ?? []).filter(e => normalizar(e.nombre).includes('recep')).map(e => e.id)
  if (recepcionIds.length === 0) return NextResponse.json({ empleados: [], efemeridesDisponible: true })

  // 2. Usuarios de Recepción
  const { data: usuarios, error: usuariosErr } = await supabase
    .from('usuarios')
    .select('id, nombre')
    .in('equipo_id', recepcionIds)
    .neq('estado_cuenta', 'archivado')
    .order('nombre')
  if (usuariosErr) return NextResponse.json({ error: usuariosErr.message }, { status: 500 })
  if (!usuarios || usuarios.length === 0) return NextResponse.json({ empleados: [], efemeridesDisponible: true })
  const userIds = usuarios.map(u => u.id)

  // 3. Feriados del mes (tabla efemerides — puede no estar migrada todavía)
  const { data: efem, error: efemErr } = await supabaseAdmin
    .from('efemerides')
    .select('dia, anio, tipo')
    .eq('mes', month)
    .in('tipo', ['feriado', 'cerrado'])
  const feriadoFechas = !efemErr && efem
    ? efem.filter(e => e.anio == null || e.anio === year).map(e => `${mes}-${String(e.dia).padStart(2, '0')}`)
    : []

  // 4. Fichadas crudas en fechas de feriado, para usuarios de Recepción
  const feriadosTrabajadosPorUsuario = new Map<string, { fecha: string; horas: number | null }[]>()
  if (feriadoFechas.length > 0) {
    const { data: raw } = await supabaseAdmin
      .from('asistencia_raw')
      .select('usuario_id, fecha, hora')
      .in('usuario_id', userIds)
      .in('fecha', feriadoFechas)

    const horasPorClave = new Map<string, string[]>()
    for (const r of raw ?? []) {
      const key = `${r.usuario_id}|${r.fecha}`
      if (!horasPorClave.has(key)) horasPorClave.set(key, [])
      horasPorClave.get(key)!.push(r.hora)
    }
    for (const [key, horas] of horasPorClave) {
      const [usuarioId, fecha] = key.split('|')
      const validas = horas.filter(h => {
        const [hh, mm] = h.substring(0, 5).split(':').map(Number)
        return hh * 60 + (mm || 0) >= 360
      })
      const deduped = Array.from(new Set(validas.map(h => h.substring(0, 5)))).sort()
      if (deduped.length === 0) continue
      let horasTrabajadas: number | null = null
      if (deduped.length >= 2) {
        const [eh, em] = deduped[0].split(':').map(Number)
        const [sh, sm] = deduped[deduped.length - 1].split(':').map(Number)
        horasTrabajadas = parseFloat((((sh * 60 + sm) - (eh * 60 + em)) / 60).toFixed(2))
      }
      if (!feriadosTrabajadosPorUsuario.has(usuarioId)) feriadosTrabajadosPorUsuario.set(usuarioId, [])
      feriadosTrabajadosPorUsuario.get(usuarioId)!.push({ fecha, horas: horasTrabajadas })
    }
  }

  // 5. Ausencias (solicitudes aprobadas) que se solapan con el mes
  const { data: solicitudes } = await supabase
    .from('solicitudes')
    .select('usuario_id, tipo, fecha_inicio, fecha_fin')
    .in('usuario_id', userIds)
    .eq('estado', 'approved')
    .in('tipo', ['Vacaciones', 'Ausencia por Salud', 'Solicitud de Días', 'Ausencia Injustificada'])
    .lte('fecha_inicio', fechaFin)
    .or(`fecha_fin.gte.${fechaInicio},fecha_fin.is.null`)

  const ausenciasPorUsuario = new Map<string, Map<string, number>>()
  for (const sol of solicitudes ?? []) {
    const inicioRaw = sol.fecha_inicio.substring(0, 10)
    const finRaw = (sol.fecha_fin ?? sol.fecha_inicio).substring(0, 10)
    const inicio = inicioRaw < fechaInicio ? fechaInicio : inicioRaw
    const fin = finRaw > fechaFin ? fechaFin : finRaw
    if (inicio > fin) continue
    const dias = Math.round((new Date(fin + 'T12:00:00').getTime() - new Date(inicio + 'T12:00:00').getTime()) / 86400000) + 1
    if (!ausenciasPorUsuario.has(sol.usuario_id)) ausenciasPorUsuario.set(sol.usuario_id, new Map())
    const m = ausenciasPorUsuario.get(sol.usuario_id)!
    m.set(sol.tipo, (m.get(sol.tipo) ?? 0) + dias)
  }

  // 6. Horas base semanales (moda de las semanas del mes; en empate, el valor menor)
  const { data: horarios } = await supabaseAdmin
    .from('horarios_base')
    .select('usuario_id, fecha, horas_base')
    .in('usuario_id', userIds)
    .gte('fecha', fechaInicio)
    .lte('fecha', fechaFin)

  const semanasPorUsuario = new Map<string, Map<number, number>>()
  for (const h of horarios ?? []) {
    const semana = getSemana(h.fecha)
    if (!semanasPorUsuario.has(h.usuario_id)) semanasPorUsuario.set(h.usuario_id, new Map())
    const m = semanasPorUsuario.get(h.usuario_id)!
    m.set(semana, (m.get(semana) ?? 0) + (h.horas_base ?? 0))
  }

  function horasBaseSemanal(usuarioId: string): number {
    const semanas = semanasPorUsuario.get(usuarioId)
    if (!semanas || semanas.size === 0) return 0
    // Moda de los totales semanales; empate → el menor (el valor "base", sin extras)
    const freq = new Map<number, number>()
    for (const v of semanas.values()) {
      const rounded = Math.round(v * 2) / 2 // redondear a 0,5hs para agrupar variaciones mínimas
      freq.set(rounded, (freq.get(rounded) ?? 0) + 1)
    }
    let moda = 0, maxFreq = 0
    for (const [v, f] of freq) {
      if (f > maxFreq || (f === maxFreq && v < moda)) { moda = v; maxFreq = f }
    }
    return moda
  }

  // 7. Armar resultado por empleado
  const empleados = usuarios.map(u => {
    const ausencias = ausenciasPorUsuario.get(u.id) ?? new Map()
    return {
      id: u.id,
      nombre: u.nombre,
      horasBaseSemanal: horasBaseSemanal(u.id),
      feriadosTrabajados: (feriadosTrabajadosPorUsuario.get(u.id) ?? []).sort((a, b) => a.fecha.localeCompare(b.fecha)),
      diasSalud: ausencias.get('Ausencia por Salud') ?? 0,
      otrasAusencias: Array.from(ausencias.entries())
        .filter(([tipo]) => tipo !== 'Ausencia por Salud')
        .map(([tipo, dias]) => ({ label: ABSENCE_LABELS[tipo] ?? tipo.toLowerCase(), dias })),
    }
  })

  return NextResponse.json({ empleados, efemeridesDisponible: !efemErr })
}
