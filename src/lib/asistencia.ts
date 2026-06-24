export const CHIP_INFO: Record<string, {
  bg: string; text: string; short: string; present: boolean; justificado: boolean
}> = {
  'Asistió':                          { bg: 'bg-emerald-100', text: 'text-emerald-700', short: '✓',     present: true,  justificado: false },
  'Llegada tarde':                    { bg: 'bg-amber-100',   text: 'text-amber-700',   short: 'T',     present: true,  justificado: false },
  'Salida temprana':                  { bg: 'bg-orange-100',  text: 'text-orange-700',  short: 'ST',    present: true,  justificado: false },
  'Llegada tarde/Salida temprana':    { bg: 'bg-amber-200',   text: 'text-amber-800',   short: 'T/ST',  present: true,  justificado: false },
  'Tarde justificado':                { bg: 'bg-blue-100',    text: 'text-blue-700',    short: 'TJ',    present: true,  justificado: false },
  'Tarde justificado/Salida temprana':{ bg: 'bg-blue-100',    text: 'text-blue-700',    short: 'TJ/ST', present: true,  justificado: false },
  'Incompleto':                       { bg: 'bg-yellow-100',  text: 'text-yellow-700',  short: '?',     present: true,  justificado: false },
  'Sin turnos':                       { bg: 'bg-gray-50',     text: 'text-gray-400',    short: '·',     present: true,  justificado: false },
  'Sin fichada':                      { bg: 'bg-slate-100',   text: 'text-slate-500',   short: 'SF',    present: true,  justificado: false },
  'Ausente':                          { bg: 'bg-red-200',     text: 'text-red-700',     short: 'X',     present: false, justificado: false },
  'Vacaciones':                       { bg: 'bg-sky-100',     text: 'text-sky-600',     short: 'V',     present: false, justificado: true  },
  'Feriado/Local cerrado':            { bg: 'bg-indigo-100',  text: 'text-indigo-600',  short: 'F',     present: false, justificado: true  },
  'Ausencia justificada':             { bg: 'bg-teal-100',    text: 'text-teal-600',    short: 'AJ',    present: false, justificado: true  },
  'Ausencia injustificada':           { bg: 'bg-red-100',     text: 'text-red-600',     short: 'AI',    present: false, justificado: false },
  'Solicitud pendiente':              { bg: 'bg-purple-100',  text: 'text-purple-600',  short: 'SP',    present: false, justificado: true  },
}

export function toMinutes(t: string): number {
  const [h, m] = t.substring(0, 5).split(':').map(Number)
  return h * 60 + (m || 0)
}

export type TeamType = 'turnos' | 'estricto' | 'resto'

export interface AsistenciaConfig {
  toleranciaEntrada: number
  toleranciaSalida: number
  maxLlegadasTarde: number
  maxSalidasTempranas: number
  maxAusenciasInjustificadas: number
  minimoSemanal: number
  equiposPorTurnos: string[]
  equiposHorarioEstricto: string[]
  empleadosPresentismo: string[]
}

export const DEFAULT_CONFIG: AsistenciaConfig = {
  toleranciaEntrada: 0,
  toleranciaSalida: 15,
  maxLlegadasTarde: 2,
  maxSalidasTempranas: 2,
  maxAusenciasInjustificadas: 1,
  minimoSemanal: 30,
  equiposPorTurnos: ['Masajes', 'Masajistas', 'Depilacion', 'Depiladoras'],
  equiposHorarioEstricto: ['Peluqueras', 'Peluqueria'],
  empleadosPresentismo: [],
}

export function getTeamType(equipoNombre: string | null, config: AsistenciaConfig): TeamType {
  if (!equipoNombre) return 'resto'
  const lower = equipoNombre.toLowerCase()
  if (config.equiposPorTurnos.some(e => lower.includes(e.toLowerCase()))) return 'turnos'
  if (config.equiposHorarioEstricto.some(e => lower.includes(e.toLowerCase()))) return 'estricto'
  return 'resto'
}

export interface ComputeResult {
  estado: string
  fichada_entrada: string | null
  fichada_salida: string | null
  horas_fichadas: number | null
  minutos_tarde: number
  minutos_antes: number
  tiene_justificacion: boolean
}

