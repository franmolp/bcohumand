// Lógica compartida (server + client) para calcular huecos de "puestos libres" por equipo.
// Espejo de la que ya usa /dashboard/espacio-trabajo/client.tsx para su pestaña "Disponibles" —
// se porta acá para poder reusarla desde API routes y el cron sin duplicar la clasificación
// de equipos (que es por substring del nombre, así que interesa que sea una única fuente).

export interface TurnoBasico {
  usuario_id: string
  fecha: string
  inicio: string
  fin: string
}

const GANTT_START = 9 * 60
const GANTT_END = 20 * 60
export const MIN_GAP_MINUTOS = 3 * 60

function normalizeEquipo(equipo: string): string {
  return equipo.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
}

export function isRecepcion(equipo: string): boolean {
  return normalizeEquipo(equipo).includes('recep')
}

export function isPeluqueria(equipo: string): boolean {
  return normalizeEquipo(equipo).includes('peluq')
}

export function isMasajistaODepiladora(equipo: string): boolean {
  const n = normalizeEquipo(equipo)
  return n.includes('masaj') || n.includes('depilac')
}

export function isManicura(equipo: string): boolean {
  return !isRecepcion(equipo) && !isPeluqueria(equipo) && !isMasajistaODepiladora(equipo)
}

// 'mesa' | 'box' = equipo elegible para la dinámica de puestos libres. null = no participa
// (peluquería, recepción, sin equipo asignado, o cualquier equipo que no exista todavía).
export function tipoRecurso(equipo: string): 'mesa' | 'box' | null {
  if (!equipo) return null
  if (isMasajistaODepiladora(equipo)) return 'box'
  if (isPeluqueria(equipo) || isRecepcion(equipo)) return null
  return 'mesa'
}

// Concordancia de género para armar oraciones ("una mesa" / "un box")
export function conArticulo(tipo: 'mesa' | 'box'): string {
  return tipo === 'box' ? 'un box' : 'una mesa'
}
export function conArticuloDef(tipo: 'mesa' | 'box'): string {
  return tipo === 'box' ? 'el box' : 'la mesa'
}
export function deArticulo(tipo: 'mesa' | 'box'): string {
  return tipo === 'box' ? 'del box' : 'de la mesa'
}

export function defaultCapacity(equipoNombre: string): number {
  const n = normalizeEquipo(equipoNombre)
  if (n.includes('peluq')) return 4
  if (n.includes('masaj') || n.includes('depilac')) return 2
  if (n.includes('recep')) return 1
  return 8
}

export function toMin(t: string): number {
  const [h, m] = t.split(':').map(Number)
  return h * 60 + (m || 0)
}

export function minToStr(m: number): string {
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
}

export function assignLanes<T extends { inicio: string; fin: string }>(shifts: T[]): (T & { lane: number })[] {
  const sorted = [...shifts].sort((a, b) => a.inicio.localeCompare(b.inicio))
  const laneEndMins: number[] = []
  return sorted.map(s => {
    const startM = toMin(s.inicio)
    let lane = laneEndMins.findIndex(end => end <= startM)
    if (lane === -1) lane = laneEndMins.length
    laneEndMins[lane] = toMin(s.fin)
    return { ...s, lane }
  })
}

// Huecos >= MIN_GAP_MINUTOS por carril, para un solo día de un solo equipo.
export function findGapsForDay<T extends { inicio: string; fin: string }>(
  shifts: T[],
  capacity: number,
  minGapMinutos: number = MIN_GAP_MINUTOS
): { lane: number; start: number; end: number }[] {
  const withLanes = assignLanes(shifts)
  const usedLanes = withLanes.length > 0 ? Math.max(...withLanes.map(t => t.lane)) + 1 : 0
  const totalLanes = Math.max(capacity > 0 ? capacity : 0, usedLanes)

  const result: { lane: number; start: number; end: number }[] = []

  for (let lane = 0; lane < totalLanes; lane++) {
    const laneShifts = withLanes
      .filter(t => t.lane === lane)
      .sort((a, b) => toMin(a.inicio) - toMin(b.inicio))

    let cursor = GANTT_START
    for (const shift of laneShifts) {
      const s = toMin(shift.inicio)
      const e = toMin(shift.fin)
      if (s - cursor >= minGapMinutos) result.push({ lane, start: cursor, end: s })
      cursor = Math.max(cursor, e)
    }
    if (GANTT_END - cursor >= minGapMinutos) result.push({ lane, start: cursor, end: GANTT_END })
  }

  return result
}

