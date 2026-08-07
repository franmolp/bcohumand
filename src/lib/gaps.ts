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
// (peluquería, recepción, o cualquier equipo que no exista todavía).
export function tipoRecurso(equipo: string): 'mesa' | 'box' | null {
  if (isMasajistaODepiladora(equipo)) return 'box'
  if (isPeluqueria(equipo) || isRecepcion(equipo)) return null
  return 'mesa'
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