export interface ComputeInput {
  horario: { inicio: string; fin: string; horas?: number } | null
  fichadas: string[]
  primerTurno: string | null
  cantCitas: number
  solicitudTipo: string | null
  solicitudEstado: 'pending' | 'approved' | 'rejected' | null
  teamType: TeamType
  config: AsistenciaConfig
}

export function computeChip(input: ComputeInput): ComputeResult {
  const { horario, fichadas, primerTurno, cantCitas, solicitudTipo, solicitudEstado, teamType, config } = input

  const empty: ComputeResult = {
    estado: 'Sin turnos', fichada_entrada: null, fichada_salida: null,
    horas_fichadas: null, minutos_tarde: 0, minutos_antes: 0, tiene_justificacion: false,
  }

  if (solicitudEstado === 'pending') {
    return { ...empty, estado: 'Solicitud pendiente', tiene_justificacion: true }
  }

  if (solicitudEstado === 'approved' && solicitudTipo) {
    if (solicitudTipo === 'Vacaciones') return { ...empty, estado: 'Vacaciones', tiene_justificacion: true }
    if (solicitudTipo === 'Feriado/Local cerrado') return { ...empty, estado: 'Feriado/Local cerrado', tiene_justificacion: true }
    if (solicitudTipo === 'Ausencia por Salud' || solicitudTipo === 'Solicitud de Días') return { ...empty, estado: 'Ausencia justificada', tiene_justificacion: true }
    if (solicitudTipo === 'Ausencia Injustificada') return { ...empty, estado: 'Ausencia injustificada' }
  }

  // Fichadas antes de las 6am pertenecen al día anterior
  const validFichadas = fichadas.filter(f => toMinutes(f.substring(0, 5)) >= 360)

  // Deduplicar por HH:MM (doble toque)
  const deduped = Array.from(new Set(validFichadas.map(f => f.substring(0, 5)))).sort()

  // Sin horario base (ej: empleada sin Fresha): calcular igual a partir de fichadas
  if (!horario) {
    if (deduped.length >= 2) {
      const entradaStr = deduped[0]
      const salidaStr = deduped[deduped.length - 1]
      const horas_fichadas = parseFloat(((toMinutes(salidaStr) - toMinutes(entradaStr)) / 60).toFixed(2))
      return { estado: 'Asistió', fichada_entrada: entradaStr, fichada_salida: salidaStr, horas_fichadas, minutos_tarde: 0, minutos_antes: 0, tiene_justificacion: false }
    }
    if (deduped.length === 1) {
      return { estado: 'Incompleto', fichada_entrada: deduped[0], fichada_salida: null, horas_fichadas: null, minutos_tarde: 0, minutos_antes: 0, tiene_justificacion: false }
    }
    return { ...empty, estado: 'Sin turnos' }
  }

  if (deduped.length === 0) {
    const hb = horario.horas ?? parseFloat(((toMinutes(horario.fin) - toMinutes(horario.inicio)) / 60).toFixed(2))
    if (cantCitas === 0) return { ...empty, estado: 'Sin turnos', horas_fichadas: hb, tiene_justificacion: false }
    return { ...empty, estado: 'Sin fichada', horas_fichadas: hb, tiene_justificacion: false }
  }

  const inicioMin = toMinutes(horario.inicio)
  const finMin = toMinutes(horario.fin)
  const horasBase = horario.horas ?? parseFloat(((finMin - inicioMin) / 60).toFixed(2))

  // Fichada incompleta: detectar si es entrada o salida por proximidad
  if (deduped.length === 1) {
    const ficMin = toMinutes(deduped[0])
    const esEntrada = Math.abs(ficMin - inicioMin) <= Math.abs(ficMin - finMin)
    return {
      estado: 'Incompleto',
      fichada_entrada: esEntrada ? deduped[0] : null,
      fichada_salida: esEntrada ? null : deduped[0],
      horas_fichadas: horasBase,
      minutos_tarde: 0, minutos_antes: 0, tiene_justificacion: false,
    }
  }

  const entradaStr = deduped[0]
  const salidaStr = deduped[deduped.length - 1]
  const entMin = toMinutes(entradaStr)
  const salMin = toMinutes(salidaStr)
  const horas_fichadas = parseFloat(((salMin - entMin) / 60).toFixed(2))
  const minTarde = Math.max(0, entMin - inicioMin)
  const minAntes = Math.max(0, finMin - salMin)

  // Masajistas / Depiladoras: regla 30 min igual que resto, pero nunca evalúan salida temprana
  if (teamType === 'turnos') {
    const turnoJust = primerTurno && toMinutes(primerTurno) - inicioMin > 30
    const refMin = turnoJust ? toMinutes(primerTurno!) : inicioMin
    const isLate = entMin > refMin + config.toleranciaEntrada
    if (turnoJust && !isLate && entMin > inicioMin) {
      return { estado: 'Tarde justificado', fichada_entrada: entradaStr, fichada_salida: salidaStr, horas_fichadas, minutos_tarde: minTarde, minutos_antes: 0, tiene_justificacion: true }
    }
    if (isLate) {
      return { estado: 'Llegada tarde', fichada_entrada: entradaStr, fichada_salida: salidaStr, horas_fichadas, minutos_tarde: Math.max(0, entMin - refMin), minutos_antes: 0, tiene_justificacion: false }
    }
    return { estado: 'Asistió', fichada_entrada: entradaStr, fichada_salida: salidaStr, horas_fichadas, minutos_tarde: 0, minutos_antes: 0, tiene_justificacion: false }
  }

  // Peluqueras: horario base estricto siempre
  if (teamType === 'estricto') {
    const lt = entMin > inicioMin + config.toleranciaEntrada
    const st = salMin < finMin - config.toleranciaSalida
    if (lt && st) return { estado: 'Llegada tarde/Salida temprana', fichada_entrada: entradaStr, fichada_salida: salidaStr, horas_fichadas, minutos_tarde: minTarde, minutos_antes: minAntes, tiene_justificacion: false }
    if (lt) return { estado: 'Llegada tarde', fichada_entrada: entradaStr, fichada_salida: salidaStr, horas_fichadas, minutos_tarde: minTarde, minutos_antes: 0, tiene_justificacion: false }
    if (st) return { estado: 'Salida temprana', fichada_entrada: entradaStr, fichada_salida: salidaStr, horas_fichadas, minutos_tarde: 0, minutos_antes: minAntes, tiene_justificacion: false }
    return { estado: 'Asistió', fichada_entrada: entradaStr, fichada_salida: salidaStr, horas_fichadas, minutos_tarde: 0, minutos_antes: 0, tiene_justificacion: false }
  }

  // Resto: regla de los 30 minutos
  if (primerTurno) {
    const turnoMin = toMinutes(primerTurno)
    if (turnoMin - inicioMin > 30 && entMin > inicioMin) {
      if (entMin <= turnoMin + config.toleranciaEntrada) {
        const st = salMin < finMin - config.toleranciaSalida
        if (st) return { estado: 'Tarde justificado/Salida temprana', fichada_entrada: entradaStr, fichada_salida: salidaStr, horas_fichadas, minutos_tarde: minTarde, minutos_antes: minAntes, tiene_justificacion: false }
        return { estado: 'Tarde justificado', fichada_entrada: entradaStr, fichada_salida: salidaStr, horas_fichadas, minutos_tarde: minTarde, minutos_antes: 0, tiene_justificacion: true }
      }
      // Llegó después del turno → caer en comparación con base
    }
  }

  const lt = entMin > inicioMin + config.toleranciaEntrada
  const st = salMin < finMin - config.toleranciaSalida
  if (lt && st) return { estado: 'Llegada tarde/Salida temprana', fichada_entrada: entradaStr, fichada_salida: salidaStr, horas_fichadas, minutos_tarde: minTarde, minutos_antes: minAntes, tiene_justificacion: false }
  if (lt) return { estado: 'Llegada tarde', fichada_entrada: entradaStr, fichada_salida: salidaStr, horas_fichadas, minutos_tarde: minTarde, minutos_antes: 0, tiene_justificacion: false }
  if (st) return { estado: 'Salida temprana', fichada_entrada: entradaStr, fichada_salida: salidaStr, horas_fichadas, minutos_tarde: 0, minutos_antes: minAntes, tiene_justificacion: false }
  return { estado: 'Asistió', fichada_entrada: entradaStr, fichada_salida: salidaStr, horas_fichadas, minutos_tarde: 0, minutos_antes: 0, tiene_justificacion: false }
}

