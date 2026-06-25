'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { Button, Spinner, Modal, Toast, Confirm } from '@/components/ui'
import { IconPlus, IconCheck, IconX, IconTrash, IconCalendar, IconEdit, IconAlertCircle, IconPaperclip, IconFileText, IconUpload, IconClock, IconSettings } from '@/components/ui/Icons'
import type { SessionUser, Solicitud } from '@/types'
import { compressImage } from '@/lib/compress-image'
import FileViewer from '@/components/FileViewer'

// ─── Config ───────────────────────────────────────────────────────────────────

interface SolicitudesConfig { vacaciones_min_dias: number; otros_min_dias: number }
const DEFAULT_CONFIG: SolicitudesConfig = { vacaciones_min_dias: 15, otros_min_dias: 10 }

function addDaysStr(dateStr: string, n: number): string {
  const [y, m, d] = dateStr.split('-').map(Number)
  const dt = new Date(y, m - 1, d + n)
  return `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,'0')}-${String(dt.getDate()).padStart(2,'0')}`
}

function todayAR(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' })
}

// ─── Constantes ───────────────────────────────────────────────────────────────

const TIPOS_EMPLEADO = [
  'Vacaciones',
  'Ausencia por Salud',
  'Solicitud de Días',
  'Cambio de horario/día',
]
const TIPOS_ADMIN = [...TIPOS_EMPLEADO, 'Ausencia Injustificada', 'Feriado/Local cerrado']

const TIPO_COLORS: Record<string, { bg: string; text: string }> = {
  'Vacaciones':             { bg: 'bg-blue-50',   text: 'text-blue-700' },
  'Ausencia por Salud':     { bg: 'bg-red-50',    text: 'text-red-600' },
  'Cambio de Horario':      { bg: 'bg-orange-50', text: 'text-orange-600' },
  'Cambio de horario/día':  { bg: 'bg-orange-50', text: 'text-orange-600' },
  'Solicitud de Días':      { bg: 'bg-amber-50',  text: 'text-amber-700' },
  'Feriado/Local cerrado':  { bg: 'bg-[var(--primary-light)]', text: 'text-[var(--primary)]' },
  'Ausencia Injustificada': { bg: 'bg-gray-100',  text: 'text-gray-600' },
}

const ESTADO_INFO: Record<string, { bg: string; text: string; label: string }> = {
  pending:  { bg: 'bg-amber-50',   text: 'text-amber-700',   label: 'Pendiente' },
  approved: { bg: 'bg-emerald-50', text: 'text-emerald-700', label: 'Aprobada' },
  rejected: { bg: 'bg-red-50',     text: 'text-red-600',     label: 'Rechazada' },
}

// ─── Form ─────────────────────────────────────────────────────────────────────

const blankForm = {
  tipo:               'Vacaciones',
  fecha_inicio:       '',
  fecha_fin:          '',
  motivo:             '',
  certificado_adjunto:'',
  subtipo_horario:    'mismo_dia',
  hor_ant_entrada:    '',
  hor_ant_salida:     '',
  hor_nuevo_entrada:  '',
  hor_nuevo_salida:   '',
  fecha_compensacion: '',
  comentario_admin:   '',
  estado:             'pending',
  empleado_id:        '',
  empleado_nombre:    '',
}
type Form = typeof blankForm

function solToForm(s: Solicitud): Form {
  const [ae, as_] = (s.horario_anterior || '').split('-')
  const [ne, ns]  = (s.horario_nuevo    || '').split('-')
  return {
    tipo:               s.tipo,
    fecha_inicio:       s.fecha_inicio    || '',
    fecha_fin:          s.fecha_fin       || '',
    motivo:             s.motivo          || '',
    certificado_adjunto:s.certificado_adjunto || '',
    subtipo_horario:    s.subtipo_horario || 'mismo_dia',
    hor_ant_entrada:    ae || '',
    hor_ant_salida:     as_ || '',
    hor_nuevo_entrada:  ne || '',
    hor_nuevo_salida:   ns || '',
    fecha_compensacion: s.fecha_compensacion || '',
    comentario_admin:   s.comentario_admin   || '',
    estado:             s.estado,
    empleado_id:        s.usuario_id         || '',
    empleado_nombre:    s.empleado_nombre    || '',
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function calcDias(ini: string, fin: string) {
  if (!ini || !fin) return 0
  return Math.max(0, Math.round((new Date(fin).getTime() - new Date(ini).getTime()) / 86400000) + 1)
}

function fmtDate(d: string | null | undefined) {
  if (!d) return '—'
  return new Date(d + 'T12:00:00').toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: '2-digit' })
}

function initials(n: string) {
  return n.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
}

// ─── Sub-componentes de UI ────────────────────────────────────────────────────

function TipoBadge({ tipo }: { tipo: string }) {
  const c = TIPO_COLORS[tipo] ?? { bg: 'bg-gray-100', text: 'text-gray-600' }
  return <span className={`text-[11px] font-semibold px-2.5 py-1 rounded-lg whitespace-nowrap ${c.bg} ${c.text}`}>{tipo}</span>
}

function EstadoBadge({ estado }: { estado: string }) {
  const c = ESTADO_INFO[estado] ?? ESTADO_INFO.pending
  return <span className={`text-[11px] font-semibold px-2.5 py-1 rounded-lg ${c.bg} ${c.text}`}>{c.label}</span>
}

function DetallePeriodo({ sol }: { sol: Solicitud }) {
  if (sol.tipo === 'Cambio de Horario' || sol.tipo === 'Cambio de horario/día') {
    if (sol.subtipo_horario === 'mismo_dia') {
      return (
        <span className="text-[12px] text-gray-500">
          {fmtDate(sol.fecha_inicio)} · <s>{sol.horario_anterior}</s> → {sol.horario_nuevo}
        </span>
      )
    }
    return (
      <span className="text-[12px] text-gray-500">
        {fmtDate(sol.fecha_inicio)} por {fmtDate(sol.fecha_compensacion)} ({sol.horario_nuevo})
      </span>
    )
  }
  const partes = [
    `${fmtDate(sol.fecha_inicio)}${sol.fecha_fin ? ' → ' + fmtDate(sol.fecha_fin) : ''}`,
    sol.dias ? `${sol.dias} día${sol.dias !== 1 ? 's' : ''}` : null,
  ]
  return <span className="text-[12px] text-gray-500">{partes.filter(Boolean).join(' · ')}</span>
}

// ─── FormFields ───────────────────────────────────────────────────────────────

