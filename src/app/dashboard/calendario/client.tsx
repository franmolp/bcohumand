'use client'

import { useState, useMemo, useEffect, useCallback } from 'react'
import type { SessionUser } from '@/types'
import { Modal, Toast, Spinner } from '@/components/ui'
import { IconCalendar, IconChevronLeft, IconChevronRight, IconPlus, IconTrash, IconX } from '@/components/ui/Icons'

// ─── Types ───────────────────────────────────────────────────────────────────

interface SolicitudCal {
  id: string
  usuario_id: string
  empleado_nombre: string
  tipo: string
  fecha_inicio: string
  fecha_fin: string | null
  estado: string
  subtipo_horario: string | null
  horario_anterior: string | null
  horario_nuevo: string | null
  fecha_compensacion: string | null
  equipo_nombre: string | null
  rol_nombre: string | null
}

interface CumpleanosUser {
  usuario_id: string
  nombre: string
  fecha_nacimiento: string
  foto_perfil?: string | null
  equipo_nombre: string | null
  rol_nombre: string | null
}

interface EventoEspecial {
  id: string
  titulo: string
  emoji: string | null
  fecha: string
  todo_el_dia: boolean
  hora_desde: string | null
  hora_hasta: string | null
  descripcion: string | null
  tipo_destinatario: string
  valor_destinatario: string | null
  categoria: string
}

interface EfemerideCal {
  id: number
  titulo: string
  mes: number
  dia: number
  anio: number | null
  tipo: string
}

interface EmpleadoOption {
  id: string
  nombre: string
  equipo_nombre: string | null
  rol_nombre: string | null
}

interface CalendarData {
  solicitudes: SolicitudCal[]
  cumpleanos: CumpleanosUser[]
  eventos: EventoEspecial[]
  efemerides: EfemerideCal[]
  empleados: EmpleadoOption[]
  equipos: string[]
  roles: string[]
}

type CalEventType = 'birthday' | 'efemeride' | 'local_cerrado' | 'special' | 'request'

interface CalEvent {
  id: string
  sourceId?: string
  type: CalEventType
  title: string
  subtitle?: string
  descripcion?: string
  color: string
  isPending: boolean
  usuarioId?: string
  hora?: string
  fotoUrl?: string | null
}

// ─── Constants ───────────────────────────────────────────────────────────────

const MESES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']
const DIAS  = ['Lun','Mar','Mié','Jue','Vie','Sáb','Dom']

// Solicitudes: Solicitud de Días + Ausencia Injustificada comparten naranja
const SOL_COLORS: Record<string, string> = {
  'Vacaciones':            '#f97316',
  'Ausencia por Salud':    '#dc2626',
  'Solicitud de Días':     '#ca8a04',
  'Ausencia Injustificada':'#ca8a04',
  'Cambio de Horario':     '#16a34a',
  'Cambio de horario/día': '#16a34a',
}
const SOL_COLOR_DEFAULT  = '#6b7280'
const COLOR_EFEMERIDE    = '#0ea5e9'
const COLOR_LOCAL_CLOSED = '#374151'
const COLOR_BIRTHDAY     = '#ec4899'
const COLOR_SPECIAL      = '#7c3aed'

const PRIORITY: Record<CalEventType, number> = {
  local_cerrado: 0,
  efemeride:     1,
  special:       2,
  birthday:      3,
  request:       4,
}

const EMOJIS = ['⭐','🎉','🎂','📢','🏢','🎯','💼','🌟','⚡','🎊','🎈','🎁','📅','🎤','🏆','🎵','🌸','🔔','📌','✨','🎪','🎨','🍰','🥳','💡']

const BLANK_EVENT = {
  categoria:            'evento' as 'evento' | 'local_cerrado',
  titulo:               '',
  emoji:                '',
  fecha:                '',
  todo_el_dia:          true,
  hora_desde:           '',
  hora_hasta:           '',
  descripcion:          '',
  tipo_destinatario:    'all',
  valor_destinatario:   '',
  enviar_notificacion:  true,
}

// ─── Pure helpers ─────────────────────────────────────────────────────────────

function dateInMonth(dateStr: string, anio: number, mes: number): number | null {
  if (!dateStr) return null
  const [y, m, d] = dateStr.split('-').map(Number)
  return y === anio && m === mes ? d : null
}

