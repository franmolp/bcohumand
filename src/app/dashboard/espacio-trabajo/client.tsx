'use client'

import { useState, useEffect, useMemo } from 'react'
import type { SessionUser } from '@/types'
import { Spinner } from '@/components/ui'
import { IconLayoutGrid, IconChevronLeft, IconChevronRight, IconClock } from '@/components/ui/Icons'

// ── Types ────────────────────────────────────────────────────────────────────
interface Turno {
  usuario_id: string
  nombre: string
  equipo: string
  fecha: string
  inicio: string
  fin: string
}

interface ApiResponse {
  turnos: Turno[]
  ultimaImportacion: string | null
  capacidades: Record<string, number>   // equipo_nombre → capacity
}

// ── ISO week helpers ──────────────────────────────────────────────────────────
function isoWeekOf(dateStr: string): { year: number; week: number } {
  const d = new Date(dateStr + 'T12:00:00')
  const dow = d.getDay() || 7
  const thu = new Date(d)
  thu.setDate(d.getDate() + (4 - dow))
  const yearStart = new Date(thu.getFullYear(), 0, 1)
  const week = Math.ceil(((thu.getTime() - yearStart.getTime()) / 86400000 + 1) / 7)
  return { year: thu.getFullYear(), week }
}

function isoWeeksInYear(year: number): number {
  const d = new Date(year, 11, 28)
  const dow = d.getDay() || 7
  const thu = new Date(d)
  thu.setDate(d.getDate() + (4 - dow))
  const yearStart = new Date(thu.getFullYear(), 0, 1)
  return Math.ceil(((thu.getTime() - yearStart.getTime()) / 86400000 + 1) / 7)
}

function getWeekDates(year: number, week: number): string[] {
  const jan4 = new Date(year, 0, 4)
  const dow = jan4.getDay() || 7
  const mon = new Date(year, 0, jan4.getDate() - dow + 1 + (week - 1) * 7)
  return Array.from({ length: 6 }, (_, i) => {
    const d = new Date(mon.getFullYear(), mon.getMonth(), mon.getDate() + i)
    return d.toLocaleDateString('sv')  // YYYY-MM-DD en timezone local
  })
}

// ── Gantt helpers ─────────────────────────────────────────────────────────────
const GANTT_START = 9 * 60
const GANTT_END = 20 * 60
const GANTT_SPAN = GANTT_END - GANTT_START
const HOURS = Array.from({ length: 12 }, (_, i) => 9 + i)

function toMin(t: string): number {
  const [h, m] = t.split(':').map(Number)
  return h * 60 + (m || 0)
}
function startPct(t: string) {
  return Math.max(0, (toMin(t) - GANTT_START) / GANTT_SPAN * 100)
}
function widthPct(inicio: string, fin: string) {
  const s = Math.max(GANTT_START, toMin(inicio))
  const e = Math.min(GANTT_END, toMin(fin))
  return Math.max(0.5, (e - s) / GANTT_SPAN * 100)
}

