'use client'

import { useState, useEffect, useMemo } from 'react'
import type { SessionUser } from '@/types'
import { Spinner } from '@/components/ui'
import { IconLayoutGrid, IconChevronLeft, IconChevronRight, IconClock } from '@/components/ui/Icons'

// ── Types ────────────────────────────────────────────────────────────────────
type Seccion = 'manicura' | 'box' | 'peluqueria' | 'recepcion'

interface Turno {
  usuario_id: string
  nombre: string
  equipo: string
  seccion: Seccion
  fecha: string
  inicio: string
  fin: string
}

interface ApiResponse {
  turnos: Turno[]
  ultimaImportacion: string | null
  capacidades: { manicura: number; box: number; peluqueria: number }
}

// ── Helpers: ISO week ─────────────────────────────────────────────────────────
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
  const mon = new Date(jan4)
  mon.setDate(jan4.getDate() - dow + 1 + (week - 1) * 7)
  return Array.from({ length: 6 }, (_, i) => {
    const d = new Date(mon)
    d.setDate(mon.getDate() + i)
    return d.toISOString().split('T')[0]
  })
}

// ── Helpers: Gantt ────────────────────────────────────────────────────────────
const GANTT_START = 8 * 60
const GANTT_END = 21 * 60
const GANTT_SPAN = GANTT_END - GANTT_START
const HOURS = Array.from({ length: 14 }, (_, i) => 8 + i) // 8..21

function toMin(t: string): number {
  const [h, m] = t.split(':').map(Number)
  return h * 60 + m
}

function startPct(t: string) {
  return Math.max(0, (toMin(t) - GANTT_START) / GANTT_SPAN * 100)
}

function widthPct(inicio: string, fin: string) {
  const s = Math.max(GANTT_START, toMin(inicio))
  const e = Math.min(GANTT_END, toMin(fin))
  return Math.max(0, (e - s) / GANTT_SPAN * 100)
}

function assignLanes(shifts: Turno[]): (Turno & { lane: number })[] {
  const sorted = [...shifts].sort((a, b) => a.inicio.localeCompare(b.inicio))
  const laneEnds: string[] = []
  return sorted.map(s => {
    let lane = laneEnds.findIndex(end => end <= s.inicio)
    if (lane === -1) lane = laneEnds.length
    laneEnds[lane] = s.fin
    return { ...s, lane }
  })
}

function peakConcurrent(shifts: Turno[]): number {
  if (!shifts.length) return 0
  return Math.max(...assignLanes(shifts).map(s => s.lane)) + 1
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
  if (ds === 1) return 'ayer'
  return `hace ${ds} días`
}

// ── Day label ─────────────────────────────────────────────────────────────────
const DIAS_CORTO = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']
const MESES_CORTO = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic']
function dayLabel(dateStr: string) {
  const d = new Date(dateStr + 'T12:00:00')
  return { dia: DIAS_CORTO[d.getDay()], num: d.getDate(), mes: MESES_CORTO[d.getMonth()] }
}

function weekLabel(year: number, week: number, dates: string[]): string {
  if (!dates.length) return `Semana ${week}`
  const d0 = new Date(dates[0] + 'T12:00:00')
  const d5 = new Date(dates[5] + 'T12:00:00')
  const m0 = MESES_CORTO[d0.getMonth()]
  const m5 = MESES_CORTO[d5.getMonth()]
  const y0 = d0.getFullYear()
  const y5 = d5.getFullYear()
  const range = m0 === m5 && y0 === y5
    ? `${d0.getDate()}–${d5.getDate()} ${m0} ${y0}`
    : y0 === y5
    ? `${d0.getDate()} ${m0} – ${d5.getDate()} ${m5} ${y0}`
    : `${d0.getDate()} ${m0} ${y0} – ${d5.getDate()} ${m5} ${y5}`
  return `S${week} · ${range}`
}

// ── Gantt section component ───────────────────────────────────────────────────
const LABEL_W = 68
const ROW_H = 36
const GANTT_MIN_W = 580

interface SectionInfo {
  id: Seccion
  titulo: string
  label: string
  capacity: number
}