function clampToMonth(dateStr: string, anio: number, mes: number, end: boolean): Date {
  const monthFirst = new Date(anio, mes - 1, 1, 12)
  const monthLast  = new Date(anio, mes, 0, 12)
  const d = new Date(dateStr + 'T12:00:00')
  if (end) return d > monthLast ? monthLast : d
  return d < monthFirst ? monthFirst : d
}

function buildDayMap(
  data: CalendarData,
  anio: number,
  mes: number,
  canViewAll: boolean,
  session: SessionUser,
  filterUid: string,
  filterTeam: string,
  filterRole: string,
): Record<number, CalEvent[]> {
  const map: Record<number, CalEvent[]> = {}

  const add = (day: number, ev: CalEvent) => {
    if (!map[day]) map[day] = []
    map[day].push(ev)
  }

  const isFiltered = !!(filterUid || filterTeam || filterRole)
  const allowed = new Set<string>()

  if (canViewAll) {
    if (isFiltered) {
      for (const emp of data.empleados) {
        if (filterUid  && emp.id === filterUid)             { allowed.add(emp.id); continue }
        if (filterTeam && emp.equipo_nombre === filterTeam) { allowed.add(emp.id); continue }
        if (filterRole && emp.rol_nombre   === filterRole)  { allowed.add(emp.id) }
      }
    } else {
      for (const emp of data.empleados) allowed.add(emp.id)
      for (const s   of data.solicitudes) allowed.add(s.usuario_id)
      for (const b   of data.cumpleanos)  allowed.add(b.usuario_id)
    }
  } else {
    allowed.add(session.id)
  }

  // ── Solicitudes ──
  for (const s of data.solicitudes) {
    if (!allowed.has(s.usuario_id)) continue

    const color = SOL_COLORS[s.tipo] ?? SOL_COLOR_DEFAULT
    const isPending = s.estado === 'pending'
    const prefix = !canViewAll ? '' : `${s.empleado_nombre} · `

    if (s.tipo === 'Cambio de Horario' || s.tipo === 'Cambio de horario/día') {
      const day = dateInMonth(s.fecha_inicio, anio, mes)
      if (day) {
        const subtitle = s.subtipo_horario === 'mismo_dia'
          ? `${s.horario_anterior ?? ''} → ${s.horario_nuevo ?? ''}`
          : 'Ausente c/ compensación'
        add(day, {
          id: `sol-${s.id}`,
          type: 'request',
          title: `${prefix}Cambio horario`,
          subtitle,
          color,
          isPending,
          usuarioId: s.usuario_id,
        })
      }
    } else {
      const start = clampToMonth(s.fecha_inicio, anio, mes, false)
      const end   = s.fecha_fin
        ? clampToMonth(s.fecha_fin, anio, mes, true)
        : clampToMonth(s.fecha_inicio, anio, mes, true)

      const cur = new Date(start)
      while (cur <= end) {
        const day = cur.getDate()
        add(day, {
          id: `sol-${s.id}-${day}`,
          type: 'request',
          title: `${prefix}${s.tipo}`,
          color,
          isPending,
          usuarioId: s.usuario_id,
        })
        cur.setDate(day + 1)
      }
    }
  }

  // ── Cumpleaños ──
  for (const b of data.cumpleanos) {
    const day = parseInt(b.fecha_nacimiento.slice(8, 10), 10)
    if (canViewAll && isFiltered && !allowed.has(b.usuario_id)) continue

    add(day, {
      id: `bd-${b.usuario_id}`,
      type: 'birthday',
      title: `${b.nombre} 🎂`,
      color: COLOR_BIRTHDAY,
      isPending: false,
      usuarioId: b.usuario_id,
      fotoUrl: b.foto_perfil ?? null,
    })
  }

  // ── Eventos especiales y Local cerrado ──
  for (const ev of data.eventos) {
    const day = dateInMonth(ev.fecha, anio, mes)
    if (!day) continue

    const isLocalCerrado = ev.categoria === 'local_cerrado'

    if (!isLocalCerrado && canViewAll && isFiltered) {
      const matches =
        ev.tipo_destinatario === 'all' ||
        (filterTeam && ev.tipo_destinatario === 'team'     && ev.valor_destinatario === filterTeam) ||
        (filterRole && ev.tipo_destinatario === 'role'     && ev.valor_destinatario === filterRole) ||
        (filterUid  && ev.tipo_destinatario === 'employee' && ev.valor_destinatario === filterUid)
      if (!matches) continue
    }

    const hora = !ev.todo_el_dia && ev.hora_desde ? ev.hora_desde.slice(0, 5) : undefined

    add(day, {
      id: `ev-${ev.id}`,
      sourceId: ev.id,
      type: isLocalCerrado ? 'local_cerrado' : 'special',
      title: isLocalCerrado ? ev.titulo : `${ev.emoji ? ev.emoji + ' ' : ''}${ev.titulo}`,
      descripcion: ev.descripcion ?? undefined,
      color: isLocalCerrado ? COLOR_LOCAL_CLOSED : COLOR_SPECIAL,
      isPending: false,
      hora,
    })
  }

  // ── Efemérides ──
  for (const ef of data.efemerides) {
    add(ef.dia, {
      id: `ef-${ef.id}`,
      sourceId: String(ef.id),
      type: 'efemeride',
      title: ef.titulo,
      color: COLOR_EFEMERIDE,
      isPending: false,
    })
  }

  for (const day of Object.keys(map)) {
    map[parseInt(day)].sort((a, b) => PRIORITY[a.type] - PRIORITY[b.type])
  }

  return map
}