function assignLanes(shifts: Turno[]): (Turno & { lane: number })[] {
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

function peakConcurrent(shifts: Turno[]): number {
  if (!shifts.length) return 0
  return Math.max(...assignLanes(shifts).map(s => s.lane)) + 1
}

// ── Available slots (huecos ≥ 3h) ────────────────────────────────────────────
const MIN_GAP = 3 * 60

function minToStr(m: number): string {
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
}

function findGaps(shifts: Turno[], capacity: number): { lane: number; gaps: { start: number; end: number }[] }[] {
  const withLanes = assignLanes(shifts)
  const usedLanes = withLanes.length > 0 ? Math.max(...withLanes.map(t => t.lane)) + 1 : 0
  const totalLanes = Math.max(capacity > 0 ? capacity : 0, usedLanes)

  const result: { lane: number; gaps: { start: number; end: number }[] }[] = []

  for (let lane = 0; lane < totalLanes; lane++) {
    const laneShifts = withLanes
      .filter(t => t.lane === lane)
      .sort((a, b) => toMin(a.inicio) - toMin(b.inicio))

    const gaps: { start: number; end: number }[] = []
    let cursor = GANTT_START

    for (const shift of laneShifts) {
      const s = toMin(shift.inicio)
      const e = toMin(shift.fin)
      if (s - cursor >= MIN_GAP) gaps.push({ start: cursor, end: s })
      cursor = Math.max(cursor, e)
    }
    if (GANTT_END - cursor >= MIN_GAP) gaps.push({ start: cursor, end: GANTT_END })

    if (gaps.length > 0) result.push({ lane, gaps })
  }

  return result
}

// ── Colors ────────────────────────────────────────────────────────────────────
const PALETTE = [
  '#6366F1','#EC4899','#8B5CF6','#14B8A6','#F59E0B',
  '#EF4444','#3B82F6','#10B981','#F97316','#06B6D4',
  '#84CC16','#7C3AED','#0EA5E9','#D946EF','#A78BFA',
  '#F43F5E','#64748B','#22C55E','#2DD4BF','#FBBF24',
]
function empColor(userId: string): string {
  let h = 0
  for (let i = 0; i < userId.length; i++) h = ((h << 5) - h + userId.charCodeAt(i)) | 0
  return PALETTE[Math.abs(h) % PALETTE.length]
}

// ── Relative time ─────────────────────────────────────────────────────────────
function relTime(iso: string): string {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000)
  if (mins < 60) return `hace ${mins} min`
  const hs = Math.floor(mins / 60)
  if (hs < 24) return `hace ${hs}h`
  const ds = Math.floor(hs / 24)
  return ds === 1 ? 'ayer' : `hace ${ds} días`
}

// ── Labels ────────────────────────────────────────────────────────────────────
const DIAS_CORTO = ['Dom','Lun','Mar','Mié','Jue','Vie','Sáb']
const MESES_CORTO = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic']

function dayLabel(dateStr: string) {
  const d = new Date(dateStr + 'T12:00:00')
  return { dia: DIAS_CORTO[d.getDay()], num: d.getDate(), mes: MESES_CORTO[d.getMonth()] }
}

function weekLabel(week: number, dates: string[]): string {
  if (!dates.length) return `Semana ${week}`
  const d0 = new Date(dates[0] + 'T12:00:00')
  const d5 = new Date(dates[5] + 'T12:00:00')
  const m0 = MESES_CORTO[d0.getMonth()], m5 = MESES_CORTO[d5.getMonth()]
  const y0 = d0.getFullYear(), y5 = d5.getFullYear()
  const range = m0 === m5 && y0 === y5
    ? `${d0.getDate()}–${d5.getDate()} ${m0} ${y0}`
    : y0 === y5 ? `${d0.getDate()} ${m0} – ${d5.getDate()} ${m5} ${y0}`
    : `${d0.getDate()} ${m0} ${y0} – ${d5.getDate()} ${m5} ${y5}`
  return `S${week} · ${range}`
}

function isRecepcion(equipo: string): boolean {
  return equipo.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').includes('recep')
}

function isPeluqueria(equipo: string): boolean {
  return equipo.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').includes('peluq')
}

// ── Lane label per section ─────────────────────────────────────────────────────
function laneLabel(equipo: string, lane: number): string {
  const n = equipo.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  if (n.includes('peluq')) return `Est ${lane + 1}`
  if (n.includes('masaj') || n.includes('depilac')) return `Box ${lane + 1}`
  return `Man ${lane + 1}`
}

// ── Gantt section ─────────────────────────────────────────────────────────────
const LABEL_W = 68
const ROW_H = 36
const GANTT_MIN_W = 560