export function overlaps(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
  return aStart < bEnd && bStart < aEnd
}

export interface TurnoCanonico { inicio: number; fin: number; label: 'Mañana' | 'Tarde' }

// Franjas fijas de turno mañana/tarde: manicura tiene un corte de descanso 14:30-15:00,
// masajes/depilación no.
export function turnosDeTipo(tipo: 'mesa' | 'box'): TurnoCanonico[] {
  return tipo === 'box'
    ? [{ inicio: 9 * 60, fin: 15 * 60, label: 'Mañana' }, { inicio: 15 * 60, fin: 20 * 60, label: 'Tarde' }]
    : [{ inicio: 9 * 60, fin: 14 * 60 + 30, label: 'Mañana' }, { inicio: 15 * 60, fin: 20 * 60, label: 'Tarde' }]
}

function restarIntervalo(
  piezas: { start: number; end: number }[],
  sub: { start: number; end: number }
): { start: number; end: number }[] {
  const siguientes: { start: number; end: number }[] = []
  for (const p of piezas) {
    if (sub.end <= p.start || sub.start >= p.end) { siguientes.push(p); continue }
    if (sub.start > p.start) siguientes.push({ start: p.start, end: sub.start })
    if (sub.end < p.end) siguientes.push({ start: sub.end, end: p.end })
  }
  return siguientes
}

// Resta intervalos ya aprobados (por carril) de los huecos crudos — puede partir un hueco en dos
// si el aprobado quedó en el medio, o recortar una punta.
export function restarAprobados(
  gaps: { lane: number; start: number; end: number }[],
  aprobados: { lane: number; start: number; end: number }[],
  minGapMinutos: number = MIN_GAP_MINUTOS
): { lane: number; start: number; end: number }[] {
  const result: { lane: number; start: number; end: number }[] = []
  for (const gap of gaps) {
    let piezas = [{ start: gap.start, end: gap.end }]
    for (const ap of aprobados.filter(a => a.lane === gap.lane)) {
      piezas = restarIntervalo(piezas, ap)
    }
    for (const p of piezas) {
      if (p.end - p.start >= minGapMinutos) result.push({ lane: gap.lane, start: p.start, end: p.end })
    }
  }
  return result
}

// Descompone un hueco crudo en los turnos canónicos (mañana/tarde) que entren completos, más lo
// que sobre (si alcanza el mínimo) sin etiqueta de turno. Así una empleada nunca ve "todo el día
// disponible" como un solo bloque: si el hueco cubre un turno entero, se lo ofrecemos aparte.
export function decomponerGap(
  gap: { start: number; end: number },
  tipo: 'mesa' | 'box',
  minGapMinutos: number = MIN_GAP_MINUTOS
): { start: number; end: number; label: 'Mañana' | 'Tarde' | null }[] {
  const piezas: { start: number; end: number; label: 'Mañana' | 'Tarde' | null }[] = []
  let restante = [{ start: gap.start, end: gap.end }]

  for (const turno of turnosDeTipo(tipo)) {
    const contenedor = restante.find(r => r.start <= turno.inicio && r.end >= turno.fin)
    if (!contenedor) continue
    piezas.push({ start: turno.inicio, end: turno.fin, label: turno.label })
    restante = restarIntervalo(restante, { start: turno.inicio, end: turno.fin })
  }

  for (const r of restante) {
    if (r.end - r.start >= minGapMinutos) piezas.push({ start: r.start, end: r.end, label: null })
  }

  return piezas
}