function FormFields({
  form, setForm, isAdmin, isAdminOrHR, editMode, empleados = [], certFile, setCertFile, config,
}: {
  form: Form
  setForm: (f: Form) => void
  isAdmin: boolean
  isAdminOrHR: boolean
  editMode: boolean
  empleados?: { id: string; nombre: string }[]
  certFile: File | null
  setCertFile: (f: File | null) => void
  config: SolicitudesConfig
}) {
  const tipos     = isAdmin ? TIPOS_ADMIN : TIPOS_EMPLEADO
  const isHorario = form.tipo === 'Cambio de Horario' || form.tipo === 'Cambio de horario/día'
  const isFeriado = form.tipo === 'Feriado/Local cerrado'
  const isSalud   = form.tipo === 'Ausencia por Salud'
  const dias      = isHorario ? 1 : calcDias(form.fecha_inicio, form.fecha_fin)

  const needsAdvance = !isAdminOrHR && !editMode
  const today = todayAR()
  const dateMin = (() => {
    if (!needsAdvance) return ''
    if (form.tipo === 'Vacaciones')        return addDaysStr(today, config.vacaciones_min_dias)
    if (form.tipo === 'Solicitud de Días' || isHorario) return addDaysStr(today, config.otros_min_dias)
    return today
  })()
  const motivoRequired = !isAdminOrHR && !editMode && (form.tipo === 'Solicitud de Días' || isHorario)

  const inp = (label: string, k: keyof Form, type = 'text', placeholder = '') => {
    const isDateField = type === 'date' && (k === 'fecha_inicio' || k === 'fecha_compensacion')
    return (
      <div>
        <label className="block text-[13px] font-medium text-[var(--text-sub)] mb-1.5">{label}</label>
        <input type={type} value={form[k] as string}
          onChange={e => setForm({ ...form, [k]: e.target.value })}
          placeholder={placeholder} style={{ fontSize: 16 }}
          min={isDateField && dateMin ? dateMin : undefined}
          className="w-full h-11 px-4 bg-white border border-[var(--border)] rounded-xl text-[var(--text)] placeholder:text-[var(--text-muted)] outline-none transition focus:border-[var(--primary)] focus:ring-2 focus:ring-[var(--primary-light)] lg:text-sm" />
      </div>
    )
  }

  const area = (label: string, k: keyof Form, placeholder = '', rows = 3) => (
    <div>
      <label className="block text-[13px] font-medium text-[var(--text-sub)] mb-1.5">{label}</label>
      <textarea value={form[k] as string}
        onChange={e => setForm({ ...form, [k]: e.target.value })}
        placeholder={placeholder} rows={rows} style={{ fontSize: 16 }}
        className="w-full px-4 py-3 bg-white border border-[var(--border)] rounded-xl text-[var(--text)] placeholder:text-[var(--text-muted)] outline-none transition focus:border-[var(--primary)] focus:ring-2 focus:ring-[var(--primary-light)] resize-none lg:text-sm" />
    </div>
  )

  return (
    <div className="space-y-4">

      {/* Estado — admin en nueva solicitud o edición (no aplica a Feriado que siempre es aprobado) */}
      {isAdmin && !isFeriado && (
        <div>
          <label className="block text-[13px] font-medium text-[var(--text-sub)] mb-1.5">Estado</label>
          <select value={form.estado} onChange={e => setForm({ ...form, estado: e.target.value })}
            style={{ fontSize: 16 }}
            className="w-full h-11 px-4 bg-white border border-[var(--border)] rounded-xl text-[var(--text)] outline-none transition focus:border-[var(--primary)] focus:ring-2 focus:ring-[var(--primary-light)] lg:text-sm">
            <option value="pending">Pendiente</option>
            <option value="approved">Aprobada</option>
            <option value="rejected">Rechazada</option>
          </select>
        </div>
      )}

      {/* Empleado — solo admin creando nueva (no en edición, no en Feriado que es masivo) */}
      {isAdmin && !editMode && form.tipo !== 'Feriado/Local cerrado' && (
        <div>
          <label className="block text-[13px] font-medium text-[var(--text-sub)] mb-1.5">Empleado</label>
          <select
            value={form.empleado_id}
            onChange={e => {
              const emp = empleados.find(x => x.id === e.target.value)
              setForm({ ...form, empleado_id: e.target.value, empleado_nombre: emp?.nombre || '' })
            }}
            style={{ fontSize: 16 }}
            className="w-full h-11 px-4 bg-white border border-[var(--border)] rounded-xl text-[var(--text)] outline-none transition focus:border-[var(--primary)] focus:ring-2 focus:ring-[var(--primary-light)] lg:text-sm">
            <option value="">Seleccioná un empleado...</option>
            {empleados.map(e => <option key={e.id} value={e.id}>{e.nombre}</option>)}
          </select>
        </div>
      )}

      {/* Tipo */}
      <div>
        <label className="block text-[13px] font-medium text-[var(--text-sub)] mb-1.5">Tipo de solicitud</label>
        <select value={form.tipo} onChange={e => setForm({ ...form, tipo: e.target.value })}
          style={{ fontSize: 16 }}
          className="w-full h-11 px-4 bg-white border border-[var(--border)] rounded-xl text-[var(--text)] outline-none transition focus:border-[var(--primary)] focus:ring-2 focus:ring-[var(--primary-light)] lg:text-sm">
          {tipos.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
      </div>

      {/* Cambio de Horario: selector de subtipo */}
      {isHorario && (
        <div className="flex bg-gray-100 rounded-xl p-0.5">
          {['mismo_dia', 'compensacion'].map(sub => (
            <button key={sub} type="button"
              onClick={() => setForm({ ...form, subtipo_horario: sub })}
              className={`flex-1 py-2 text-[12px] font-medium rounded-[10px] cursor-pointer transition-all ${form.subtipo_horario === sub ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'}`}>
              {sub === 'mismo_dia' ? 'Cambio de horario' : 'Compensación'}
            </button>
          ))}
        </div>
      )}

      {/* Aviso de anticipación mínima */}
      {needsAdvance && !isFeriado && !isSalud && (
        <div className="flex items-start gap-2 px-3 py-2.5 bg-amber-50 border border-amber-100 rounded-xl">
          <IconClock size={14} className="text-amber-500 shrink-0 mt-0.5" />
          <p className="text-[12px] text-amber-700">
            {form.tipo === 'Vacaciones'
              ? `Anticipación mínima: ${config.vacaciones_min_dias} días`
              : `Anticipación mínima: ${config.otros_min_dias} días · Motivo obligatorio`}
          </p>
        </div>
      )}

      {/* Fechas estándar (no Horario) */}
      {!isHorario && (
        <>
          <div className="grid grid-cols-2 gap-3">
            {inp('Fecha inicio', 'fecha_inicio', 'date')}
            {inp('Fecha fin', 'fecha_fin', 'date')}
          </div>
          {dias > 0 && (
            <p className="text-[13px] text-[var(--primary)] font-medium -mt-1">
              {dias} día{dias !== 1 ? 's' : ''}
            </p>
          )}
        </>
      )}

      {/* Cambio de Horario — mismo_dia */}
      {isHorario && form.subtipo_horario === 'mismo_dia' && (
        <>
          {inp('Fecha del cambio', 'fecha_inicio', 'date')}
          <div>
            <p className="text-[13px] font-medium text-[var(--text-sub)] mb-2">Horario actual</p>
            <div className="grid grid-cols-2 gap-3">
              {inp('Entrada', 'hor_ant_entrada', 'time')}
              {inp('Salida',  'hor_ant_salida',  'time')}
            </div>
          </div>
          <div>
            <p className="text-[13px] font-medium text-[var(--text-sub)] mb-2">Nuevo horario</p>
            <div className="grid grid-cols-2 gap-3">
              {inp('Entrada', 'hor_nuevo_entrada', 'time')}
              {inp('Salida',  'hor_nuevo_salida',  'time')}
            </div>
          </div>
        </>
      )}

      {/* Cambio de Horario — compensacion */}
      {isHorario && form.subtipo_horario === 'compensacion' && (
        <>
          <div className="grid grid-cols-2 gap-3">
            {inp('Día que no viene', 'fecha_inicio',       'date')}
            {inp('Día compensación', 'fecha_compensacion', 'date')}
          </div>
          <div>
            <p className="text-[13px] font-medium text-[var(--text-sub)] mb-2">Horario de compensación</p>
            <div className="grid grid-cols-2 gap-3">
              {inp('Entrada', 'hor_nuevo_entrada', 'time')}
              {inp('Salida',  'hor_nuevo_salida',  'time')}
            </div>
          </div>
        </>
      )}

      {/* Motivo (todos menos Feriado) */}
      {!isFeriado && area(
        `Motivo${(isSalud || form.tipo === 'Ausencia Injustificada' || motivoRequired) ? '' : ' (opcional)'}`,
        'motivo',
        'Describí brevemente el motivo...'
      )}

      {/* Feriado: motivo + comentario + aviso masivo */}
      {isFeriado && (
        <>
          {area('Motivo / Descripción', 'motivo', 'ej: Feriado nacional, cierre por festejo...', 2)}
          {area('Comentario para empleados (opcional)', 'comentario_admin', 'Mensaje para los empleados...', 2)}
          <div className="flex items-start gap-2 p-3 bg-[var(--primary-light)] rounded-xl">
            <IconAlertCircle size={15} className="text-[var(--primary)] shrink-0 mt-0.5" />
            <p className="text-[12px] text-[var(--primary)]">
              Se creará una solicitud aprobada para <strong>todos los empleados activos</strong>.
            </p>
          </div>
        </>
      )}

      {/* Certificado médico — en creación y edición de Ausencia por Salud */}
      {isSalud && (
        <div>
          <label className="block text-[13px] font-medium text-[var(--text-sub)] mb-2">
            Certificado médico <span className="text-[var(--text-muted)] font-normal">(opcional)</span>
          </label>
          <label className={`flex flex-col items-center justify-center h-20 border-2 border-dashed rounded-xl cursor-pointer transition-colors ${certFile ? 'border-[var(--primary)] bg-[var(--primary-light)]' : 'border-gray-200 hover:border-[var(--primary)] hover:bg-[var(--primary-light)]'}`}>
            <input type="file" accept="image/*,.pdf" className="hidden"
              onChange={e => { setCertFile(e.target.files?.[0] || null); setForm({ ...form, certificado_adjunto: '' }) }} />
            {certFile ? (
              <div className="text-center px-4">
                <p className="text-[13px] font-medium text-[var(--primary)] truncate max-w-[240px]">{certFile.name}</p>
                <p className="text-[11px] text-[var(--text-sub)]">
                  {(certFile.size / 1024).toFixed(0)} KB
                  {certFile.type.startsWith('image/') && ' · se comprimirá'}
                </p>
              </div>
            ) : (
              <div className="text-center">
                <IconPaperclip size={16} className="mx-auto text-gray-300 mb-0.5" />
                <p className="text-[12px] text-gray-400">Imagen o PDF · máx. 5MB</p>
              </div>
            )}
          </label>
          {form.certificado_adjunto && !certFile && (
            <a href={form.certificado_adjunto} target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-1.5 text-[12px] text-[var(--primary)] mt-2">
              <IconPaperclip size={13} /> Ver certificado actual
            </a>
          )}
        </div>
      )}

      {/* Comentario admin — edición de no-Feriado */}
      {editMode && isAdmin && !isFeriado && (
        area('Comentario al empleado', 'comentario_admin', 'Comentario interno...', 2)
      )}

    </div>
  )
}

// ─── Helpers importación CSV ──────────────────────────────────────────────────

function readFileText(file: File): Promise<string> {
  return new Promise((res, rej) => {
    const reader = new FileReader()
    reader.onload = e => res(e.target?.result as string ?? '')
    reader.onerror = rej
    reader.readAsText(file, 'UTF-8')
  })
}

function csvLine(line: string): string[] {
  const out: string[] = []
  let inQ = false, cur = ''
  for (let i = 0; i < line.length; i++) {
    const c = line[i]
    if (c === '"') { if (inQ && line[i+1] === '"') { cur += '"'; i++ } else inQ = !inQ }
    else if (c === ',' && !inQ) { out.push(cur.trim()); cur = '' }
    else cur += c
  }
  out.push(cur.trim())
  return out
}

function fixMojibake(s: string): string {
  if (!/[\xC0-\xDF][\x80-\xBF]/.test(s)) return s
  try {
    const bytes = new Uint8Array(s.length)
    for (let i = 0; i < s.length; i++) bytes[i] = s.charCodeAt(i) & 0xFF
    const decoded = new TextDecoder('utf-8', { fatal: false }).decode(bytes)
    return decoded.includes('�') ? s : decoded
  } catch { return s }
}

function parseDDMMYYYY(s: string): string {
  const m = (s ?? '').trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/)
  if (!m) return ''
  return `${m[3]}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`
}