export interface PresentismoResult {
  horasReales: number
  horasJustificadas: number
  laborables: number
  presentes: number
  tardanzas: number
  salidaTempranaCount: number
  ausencias: number
  justificadas: number
  llegadasTardeCount: number
  ausenciasInjustificadasCount: number
  pct: number | null
  estado: 'ok' | 'bajo' | 'no_cumple' | 'penalizado'
  minimoMensual: number
}

export function calcPresentismo(
  records: { estado: string | null; horas_fichadas: number | null; horas_base: number | null; dia_semana?: string | null; horario_base_entrada?: string | null; horario_base_salida?: string | null }[],
  config: AsistenciaConfig,
  diasNoFestivos: number,
): PresentismoResult {
  // Primera pasada: promedios de horas por día de semana para imputar justificados sin horario
  const dowSums = new Map<string, { sum: number; count: number }>()
  for (const r of records) {
    const chip = CHIP_INFO[r.estado ?? '']
    if (!chip?.present || !r.dia_semana) continue
    const h = r.horas_base
      ?? (r.horario_base_entrada && r.horario_base_salida
        ? parseFloat(((toMinutes(r.horario_base_salida) - toMinutes(r.horario_base_entrada)) / 60).toFixed(2))
        : null)
    if (h == null) continue
    const e = dowSums.get(r.dia_semana) ?? { sum: 0, count: 0 }
    e.sum += h; e.count++
    dowSums.set(r.dia_semana, e)
  }
  const dowAvg = new Map(Array.from(dowSums).map(([d, { sum, count }]) => [d, sum / count]))
  const globalAvg = dowSums.size
    ? Array.from(dowSums.values()).reduce((s, { sum, count }) => s + sum / count, 0) / dowSums.size
    : 0

  let horasReales = 0, horasJustificadas = 0
  let laborables = 0, presentes = 0, tardanzas = 0, salidaTempranaCount = 0
  let ausencias = 0, justificadas = 0
  let llegadasTardeCount = 0, ausenciasInjustificadasCount = 0

  for (const r of records) {
    const estado = r.estado ?? ''
    const chip = CHIP_INFO[estado]
    if (!chip) continue

    if (chip.present) {
      laborables++; presentes++
      horasReales += r.horas_base ?? 0
      if (estado.startsWith('Llegada tarde')) { tardanzas++; llegadasTardeCount++ }
      if (estado.includes('Salida temprana')) salidaTempranaCount++
    } else if (chip.justificado) {
      laborables++; justificadas++
      const hb = r.horas_base ?? (r.dia_semana ? (dowAvg.get(r.dia_semana) ?? globalAvg) : globalAvg)
      horasJustificadas += hb
    } else if (estado === 'Ausencia injustificada' || estado === 'Ausente') {
      laborables++; ausencias++
      ausenciasInjustificadasCount++
    }
  }

  const minimoMensual = parseFloat(((diasNoFestivos / 6) * config.minimoSemanal).toFixed(1))
  const total = horasReales + horasJustificadas
  const pct = minimoMensual > 0 ? Math.round((total / minimoMensual) * 100) : null

  const penalizado =
    llegadasTardeCount > config.maxLlegadasTarde ||
    salidaTempranaCount > config.maxSalidasTempranas ||
    ausenciasInjustificadasCount > config.maxAusenciasInjustificadas

  const estado: PresentismoResult['estado'] = penalizado ? 'penalizado'
    : (pct === null || pct >= 100) ? 'ok'
    : pct >= 85 ? 'bajo'
    : 'no_cumple'

  return {
    horasReales, horasJustificadas, laborables, presentes, tardanzas,
    salidaTempranaCount, ausencias, justificadas,
    llegadasTardeCount, ausenciasInjustificadasCount,
    pct, estado, minimoMensual,
  }
}