function GanttSection({ equipo, capacity, shifts, selectedDate }: {
  equipo: string
  capacity: number
  shifts: Turno[]
  selectedDate: string
}) {
  const dayShifts = shifts.filter(t => t.fecha === selectedDate)
  const withLanes = useMemo(() => assignLanes(dayShifts), [dayShifts])  // eslint-disable-line react-hooks/exhaustive-deps
  const peak = withLanes.length > 0 ? Math.max(...withLanes.map(t => t.lane)) + 1 : 0
  const displayLanes = Math.max(capacity > 0 ? capacity : peak, peak)
  const isOver = capacity > 0 && peak > capacity
  const isFull = capacity > 0 && peak === capacity

  const badgeClass = isOver
    ? 'bg-red-100 text-red-600 border border-red-200'
    : isFull
    ? 'bg-amber-100 text-amber-700 border border-amber-200'
    : peak > 0 ? 'bg-gray-100 text-gray-500' : 'bg-gray-50 text-gray-400'

  return (
    <div className="bg-white rounded-2xl border border-[var(--border)] overflow-hidden">
      <div className="px-4 py-2.5 border-b border-gray-100 flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-[var(--text)]">{equipo}</h3>
        {capacity > 0 && (
          <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${badgeClass}`}>
            {peak}/{capacity}{isOver ? ' ⚠' : ''}
          </span>
        )}
      </div>

      <div className="overflow-x-auto">
        <div style={{ minWidth: LABEL_W + GANTT_MIN_W }}>
          {/* Time axis */}
          <div className="flex border-b border-gray-100">
            {/* sticky placeholder so the hour labels don't scroll under the label column */}
            <div style={{ width: LABEL_W, flexShrink: 0, position: 'sticky', left: 0, zIndex: 10, background: '#F9FAFB' }} />
            <div className="flex-1 relative bg-gray-50/60" style={{ minWidth: GANTT_MIN_W, height: 22 }}>
              {HOURS.map(h => (
                <div key={h}
                  className="absolute top-0 bottom-0 border-l border-gray-200 flex items-end"
                  style={{ left: `${(h * 60 - GANTT_START) / GANTT_SPAN * 100}%` }}>
                  <span className="text-[10px] text-gray-400 pl-1 pb-1">{h}h</span>
                </div>
              ))}
            </div>
          </div>

          {/* Lanes */}
          {dayShifts.length === 0 ? (
            <div className="py-5 text-center text-sm text-[var(--text-muted)]">Sin turnos</div>
          ) : (
            Array.from({ length: displayLanes }, (_, lane) => {
              const laneShifts = withLanes.filter(t => t.lane === lane)
              const isOverflow = capacity > 0 && lane >= capacity
              return (
                <div key={lane}
                  className={`flex border-t border-gray-50 ${isOverflow ? 'bg-red-50/40' : ''}`}
                  style={{ height: ROW_H }}>
                  {/* Sticky lane label */}
                  <div style={{
                    width: LABEL_W,
                    flexShrink: 0,
                    position: 'sticky',
                    left: 0,
                    zIndex: 10,
                    background: isOverflow ? '#FEF2F2' : '#FFFFFF',
                  }}
                    className={`flex items-center px-2 text-[11px] font-medium border-r border-gray-100 ${
                      isOverflow ? 'text-red-400' : 'text-gray-400'
                    }`}>
                    {laneLabel(equipo, lane)}
                  </div>
                  <div className="flex-1 relative" style={{ minWidth: GANTT_MIN_W }}>
                    {HOURS.map(h => (
                      <div key={h}
                        className="absolute top-0 bottom-0 border-l border-gray-50"
                        style={{ left: `${(h * 60 - GANTT_START) / GANTT_SPAN * 100}%` }} />
                    ))}
                    {laneShifts.map(shift => (
                      <div key={shift.usuario_id}
                        className="absolute top-1.5 bottom-1.5 rounded-lg flex items-center px-2 overflow-hidden cursor-default"
                        style={{
                          left: `${startPct(shift.inicio)}%`,
                          width: `${widthPct(shift.inicio, shift.fin)}%`,
                          backgroundColor: empColor(shift.usuario_id),
                        }}
                        title={`${shift.nombre} · ${shift.inicio}–${shift.fin}`}>
                        <span className="text-white text-[11px] font-semibold truncate leading-none">
                          {shift.nombre} | {shift.inicio}–{shift.fin}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )
            })
          )}
        </div>
      </div>
    </div>
  )
}

// ── Available slots section ───────────────────────────────────────────────────
function AvailableSection({ equipo, capacity, shifts, selectedDate }: {
  equipo: string
  capacity: number
  shifts: Turno[]
  selectedDate: string
}) {
  const dayShifts = shifts.filter(t => t.fecha === selectedDate)
  const laneGaps = findGaps(dayShifts, capacity)

  if (laneGaps.length === 0) return null

  return (
    <div className="bg-white rounded-2xl border border-[var(--border)] p-4">
      <h3 className="text-sm font-semibold text-[var(--text)] mb-3">{equipo}</h3>
      <div className="space-y-2.5">
        {laneGaps.map(({ lane, gaps }) => (
          <div key={lane} className="flex items-start gap-3">
            <span className="text-[11px] font-medium text-gray-400 pt-1 flex-shrink-0" style={{ width: LABEL_W - 8 }}>
              {laneLabel(equipo, lane)}
            </span>
            <div className="flex flex-wrap gap-1.5">
              {gaps.map((g, i) => (
                <span key={i} className="text-xs bg-emerald-50 text-emerald-700 border border-emerald-100 rounded-lg px-2.5 py-1 font-medium">
                  {minToStr(g.start)} – {minToStr(g.end)}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Week overview chips ────────────────────────────────────────────────────────
function WeekOverview({ dates, turnos, capacidades, selectedDate, onSelect }: {
  dates: string[]
  turnos: Turno[]
  capacidades: Record<string, number>
  selectedDate: string
  onSelect: (d: string) => void
}) {
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-6 gap-1.5">
        {dates.map(date => {
          const { dia, num, mes } = dayLabel(date)
          const dayTurnos = turnos.filter(t => t.fecha === date)
          const isSelected = date === selectedDate

          // Solo manicura y box (sin peluquería ni recepción)
          const equipos = [...new Set(dayTurnos.map(t => t.equipo).filter(Boolean))]
            .filter(e => !isRecepcion(e) && !isPeluqueria(e))
          let isExcedido = false
          let isLibre = false
          for (const eq of equipos) {
            const cap = capacidades[eq] ?? 8
            const eqShifts = dayTurnos.filter(t => t.equipo === eq)
            if (!eqShifts.length) continue
            if (peakConcurrent(eqShifts) > cap) isExcedido = true
            if (findGaps(eqShifts, cap).length > 0) isLibre = true
          }
          const hasTurnos = equipos.some(eq => dayTurnos.some(t => t.equipo === eq))
          const dotColor = !hasTurnos ? '' : isExcedido ? 'bg-red-500' : isLibre ? 'bg-emerald-400' : 'bg-red-400'
          const dotPing = isExcedido

          return (
            <button key={date} onClick={() => onSelect(date)}
              className={`flex flex-col items-center gap-1 py-2 px-1 rounded-xl border transition-all cursor-pointer ${
                isSelected
                  ? 'border-[var(--primary)] bg-[var(--primary-light)]/60 text-[var(--primary)]'
                  : 'border-[var(--border)] bg-white text-[var(--text-sub)] hover:border-[var(--primary)]/40 hover:bg-gray-50'
              }`}>
              <span className={`text-[10px] font-medium uppercase tracking-wide ${isSelected ? 'text-[var(--primary)]' : 'text-[var(--text-muted)]'}`}>
                {dia}
              </span>
              <span className={`text-[15px] font-bold leading-none ${isSelected ? 'text-[var(--primary)]' : ''}`}>
                {num}
              </span>
              <span className={`text-[9px] ${isSelected ? 'text-[var(--primary)]/70' : 'text-[var(--text-muted)]'}`}>
                {mes}
              </span>
              <div className="h-2 flex items-center justify-center relative">
                {dotColor && dotPing && (
                  <span className={`absolute w-2.5 h-2.5 rounded-full ${dotColor} opacity-75 animate-ping`} />
                )}
                {dotColor && <span className={`w-1.5 h-1.5 rounded-full ${dotColor} relative`} />}
              </div>
            </button>
          )
        })}
      </div>
      {/* Leyenda de puntos */}
      <div className="flex items-center gap-3 px-0.5">
        <span className="flex items-center gap-1 text-[10px] text-gray-400">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 inline-block" />Lugares libres
        </span>
        <span className="flex items-center gap-1 text-[10px] text-gray-400">
          <span className="w-1.5 h-1.5 rounded-full bg-red-400 inline-block" />Todo lleno
        </span>
        <span className="flex items-center gap-1 text-[10px] text-gray-400 relative">
          <span className="w-1.5 h-1.5 rounded-full bg-red-500 inline-block animate-ping opacity-75 absolute" />
          <span className="w-1.5 h-1.5 rounded-full bg-red-500 inline-block relative" />Excedido
        </span>
      </div>
    </div>
  )
}

// ── Section ordering ──────────────────────────────────────────────────────────
function sectionOrder(equipoNombre: string): number {
  const n = equipoNombre.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  if (n.includes('peluq')) return 2
  if (n.includes('masaj') || n.includes('depilac')) return 1
  return 0  // manicura-like first
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function EspacioTrabajoClient({ user: _user }: { user: SessionUser }) {
  const todayStr = new Date().toLocaleDateString('sv')  // YYYY-MM-DD en timezone local
  const initIso = isoWeekOf(todayStr)

  const [weekYear, setWeekYear] = useState(initIso.year)
  const [weekNum, setWeekNum] = useState(initIso.week)
  const [selectedDate, setSelectedDate] = useState(todayStr)
  const [tab, setTab] = useState<'ocupacion' | 'disponibles'>('ocupacion')
  const [apiData, setApiData] = useState<ApiResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const dates = useMemo(() => getWeekDates(weekYear, weekNum), [weekYear, weekNum])

  useEffect(() => {
    setLoading(true); setError(null)
    fetch(`/api/espacio-trabajo?fechaInicio=${dates[0]}&fechaFin=${dates[5]}`)
      .then(r => r.json())
      .then(d => { setApiData(d); setLoading(false) })
      .catch(() => { setError('No se pudieron cargar los datos'); setLoading(false) })
  }, [dates])

  function prevWeek() {
    let w = weekNum - 1, y = weekYear
    if (w < 1) { y--; w = isoWeeksInYear(y) }
    setWeekYear(y); setWeekNum(w)
    setSelectedDate(getWeekDates(y, w)[0])
  }
  function nextWeek() {
    let w = weekNum + 1, y = weekYear
    if (w > isoWeeksInYear(y)) { y++; w = 1 }
    setWeekYear(y); setWeekNum(w)
    setSelectedDate(getWeekDates(y, w)[0])
  }

  // Groups: one per distinct equipo, sorted by section order then alphabetically
  const groups = useMemo(() => {
    if (!apiData) return []
    const equipoNames = [...new Set(apiData.turnos.map(t => t.equipo).filter(Boolean))]
      .filter(e => !isRecepcion(e))
    return equipoNames
      .sort((a, b) => sectionOrder(a) - sectionOrder(b) || a.localeCompare(b, 'es'))
  }, [apiData])

  const hasAvailable = useMemo(() => {
    if (!apiData) return false
    return groups.some(eq => {
      const dayShifts = apiData.turnos.filter(t => t.equipo === eq && t.fecha === selectedDate)
      return findGaps(dayShifts, apiData.capacidades[eq] ?? 8).length > 0
    })
  }, [apiData, groups, selectedDate])

  return (
    <div className="py-4 space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-[image:var(--gradient)] flex items-center justify-center flex-shrink-0 shadow-sm">
            <IconLayoutGrid size={17} className="text-white" />
          </div>
          <div>
            <h1 className="text-[17px] font-bold text-[var(--text)] leading-tight">Espacio de trabajo</h1>
            {apiData?.ultimaImportacion && (
              <p className="text-[11px] text-[var(--text-muted)] flex items-center gap-1 mt-0.5">
                <IconClock size={11} />
                Actualizado {relTime(apiData.ultimaImportacion)}
              </p>
            )}
          </div>
        </div>
        {apiData && !apiData.ultimaImportacion && (
          <span className="text-xs text-amber-600 bg-amber-50 border border-amber-200 px-2.5 py-1 rounded-lg">
            Importación de Fresha pendiente
          </span>
        )}
      </div>

      {/* Week nav */}
      <div className="flex items-center gap-2">
        <button onClick={prevWeek}
          className="w-8 h-8 rounded-lg border border-[var(--border)] bg-white flex items-center justify-center hover:bg-gray-50 transition-colors cursor-pointer">
          <IconChevronLeft size={16} className="text-[var(--text-sub)]" />
        </button>
        <p className="flex-1 text-center text-sm font-semibold text-[var(--text)]">
          {weekLabel(weekNum, dates)}
        </p>
        <button onClick={nextWeek}
          className="w-8 h-8 rounded-lg border border-[var(--border)] bg-white flex items-center justify-center hover:bg-gray-50 transition-colors cursor-pointer">
          <IconChevronRight size={16} className="text-[var(--text-sub)]" />
        </button>
      </div>

      {/* Day chips + legend */}
      {apiData && (
        <WeekOverview
          dates={dates}
          turnos={apiData.turnos}
          capacidades={apiData.capacidades}
          selectedDate={selectedDate}
          onSelect={setSelectedDate}
        />
      )}

      {/* Tabs */}
      {apiData && groups.length > 0 && (
        <div className="flex gap-1 bg-gray-100 rounded-xl p-1">
          <button
            onClick={() => setTab('ocupacion')}
            className={`flex-1 py-1.5 text-sm font-medium rounded-lg transition-all cursor-pointer ${
              tab === 'ocupacion'
                ? 'bg-white text-[var(--text)] shadow-sm'
                : 'text-[var(--text-muted)] hover:text-[var(--text-sub)]'
            }`}>
            Ocupación
          </button>
          <button
            onClick={() => setTab('disponibles')}
            className={`flex-1 py-1.5 text-sm font-medium rounded-lg transition-all cursor-pointer ${
              tab === 'disponibles'
                ? 'bg-white text-[var(--text)] shadow-sm'
                : 'text-[var(--text-muted)] hover:text-[var(--text-sub)]'
            }`}>
            Disponibles
            {hasAvailable && tab !== 'disponibles' && (
              <span className="ml-1.5 inline-flex items-center justify-center w-1.5 h-1.5 rounded-full bg-emerald-400" />
            )}
          </button>
        </div>
      )}

      {/* Content */}
      {loading ? (
        <div className="py-16"><Spinner /></div>
      ) : error ? (
        <div className="py-10 text-center text-sm text-red-500">{error}</div>
      ) : !apiData ? null : groups.length === 0 ? (
        <div className="bg-white rounded-2xl border border-[var(--border)] py-14 text-center">
          <p className="text-sm text-[var(--text-muted)]">Sin turnos cargados para esta semana</p>
          <p className="text-xs text-[var(--text-muted)] mt-1">Importá los horarios desde Fresha para ver la ocupación</p>
        </div>
      ) : tab === 'ocupacion' ? (
        <div className="space-y-3">
          {groups.map(equipo => (
            <GanttSection
              key={equipo}
              equipo={equipo}
              capacity={apiData.capacidades[equipo] ?? 8}
              shifts={apiData.turnos.filter(t => t.equipo === equipo)}
              selectedDate={selectedDate}
            />
          ))}
        </div>
      ) : (
        <div className="space-y-3">
          {groups.map(equipo => (
            <AvailableSection
              key={equipo}
              equipo={equipo}
              capacity={apiData.capacidades[equipo] ?? 8}
              shifts={apiData.turnos.filter(t => t.equipo === equipo)}
              selectedDate={selectedDate}
            />
          ))}
          {!hasAvailable && (
            <div className="bg-white rounded-2xl border border-[var(--border)] py-10 text-center">
              <p className="text-sm text-[var(--text-muted)]">Sin huecos de +3h disponibles este día</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