function GanttSection({ section, shifts, selectedDate }: {
  section: SectionInfo
  shifts: Turno[]
  selectedDate: string
}) {
  const dayShifts = shifts.filter(t => t.fecha === selectedDate && t.seccion === section.id)
  const withLanes = useMemo(() => assignLanes(dayShifts), [dayShifts])
  const peak = withLanes.length > 0 ? Math.max(...withLanes.map(t => t.lane)) + 1 : 0
  const cap = section.capacity
  const displayLanes = Math.max(cap > 0 ? cap : peak, peak)
  const isOver = cap > 0 && peak > cap
  const isFull = cap > 0 && peak === cap

  const badgeClass = isOver
    ? 'bg-red-100 text-red-600 border border-red-200'
    : isFull
    ? 'bg-amber-100 text-amber-700 border border-amber-200'
    : 'bg-gray-100 text-gray-500'

  return (
    <div className="bg-white rounded-2xl border border-[var(--border)] overflow-hidden">
      {/* Header */}
      <div className="px-4 py-2.5 border-b border-gray-100 flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-[var(--text)]">{section.titulo}</h3>
        {cap > 0 && (
          <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${badgeClass}`}>
            {peak}/{cap}{isOver ? ' ⚠' : ''}
          </span>
        )}
      </div>

      {/* Timeline */}
      <div className="overflow-x-auto">
        <div style={{ minWidth: LABEL_W + GANTT_MIN_W }}>
          {/* Time axis */}
          <div className="flex border-b border-gray-100 bg-gray-50/60">
            <div style={{ width: LABEL_W, flexShrink: 0 }} />
            <div className="flex-1 relative" style={{ minWidth: GANTT_MIN_W, height: 22 }}>
              {HOURS.map(h => (
                <div key={h}
                  className="absolute top-0 bottom-0 border-l border-gray-200 flex items-end"
                  style={{ left: `${(h * 60 - GANTT_START) / GANTT_SPAN * 100}%` }}>
                  <span className="text-[10px] text-gray-400 pl-1 pb-1 leading-none">{h}h</span>
                </div>
              ))}
            </div>
          </div>

          {/* Lanes */}
          {dayShifts.length === 0 ? (
            <div className="flex items-center justify-center py-5 text-sm text-[var(--text-muted)]">
              Sin turnos programados
            </div>
          ) : (
            Array.from({ length: displayLanes }, (_, lane) => {
              const laneShifts = withLanes.filter(t => t.lane === lane)
              const isOverflow = cap > 0 && lane >= cap
              return (
                <div key={lane}
                  className={`flex border-t border-gray-50 ${isOverflow ? 'bg-red-50/40' : ''}`}
                  style={{ height: ROW_H }}>
                  <div style={{ width: LABEL_W, flexShrink: 0 }}
                    className={`flex items-center px-2 text-[11px] font-medium border-r border-gray-100 flex-shrink-0 ${
                      isOverflow ? 'text-red-400' : 'text-gray-400'
                    }`}>
                    {section.label} {lane + 1}
                  </div>
                  <div className="flex-1 relative" style={{ minWidth: GANTT_MIN_W }}>
                    {/* Hour gridlines */}
                    {HOURS.map(h => (
                      <div key={h}
                        className="absolute top-0 bottom-0 border-l border-gray-50"
                        style={{ left: `${(h * 60 - GANTT_START) / GANTT_SPAN * 100}%` }} />
                    ))}
                    {/* Shift blocks */}
                    {laneShifts.map(shift => {
                      const color = empColor(shift.usuario_id)
                      const nombre = shift.nombre.split(' ')[0]
                      return (
                        <div key={shift.usuario_id}
                          className="absolute top-1.5 bottom-1.5 rounded-lg flex items-center px-2 overflow-hidden cursor-default"
                          style={{
                            left: `${startPct(shift.inicio)}%`,
                            width: `${widthPct(shift.inicio, shift.fin)}%`,
                            backgroundColor: color,
                          }}
                          title={`${shift.nombre} · ${shift.inicio}–${shift.fin}`}>
                          <span className="text-white text-[11px] font-semibold truncate leading-none">
                            {nombre}
                          </span>
                        </div>
                      )
                    })}
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

// ── Weekly overview strip ─────────────────────────────────────────────────────
function WeekOverview({ dates, turnos, capacidades, selectedDate, onSelect }: {
  dates: string[]
  turnos: Turno[]
  capacidades: { manicura: number; box: number; peluqueria: number }
  selectedDate: string
  onSelect: (d: string) => void
}) {
  return (
    <div className="grid grid-cols-6 gap-1.5">
      {dates.map(date => {
        const { dia, num, mes } = dayLabel(date)
        const dayTurnos = turnos.filter(t => t.fecha === date)
        const isSelected = date === selectedDate
        const hasTurnos = dayTurnos.length > 0

        // Compute peak per section
        const secStats = (['manicura', 'box', 'peluqueria'] as const).map(sec => {
          const cap = capacidades[sec]
          const pk = peakConcurrent(dayTurnos.filter(t => t.seccion === sec))
          return { sec, cap, pk }
        }).filter(s => s.pk > 0)

        const hasAlert = secStats.some(s => s.pk >= s.cap)

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
            {hasTurnos ? (
              <div className="flex gap-0.5 mt-0.5">
                {(['manicura', 'box', 'peluqueria'] as const).map(sec => {
                  const cap = capacidades[sec]
                  const pk = peakConcurrent(dayTurnos.filter(t => t.seccion === sec))
                  if (pk === 0) return null
                  const color = pk >= cap ? 'bg-red-400' : pk >= cap * 0.75 ? 'bg-amber-400' : 'bg-emerald-400'
                  return <span key={sec} className={`w-1.5 h-1.5 rounded-full ${color}`} />
                })}
              </div>
            ) : (
              <div className="w-1.5 h-1.5 mt-0.5" />
            )}
          </button>
        )
      })}
    </div>
  )
}

// ── Main component ─────────────────────────────────────────────────────────────
export default function EspacioTrabajoClient({ user }: { user: SessionUser }) {
  const todayStr = new Date().toISOString().split('T')[0]
  const initIso = isoWeekOf(todayStr)

  const [weekYear, setWeekYear] = useState(initIso.year)
  const [weekNum, setWeekNum] = useState(initIso.week)
  const [selectedDate, setSelectedDate] = useState(todayStr)
  const [apiData, setApiData] = useState<ApiResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const dates = useMemo(() => getWeekDates(weekYear, weekNum), [weekYear, weekNum])

  useEffect(() => {
    if (!dates.includes(selectedDate)) {
      setSelectedDate(dates.find(d => d === todayStr) ?? dates[0])
    }
  }, [dates, todayStr]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    setLoading(true)
    setError(null)
    fetch(`/api/espacio-trabajo?fechaInicio=${dates[0]}&fechaFin=${dates[5]}`)
      .then(r => r.json())
      .then(d => { setApiData(d); setLoading(false) })
      .catch(() => { setError('No se pudieron cargar los datos'); setLoading(false) })
  }, [dates])

  function prevWeek() {
    let w = weekNum - 1, y = weekYear
    if (w < 1) { y--; w = isoWeeksInYear(y) }
    setWeekYear(y); setWeekNum(w)
  }
  function nextWeek() {
    let w = weekNum + 1, y = weekYear
    if (w > isoWeeksInYear(y)) { y++; w = 1 }
    setWeekYear(y); setWeekNum(w)
  }

  const sections: SectionInfo[] = useMemo(() => {
    if (!apiData) return []
    const caps = apiData.capacidades
    const all: SectionInfo[] = [
      { id: 'manicura', titulo: 'Manicura', label: 'Man', capacity: caps.manicura },
      { id: 'box', titulo: 'Box — Masajes & Depilación', label: 'Box', capacity: caps.box },
      { id: 'peluqueria', titulo: 'Peluquería', label: 'Est', capacity: caps.peluqueria },
      { id: 'recepcion', titulo: 'Recepción', label: 'Rec', capacity: 0 },
    ]
    return all.filter(s => apiData.turnos.some(t => t.seccion === s.id))
  }, [apiData])

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
            Sin importación registrada
          </span>
        )}
      </div>

      {/* Week navigation */}
      <div className="flex items-center gap-2">
        <button onClick={prevWeek}
          className="w-8 h-8 rounded-lg border border-[var(--border)] bg-white flex items-center justify-center hover:bg-gray-50 transition-colors cursor-pointer">
          <IconChevronLeft size={16} className="text-[var(--text-sub)]" />
        </button>
        <div className="flex-1 text-center">
          <span className="text-sm font-semibold text-[var(--text)]">{weekLabel(weekYear, weekNum, dates)}</span>
        </div>
        <button onClick={nextWeek}
          className="w-8 h-8 rounded-lg border border-[var(--border)] bg-white flex items-center justify-center hover:bg-gray-50 transition-colors cursor-pointer">
          <IconChevronRight size={16} className="text-[var(--text-sub)]" />
        </button>
      </div>

      {/* Day selector */}
      {apiData && (
        <WeekOverview
          dates={dates}
          turnos={apiData.turnos}
          capacidades={apiData.capacidades}
          selectedDate={selectedDate}
          onSelect={setSelectedDate}
        />
      )}

      {/* Content */}
      {loading ? (
        <div className="py-16"><Spinner /></div>
      ) : error ? (
        <div className="py-10 text-center text-sm text-red-500">{error}</div>
      ) : !apiData ? null : (
        <div className="space-y-3">
          {sections.length === 0 ? (
            <div className="bg-white rounded-2xl border border-[var(--border)] py-14 text-center">
              <p className="text-sm text-[var(--text-muted)]">Sin turnos cargados para esta semana</p>
              <p className="text-xs text-[var(--text-muted)] mt-1">Importá los horarios desde Fresha para ver la ocupación</p>
            </div>
          ) : (
            sections.map(section => (
              <GanttSection
                key={section.id}
                section={section}
                shifts={apiData.turnos}
                selectedDate={selectedDate}
              />
            ))
          )}
        </div>
      )}
    </div>
  )
}