function parseSolicitudesCSV(text: string) {
  const rows = text.replace(/\r\n/g,'\n').split('\n').filter(l => l.trim()).map(l => csvLine(l))
  if (rows.length < 2) return []
  const hdr = rows[0].map(h => fixMojibake(h).toLowerCase().trim())
  const idx = (terms: string[]) => hdr.findIndex(h => terms.some(t => h.includes(t)))

  const iId        = idx(['id'])
  const iEmail     = idx(['email'])
  const iNombre    = idx(['nombre'])
  const iTipo      = idx(['tipo'])
  const iDias      = idx(['dias','días'])
  const iFechaIni  = idx(['fechainicio','fecha inicio'])
  const iFechaFin  = idx(['fechafin','fecha fin'])
  const iMotivo    = idx(['motivo'])
  const iEstado    = idx(['estado'])
  const iFechaCrea = idx(['fechacreacion','fecha creacion'])
  const iMod       = idx(['moderador'])
  const iCom       = idx(['comentario'])
  const iCert      = idx(['certificado'])
  const iSubtipo   = idx(['cambio dia','cambio día'])
  const iHorNorm   = idx(['horario normal'])
  const iHorNuevo  = idx(['nuevo horario'])
  const iDiaNuevo  = idx(['nuevo dia','nuevo día'])

  const out = []
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i]
    const get = (ix: number) => ix >= 0 ? fixMojibake(r[ix] ?? '').trim() : ''
    const email = get(iEmail).toLowerCase()
    const fecha_inicio = parseDDMMYYYY(get(iFechaIni))
    if (!email || !fecha_inicio) continue

    const diasRaw = get(iDias)
    const dias = diasRaw ? parseFloat(diasRaw.replace(',','.')) || null : null

    const fechaCreRaw = get(iFechaCrea)
    let fecha_creacion: string | null = null
    if (fechaCreRaw) {
      const [datePart, timePart] = fechaCreRaw.split(' ')
      const d = parseDDMMYYYY(datePart ?? '')
      if (d) {
        const tm = (timePart ?? '').match(/^(\d{1,2}):(\d{2})/)
        const hh = tm ? tm[1].padStart(2,'0') : '00'
        const mm = tm ? tm[2] : '00'
        fecha_creacion = `${d}T${hh}:${mm}:00.000Z`
      }
    }

    out.push({
      id: get(iId) || undefined,
      email,
      nombre: get(iNombre),
      tipo: get(iTipo),
      dias,
      fecha_inicio,
      fecha_fin: parseDDMMYYYY(get(iFechaFin)) || null,
      motivo: get(iMotivo) || null,
      estado: get(iEstado) || 'pending',
      fecha_creacion,
      moderador: get(iMod) || null,
      comentario: get(iCom) || null,
      certificado: get(iCert) || null,
      subtipo_horario: get(iSubtipo) || null,
      horario_anterior: get(iHorNorm) || null,
      horario_nuevo: get(iHorNuevo) || null,
      fecha_compensacion: parseDDMMYYYY(get(iDiaNuevo)) || null,
    })
  }
  return out
}

// ─── Historial ────────────────────────────────────────────────────────────────

const CAMPO_LABEL: Record<string, string> = {
  tipo: 'Tipo', dias: 'Días', fecha_inicio: 'Fecha inicio', fecha_fin: 'Fecha fin',
  motivo: 'Motivo', estado: 'Estado', comentario_admin: 'Comentario',
  certificado_adjunto: 'Certificado', subtipo_horario: 'Subtipo',
  horario_anterior: 'Horario anterior', horario_nuevo: 'Horario nuevo',
  fecha_compensacion: 'Fecha compensación',
}
const ESTADO_LABEL: Record<string, string> = {
  pending: 'Pendiente', approved: 'Aprobada', rejected: 'Rechazada',
}
function fmtVal(campo: string, val: unknown): string {
  if (val === null || val === undefined || val === '') return '—'
  if (campo === 'estado') return ESTADO_LABEL[String(val)] ?? String(val)
  return String(val)
}
function fmtDatetimeHist(iso: string | null): string {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })
  } catch { return iso }
}

interface EdicionEntry { campo: string; valorAnterior: unknown; valorNuevo: unknown; editadoPor: string; fecha: string }

function HistorialModal({ sol, onClose }: { sol: Solicitud; onClose: () => void }) {
  type Evento = { fecha: string; titulo: string; detalle?: string; color: string }
  const eventos: Evento[] = []

  // 1. Creación
  eventos.push({
    fecha: sol.fecha_creacion,
    titulo: 'Solicitud creada',
    detalle: `por ${sol.empleado_nombre}`,
    color: 'bg-[var(--primary)]',
  })

  // 2. Ediciones registradas (campo por campo)
  const edicions = (sol.ediciones ?? []) as EdicionEntry[]
  const estadoEnEdiciones = edicions.some(e => e.campo === 'estado')
  for (const e of edicions) {
    eventos.push({
      fecha: e.fecha,
      titulo: `${e.editadoPor} modificó ${CAMPO_LABEL[e.campo] ?? e.campo}`,
      detalle: `${fmtVal(e.campo, e.valorAnterior)} → ${fmtVal(e.campo, e.valorNuevo)}`,
      color: 'bg-gray-300',
    })
  }

  // 3. Aprobación/rechazo por acción rápida (si no está ya en ediciones)
  if (sol.moderador && !estadoEnEdiciones && sol.estado !== 'pending') {
    const aprobada = sol.estado === 'approved'
    eventos.push({
      fecha: sol.hora_ultima_actividad ?? sol.fecha_creacion,
      titulo: aprobada ? 'Aprobada' : 'Rechazada',
      detalle: `por ${sol.moderador}${sol.comentario_admin ? ` · "${sol.comentario_admin}"` : ''}`,
      color: aprobada ? 'bg-emerald-500' : 'bg-red-500',
    })
  }

  eventos.sort((a, b) => a.fecha.localeCompare(b.fecha))

  return (
    <Modal open={true} onClose={onClose} title="Historial de la solicitud">
      <div className="space-y-0">
        {eventos.map((ev, i) => (
          <div key={i} className="flex gap-3">
            <div className="flex flex-col items-center">
              <div className={`w-2.5 h-2.5 rounded-full mt-1 flex-shrink-0 ${ev.color}`} />
              {i < eventos.length - 1 && <div className="w-px flex-1 bg-gray-100 my-1 min-h-[16px]" />}
            </div>
            <div className="flex-1 min-w-0 pb-4">
              <p className="text-[13px] font-semibold text-[var(--text)]">{ev.titulo}</p>
              {ev.detalle && <p className="text-[12px] text-gray-500 mt-0.5">{ev.detalle}</p>}
              <p className="text-[11px] text-gray-400 mt-0.5">{fmtDatetimeHist(ev.fecha)}</p>
            </div>
          </div>
        ))}
      </div>
    </Modal>
  )
}