// ─── EventChip ───────────────────────────────────────────────────────────────

function EventChip({ ev }: { ev: CalEvent }) {
  return (
    <div
      className="text-[10px] px-1 py-px rounded truncate leading-[14px] font-medium"
      style={{
        background: ev.isPending
          ? `repeating-linear-gradient(45deg, ${ev.color}, ${ev.color} 3px, rgba(255,255,255,0.55) 3px, rgba(255,255,255,0.55) 6px)`
          : ev.color,
        color: ev.isPending ? '#374151' : '#fff',
        border: ev.isPending ? `1px solid ${ev.color}` : undefined,
      }}
    >
      {ev.title}
    </div>
  )
}

// ─── DayModal ────────────────────────────────────────────────────────────────

function DayModal({
  day, mes, anio, events, isAdmin,
  onClose, onDelete,
}: {
  day: number; mes: number; anio: number
  events: CalEvent[]; isAdmin: boolean
  onClose: () => void
  onDelete: (sourceId: string, type: CalEventType) => void
}) {
  const typeLabel: Record<CalEventType, string> = {
    local_cerrado: 'Local cerrado',
    efemeride:     'Efeméride',
    special:       'Evento especial',
    birthday:      'Cumpleaños',
    request:       'Solicitud',
  }

  const canDelete = (ev: CalEvent) =>
    isAdmin && ev.sourceId && (ev.type === 'special' || ev.type === 'local_cerrado' || ev.type === 'efemeride')

  return (
    <Modal open onClose={onClose} title={`${day} de ${MESES[mes - 1]} ${anio}`}>
      <div className="space-y-2 max-h-[60vh] overflow-y-auto -mx-1 px-1">
        {events.length === 0 && (
          <p className="text-center text-[13px] text-gray-400 py-6">Sin eventos este día</p>
        )}
        {events.map(ev => {
          const bdName = ev.type === 'birthday' ? ev.title.replace(/\s*🎂\s*$/, '') : ''
          const bdIni  = bdName.split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase()
          return (
            <div
              key={ev.id}
              className="flex items-start gap-3 p-3 rounded-xl"
              style={{ borderLeft: `4px solid ${ev.color}`, backgroundColor: `${ev.color}18` }}
            >
              {ev.type === 'birthday' && (
                ev.fotoUrl
                  ? <img src={ev.fotoUrl} alt="" className="w-10 h-10 rounded-full object-cover shrink-0 shadow-sm" />
                  : <div className="w-10 h-10 rounded-full flex items-center justify-center shrink-0 shadow-sm text-white font-bold text-[13px]" style={{ background: 'linear-gradient(135deg, #667eea, #764ba2)' }}>{bdIni}</div>
              )}
              <div className="flex-1 min-w-0">
                <p className="text-[13px] font-semibold leading-snug">{ev.title}</p>
                {ev.subtitle    && <p className="text-[12px] text-gray-500 mt-0.5">{ev.subtitle}</p>}
                {ev.hora        && <p className="text-[11px] text-gray-400 mt-0.5">{ev.hora}</p>}
                {ev.descripcion && <p className="text-[12px] text-gray-600 mt-1">{ev.descripcion}</p>}
                <span className="text-[10px] font-medium uppercase tracking-wide mt-1 block" style={{ color: ev.color }}>
                  {typeLabel[ev.type]}
                  {ev.isPending && ' · Pendiente'}
                </span>
              </div>
              {canDelete(ev) && (
                <button
                  onClick={() => onDelete(ev.sourceId!, ev.type)}
                  className="p-1.5 text-gray-300 hover:text-red-500 transition-colors cursor-pointer flex-shrink-0"
                >
                  <IconTrash size={14} />
                </button>
              )}
            </div>
          )
        })}
      </div>
    </Modal>
  )
}

// ─── CreateEventModal ─────────────────────────────────────────────────────────

function CreateEventModal({
  onClose, onSave, empleados, equipos, roles,
}: {
  onClose: () => void
  onSave: (payload: typeof BLANK_EVENT & { selected_employees?: string[] }) => Promise<void>
  empleados: EmpleadoOption[]
  equipos: string[]
  roles: string[]
}) {
  const [form, setForm] = useState({ ...BLANK_EVENT })
  const [saving, setSaving] = useState(false)
  const [selectedEmployees, setSelectedEmployees] = useState<string[]>([])
  const [empSearch, setEmpSearch] = useState('')

  const set = (k: string, v: unknown) => setForm(f => ({ ...f, [k]: v }))

  const isLocalCerrado = form.categoria === 'local_cerrado'

  function setCategoria(cat: 'evento' | 'local_cerrado') {
    setForm(f => ({
      ...f,
      categoria: cat,
      titulo: cat === 'local_cerrado' && !f.titulo ? 'Local cerrado' : f.titulo,
      tipo_destinatario: 'all',
      valor_destinatario: '',
    }))
    setSelectedEmployees([])
  }

  function toggleEmployee(id: string) {
    setSelectedEmployees(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
  }

  async function submit() {
    if (!form.titulo.trim() || !form.fecha) return
    if (!isLocalCerrado && form.tipo_destinatario === 'employee' && selectedEmployees.length === 0) return
    setSaving(true)
    await onSave({ ...form, selected_employees: form.tipo_destinatario === 'employee' ? selectedEmployees : undefined })
    setSaving(false)
  }

  const filteredEmpleados = useMemo(() =>
    [...empleados]
      .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
      .filter(e => e.nombre.toLowerCase().includes(empSearch.toLowerCase())),
    [empleados, empSearch]
  )

  const valOptions = useMemo(() => {
    if (form.tipo_destinatario === 'team') return equipos.map(e => ({ id: e, label: e }))
    if (form.tipo_destinatario === 'role') return roles.map(r => ({ id: r, label: r }))
    return []
  }, [form.tipo_destinatario, equipos, roles])

  const modalTitle = isLocalCerrado ? 'Local cerrado' : 'Nuevo evento especial'

  return (
    <Modal open onClose={onClose} title={modalTitle}>
      <div className="space-y-4">

        {/* Tipo selector */}
        <div className="flex rounded-xl border border-gray-200 overflow-hidden">
          {(['evento', 'local_cerrado'] as const).map(cat => (
            <button
              key={cat}
              onClick={() => setCategoria(cat)}
              className={`flex-1 py-2 text-[13px] font-medium transition-colors cursor-pointer ${form.categoria === cat ? 'bg-[var(--primary)] text-white' : 'text-gray-500 hover:bg-gray-50'}`}
            >
              {cat === 'evento' ? 'Evento especial' : 'Local cerrado'}
            </button>
          ))}
        </div>

        {/* Emoji picker — solo para eventos especiales */}
        {!isLocalCerrado && (
          <div>
            <label className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-1.5 block">Emoji</label>
            <div className="flex flex-wrap gap-1.5">
              {EMOJIS.map(em => (
                <button
                  key={em}
                  onClick={() => set('emoji', form.emoji === em ? '' : em)}
                  className={`w-8 h-8 text-lg rounded-lg border transition-all cursor-pointer ${
                    form.emoji === em ? 'border-[var(--primary)] bg-[var(--primary-light)] scale-110' : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                  }`}
                >
                  {em}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Título */}
        <div>
          <label className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-1 block">Título *</label>
          <input
            className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-[14px] outline-none focus:border-[var(--primary)]"
            style={{ fontSize: 16 }}
            placeholder={isLocalCerrado ? 'Ej: Local cerrado, Feriado…' : 'Nombre del evento'}
            value={form.titulo}
            onChange={e => set('titulo', e.target.value)}
          />
        </div>

        {/* Fecha */}
        <div>
          <label className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-1 block">Fecha *</label>
          <input
            type="date"
            className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-[14px] outline-none focus:border-[var(--primary)]"
            style={{ fontSize: 16 }}
            value={form.fecha}
            onChange={e => set('fecha', e.target.value)}
          />
        </div>

        {/* Todo el día */}
        <label className="flex items-center gap-2.5 cursor-pointer">
          <div
            onClick={() => set('todo_el_dia', !form.todo_el_dia)}
            className={`w-10 h-5 rounded-full transition-colors ${form.todo_el_dia ? 'bg-[var(--primary)]' : 'bg-gray-200'}`}
          >
            <div className={`w-4 h-4 bg-white rounded-full shadow m-0.5 transition-transform ${form.todo_el_dia ? 'translate-x-5' : ''}`} />
          </div>
          <span className="text-[13px]">Todo el día</span>
        </label>

        {/* Horario */}
        {!form.todo_el_dia && (
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-1 block">Desde</label>
              <input
                type="time"
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-[14px] outline-none focus:border-[var(--primary)]"
                value={form.hora_desde}
                onChange={e => set('hora_desde', e.target.value)}
              />
            </div>
            <div>
              <label className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-1 block">Hasta</label>
              <input
                type="time"
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-[14px] outline-none focus:border-[var(--primary)]"
                value={form.hora_hasta}
                onChange={e => set('hora_hasta', e.target.value)}
              />
            </div>
          </div>
        )}

        {/* Descripción */}
        <div>
          <label className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-1 block">Descripción</label>
          <textarea
            className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-[14px] outline-none focus:border-[var(--primary)] resize-none"
            rows={2}
            style={{ fontSize: 16 }}
            placeholder="Opcional"
            value={form.descripcion}
            onChange={e => set('descripcion', e.target.value)}
          />
        </div>

        {/* Destinatario — solo para eventos especiales */}
        {!isLocalCerrado && (
          <>
            <div>
              <label className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-1 block">Visible para</label>
              <select
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-[14px] outline-none focus:border-[var(--primary)] bg-white"
                style={{ fontSize: 16 }}
                value={form.tipo_destinatario}
                onChange={e => { set('tipo_destinatario', e.target.value); set('valor_destinatario', ''); setSelectedEmployees([]) }}
              >
                <option value="all">Todos</option>
                <option value="team">Equipo</option>
                <option value="role">Rol</option>
                <option value="employee">Empleadas específicas</option>
              </select>
            </div>

            {valOptions.length > 0 && (
              <div>
                <label className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-1 block">
                  {form.tipo_destinatario === 'team' ? 'Equipo' : 'Rol'}
                </label>
                <select
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-[14px] outline-none focus:border-[var(--primary)] bg-white"
                  style={{ fontSize: 16 }}
                  value={form.valor_destinatario}
                  onChange={e => set('valor_destinatario', e.target.value)}
                >
                  <option value="">Seleccionar…</option>
                  {valOptions.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
                </select>
              </div>
            )}

            {form.tipo_destinatario === 'employee' && (
              <div>
                <label className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-1.5 block">
                  Empleadas {selectedEmployees.length > 0 && <span className="text-[var(--primary)]">({selectedEmployees.length} seleccionadas)</span>}
                </label>
                <input
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-[14px] outline-none focus:border-[var(--primary)] mb-2"
                  style={{ fontSize: 16 }}
                  placeholder="Buscar…"
                  value={empSearch}
                  onChange={e => setEmpSearch(e.target.value)}
                />
                <div className="border border-gray-200 rounded-xl overflow-y-auto max-h-44">
                  {filteredEmpleados.map(e => (
                    <label key={e.id} className="flex items-center gap-2.5 px-3 py-2 hover:bg-gray-50 cursor-pointer border-b border-gray-100 last:border-0">
                      <input
                        type="checkbox"
                        checked={selectedEmployees.includes(e.id)}
                        onChange={() => toggleEmployee(e.id)}
                        className="w-4 h-4 accent-[var(--primary)]"
                      />
                      <span className="text-[13px] text-gray-700">{e.nombre}</span>
                    </label>
                  ))}
                  {filteredEmpleados.length === 0 && <p className="text-[13px] text-gray-400 text-center py-4">Sin resultados</p>}
                </div>
              </div>
            )}
          </>
        )}

        {/* Notificación — solo para eventos especiales */}
        {!isLocalCerrado && (
          <label className="flex items-center gap-2.5 cursor-pointer">
            <input
              type="checkbox"
              checked={form.enviar_notificacion}
              onChange={e => set('enviar_notificacion', e.target.checked)}
              className="w-4 h-4 accent-[var(--primary)]"
            />
            <span className="text-[13px] text-gray-600">Enviar notificación</span>
          </label>
        )}

        {/* Actions */}
        <div className="flex gap-3 pt-1">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 rounded-xl border border-gray-200 text-[14px] text-gray-600 font-medium cursor-pointer"
          >
            Cancelar
          </button>
          <button
            onClick={submit}
            disabled={saving || !form.titulo.trim() || !form.fecha || (!isLocalCerrado && form.tipo_destinatario === 'employee' && selectedEmployees.length === 0)}
            className="flex-1 py-2.5 rounded-xl bg-[var(--primary)] text-white text-[14px] font-semibold disabled:opacity-50 cursor-pointer"
          >
            {saving ? <Spinner size={16} inline /> : 'Guardar'}
          </button>
        </div>
      </div>
    </Modal>
  )
}

// ─── Legend ──────────────────────────────────────────────────────────────────

function Legend() {
  const items = [
    { label: 'Vacaciones',      color: '#f97316' },
    { label: 'Ausencias',       color: '#ca8a04' },
    { label: 'Aus. Salud',      color: '#dc2626' },
    { label: 'Cambio Horario',  color: '#16a34a' },
    { label: 'Local cerrado',   color: '#374151' },
    { label: 'Efemérides',      color: '#0ea5e9' },
    { label: 'Cumpleaños',      color: '#ec4899' },
    { label: 'Evento Especial', color: '#7c3aed' },
  ]

  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1.5 py-3 border-t border-gray-100">
      {items.map(i => (
        <div key={i.label} className="flex items-center gap-1.5">
          <div className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ backgroundColor: i.color }} />
          <span className="text-[11px] text-gray-500">{i.label}</span>
        </div>
      ))}
    </div>
  )
}

// ─── CalendarioClient ─────────────────────────────────────────────────────────

export default function CalendarioClient({ user }: { user: SessionUser }) {
  const isAdmin     = user.rol === 'admin' || user.rol === 'Admin'
  const canViewAll  = isAdmin || user.rol === 'HR' || user.rol === 'Encargada'
  const today = new Date()

  const [anio, setAnio] = useState(today.getFullYear())
  const [mes,  setMes]  = useState(today.getMonth() + 1)

  const [data,    setData]    = useState<CalendarData | null>(null)
  const [loading, setLoading] = useState(true)
  const [toastMsg,     setToastMsg]     = useState('')
  const [toastVisible, setToastVisible] = useState(false)

  const [filterUid,  setFilterUid]  = useState('')
  const [filterTeam, setFilterTeam] = useState('')
  const [filterRole, setFilterRole] = useState('')

  const [dayModal,    setDayModal]    = useState<{ day: number; events: CalEvent[] } | null>(null)
  const [createModal, setCreateModal] = useState(false)

  function showToast(msg: string) {
    setToastMsg(msg); setToastVisible(true)
    setTimeout(() => setToastVisible(false), 3000)
  }

  const loadData = useCallback(async (y: number, m: number) => {
    setLoading(true)
    try {
      const r = await fetch(`/api/calendario?anio=${y}&mes=${m}`)
      if (r.ok) setData(await r.json())
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadData(anio, mes) }, [anio, mes, loadData])

  function prevMonth() {
    if (mes === 1) { setAnio(a => a - 1); setMes(12) }
    else setMes(m => m - 1)
    setFilterUid(''); setFilterTeam(''); setFilterRole('')
  }
  function nextMonth() {
    if (mes === 12) { setAnio(a => a + 1); setMes(1) }
    else setMes(m => m + 1)
    setFilterUid(''); setFilterTeam(''); setFilterRole('')
  }

  const cells = useMemo(() => {
    const firstDate = new Date(anio, mes - 1, 1)
    const dow = (firstDate.getDay() + 6) % 7
    const numDays = new Date(anio, mes, 0).getDate()
    const arr: (number | null)[] = []
    for (let i = 0; i < dow; i++) arr.push(null)
    for (let d = 1; d <= numDays; d++) arr.push(d)
    const trailing = (7 - arr.length % 7) % 7
    for (let i = 0; i < trailing; i++) arr.push(null)
    return arr
  }, [anio, mes])

  const dayEventsMap = useMemo<Record<number, CalEvent[]>>(() => {
    if (!data) return {}
    return buildDayMap(data, anio, mes, canViewAll, user, filterUid, filterTeam, filterRole)
  }, [data, anio, mes, canViewAll, user, filterUid, filterTeam, filterRole])

  async function handleCreateEvent(payload: typeof BLANK_EVENT & { selected_employees?: string[] }) {
    const { selected_employees, ...rest } = payload
    const requests = (rest.tipo_destinatario === 'employee' && selected_employees && selected_employees.length > 0)
      ? selected_employees.map(id => fetch('/api/calendario', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...rest, tipo_destinatario: 'employee', valor_destinatario: id }),
        }))
      : [fetch('/api/calendario', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(rest),
        })]
    const results = await Promise.all(requests)
    const failed = results.find(r => !r.ok)
    if (failed) {
      const body = await failed.json().catch(() => ({}))
      showToast(body.error ?? 'Error al crear el evento')
      return
    }
    setCreateModal(false)
    showToast('Guardado')
    loadData(anio, mes)
  }

  async function handleDeleteEvent(sourceId: string, evType: CalEventType) {
    const url = evType === 'efemeride'
      ? `/api/calendario/${sourceId}?type=efemeride`
      : `/api/calendario/${sourceId}`
    const r = await fetch(url, { method: 'DELETE' })
    if (!r.ok) {
      const body = await r.json().catch(() => ({}))
      showToast(body.error ?? 'Error al eliminar')
      return
    }
    setDayModal(null)
    showToast('Eliminado')
    loadData(anio, mes)
  }

  const todayDay = today.getDate()
  const isCurrentMonth = today.getFullYear() === anio && today.getMonth() + 1 === mes

  return (
    <div className="py-4 fade-in">

      {/* ── Header ── */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-[image:var(--gradient)] flex items-center justify-center flex-shrink-0 shadow-sm">
            <IconCalendar size={18} className="text-white" />
          </div>
          <h1 className="text-[17px] font-bold text-[var(--text)]">Calendario</h1>
        </div>
        {isAdmin && (
          <button
            onClick={() => setCreateModal(true)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[var(--primary)] text-white text-[13px] font-semibold cursor-pointer"
          >
            <IconPlus size={16} /> Evento
          </button>
        )}
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">

        {/* ── Month nav ── */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
          <button onClick={prevMonth} className="p-2 rounded-lg hover:bg-gray-100 text-gray-500 cursor-pointer">
            <IconChevronLeft size={18} />
          </button>
          <h2 className="text-[16px] lg:text-[18px] font-bold text-[var(--text)]">
            {MESES[mes - 1]} {anio}
          </h2>
          <button onClick={nextMonth} className="p-2 rounded-lg hover:bg-gray-100 text-gray-500 cursor-pointer">
            <IconChevronRight size={18} />
          </button>
        </div>

        {/* ── Admin filters ── */}
        {canViewAll && data && (
          <div className="flex flex-wrap gap-2 px-4 py-2.5 border-b border-gray-100 bg-gray-50/50">
            <select
              className="text-[12px] border border-gray-200 rounded-lg px-2.5 py-1.5 bg-white outline-none focus:border-[var(--primary)] cursor-pointer"
              value={filterTeam}
              onChange={e => { setFilterTeam(e.target.value); setFilterUid(''); setFilterRole('') }}
            >
              <option value="">Todos los equipos</option>
              {[...data.equipos].sort((a, b) => a.localeCompare(b, 'es')).map(eq => <option key={eq} value={eq}>{eq}</option>)}
            </select>

            <select
              className="text-[12px] border border-gray-200 rounded-lg px-2.5 py-1.5 bg-white outline-none focus:border-[var(--primary)] cursor-pointer"
              value={filterRole}
              onChange={e => { setFilterRole(e.target.value); setFilterUid(''); setFilterTeam('') }}
            >
              <option value="">Todos los roles</option>
              {[...data.roles].sort((a, b) => a.localeCompare(b, 'es')).map(r => <option key={r} value={r}>{r}</option>)}
            </select>

            <select
              className="text-[12px] border border-gray-200 rounded-lg px-2.5 py-1.5 bg-white outline-none focus:border-[var(--primary)] cursor-pointer"
              value={filterUid}
              onChange={e => { setFilterUid(e.target.value); setFilterTeam(''); setFilterRole('') }}
            >
              <option value="">Todos los empleados</option>
              {[...data.empleados].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')).map(em => <option key={em.id} value={em.id}>{em.nombre}</option>)}
            </select>

            {(filterUid || filterTeam || filterRole) && (
              <button
                onClick={() => { setFilterUid(''); setFilterTeam(''); setFilterRole('') }}
                className="flex items-center gap-1 text-[12px] text-gray-400 hover:text-gray-600 px-2 cursor-pointer"
              >
                <IconX size={13} /> Limpiar
              </button>
            )}
          </div>
        )}

        {/* ── Grid ── */}
        {loading ? (
          <div className="flex items-center justify-center py-24">
            <Spinner size={32} />
          </div>
        ) : (
          <div className="grid grid-cols-7 border-t border-l border-gray-100">
            {DIAS.map(d => (
              <div key={d} className="border-r border-b border-gray-100 py-2 text-center text-[10px] lg:text-[12px] font-semibold text-gray-400 bg-gray-50/60 select-none">
                {d}
              </div>
            ))}

            {cells.map((day, i) => {
              const events = day ? (dayEventsMap[day] ?? []) : []
              const isToday = isCurrentMonth && day === todayDay
              const hasMore = events.length > 4

              return (
                <div
                  key={i}
                  className={`
                    border-r border-b border-gray-100
                    h-14 lg:min-h-[140px] overflow-hidden
                    ${day ? 'cursor-pointer hover:bg-gray-50/70 transition-colors' : 'bg-gray-50/30'}
                  `}
                  onClick={() => day && setDayModal({ day, events })}
                >
                  {day && (
                    <div className="h-full flex flex-col">
                      <div className="flex items-start justify-between px-1 pt-1 pb-0.5">
                        <div className={`
                          w-6 h-6 rounded-full flex items-center justify-center text-[11px] lg:text-[12px] font-semibold select-none
                          ${isToday ? 'bg-[var(--primary)] text-white' : 'text-gray-600'}
                        `}>
                          {day}
                        </div>
                      </div>

                      {/* Mobile: puntos de colores */}
                      {events.length > 0 && (
                        <div className="lg:hidden flex flex-wrap gap-0.5 px-1.5 pb-1">
                          {events.slice(0, 5).map(ev => (
                            <div
                              key={ev.id}
                              className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                              style={{ backgroundColor: ev.color }}
                            />
                          ))}
                          {events.length > 5 && (
                            <span className="text-[8px] text-gray-400 leading-none">+{events.length - 5}</span>
                          )}
                        </div>
                      )}

                      {/* Desktop: chips con texto */}
                      <div className="hidden lg:flex flex-col gap-px px-1 pb-1 flex-1 overflow-hidden">
                        {events.slice(0, 4).map(ev => (
                          <EventChip key={ev.id} ev={ev} />
                        ))}
                        {hasMore && (
                          <span className="text-[10px] text-gray-400 px-1">+{events.length - 4} más</span>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}

        {/* ── Legend ── */}
        <div className="px-4">
          <Legend />
        </div>
      </div>

      {/* ── Day modal ── */}
      {dayModal && (
        <DayModal
          day={dayModal.day}
          mes={mes}
          anio={anio}
          events={dayModal.events}
          isAdmin={isAdmin}
          onClose={() => setDayModal(null)}
          onDelete={handleDeleteEvent}
        />
      )}

      {/* ── Create event modal ── */}
      {createModal && data && (
        <CreateEventModal
          onClose={() => setCreateModal(false)}
          onSave={handleCreateEvent}
          empleados={data.empleados}
          equipos={data.equipos}
          roles={data.roles}
        />
      )}

      <Toast message={toastMsg} visible={toastVisible} />
    </div>
  )
}