// ─── Componente principal ─────────────────────────────────────────────────────

interface Empleado { id: string; nombre: string }

export default function SolicitudesClient({ user }: { user: SessionUser }) {
  const isAdmin = user.rol === 'admin' || user.rol === 'Admin'
  const isHR = user.rol === 'HR'
  const isAdminOrHR = isAdmin || isHR

  // Lista
  const [list, setList]                     = useState<Solicitud[]>([])
  const [loading, setLoading]               = useState(true)
  const [estadoFilter, setEstadoFilter]     = useState(isAdminOrHR ? 'pending' : '')
  const [visibleCount, setVisibleCount]     = useState(10)
  const [tipoFilter, setTipoFilter]         = useState('')
  const [empleadoFilter, setEmpleadoFilter] = useState('')
  const [empleados, setEmpleados]           = useState<Empleado[]>([])
  const [subFilter, setSubFilter]           = useState<'en_curso' | 'futuras' | 'archivadas'>('en_curso')
  const [fotosMap, setFotosMap]             = useState<Record<string, string | null>>({})

  // Modal nueva / edición
  const [modal, setModal]           = useState(false)
  const [editId, setEditId]         = useState<string | null>(null)
  const [form, setForm]             = useState<Form>(blankForm)
  const [saving, setSaving]         = useState(false)
  const [formError, setFormError]   = useState('')
  const [modalCertFile, setModalCertFile] = useState<File | null>(null)

  // Acciones rápidas
  const [rejectItem, setRejectItem]   = useState<Solicitud | null>(null)
  const [comentario, setComentario]   = useState('')
  const [processing, setProcessing]   = useState(false)
  const [approveItem, setApproveItem] = useState<Solicitud | null>(null)
  const [deleteItem, setDeleteItem]   = useState<Solicitud | null>(null)

  // Ver certificado
  const [viewCertItem, setViewCertItem] = useState<Solicitud | null>(null)

  // Historial
  const [historialItem, setHistorialItem] = useState<Solicitud | null>(null)

  // Certificado (empleado)
  const [certItem, setCertItem]       = useState<Solicitud | null>(null)
  const [certUrl, setCertUrl]         = useState('')
  const [certFile, setCertFile]       = useState<File | null>(null)
  const [certError, setCertError]     = useState('')
  const [certUploading, setCertUploading] = useState(false)

  // Herramientas admin: importar
  const [importFile, setImportFile]         = useState<File | null>(null)
  const [importLoading, setImportLoading]   = useState(false)
  const [importResult, setImportResult]     = useState<{ ok: number; total: number; noEncontrados: string[] } | null>(null)
  const [importError, setImportError]       = useState('')
  const importRef = useRef<HTMLInputElement>(null)

  const [toast, setToast] = useState('')

  // Config de plazos
  const [config, setConfig]         = useState<SolicitudesConfig>(DEFAULT_CONFIG)
  const [configModal, setConfigModal] = useState(false)
  const [configForm, setConfigForm] = useState(DEFAULT_CONFIG)
  const [configSaving, setConfigSaving] = useState(false)

  // ─── Carga ───
  const load = useCallback(async () => {
    setLoading(true)
    const p = new URLSearchParams()
    if (estadoFilter)   p.set('estado',   estadoFilter)
    if (tipoFilter)     p.set('tipo',     tipoFilter)
    if (empleadoFilter) p.set('empleado', empleadoFilter)
    const r = await fetch(`/api/solicitudes?${p}`)
    const d = await r.json()
    const data: Solicitud[] = Array.isArray(d) ? d : []
    setList(data)
    setLoading(false)
    if (data.length) {
      const ids = [...new Set(data.map(s => s.usuario_id))].join(',')
      fetch(`/api/usuarios/fotos?ids=${ids}`).then(r => r.json()).then(setFotosMap).catch(() => {})
    }
  }, [estadoFilter, tipoFilter, empleadoFilter])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    fetch('/api/solicitudes/config').then(r => r.json()).then(d => {
      setConfig(d); setConfigForm(d)
    }).catch(() => {})
  }, [])

  useEffect(() => {
    if (!isAdminOrHR) return
    fetch('/api/empleados?estado=activo')
      .then(r => r.json())
      .then((d: { id: string; nombre: string }[]) =>
        setEmpleados(Array.isArray(d) ? d.map(e => ({ id: e.id, nombre: e.nombre })) : [])
      )
  }, [isAdminOrHR])

  useEffect(() => {
    if (toast) { const t = setTimeout(() => setToast(''), 3000); return () => clearTimeout(t) }
  }, [toast])

  useEffect(() => {
    if (!isAdminOrHR) setVisibleCount(10)
  }, [tipoFilter, isAdminOrHR])

  // ─── Compresión de imagen client-side ───
  // ─── Abrir modales ───
  function openNew()              { setForm(blankForm);       setEditId(null);  setFormError(''); setModalCertFile(null); setModal(true) }
  function openEdit(s: Solicitud) { setForm(solToForm(s)); setEditId(s.id);  setFormError(''); setModalCertFile(null); setModal(true) }

  // ─── Guardar config de plazos ───
  async function saveConfig() {
    setConfigSaving(true)
    const res = await fetch('/api/solicitudes/config', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(configForm),
    })
    const d = await res.json()
    setConfigSaving(false)
    if (res.ok) { setConfig(d); setConfigModal(false); setToast('Ajustes guardados') }
  }

  // ─── Guardar nueva / edición ───
  async function save() {
    setFormError(''); setSaving(true)

    const isFeriado = form.tipo === 'Feriado/Local cerrado'
    const isHorario = form.tipo === 'Cambio de Horario' || form.tipo === 'Cambio de horario/día' || form.tipo === 'Cambio de horario/día'

    if (isAdminOrHR && !editId && !isFeriado && !form.empleado_id) {
      setFormError('Debe seleccionar un empleado'); setSaving(false); return
    }
    if (!form.fecha_inicio) { setFormError('La fecha inicio es requerida'); setSaving(false); return }
    if (!isFeriado && !isHorario && !form.fecha_fin) { setFormError('La fecha fin es requerida'); setSaving(false); return }
    if (isFeriado && !form.fecha_fin) { setFormError('Las fechas son requeridas'); setSaving(false); return }

    // ─── Validación de plazos (solo empleados en nueva solicitud) ───
    if (!isAdminOrHR && !editId && !isFeriado) {
      const today = todayAR()
      if (form.fecha_inicio < today) {
        setFormError('No podés crear solicitudes con fechas anteriores a hoy'); setSaving(false); return
      }
      if (form.tipo === 'Vacaciones') {
        const minFecha = addDaysStr(today, config.vacaciones_min_dias)
        if (form.fecha_inicio < minFecha) {
          setFormError(`Las vacaciones deben pedirse con al menos ${config.vacaciones_min_dias} días de anticipación`)
          setSaving(false); return
        }
      } else if (form.tipo === 'Solicitud de Días' || isHorario) {
        const minFecha = addDaysStr(today, config.otros_min_dias)
        if (form.fecha_inicio < minFecha) {
          setFormError(`Esta solicitud debe pedirse con al menos ${config.otros_min_dias} días de anticipación`)
          setSaving(false); return
        }
        if (!form.motivo.trim()) {
          setFormError('El motivo es obligatorio para este tipo de solicitud'); setSaving(false); return
        }
      }
    }

    const dias = isHorario ? 1 : calcDias(form.fecha_inicio, form.fecha_fin)

    const horario_anterior = isHorario && form.subtipo_horario === 'mismo_dia'
      ? `${form.hor_ant_entrada}-${form.hor_ant_salida}` : null
    const horario_nuevo = isHorario
      ? `${form.hor_nuevo_entrada}-${form.hor_nuevo_salida}` : null

    try {
      // Upload certificado si se seleccionó un archivo en el modal
      let certAdjunto = form.certificado_adjunto || null
      if (modalCertFile) {
        const toUpload = modalCertFile.type.startsWith('image/')
          ? await compressImage(modalCertFile)
          : modalCertFile
        const fd = new FormData()
        fd.append('file', toUpload)
        const ru = await fetch('/api/upload', { method: 'POST', body: fd })
        const du = await ru.json()
        if (!ru.ok) { setFormError(du.error || 'Error al subir el certificado'); setSaving(false); return }
        certAdjunto = du.url
      }

      // Feriado masivo (solo nueva)
      if (!editId && isFeriado) {
        const r = await fetch('/api/solicitudes/masiva', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            fecha_inicio:    form.fecha_inicio,
            fecha_fin:       form.fecha_fin,
            motivo:          form.motivo        || null,
            comentario_admin: form.comentario_admin || null,
          }),
        })
        const d = await r.json()
        if (!r.ok) { setFormError(d.error || 'Error'); setSaving(false); return }
        setModal(false); setToast(`Feriado creado para ${d.count} empleado${d.count !== 1 ? 's' : ''}`); load()
        return
      }

      const body: Record<string, unknown> = {
        tipo:               form.tipo,
        usuario_id:         isAdminOrHR && !editId ? form.empleado_id    : undefined,
        empleado_nombre:    isAdminOrHR && !editId ? form.empleado_nombre : undefined,
        fecha_inicio:       form.fecha_inicio,
        fecha_fin:          isHorario && form.subtipo_horario === 'mismo_dia'
                              ? form.fecha_inicio
                              : (form.fecha_fin || null),
        dias,
        motivo:             form.motivo             || null,
        certificado_adjunto: certAdjunto,
        subtipo_horario:    isHorario ? form.subtipo_horario : null,
        horario_anterior,
        horario_nuevo,
        fecha_compensacion: isHorario && form.subtipo_horario === 'compensacion'
                              ? form.fecha_compensacion : null,
        comentario_admin:   form.comentario_admin  || null,
      }

      if (isAdminOrHR) body.estado = form.estado

      const r = await fetch(editId ? `/api/solicitudes/${editId}` : '/api/solicitudes', {
        method: editId ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const d = await r.json()
      if (!r.ok) { setFormError(d.error || 'Error'); setSaving(false); return }
      setModal(false); setToast(editId ? 'Solicitud actualizada' : 'Solicitud enviada'); load()
    } catch { setFormError('Error de conexión') } finally { setSaving(false) }
  }

  // ─── Aprobar ───
  async function approve() {
    if (!approveItem) return
    setProcessing(true)
    await fetch(`/api/solicitudes/${approveItem.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'approve', comentario_admin: comentario || null }),
    })
    setApproveItem(null); setComentario(''); setProcessing(false); setToast('Solicitud aprobada'); load()
  }

  // ─── Rechazar ───
  async function reject() {
    if (!rejectItem) return
    setProcessing(true)
    await fetch(`/api/solicitudes/${rejectItem.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'reject', comentario_admin: comentario || null }),
    })
    setRejectItem(null); setComentario(''); setProcessing(false); setToast('Solicitud rechazada'); load()
  }

  // ─── Eliminar ───
  async function deleteSolicitud() {
    if (!deleteItem) return
    await fetch(`/api/solicitudes/${deleteItem.id}`, { method: 'DELETE' })
    setDeleteItem(null); setToast('Solicitud eliminada'); load()
  }

  // ─── Importar CSV histórico ───
  async function importarCSV() {
    if (!importFile) return
    setImportLoading(true); setImportError(''); setImportResult(null)
    try {
      const text = await readFileText(importFile)
      const rows = parseSolicitudesCSV(text)
      if (!rows.length) { setImportError('No se encontraron filas válidas'); setImportLoading(false); return }
      const res = await fetch('/api/importar/solicitudes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rows }),
      })
      const d = await res.json()
      if (d.error) setImportError(d.error)
      else { setImportResult(d); load() }
    } catch { setImportError('Error al procesar el archivo') }
    finally { setImportLoading(false) }
  }

  // ─── Guardar certificado ───
  async function saveCert() {
    if (!certItem) return
    setCertError(''); setCertUploading(true)

    let url = certUrl

    if (certFile) {
      try {
        const toUpload = certFile.type.startsWith('image/')
          ? await compressImage(certFile)
          : certFile
        const fd = new FormData()
        fd.append('file', toUpload)
        const r = await fetch('/api/upload', { method: 'POST', body: fd })
        const d = await r.json()
        if (!r.ok) { setCertError(d.error || 'Error al subir el archivo'); setCertUploading(false); return }
        url = d.url
      } catch { setCertError('Error al procesar el archivo'); setCertUploading(false); return }
    }

    if (!url) { setCertError('Seleccioná un archivo o pegá un link'); setCertUploading(false); return }

    const r = await fetch(`/api/solicitudes/${certItem.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ certificado_adjunto: url }),
    })
    if (r.ok) {
      setCertItem(null); setCertUrl(''); setCertFile(null)
      setToast('Certificado adjuntado'); load()
    }
    setCertUploading(false)
  }

  // ─── Sub-filtro por período ───
  // Use local date (not UTC) to avoid timezone issues in Argentina (UTC-3)
  const _d = new Date()
  const TODAY = `${_d.getFullYear()}-${String(_d.getMonth()+1).padStart(2,'0')}-${String(_d.getDate()).padStart(2,'0')}`
  const displayList = !isAdminOrHR
    ? list
    : estadoFilter === 'pending' ? list : list.filter(sol => {
        const ini = sol.fecha_inicio || ''
        const fin = sol.fecha_fin || sol.fecha_inicio || ''
        if (subFilter === 'en_curso')    return ini <= TODAY && fin >= TODAY
        if (subFilter === 'futuras')     return ini > TODAY
        if (subFilter === 'archivadas')  return fin < TODAY
        return true
      })
  const visibleList = isAdminOrHR ? displayList : displayList.slice(0, visibleCount)

  // ─── Render helpers ───
  const pendingCount = list.filter(s => s.estado === 'pending').length
  const tabs = isAdminOrHR
    ? ['pending', 'todos', 'approved', 'rejected']
    : ['todos', 'pending', 'approved', 'rejected']
  const tabLabel: Record<string, string> = {
    pending: 'Pendientes', todos: 'Todas', approved: 'Aprobadas', rejected: 'Rechazadas',
  }

  // ─────────────────────────────────────────────────────────────────────────────
  return (
    <div className="py-4 fade-in">

      {/* ─── Header ─── */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-[image:var(--gradient)] flex items-center justify-center flex-shrink-0 shadow-sm">
            <IconFileText size={18} className="text-white" />
          </div>
          <div>
            <h1 className="text-[17px] font-bold text-[var(--text)]">{isAdminOrHR ? 'Solicitudes' : 'Mis Solicitudes'}</h1>
            <p className="text-xs text-[var(--text-muted)]">
              {isAdminOrHR && pendingCount > 0 && estadoFilter === 'pending'
                ? `${pendingCount} pendiente${pendingCount !== 1 ? 's' : ''}`
                : `${displayList.length} resultado${displayList.length !== 1 ? 's' : ''}`}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {isAdminOrHR && (
            <button
              onClick={() => { setConfigForm(config); setConfigModal(true) }}
              className="p-2 text-gray-400 hover:text-[var(--primary)] hover:bg-[var(--primary-light)] rounded-xl transition-colors cursor-pointer"
              title="Ajustes de solicitudes"
            >
              <IconSettings size={17} />
            </button>
          )}
          <Button icon={<IconPlus size={16} />} size="sm" onClick={openNew}>Nueva</Button>
        </div>
      </div>

      {/* ─── Filtros ─── */}
      <div className="bg-white rounded-xl border border-gray-200/60 p-3 mb-4 space-y-2 lg:space-y-0 lg:flex lg:items-center lg:gap-2.5">
        {/* Empleado dropdown — solo admin/HR */}
        {isAdminOrHR && (
          <select value={empleadoFilter} onChange={e => setEmpleadoFilter(e.target.value)}
            style={{ fontSize: 16 }}
            className="w-full lg:w-52 h-10 px-3 border border-gray-200 rounded-xl bg-white cursor-pointer lg:text-sm">
            <option value="">Todos los empleados</option>
            {empleados.map(e => <option key={e.id} value={e.id}>{e.nombre}</option>)}
          </select>
        )}
        <div className="flex gap-2 flex-1">
          {/* Tipo */}
          <select value={tipoFilter} onChange={e => setTipoFilter(e.target.value)}
            style={{ fontSize: 16 }}
            className="h-10 px-3 border border-gray-200 rounded-xl bg-white cursor-pointer flex-1 lg:flex-none lg:w-56 min-w-0 lg:text-sm">
            <option value="">Todos los tipos</option>
            {TIPOS_ADMIN.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
          {/* Estado tabs — solo adminOrHR */}
          {isAdminOrHR && (
            <div className="flex bg-gray-100 rounded-xl p-0.5 shrink-0">
              {tabs.map(s => {
                const active = estadoFilter === s || (s === 'todos' && !estadoFilter)
                return (
                  <button key={s} onClick={() => { setEstadoFilter(s === 'todos' ? '' : s); setSubFilter('en_curso') }}
                    className={`px-2 lg:px-3 py-2 text-[10px] lg:text-[11px] font-medium rounded-[10px] cursor-pointer transition-all whitespace-nowrap ${active ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'}`}>
                    {tabLabel[s]}
                  </button>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* ─── Sub-filtro período (no aplica a Pendientes ni a empleados) ─── */}
      {isAdminOrHR && estadoFilter !== 'pending' && (
        <div className="flex bg-white border border-gray-200/60 rounded-xl p-0.5 mb-4 w-fit">
          {(['en_curso', 'futuras', 'archivadas'] as const).map(sf => (
            <button key={sf} onClick={() => setSubFilter(sf)}
              className={`px-3 lg:px-4 py-2 text-[11px] lg:text-[12px] font-medium rounded-[10px] cursor-pointer transition-all whitespace-nowrap ${subFilter === sf ? 'bg-[var(--primary)] text-white shadow-sm' : 'text-gray-500 hover:text-gray-800'}`}>
              {sf === 'en_curso' ? 'En curso' : sf === 'futuras' ? 'Futuras' : 'Archivadas'}
            </button>
          ))}
        </div>
      )}

      {/* ─── Contenido ─── */}
      {loading ? <Spinner /> : displayList.length === 0 ? (
        <div className="text-center py-16">
          <IconCalendar size={36} className="mx-auto text-gray-300 mb-2" />
          <p className="text-sm text-[var(--text-sub)]">
            {!isAdminOrHR
              ? 'No hay solicitudes'
              : estadoFilter === 'pending'
                ? 'No hay solicitudes pendientes'
                : subFilter === 'en_curso' ? 'No hay solicitudes en curso'
                : subFilter === 'futuras'  ? 'No hay solicitudes futuras'
                : 'No hay solicitudes archivadas'}
          </p>
        </div>
      ) : (
        <>
          {/* MOBILE: cards */}
          <div className="lg:hidden space-y-2">
            {visibleList.map(sol => (
              <div key={sol.id} className="bg-white rounded-xl border border-gray-200/60 p-3.5">
                <div className="flex items-start gap-3">
                  {isAdminOrHR ? (
                    fotosMap[sol.usuario_id]
                      // eslint-disable-next-line @next/next/no-img-element
                      ? <img src={fotosMap[sol.usuario_id]!} alt="" className="w-9 h-9 rounded-full object-cover shrink-0 shadow-sm mt-0.5" />
                      : <div className="w-9 h-9 bg-[image:var(--gradient)] rounded-full flex items-center justify-center shrink-0 shadow-sm mt-0.5">
                          <span className="text-[10px] font-bold text-white">{initials(sol.empleado_nombre)}</span>
                        </div>
                  ) : (
                    <div className="w-9 h-9 bg-gray-100 rounded-full flex items-center justify-center shrink-0 mt-0.5">
                      <IconCalendar size={16} className="text-gray-400" />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    {isAdminOrHR && <p className="text-sm font-semibold truncate">{sol.empleado_nombre}</p>}
                    <div className="flex items-center gap-1.5 flex-wrap mt-0.5">
                      <TipoBadge tipo={sol.tipo} />
                      <EstadoBadge estado={sol.estado} />
                      {sol.tipo === 'Ausencia por Salud' && (
                        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-md ${sol.certificado_adjunto ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-100 text-gray-500'}`}>
                          {sol.certificado_adjunto ? 'Con cert.' : 'Sin cert.'}
                        </span>
                      )}
                    </div>
                    <div className="mt-1"><DetallePeriodo sol={sol} /></div>
                    {sol.motivo && <p className="text-[12px] text-gray-500 mt-0.5 line-clamp-1">{sol.motivo}</p>}
                    {sol.comentario_admin && (
                      <p className="text-[11px] text-gray-400 mt-0.5 italic truncate">"{sol.comentario_admin}"</p>
                    )}
                  </div>
                  {/* Acciones */}
                  <div className="flex flex-col gap-1 shrink-0">
                    {sol.tipo === 'Ausencia por Salud' && sol.certificado_adjunto && (
                      <button onClick={() => setViewCertItem(sol)}
                        className="w-8 h-8 flex items-center justify-center text-blue-500 bg-blue-50 rounded-lg cursor-pointer active:bg-blue-100">
                        <IconFileText size={15} />
                      </button>
                    )}
                    <button onClick={() => setHistorialItem(sol)}
                      className="w-8 h-8 flex items-center justify-center text-gray-400 bg-gray-50 rounded-lg cursor-pointer active:bg-gray-100">
                      <IconClock size={15} />
                    </button>
                    {isAdminOrHR && sol.estado === 'pending' && (
                      <>
                        <button onClick={() => { setApproveItem(sol); setComentario('') }}
                          className="w-8 h-8 flex items-center justify-center text-emerald-600 bg-emerald-50 rounded-lg cursor-pointer active:bg-emerald-100">
                          <IconCheck size={15} />
                        </button>
                        <button onClick={() => { setRejectItem(sol); setComentario('') }}
                          className="w-8 h-8 flex items-center justify-center text-red-500 bg-red-50 rounded-lg cursor-pointer active:bg-red-100">
                          <IconX size={15} />
                        </button>
                      </>
                    )}
                    {isAdminOrHR && (
                      <button onClick={() => openEdit(sol)}
                        className="w-8 h-8 flex items-center justify-center text-gray-400 bg-gray-50 rounded-lg cursor-pointer active:bg-gray-100">
                        <IconEdit size={15} />
                      </button>
                    )}
                    {isAdminOrHR && (
                      <button onClick={() => setDeleteItem(sol)}
                        className="w-8 h-8 flex items-center justify-center text-red-400 bg-red-50 rounded-lg cursor-pointer active:bg-red-100">
                        <IconTrash size={15} />
                      </button>
                    )}
                    {!isAdminOrHR && sol.estado === 'pending' && (
                      <button onClick={() => setDeleteItem(sol)}
                        className="w-8 h-8 flex items-center justify-center text-gray-400 bg-gray-50 rounded-lg cursor-pointer active:bg-red-50">
                        <IconTrash size={15} />
                      </button>
                    )}
                    {!isAdminOrHR && sol.tipo === 'Ausencia por Salud' && (
                      <button onClick={() => { setCertItem(sol); setCertUrl(sol.certificado_adjunto || '') }}
                        className="w-8 h-8 flex items-center justify-center text-[var(--primary)] bg-[var(--primary-light)] rounded-lg cursor-pointer">
                        <IconPaperclip size={15} />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* DESKTOP: tabla */}
          <div className="hidden lg:block bg-white rounded-xl border border-gray-200/60 overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="bg-gray-50 text-[11px] text-gray-500 uppercase tracking-wider">
                  {isAdminOrHR && <th className="text-left py-3 px-4 font-semibold">Empleado</th>}
                  <th className="text-left py-3 px-4 font-semibold">Tipo</th>
                  <th className="text-left py-3 px-4 font-semibold">Período</th>
                  <th className="text-left py-3 px-4 font-semibold">Motivo</th>
                  <th className="text-left py-3 px-4 font-semibold">Estado</th>
                  <th className="w-28" />
                </tr>
              </thead>
              <tbody>
                {visibleList.map(sol => (
                  <tr key={sol.id} className="text-sm border-t border-gray-100 hover:bg-gray-50/50 transition-colors">
                    {isAdminOrHR && (
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2.5">
                          {fotosMap[sol.usuario_id]
                            // eslint-disable-next-line @next/next/no-img-element
                            ? <img src={fotosMap[sol.usuario_id]!} alt="" className="w-7 h-7 rounded-full object-cover shrink-0 shadow-sm" />
                            : <div className="w-7 h-7 bg-[image:var(--gradient)] rounded-full flex items-center justify-center shrink-0 shadow-sm">
                                <span className="text-[9px] font-bold text-white">{initials(sol.empleado_nombre)}</span>
                              </div>
                          }
                          <p className="font-medium text-[13px]">{sol.empleado_nombre}</p>
                        </div>
                      </td>
                    )}
                    <td className="py-3 px-4">
                      <div className="flex flex-col gap-1">
                        <TipoBadge tipo={sol.tipo} />
                        {sol.tipo === 'Ausencia por Salud' && (
                          <span className={`text-[10px] px-2 py-0.5 rounded-md w-fit font-medium ${sol.certificado_adjunto ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-100 text-gray-500'}`}>
                            {sol.certificado_adjunto ? 'Con cert.' : 'Sin cert.'}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="py-3 px-4 whitespace-nowrap"><DetallePeriodo sol={sol} /></td>
                    <td className="py-3 px-4 max-w-[180px]">
                      {sol.motivo
                        ? <span className="block text-[13px] text-gray-600 truncate" title={sol.motivo}>{sol.motivo}</span>
                        : <span className="text-[13px] text-gray-400">—</span>}
                      {sol.comentario_admin && (
                        <span className="block text-[11px] text-gray-400 italic truncate mt-0.5" title={sol.comentario_admin}>
                          "{sol.comentario_admin}"
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-4"><EstadoBadge estado={sol.estado} /></td>
                    <td className="py-3 px-4">
                      <div className="flex gap-0.5 justify-end">
                        {sol.tipo === 'Ausencia por Salud' && sol.certificado_adjunto && (
                          <button onClick={() => setViewCertItem(sol)} title="Ver certificado"
                            className="p-1.5 text-blue-500 hover:bg-blue-50 rounded-lg cursor-pointer">
                            <IconFileText size={15} />
                          </button>
                        )}
                        <button onClick={() => setHistorialItem(sol)} title="Historial"
                          className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-50 rounded-lg cursor-pointer">
                          <IconClock size={15} />
                        </button>
                        {isAdminOrHR && sol.estado === 'pending' && (
                          <>
                            <button onClick={() => { setApproveItem(sol); setComentario('') }} title="Aprobar"
                              className="p-1.5 text-emerald-600 hover:bg-emerald-50 rounded-lg cursor-pointer">
                              <IconCheck size={15} />
                            </button>
                            <button onClick={() => { setRejectItem(sol); setComentario('') }} title="Rechazar"
                              className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg cursor-pointer">
                              <IconX size={15} />
                            </button>
                          </>
                        )}
                        {isAdminOrHR && (
                          <button onClick={() => openEdit(sol)} title="Editar"
                            className="p-1.5 text-gray-400 hover:text-[var(--primary)] hover:bg-[var(--primary-light)] rounded-lg cursor-pointer">
                            <IconEdit size={15} />
                          </button>
                        )}
                        {isAdminOrHR && (
                          <button onClick={() => setDeleteItem(sol)} title="Eliminar"
                            className="p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg cursor-pointer">
                            <IconTrash size={15} />
                          </button>
                        )}
                        {!isAdminOrHR && sol.estado === 'pending' && (
                          <button onClick={() => setDeleteItem(sol)}
                            className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg cursor-pointer">
                            <IconTrash size={15} />
                          </button>
                        )}
                        {!isAdminOrHR && sol.tipo === 'Ausencia por Salud' && (
                          <button onClick={() => { setCertItem(sol); setCertUrl(sol.certificado_adjunto || '') }} title="Adjuntar certificado"
                            className="p-1.5 text-[var(--primary)] hover:bg-[var(--primary-light)] rounded-lg cursor-pointer">
                            <IconPaperclip size={15} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* ─── Ver más (solo empleados) ─── */}
          {!isAdminOrHR && displayList.length > visibleCount && (
            <button
              onClick={() => setVisibleCount(v => v + 10)}
              className="w-full mt-3 py-3 text-[13px] font-medium text-[var(--primary)] bg-white border border-gray-200/60 rounded-xl hover:bg-[var(--primary-light)] transition-colors cursor-pointer"
            >
              Ver más ({displayList.length - visibleCount} más)
            </button>
          )}
        </>
      )}

      {/* ─── Modal: Ajustes de plazos ─── */}
      <Modal open={configModal} onClose={() => setConfigModal(false)} title="Ajustes de solicitudes"
        footer={<>
          <Button variant="secondary" onClick={() => setConfigModal(false)} className="flex-1 lg:flex-none">Cancelar</Button>
          <Button onClick={saveConfig} loading={configSaving} className="flex-1 lg:flex-none">Guardar</Button>
        </>}>
        <div className="space-y-5">
          <p className="text-[13px] text-gray-500">Los empleados no pueden crear solicitudes con menos días de anticipación que los configurados acá. Admin y HR están exentos de estos plazos.</p>
          <div>
            <label className="block text-[13px] font-semibold text-[var(--text)] mb-1">Vacaciones — anticipación mínima</label>
            <p className="text-[12px] text-gray-400 mb-2">Días que el empleado debe pedir antes de la fecha de inicio</p>
            <div className="flex items-center gap-3">
              <input type="number" min={1} max={90} value={configForm.vacaciones_min_dias}
                onChange={e => setConfigForm({ ...configForm, vacaciones_min_dias: Math.max(1, +e.target.value) })}
                style={{ fontSize: 16 }}
                className="w-24 h-11 px-4 bg-white border border-[var(--border)] rounded-xl text-[var(--text)] outline-none focus:border-[var(--primary)] focus:ring-2 focus:ring-[var(--primary-light)]" />
              <span className="text-[13px] text-gray-500">días</span>
            </div>
          </div>
          <div>
            <label className="block text-[13px] font-semibold text-[var(--text)] mb-1">Solicitud de Días / Cambio de horario — anticipación mínima</label>
            <p className="text-[12px] text-gray-400 mb-2">También requieren motivo obligatorio</p>
            <div className="flex items-center gap-3">
              <input type="number" min={1} max={90} value={configForm.otros_min_dias}
                onChange={e => setConfigForm({ ...configForm, otros_min_dias: Math.max(1, +e.target.value) })}
                style={{ fontSize: 16 }}
                className="w-24 h-11 px-4 bg-white border border-[var(--border)] rounded-xl text-[var(--text)] outline-none focus:border-[var(--primary)] focus:ring-2 focus:ring-[var(--primary-light)]" />
              <span className="text-[13px] text-gray-500">días</span>
            </div>
          </div>
          <div className="p-3 bg-gray-50 rounded-xl text-[12px] text-gray-500 space-y-1">
            <p><span className="font-medium text-gray-700">Ausencia por Salud:</span> se puede pedir a partir de hoy</p>
            <p><span className="font-medium text-gray-700">Admin y HR:</span> pueden crear cualquier solicitud sin restricciones de plazo</p>
          </div>
        </div>
      </Modal>

      {/* ─── Modal: Nueva / Editar ─── */}
      <Modal open={modal} onClose={() => setModal(false)}
        title={editId ? 'Editar solicitud' : 'Nueva solicitud'}
        footer={<>
          <Button variant="secondary" onClick={() => setModal(false)} className="flex-1 lg:flex-none">Cancelar</Button>
          <Button onClick={save} loading={saving} className="flex-1 lg:flex-none">
            {editId ? 'Guardar' : form.tipo === 'Feriado/Local cerrado' ? 'Crear feriado' : 'Enviar'}
          </Button>
        </>}>
        <FormFields form={form} setForm={setForm} isAdmin={isAdminOrHR} isAdminOrHR={isAdminOrHR} editMode={!!editId} empleados={empleados} certFile={modalCertFile} setCertFile={setModalCertFile} config={config} />
        {formError && (
          <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-100 rounded-xl mt-4">
            <IconAlertCircle size={16} className="text-red-500 shrink-0" />
            <p className="text-[13px] text-red-600 font-medium">{formError}</p>
          </div>
        )}
      </Modal>

      {/* ─── Modal: Rechazar ─── */}
      <Modal open={!!rejectItem} onClose={() => setRejectItem(null)} title="Rechazar solicitud"
        footer={<>
          <Button variant="secondary" onClick={() => setRejectItem(null)} className="flex-1 lg:flex-none">Cancelar</Button>
          <Button variant="danger" onClick={reject} loading={processing} className="flex-1 lg:flex-none">Rechazar</Button>
        </>}>
        {rejectItem && (
          <div className="space-y-4">
            <div className="p-3 bg-gray-50 rounded-xl">
              <p className="text-sm font-semibold">{rejectItem.empleado_nombre}</p>
              <div className="text-[12px] text-gray-500 mt-0.5">
                <TipoBadge tipo={rejectItem.tipo} />
                {' '}· <DetallePeriodo sol={rejectItem} />
              </div>
              {rejectItem.motivo && <p className="text-[12px] text-gray-500 mt-1 italic">"{rejectItem.motivo}"</p>}
            </div>
            <div>
              <label className="block text-[13px] font-medium text-[var(--text-sub)] mb-1.5">Comentario (opcional)</label>
              <textarea value={comentario} onChange={e => setComentario(e.target.value)}
                placeholder="Motivo del rechazo..." rows={3} style={{ fontSize: 16 }}
                className="w-full px-4 py-3 bg-white border border-[var(--border)] rounded-xl text-[var(--text)] placeholder:text-[var(--text-muted)] outline-none transition focus:border-[var(--primary)] focus:ring-2 focus:ring-[var(--primary-light)] resize-none lg:text-sm" />
            </div>
          </div>
        )}
      </Modal>

      {/* ─── Modal: Certificado (empleado) ─── */}
      <Modal open={!!certItem} onClose={() => { setCertItem(null); setCertFile(null); setCertUrl(''); setCertError('') }}
        title="Adjuntar certificado médico"
        footer={<>
          <Button variant="secondary" onClick={() => { setCertItem(null); setCertFile(null); setCertUrl(''); setCertError('') }} className="flex-1 lg:flex-none">Cancelar</Button>
          <Button onClick={saveCert} loading={certUploading} className="flex-1 lg:flex-none">
            {certUploading ? 'Subiendo...' : 'Guardar'}
          </Button>
        </>}>
        <div className="space-y-4">
          {/* File picker */}
          <div>
            <label className="block text-[13px] font-medium text-[var(--text-sub)] mb-2">Subir archivo</label>
            <label className={`flex flex-col items-center justify-center h-24 border-2 border-dashed rounded-xl cursor-pointer transition-colors ${certFile ? 'border-[var(--primary)] bg-[var(--primary-light)]' : 'border-gray-200 hover:border-[var(--primary)] hover:bg-[var(--primary-light)]'}`}>
              <input type="file" accept="image/*,.pdf" className="hidden"
                onChange={e => { setCertFile(e.target.files?.[0] || null); setCertUrl(''); setCertError('') }} />
              {certFile ? (
                <div className="text-center px-4">
                  <IconPaperclip size={18} className="mx-auto text-[var(--primary)] mb-1" />
                  <p className="text-[13px] font-medium text-[var(--primary)] truncate max-w-[240px]">{certFile.name}</p>
                  <p className="text-[11px] text-[var(--text-sub)]">
                    {(certFile.size / 1024).toFixed(0)} KB
                    {certFile.type.startsWith('image/') && ' · se comprimirá automáticamente'}
                  </p>
                </div>
              ) : (
                <div className="text-center">
                  <IconPaperclip size={20} className="mx-auto text-gray-300 mb-1" />
                  <p className="text-[13px] text-gray-400">Tocá para elegir imagen o PDF</p>
                  <p className="text-[11px] text-gray-300 mt-0.5">máx. 5 MB</p>
                </div>
              )}
            </label>
          </div>

          {/* Divider */}
          <div className="flex items-center gap-3">
            <hr className="flex-1 border-gray-100" />
            <span className="text-[11px] text-gray-400">o pegá un link</span>
            <hr className="flex-1 border-gray-100" />
          </div>

          {/* URL fallback */}
          <input type="url" value={certUrl}
            onChange={e => { setCertUrl(e.target.value); setCertFile(null); setCertError('') }}
            placeholder="https://drive.google.com/..." style={{ fontSize: 16 }}
            className="w-full h-11 px-4 bg-white border border-[var(--border)] rounded-xl text-[var(--text)] placeholder:text-[var(--text-muted)] outline-none transition focus:border-[var(--primary)] focus:ring-2 focus:ring-[var(--primary-light)]" />

          {/* Ver actual */}
          {certItem?.certificado_adjunto && (
            <a href={certItem.certificado_adjunto} target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-1.5 text-[13px] text-[var(--primary)]">
              <IconPaperclip size={14} /> Ver certificado actual
            </a>
          )}

          {/* Error */}
          {certError && (
            <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-100 rounded-xl">
              <IconAlertCircle size={15} className="text-red-500 shrink-0" />
              <p className="text-[13px] text-red-600">{certError}</p>
            </div>
          )}
        </div>
      </Modal>

      {/* ─── Modal: Historial ─── */}
      {historialItem && <HistorialModal sol={historialItem} onClose={() => setHistorialItem(null)} />}

      {/* ─── FileViewer: Ver certificado ─── */}
      {viewCertItem?.certificado_adjunto && (
        <FileViewer
          url={viewCertItem.certificado_adjunto}
          name="Certificado médico"
          onClose={() => setViewCertItem(null)}
        />
      )}

      {/* ─── Modal: Aprobar ─── */}
      <Modal open={!!approveItem} onClose={() => { setApproveItem(null); setComentario('') }}
        title="Aprobar solicitud"
        footer={<>
          <Button variant="secondary" onClick={() => { setApproveItem(null); setComentario('') }} className="flex-1 lg:flex-none">Cancelar</Button>
          <Button onClick={approve} loading={processing} className="flex-1 lg:flex-none">Aprobar</Button>
        </>}>
        {approveItem && (
          <div className="space-y-4">
            <div className="p-3 bg-gray-50 rounded-xl">
              <p className="text-sm font-semibold">{approveItem.empleado_nombre}</p>
              <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                <TipoBadge tipo={approveItem.tipo} />
                <span className="text-[12px] text-gray-500">·</span>
                <DetallePeriodo sol={approveItem} />
              </div>
              {approveItem.motivo && <p className="text-[12px] text-gray-500 mt-1 italic">"{approveItem.motivo}"</p>}
            </div>
            <div>
              <label className="block text-[13px] font-medium text-[var(--text-sub)] mb-1.5">Comentario al empleado <span className="font-normal text-[var(--text-muted)]">(opcional)</span></label>
              <textarea value={comentario} onChange={e => setComentario(e.target.value)}
                placeholder="Ej: Aprobado, recordá avisar con anticipación..." rows={3} style={{ fontSize: 16 }}
                className="w-full px-4 py-3 bg-white border border-[var(--border)] rounded-xl text-[var(--text)] placeholder:text-[var(--text-muted)] outline-none transition focus:border-[var(--primary)] focus:ring-2 focus:ring-[var(--primary-light)] resize-none lg:text-sm" />
            </div>
          </div>
        )}
      </Modal>

      {/* ─── Confirm: Eliminar ─── */}
      <Confirm open={!!deleteItem} onClose={() => setDeleteItem(null)} onConfirm={deleteSolicitud}
        title="Eliminar solicitud"
        message={`¿Eliminar la solicitud de ${deleteItem?.empleado_nombre ?? ''}? No se puede deshacer.`}
        confirmLabel="Eliminar" danger />

      {/* ─── Herramientas admin (ocultas — cambiar false por isAdmin para reactivar) ─── */}
      {false && isAdmin && (
        <div className="mt-8 border-t border-gray-100 pt-6 space-y-3">
          <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide">Herramientas de administración</p>

          {/* Importar CSV */}
          <div className="bg-white rounded-xl border border-gray-200/60 p-4 space-y-3">
            <div>
              <p className="text-sm font-semibold text-[var(--text)]">Importar solicitudes históricas</p>
              <p className="text-xs text-[var(--text-muted)] mt-0.5">CSV exportado del sistema anterior (GAS). Se matchea por email del empleado.</p>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <input ref={importRef} type="file" accept=".csv" className="hidden"
                onChange={e => { setImportFile(e.target.files?.[0] ?? null); setImportResult(null); setImportError('') }} />
              <button onClick={() => importRef.current?.click()} disabled={importLoading}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm border border-[var(--border)] rounded-lg text-[var(--text-sub)] hover:border-[var(--primary)] hover:text-[var(--primary)] disabled:opacity-50 transition-colors truncate max-w-xs">
                <IconUpload size={14} className="flex-shrink-0" />
                <span className="truncate">{importFile ? importFile.name : 'Seleccionar CSV…'}</span>
              </button>
              {importFile && (
                <>
                  <button onClick={importarCSV} disabled={importLoading}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg bg-[var(--primary)] text-white font-medium disabled:opacity-60 hover:opacity-90 transition-opacity flex-shrink-0">
                    {importLoading && <Spinner size={12} inline />}
                    {importLoading ? 'Importando…' : 'Importar'}
                  </button>
                  {!importLoading && (
                    <button onClick={() => { setImportFile(null); setImportResult(null); setImportError('') }}
                      className="text-xs text-[var(--text-muted)] hover:text-red-500 transition-colors">
                      Quitar
                    </button>
                  )}
                </>
              )}
            </div>
            {importResult && (
              <div className="space-y-1">
                <div className="flex items-center gap-1.5 text-sm text-emerald-600 font-medium">
                  <IconCheck size={14} />
                  {importResult.ok.toLocaleString('es-AR')} importadas de {importResult.total.toLocaleString('es-AR')}
                </div>
                {importResult.noEncontrados.length > 0 && (
                  <p className="text-xs text-amber-600">
                    Sin usuario ({importResult.noEncontrados.length}): {importResult.noEncontrados.slice(0,5).join(', ')}
                    {importResult.noEncontrados.length > 5 ? ` y ${importResult.noEncontrados.length - 5} más` : ''}
                  </p>
                )}
              </div>
            )}
            {importError && <p className="text-sm text-red-600">{importError}</p>}
          </div>
        </div>
      )}

      <Toast message={toast} visible={!!toast} />
    </div>
  )
}
