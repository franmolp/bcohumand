'use client'

import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { Button, Spinner, Toast, Modal } from '@/components/ui'
import { IconRefresh, IconChevronRight, IconChevronLeft, IconUpload, IconCheck, IconEdit, IconFileText, IconPlus, IconTrash, IconX, IconClipboard } from '@/components/ui/Icons'
import { CHIP_INFO, calcPresentismo, DEFAULT_CONFIG, AsistenciaConfig, toMinutes } from '@/lib/asistencia'
import { AsistenciaProcesada, SessionUser } from '@/types'

interface Empleado {
  id: string; nombre: string; email: string
  equipo: { id: number; nombre: string } | null
  rol: { id: number; nombre: string } | null
}

interface PrimerTurnoDia {
  usuario_id: string
  fecha: string
  primer_turno: string
  ultimo_turno: string | null
  cant_citas: number
}

type Tab = 'home' | 'todos' | 'presentismo' | 'importar' | 'ajustes'

interface Props { user: SessionUser }

// ─── helpers ──────────────────────────────────────────────────────────────────

function fmtTime(t: string | null): string {
  if (!t) return '—'
  return t.substring(0, 5)
}

function fmtH(h: number | null): string {
  if (h == null) return '—'
  const neg = h < 0
  const m = Math.round(Math.abs(h) * 60)
  const hh = Math.floor(m / 60), mm = m % 60
  const s = mm === 0 ? `${hh}h` : `${hh}h${String(mm).padStart(2, '0')}m`
  return neg ? `-${s}` : s
}

function mesLabel(mes: string): string {
  const [y, m] = mes.split('-').map(Number)
  return `${['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'][m - 1]} ${y}`
}

function daysInMonth(mes: string): number {
  const [y, m] = mes.split('-').map(Number)
  return new Date(y, m, 0).getDate()
}

function padDay(mes: string, d: number): string {
  return `${mes}-${String(d).padStart(2, '0')}`
}

function getDowShort(mes: string, d: number): string {
  const [y, m] = mes.split('-').map(Number)
  return ['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'][new Date(y, m - 1, d).getDay()]
}

function getDowFull(mes: string, d: number): string {
  const [y, m] = mes.split('-').map(Number)
  return ['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'][new Date(y, m - 1, d).getDay()]
}

function countNonSunday(mes: string, hasta?: string): number {
  const total = daysInMonth(mes)
  const [y, m] = mes.split('-').map(Number)
  let n = 0
  for (let d = 1; d <= total; d++) {
    const dateStr = padDay(mes, d)
    if (hasta && dateStr > hasta) break
    if (new Date(y, m - 1, d).getDay() !== 0) n++
  }
  return n
}

function fmtFecha(f: string): string {
  const [y, m, d] = f.split('-')
  return `${d}/${m}/${y}`
}


function chipSeverity(estado: string | null): number {
  if (!estado) return -1
  if (['Ausente', 'Ausencia injustificada'].includes(estado)) return 5
  if (estado === 'Sin fichada') return 4
  if (['Llegada tarde', 'Salida temprana', 'Llegada tarde/Salida temprana', 'Incompleto', 'Tarde justificado/Salida temprana'].includes(estado)) return 3
  if (['Asistió', 'Tarde justificado'].includes(estado)) return 2
  return 1
}

// ─── component ────────────────────────────────────────────────────────────────

export default function AsistenciaClient({ user }: Props) {
  const isAdmin     = user.rol === 'admin' || user.rol === 'Admin'
  const isHR        = user.rol === 'HR'
  const isEncargada = user.rol === 'Encargada'
  const canEdit     = isAdmin || isHR
  const today = new Date().toISOString().split('T')[0]
  const defaultMes = today.substring(0, 7)
  const ayer = (() => { const d = new Date(); d.setDate(d.getDate() - 1); return d.toISOString().split('T')[0] })()

  const [tab, setTab] = useState<Tab>('home')
  const [mes, setMes] = useState(defaultMes)
  const [records, setRecords] = useState<AsistenciaProcesada[]>([])
  const [primerTurnos, setPrimerTurnos] = useState<PrimerTurnoDia[]>([])
  const [empList, setEmpList] = useState<Empleado[]>([])
  const [homeEmpId, setHomeEmpId] = useState((isAdmin || isHR || isEncargada) ? '' : user.id)
  const [todosDate, setTodosDate] = useState(today)
  const [config, setConfig] = useState<AsistenciaConfig>(DEFAULT_CONFIG)
  const [configDraft, setConfigDraft] = useState<AsistenciaConfig>(DEFAULT_CONFIG)
  const [loading, setLoading] = useState(false)
  const [regen, setRegen] = useState(false)
  const [regenAnio, setRegenAnio] = useState(false)
  const [savingCfg, setSavingCfg] = useState(false)
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null)
  const [weekEmpId, setWeekEmpId] = useState<string | null>(null)

  // ── loaders ────────────────────────────────────────────────────────────────

  const loadRecords = useCallback(async () => {
    setLoading(true)
    const res = await fetch(`/api/asistencia?mes=${mes}`)
    const data = await res.json()
    if (data.error) setToast({ msg: data.error, type: 'error' })
    setRecords(Array.isArray(data) ? data : [])
    setLoading(false)
  }, [mes])

  const loadEmpList = useCallback(async () => {
    const res = await fetch('/api/empleados')
    const data = await res.json()
    setEmpList(Array.isArray(data) ? data.filter((e: Empleado & { estado_cuenta?: string }) => e.estado_cuenta !== 'inactiva') : [])
  }, [])

  const loadConfig = useCallback(async () => {
    const res = await fetch('/api/config-asistencia')
    const data = await res.json()
    if (!data.error) { setConfig(data); setConfigDraft(data) }
  }, [])

  const loadPrimerTurnos = useCallback(async () => {
    const res = await fetch(`/api/primer-turno?mes=${mes}`)
    const data = await res.json()
    setPrimerTurnos(Array.isArray(data) ? data : [])
  }, [mes])

  useEffect(() => { if (isAdmin || isHR || isEncargada) loadEmpList() }, [isAdmin, isHR, isEncargada, loadEmpList])
  useEffect(() => { loadConfig() }, [loadConfig])
  useEffect(() => { loadRecords() }, [loadRecords])
  useEffect(() => { if (isAdmin || isHR || isEncargada) loadPrimerTurnos() }, [isAdmin, isHR, isEncargada, loadPrimerTurnos])

  // ── memos ──────────────────────────────────────────────────────────────────

  // Para el mes en curso (o futuro), solo contamos hasta ayer — proporcional
  const diasNF = useMemo(() => countNonSunday(mes, mes >= defaultMes ? ayer : undefined), [mes, ayer, defaultMes])

  const homeRecords = useMemo(
    () => records.filter(r => r.usuario_id === homeEmpId && r.fecha <= ayer),
    [records, homeEmpId, ayer]
  )

  const homeStats = useMemo(
    () => calcPresentismo(homeRecords, config, diasNF),
    [homeRecords, config, diasNF]
  )

  const todosData = useMemo(() => {
    const byEmp = new Map(records.filter(r => r.fecha === todosDate).map(r => [r.usuario_id, r]))
    const byEmpTurno = new Map(primerTurnos.filter(t => t.fecha === todosDate).map(t => [t.usuario_id, t]))
    return empList
      .map(e => ({ emp: e, rec: byEmp.get(e.id) ?? null, turno: byEmpTurno.get(e.id) ?? null }))
      .sort((a, b) => a.emp.nombre.localeCompare(b.emp.nombre, 'es'))
  }, [records, empList, todosDate, primerTurnos])

  const statsPerEmp = useMemo(() => {
    const filtrados = config.empleadosPresentismo.length === 0
      ? empList
      : empList.filter(e => config.empleadosPresentismo.includes(e.email))
    return filtrados.map(emp => {
      const recs = records.filter(r => r.usuario_id === emp.id && r.fecha <= ayer)
      const stats = calcPresentismo(recs, config, diasNF)
      return { emp, stats }
    }).sort((a, b) => a.emp.nombre.localeCompare(b.emp.nombre, 'es'))
  }, [records, empList, config, diasNF, ayer])

  const weekData = useMemo(() => {
    if (!weekEmpId) return []
    const recs = records.filter(r => r.usuario_id === weekEmpId && r.fecha <= ayer)
    const byWeek = new Map<number, typeof recs>()
    for (const r of recs) {
      if (r.semana == null) continue
      if (!byWeek.has(r.semana)) byWeek.set(r.semana, [])
      byWeek.get(r.semana)!.push(r)
    }
    return Array.from(byWeek.entries()).sort(([a], [b]) => a - b).map(([semana, wr]) => {
      const stats = calcPresentismo(wr as Parameters<typeof calcPresentismo>[0], config, wr.length)
      const fechas = wr.map(r => r.fecha).sort()
      return { semana, stats, de: fechas[0], hasta: fechas[fechas.length - 1] }
    })
  }, [records, weekEmpId, config, ayer])

  // ── actions ────────────────────────────────────────────────────────────────

  function showToast(msg: string, type: 'success' | 'error') {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3500)
  }

  async function regenerar() {
    setRegen(true)
    const [y, m] = mes.split('-').map(Number)
    const eom = `${mes}-${String(new Date(y, m, 0).getDate()).padStart(2, '0')}`
    const fechaFin = eom < ayer ? eom : ayer
    const res = await fetch('/api/asistencia/regenerar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fechaInicio: `${mes}-01`, fechaFin }),
    })
    const data = await res.json()
    setRegen(false)
    if (data.error) showToast(data.error, 'error')
    else { showToast(`${data.procesados} registros regenerados`, 'success'); loadRecords() }
  }

  async function regenerarAnio() {
    setRegenAnio(true)
    const year = new Date().getFullYear()
    const res = await fetch('/api/asistencia/regenerar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fechaInicio: `${year}-01-01`, fechaFin: ayer }),
    })
    const data = await res.json()
    setRegenAnio(false)
    if (data.error) showToast(data.error, 'error')
    else { showToast(`${data.procesados} registros regenerados`, 'success'); loadRecords() }
  }

  async function saveConfig() {
    setSavingCfg(true)
    const res = await fetch('/api/config-asistencia', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(configDraft),
    })
    const data = await res.json()
    setSavingCfg(false)
    if (data.error) showToast(data.error, 'error')
    else { setConfig(configDraft); showToast('Configuración guardada', 'success') }
  }

  const TABS: { key: Tab; label: string }[] = isAdmin
    ? [{ key: 'home', label: 'Ficha' }, { key: 'todos', label: 'Todos' }, { key: 'presentismo', label: 'Presentismo' }, { key: 'importar', label: 'Importar' }, { key: 'ajustes', label: 'Ajustes' }]
    : isHR
    ? [{ key: 'home', label: 'Ficha' }, { key: 'todos', label: 'Todos' }, { key: 'presentismo', label: 'Presentismo' }]
    : isEncargada
    ? [{ key: 'home', label: 'Ficha' }, { key: 'todos', label: 'Todos' }]
    : [{ key: 'home', label: 'Mi Asistencia' }, { key: 'presentismo', label: 'Presentismo' }]

  // ── weekly modal emp lookup ────────────────────────────────────────────────

  const weekEmp = useMemo(() => empList.find(e => e.id === weekEmpId) ?? null, [empList, weekEmpId])

  // ── render ─────────────────────────────────────────────────────────────────

  return (
    <div className="pt-[41px] lg:pt-0">

      {/* Header — igual que los demás módulos */}
      <div className="pt-4 pb-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-[image:var(--gradient)] flex items-center justify-center flex-shrink-0 shadow-sm">
            <IconClipboard size={18} className="text-white" />
          </div>
          <h1 className="text-[17px] font-bold text-[var(--text)]">Asistencia</h1>
        </div>
        {isAdmin && (
          <div className="flex items-center gap-3">
            <button
              onClick={regenerar}
              disabled={regen || regenAnio}
              className="flex items-center gap-1.5 text-sm text-[var(--primary)] font-medium disabled:opacity-50"
            >
              {regen ? <Spinner size={14} inline /> : <IconRefresh size={16} />}
              {regen ? 'Regenerando…' : 'Mes'}
            </button>
            <button
              onClick={regenerarAnio}
              disabled={regen || regenAnio}
              className="flex items-center gap-1.5 text-sm text-[var(--primary)] font-medium disabled:opacity-50"
            >
              {regenAnio ? <Spinner size={14} inline /> : <IconRefresh size={16} />}
              {regenAnio ? 'Regenerando…' : 'Año completo'}
            </button>
          </div>
        )}
      </div>

      {/* Tabs — fixed on mobile (sticky doesn't work inside overflow-y-auto on iOS Safari), sticky on desktop */}
      <div className="fixed top-12 left-0 right-0 z-20 bg-white border-b border-[var(--border)] lg:sticky lg:top-14 lg:left-auto lg:right-auto">
        <div className="px-4 lg:px-0 flex gap-0 -mb-px overflow-x-auto scrollbar-none">
          {TABS.map(t => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`px-4 py-2.5 text-sm font-medium border-b-2 whitespace-nowrap transition-colors ${
                tab === t.key
                  ? 'border-[var(--primary)] text-[var(--primary)]'
                  : 'border-transparent text-[var(--text-muted)] hover:text-[var(--text)]'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>
      {/* Content */}
      <div className="pb-24 lg:pb-8">
        {loading && <Spinner />}

        {!loading && tab === 'home' && (
          <HomeTab
            mes={mes} setMes={setMes} isAdmin={canEdit}
            canSelectEmp={isAdmin || isHR || isEncargada}
            empList={empList} homeEmpId={homeEmpId} setHomeEmpId={setHomeEmpId}
            homeRecords={homeRecords} homeStats={homeStats}
            onRecordEdited={loadRecords}
          />
        )}

        {!loading && tab === 'todos' && (isAdmin || isHR || isEncargada) && (
          <TodosTab todosDate={todosDate} setTodosDate={setTodosDate} todosData={todosData} maxDate={ayer} canEdit={canEdit} onRecordEdited={loadRecords} />
        )}

        {!loading && tab === 'presentismo' && (
          <PresentismoTab
            mes={mes} setMes={setMes} isAdmin={canEdit}
            statsPerEmp={statsPerEmp} homeStats={homeStats} config={config}
            weekData={weekData} weekEmp={weekEmp} weekEmpId={weekEmpId}
            setWeekEmpId={setWeekEmpId}
            homeRecords={homeRecords}
          />
        )}

        {tab === 'importar' && isAdmin && <ImportarTab />}

        {!loading && tab === 'ajustes' && isAdmin && (
          <AjustesTab
            configDraft={configDraft} setConfigDraft={setConfigDraft}
            saveConfig={saveConfig} savingCfg={savingCfg}
            empList={empList}
          />
        )}
      </div>

      {/* Toast */}
      <Toast message={toast?.msg ?? ''} visible={!!toast} type={toast?.type ?? 'success'} />
    </div>
  )
}

// ─── Liquidación helpers ──────────────────────────────────────────────────────

const MESES_PDF = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']
const DOW_PDF   = ['Domingo','Lunes','Martes','Miercoles','Jueves','Viernes','Sabado']

function decimalToHHMMSS(h: number): string {
  const totalMin = Math.round(h * 60)
  const hh = Math.floor(totalMin / 60)
  const mm = totalMin % 60
  return `${String(hh).padStart(2,'0')}:${String(mm).padStart(2,'0')}:00`
}

function fmtARS(n: number): string {
  return Math.round(n).toLocaleString('es-AR')
}

function normalizarNombreLiq(nombre: string): string {
  const p = nombre.trim().split(/\s+/).filter(Boolean)
  if (!p.length) return nombre
  const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1).toLowerCase()
  return p.length === 1 ? cap(p[0]) : cap(p[0]) + ' ' + p[p.length - 1].charAt(0).toUpperCase()
}

// ─── Tab: Ficha ───────────────────────────────────────────────────────────────

function HomeTab({ mes, setMes, isAdmin, canSelectEmp, empList, homeEmpId, setHomeEmpId, homeRecords, homeStats, onRecordEdited }: {
  mes: string; setMes: (m: string) => void; isAdmin: boolean; canSelectEmp?: boolean
  empList: Empleado[]; homeEmpId: string; setHomeEmpId: (id: string) => void
  homeRecords: AsistenciaProcesada[]
  homeStats: ReturnType<typeof calcPresentismo>
  onRecordEdited: () => void
}) {
  const days = Array.from({ length: daysInMonth(mes) }, (_, i) => i + 1)
  const dayMap = new Map(homeRecords.map(r => [r.fecha, r]))
  const hasEmp = !!homeEmpId

  const [editRec, setEditRec] = useState<AsistenciaProcesada | null>(null)
  const [editEstado, setEditEstado] = useState('')
  const [editEntrada, setEditEntrada] = useState('')
  const [editSalida, setEditSalida] = useState('')
  const [editBaseEntrada, setEditBaseEntrada] = useState('')
  const [editBaseSalida, setEditBaseSalida] = useState('')
  const [saving, setSaving] = useState(false)

  function openEdit(rec: AsistenciaProcesada) {
    setEditRec(rec)
    setEditEstado(rec.estado ?? 'Asistió')
    setEditBaseEntrada(rec.horario_base_entrada?.substring(0, 5) ?? '')
    setEditBaseSalida(rec.horario_base_salida?.substring(0, 5) ?? '')
    setEditEntrada(rec.fichada_entrada?.substring(0, 5) ?? '')
    setEditSalida(rec.fichada_salida?.substring(0, 5) ?? '')
  }

  async function saveEdit() {
    if (!editRec) return
    setSaving(true)
    const horas = editEntrada && editSalida
      ? parseFloat(((toMinutes(editSalida) - toMinutes(editEntrada)) / 60).toFixed(2))
      : null
    const res = await fetch('/api/asistencia/editar', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        usuario_id: editRec.usuario_id,
        fecha: editRec.fecha,
        estado: editEstado,
        fichada_entrada: editEntrada || null,
        fichada_salida: editSalida || null,
        horas_fichadas: horas,
        horario_base_entrada: editBaseEntrada || null,
        horario_base_salida: editBaseSalida || null,
        horas_base: editBaseEntrada && editBaseSalida
          ? parseFloat(((toMinutes(editBaseSalida) - toMinutes(editBaseEntrada)) / 60).toFixed(2))
          : null,
      }),
    })
    const data = await res.json()
    setSaving(false)
    if (!data.error) { setEditRec(null); onRecordEdited() }
  }

  const estadoOpts = Object.keys(CHIP_INFO)
  const editHoras = editEntrada && editSalida ? parseFloat(((toMinutes(editSalida) - toMinutes(editEntrada)) / 60).toFixed(2)) : null

  // Horas programadas de un registro: horas_base > calculado de entrada/salida > null
  const getHorasProg = (r: AsistenciaProcesada): number | null => {
    if (r.horas_base != null) return r.horas_base
    if (r.horario_base_entrada && r.horario_base_salida)
      return parseFloat(((toMinutes(r.horario_base_salida) - toMinutes(r.horario_base_entrada)) / 60).toFixed(2))
    return null
  }

  // Promedio por día de semana (usando horas programadas, fallback a fichadas)
  const dowSums = new Map<string, { sum: number; count: number }>()
  for (const r of homeRecords) {
    if (!CHIP_INFO[r.estado ?? '']?.present || !r.dia_semana) continue
    const h = getHorasProg(r) ?? r.horas_fichadas
    if (h == null) continue
    const e = dowSums.get(r.dia_semana) ?? { sum: 0, count: 0 }
    e.sum += h; e.count++
    dowSums.set(r.dia_semana, e)
  }
  const dowAvg = new Map(Array.from(dowSums).map(([d, { sum, count }]) => [d, sum / count]))

  // Promedio global como fallback final
  const globalAvg = dowSums.size
    ? Array.from(dowSums.values()).reduce((s, { sum, count }) => s + sum / count, 0) / dowSums.size
    : 0

  // Horas a imputar para un día justificado
  const horasJustif = (r: AsistenciaProcesada) =>
    getHorasProg(r) ?? (r.dia_semana ? (dowAvg.get(r.dia_semana) ?? globalAvg) : globalAvg)

  // Horas totales: fichadas reales (presentes) + horas estimadas (justificados)
  const horasFichadasReales = parseFloat(homeRecords.reduce((sum, r) => {
    const chip = CHIP_INFO[r.estado ?? '']
    if (chip?.present) return sum + (r.horas_fichadas ?? 0)
    if (chip?.justificado) return sum + horasJustif(r)
    return sum
  }, 0).toFixed(2))

  // ── Liquidación ──────────────────────────────────────────────────────────────
  const [valorHora, setValorHora] = useState('')
  const [descuentos, setDescuentos] = useState<{id: string; concepto: string; monto: string}[]>([])
  const [showAddDesc, setShowAddDesc] = useState(false)
  const [newConcepto, setNewConcepto] = useState('')
  const [newMonto, setNewMonto] = useState('')
  const [adicionales, setAdicionales] = useState<{id: string; concepto: string; monto: string}[]>([])
  const [showAddAd, setShowAddAd] = useState(false)
  const [newConceptoAd, setNewConceptoAd] = useState('')
  const [newMontoAd, setNewMontoAd] = useState('')

  function addDescuento() {
    if (!newConcepto.trim()) return
    setDescuentos(ds => [...ds, { id: Date.now().toString(), concepto: newConcepto.trim(), monto: newMonto.trim() }])
    setNewConcepto(''); setNewMonto(''); setShowAddDesc(false)
  }

  function addAdicional() {
    if (!newConceptoAd.trim()) return
    setAdicionales(ds => [...ds, { id: Date.now().toString(), concepto: newConceptoAd.trim(), monto: newMontoAd.trim() }])
    setNewConceptoAd(''); setNewMontoAd(''); setShowAddAd(false)
  }

  function generarPDF() {
    const vhNum = parseFloat(valorHora.replace(/\./g, '').replace(',', '.')) || 0
    const [y, m] = mes.split('-').map(Number)
    const totalDays = daysInMonth(mes)
    const mesNombre = MESES_PDF[m - 1]
    const empNombre = normalizarNombreLiq(empList.find(e => e.id === homeEmpId)?.nombre ?? '')

    let totalMin = 0
    let filas = ''
    for (let d = 1; d <= totalDays; d++) {
      const fecha = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
      const dow = new Date(y, m - 1, d).getDay()
      const diaNombre = DOW_PDF[dow]
      const esDomingo = dow === 0
      const rec = dayMap.get(fecha)
      const h = rec?.horas_fichadas ?? null
      const color = esDomingo ? '#f97316' : '#1e293b'
      const weight = esDomingo ? '600' : '400'
      let horasStr = '—', subStr = '—'
      if (h != null && h > 0) {
        totalMin += Math.round(h * 60)
        horasStr = decimalToHHMMSS(h)
        subStr = fmtARS(h * vhNum)
      }
      filas += `<tr style="color:${color};font-weight:${weight}">
        <td style="padding:7px 12px;border-bottom:1px solid #f1f5f9">${d}/${m}/${y}</td>
        <td style="padding:7px 12px;border-bottom:1px solid #f1f5f9">${diaNombre}</td>
        <td style="padding:7px 12px;border-bottom:1px solid #f1f5f9;text-align:center">${horasStr}</td>
        <td style="padding:7px 12px;border-bottom:1px solid #f1f5f9;text-align:right">${subStr}</td>
      </tr>`
    }

    const totalHH = Math.floor(totalMin / 60)
    const totalMM = totalMin % 60
    const totalHorasStr = `${String(totalHH).padStart(2,'0')}:${String(totalMM).padStart(2,'0')}:00`
    const subtotalNum = (totalMin / 60) * vhNum
    const parseMonto = (s: string) => parseFloat(s.replace(/\./g,'').replace(',','.')) || 0
    const totalAdNum = adicionales.reduce((s, d) => s + parseMonto(d.monto), 0)
    const totalDescNum = descuentos.reduce((s, d) => s + parseMonto(d.monto), 0)
    const totalFinalNum = subtotalNum + totalAdNum - totalDescNum

    const adRows = adicionales.map(d =>
      `<tr><td colspan="2" style="padding:6px 12px;color:#475569">${d.concepto}</td>
       <td style="padding:6px 12px;text-align:right;color:#10b981">+${fmtARS(parseMonto(d.monto))}</td></tr>`
    ).join('')

    const descRows = descuentos.map(d =>
      `<tr><td colspan="2" style="padding:6px 12px;color:#475569">${d.concepto}</td>
       <td style="padding:6px 12px;text-align:right;color:#ef4444">-${fmtARS(parseMonto(d.monto))}</td></tr>`
    ).join('')

    const html = `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8">
<title>Liquidacion ${empNombre} ${mesNombre} ${y}</title>
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  body{font-family:'Segoe UI',Arial,sans-serif;font-size:13px;color:#1e293b;background:#fff}
  @media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact}@page{margin:18mm 14mm}}
</style></head><body>
<div style="background:linear-gradient(135deg,#667eea,#764ba2);padding:22px 28px;color:#fff;border-radius:0 0 8px 8px;margin-bottom:20px">
  <h1 style="font-size:20px;font-weight:700;letter-spacing:.5px">Liquidacion Mensual</h1>
  <p style="font-size:12px;opacity:.85;margin-top:4px">1 de ${mesNombre} ${y} &ndash; ${totalDays} de ${mesNombre} ${y}</p>
</div>
<div style="padding:0 28px">
  <h2 style="font-size:15px;font-weight:700;margin-bottom:16px">${empNombre}</h2>
  <table style="width:100%;border-collapse:collapse">
    <thead>
      <tr style="background:#f8fafc;font-size:11px;font-weight:600;color:#64748b;text-transform:uppercase;letter-spacing:.5px">
        <th style="padding:9px 12px;text-align:left;border-bottom:2px solid #e2e8f0">Fecha</th>
        <th style="padding:9px 12px;text-align:left;border-bottom:2px solid #e2e8f0">Dia</th>
        <th style="padding:9px 12px;text-align:center;border-bottom:2px solid #e2e8f0">Horas</th>
        <th style="padding:9px 12px;text-align:right;border-bottom:2px solid #e2e8f0">Subtotal</th>
      </tr>
    </thead>
    <tbody>${filas}</tbody>
  </table>
  <table style="width:100%;border-collapse:collapse;margin-top:20px;font-size:13px">
    <tr style="border-top:2px solid #e2e8f0">
      <td colspan="2" style="padding:8px 12px;color:#64748b">Total horas</td>
      <td style="padding:8px 12px;text-align:right;font-weight:600">${totalHorasStr}</td>
    </tr>
    <tr>
      <td colspan="2" style="padding:8px 12px;color:#64748b">Valor hora</td>
      <td style="padding:8px 12px;text-align:right">$ ${fmtARS(vhNum)}</td>
    </tr>
    <tr style="border-top:1px solid #e2e8f0">
      <td colspan="2" style="padding:8px 12px;font-weight:700">Subtotal</td>
      <td style="padding:8px 12px;text-align:right;font-weight:700">$ ${fmtARS(subtotalNum)}</td>
    </tr>
    ${adRows}${descRows}
    <tr style="background:#10b981;color:#fff">
      <td colspan="2" style="padding:10px 12px;font-weight:700;border-radius:0 0 0 8px">Total</td>
      <td style="padding:10px 12px;text-align:right;font-weight:700;font-size:15px;border-radius:0 0 8px 0">$ ${fmtARS(totalFinalNum)}</td>
    </tr>
  </table>
  <p style="font-size:10px;color:#94a3b8;margin-top:24px;text-align:center">BCO HUMAND &bull; ${empNombre} &bull; ${mesNombre} ${y}</p>
</div>
<script>window.onload=function(){window.print()}<\/script>
</body></html>`

    const w = window.open('', '_blank')
    if (w) { w.document.write(html); w.document.close(); w.focus() }
  }

  return (
    <div className="py-4 space-y-4">

      {/* Filtros */}
      <div className="flex flex-wrap gap-2">
        {(isAdmin || canSelectEmp) && (
          <select value={homeEmpId} onChange={e => setHomeEmpId(e.target.value)}
            className="flex-1 min-w-[160px] h-10 px-3 bg-white border border-[var(--border)] rounded-xl text-sm text-[var(--text)] outline-none focus:border-[var(--primary)]"
            style={{ fontSize: 16 }}>
            <option value="">Seleccionar empleado…</option>
            {empList.map(e => <option key={e.id} value={e.id}>{e.nombre}</option>)}
          </select>
        )}
        <input type="month" value={mes} onChange={e => setMes(e.target.value)}
          className="h-10 px-3 bg-white border border-[var(--border)] rounded-xl text-sm text-[var(--text)] outline-none focus:border-[var(--primary)]"
          style={{ fontSize: 16 }} />
      </div>

      {!hasEmp && (
        <div className="text-center py-20 text-[var(--text-muted)] text-sm">
          {(isAdmin || canSelectEmp) ? 'Seleccioná un empleado para ver su asistencia' : 'Sin registros para este mes'}
        </div>
      )}

      {/* Resumen del mes */}
      {hasEmp && (
        <div className="bg-white rounded-2xl border border-[var(--border)] p-4 flex items-center gap-4">
          <div>
            <div className="text-xs text-[var(--text-muted)] mb-0.5">Horas {mesLabel(mes)}</div>
            <div className="text-2xl font-bold text-[var(--text)]">
              {fmtH(horasFichadasReales)}
              {false && homeStats.horasJustificadas > 0 && (
                <span className="text-base font-normal text-[var(--text-muted)] ml-1.5">(+{fmtH(homeStats.horasJustificadas)} justif.)</span>
              )}
            </div>
          </div>
          <div className="ml-auto flex gap-4 text-center">
            <div><div className="text-lg font-bold text-emerald-600">{homeStats.presentes}</div><div className="text-[10px] text-[var(--text-muted)]">Pres.</div></div>
            <div><div className="text-lg font-bold text-amber-600">{homeStats.tardanzas}</div><div className="text-[10px] text-[var(--text-muted)]">Tard.</div></div>
            <div><div className="text-lg font-bold text-red-600">{homeStats.ausencias}</div><div className="text-[10px] text-[var(--text-muted)]">Aus.</div></div>
          </div>
        </div>
      )}

      {/* ── Desktop: tabla ── */}
      {hasEmp && (
        <div className="hidden lg:block bg-white rounded-2xl border border-[var(--border)] overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50 border-b border-[var(--border)]">
                <th className="text-left px-5 py-3 text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wide">Fecha</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wide">Entrada</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wide">Salida</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wide">Horas</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wide">Estado</th>
                <th className="w-12"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border)]">
              {days.map(d => {
                const fecha = padDay(mes, d)
                const rec = dayMap.get(fecha)
                const dowS = getDowShort(mes, d)
                const dowF = getDowFull(mes, d)
                const isSun = dowS === 'Dom'
                const isManual = !!rec?.editado_manual

                if (isSun && !rec) return (
                  <tr key={d} className="bg-gray-50/50">
                    <td colSpan={6} className="px-5 py-2 text-xs text-gray-300">{dowF} {d}</td>
                  </tr>
                )
                if (!rec) return (
                  <tr key={d} className="hover:bg-gray-50/40 transition-colors">
                    <td className="px-5 py-3.5">
                      <div className="text-sm font-semibold text-[var(--text)]">{dowF} {d}</div>
                    </td>
                    <td colSpan={4} className="px-4 py-3.5 text-sm text-gray-300">—</td>
                    <td></td>
                  </tr>
                )
                const chip = CHIP_INFO[rec.estado ?? ''] ?? CHIP_INFO['Ausente']
                return (
                  <tr key={d} className={`hover:bg-gray-50/40 transition-colors ${isManual ? 'bg-violet-50/30' : ''}`}>
                    <td className="px-5 py-3.5">
                      <div className="text-sm font-semibold text-[var(--text)]">{dowF} {d}</div>
                      {(rec.horario_base_entrada || rec.horario_base_salida) && (
                        <div className="text-xs text-gray-400 mt-0.5">Base: {fmtTime(rec.horario_base_entrada)} – {fmtTime(rec.horario_base_salida)}</div>
                      )}
                    </td>
                    <td className="px-4 py-3.5">
                      {rec.fichada_entrada
                        ? <span className="inline-flex px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">{fmtTime(rec.fichada_entrada)}</span>
                        : <span className="text-gray-300 text-sm">—</span>}
                    </td>
                    <td className="px-4 py-3.5">
                      {rec.fichada_salida
                        ? <span className="inline-flex px-2.5 py-1 rounded-full text-xs font-semibold bg-rose-50 text-rose-600 border border-rose-200">{fmtTime(rec.fichada_salida)}</span>
                        : <span className="text-gray-300 text-sm">—</span>}
                    </td>
                    <td className="px-4 py-3.5 text-sm font-medium text-[var(--text)]">
                      {rec.horas_fichadas != null
                        ? fmtH(rec.horas_fichadas)
                        : CHIP_INFO[rec.estado ?? '']?.justificado && horasJustif(rec) > 0
                          ? <span className="text-[var(--text-muted)]">{fmtH(horasJustif(rec))}</span>
                          : '—'}
                    </td>
                    <td className="px-4 py-3.5">
                      <div className="flex items-center gap-2">
                        <span className={`inline-flex px-2.5 py-1 rounded-full text-xs font-semibold ${chip.bg} ${chip.text}`}>{rec.estado}</span>
                        {isManual && <span title="Editado manualmente" className="w-2 h-2 rounded-full bg-violet-400 flex-shrink-0" />}
                      </div>
                    </td>
                    <td className="px-3 py-3.5 text-right">
                      {isAdmin && (
                        <button onClick={() => openEdit(rec)} className="p-1.5 rounded-lg text-gray-300 hover:text-[var(--primary)] hover:bg-[var(--primary)]/5 transition-colors">
                          <IconEdit size={15} />
                        </button>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Mobile: cards ── */}
      {hasEmp && (
        <div className="lg:hidden space-y-1.5">
          {days.map(d => {
            const fecha = padDay(mes, d)
            const rec = dayMap.get(fecha)
            const dowS = getDowShort(mes, d)
            const isSun = dowS === 'Dom'
            const isManual = !!rec?.editado_manual

            if (isSun && !rec) return (
              <div key={d} className="py-1 px-3">
                <span className="text-xs text-gray-300">{d} Dom</span>
              </div>
            )
            if (!rec) return (
              <div key={d} className="flex items-center gap-3 px-3 py-2.5 bg-white rounded-xl border border-[var(--border)]">
                <div className="w-10 flex-shrink-0 text-center">
                  <div className="text-sm font-bold text-[var(--text)]">{d}</div>
                  <div className="text-[10px] text-[var(--text-muted)]">{dowS}</div>
                </div>
                <span className="text-xs text-gray-300">—</span>
              </div>
            )
            const chip = CHIP_INFO[rec.estado ?? ''] ?? CHIP_INFO['Ausente']
            return (
              <div key={d} className={`flex items-center gap-2 px-3 py-2.5 bg-white rounded-xl border ${isManual ? 'border-violet-200' : 'border-[var(--border)]'}`}>
                {/* Columna de fecha — siempre centrada verticalmente */}
                <div className="w-10 flex-shrink-0 text-center">
                  <div className="text-sm font-bold text-[var(--text)]">{d}</div>
                  <div className="text-[10px] text-[var(--text-muted)]">{dowS}</div>
                </div>
                {/* Contenido */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 mb-0.5">
                    <span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold ${chip.bg} ${chip.text}`}>{rec.estado}</span>
                    {isManual && <span className="w-1.5 h-1.5 rounded-full bg-violet-400 flex-shrink-0" />}
                  </div>
                  <div className="flex items-center gap-1.5 text-[11px]">
                    {(rec.horario_base_entrada || rec.horario_base_salida) && (
                      <span className="text-gray-400 shrink-0">Base: {fmtTime(rec.horario_base_entrada)}–{fmtTime(rec.horario_base_salida)}</span>
                    )}
                    <div className="ml-auto flex items-center gap-1.5">
                      <span className={`px-1.5 py-0.5 rounded-full font-medium border min-w-[44px] text-center inline-block ${rec.fichada_entrada ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'invisible'}`}>
                        {fmtTime(rec.fichada_entrada) ?? ''}
                      </span>
                      <span className={`text-gray-300 ${!rec.fichada_entrada && !rec.fichada_salida ? 'invisible' : ''}`}>→</span>
                      <span className={`px-1.5 py-0.5 rounded-full font-medium border min-w-[44px] text-center inline-block ${rec.fichada_salida ? 'bg-rose-50 text-rose-600 border-rose-200' : 'invisible'}`}>
                        {fmtTime(rec.fichada_salida) ?? ''}
                      </span>
                      {rec.horas_fichadas != null
                        ? <span className="font-semibold text-[var(--text)] ml-1">{fmtH(rec.horas_fichadas)}</span>
                        : CHIP_INFO[rec.estado ?? '']?.justificado && horasJustif(rec) > 0
                          ? <span className="font-semibold text-[var(--text-muted)] ml-1">{fmtH(horasJustif(rec))}</span>
                          : null}
                    </div>
                  </div>
                </div>
                {isAdmin && (
                  <button onClick={() => openEdit(rec)} className="flex-shrink-0 p-1.5 rounded-lg text-gray-300 hover:text-[var(--primary)] hover:bg-[var(--primary)]/5 transition-colors">
                    <IconEdit size={14} />
                  </button>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Liquidación PDF */}
      {hasEmp && isAdmin && (
        <div className="bg-white rounded-2xl border border-[var(--border)] p-4 space-y-3">
          <div className="flex items-center gap-2">
            <IconFileText size={16} className="text-[var(--primary)]" />
            <span className="text-sm font-semibold text-[var(--text)]">Liquidación</span>
          </div>

          <div className="flex flex-wrap gap-3 items-end">
            <div>
              <label className="block text-xs text-[var(--text-muted)] mb-1">Valor hora ($)</label>
              <input
                type="text" inputMode="numeric"
                value={valorHora}
                onChange={e => setValorHora(e.target.value)}
                placeholder="7.000"
                className="h-10 px-3 w-36 border border-[var(--border)] rounded-xl text-sm text-[var(--text)] outline-none focus:border-[var(--primary)]"
                style={{ fontSize: 16 }}
              />
            </div>
            <button
              onClick={generarPDF}
              disabled={!valorHora.trim()}
              className="h-10 px-4 rounded-xl text-sm font-medium bg-[var(--primary)] text-white flex items-center gap-1.5 hover:opacity-90 disabled:opacity-40 transition-opacity"
            >
              <IconFileText size={15} /> Generar PDF
            </button>
          </div>

          {/* Adicionales */}
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <span className="text-xs text-[var(--text-muted)]">Adicionales</span>
              {!showAddAd && (
                <button onClick={() => setShowAddAd(true)}
                  className="flex items-center gap-1 text-xs text-emerald-600 hover:opacity-80">
                  <IconPlus size={13} /> Agregar
                </button>
              )}
            </div>

            {adicionales.map(d => (
              <div key={d.id} className="flex items-center gap-2 text-sm">
                <span className="flex-1 text-[var(--text)]">{d.concepto}</span>
                <span className="text-emerald-600 font-medium">+$ {d.monto}</span>
                <button onClick={() => setAdicionales(ds => ds.filter(x => x.id !== d.id))}
                  className="text-gray-400 hover:text-red-500 transition-colors">
                  <IconTrash size={14} />
                </button>
              </div>
            ))}

            {showAddAd && (
              <div className="flex flex-wrap gap-2 items-center pt-1">
                <input
                  type="text" placeholder="Concepto" value={newConceptoAd}
                  onChange={e => setNewConceptoAd(e.target.value)}
                  className="h-9 px-3 flex-1 min-w-[120px] border border-[var(--border)] rounded-xl text-sm outline-none focus:border-[var(--primary)]"
                  style={{ fontSize: 16 }}
                />
                <input
                  type="text" inputMode="numeric" placeholder="$ Monto" value={newMontoAd}
                  onChange={e => setNewMontoAd(e.target.value)}
                  className="h-9 px-3 w-28 border border-[var(--border)] rounded-xl text-sm outline-none focus:border-[var(--primary)]"
                  style={{ fontSize: 16 }}
                />
                <button onClick={addAdicional}
                  className="h-9 px-3 rounded-xl bg-emerald-500 text-white text-sm font-medium hover:opacity-90">
                  <IconPlus size={14} />
                </button>
                <button onClick={() => { setShowAddAd(false); setNewConceptoAd(''); setNewMontoAd('') }}
                  className="h-9 px-2 text-gray-400 hover:text-gray-600">
                  <IconX size={16} />
                </button>
              </div>
            )}
          </div>

          {/* Descuentos */}
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <span className="text-xs text-[var(--text-muted)]">Descuentos</span>
              {!showAddDesc && (
                <button onClick={() => setShowAddDesc(true)}
                  className="flex items-center gap-1 text-xs text-[var(--primary)] hover:opacity-80">
                  <IconPlus size={13} /> Agregar
                </button>
              )}
            </div>

            {descuentos.map(d => (
              <div key={d.id} className="flex items-center gap-2 text-sm">
                <span className="flex-1 text-[var(--text)]">{d.concepto}</span>
                <span className="text-red-600 font-medium">-$ {d.monto}</span>
                <button onClick={() => setDescuentos(ds => ds.filter(x => x.id !== d.id))}
                  className="text-gray-400 hover:text-red-500 transition-colors">
                  <IconTrash size={14} />
                </button>
              </div>
            ))}

            {showAddDesc && (
              <div className="flex flex-wrap gap-2 items-center pt-1">
                <input
                  type="text" placeholder="Concepto" value={newConcepto}
                  onChange={e => setNewConcepto(e.target.value)}
                  className="h-9 px-3 flex-1 min-w-[120px] border border-[var(--border)] rounded-xl text-sm outline-none focus:border-[var(--primary)]"
                  style={{ fontSize: 16 }}
                />
                <input
                  type="text" inputMode="numeric" placeholder="$ Monto" value={newMonto}
                  onChange={e => setNewMonto(e.target.value)}
                  className="h-9 px-3 w-28 border border-[var(--border)] rounded-xl text-sm outline-none focus:border-[var(--primary)]"
                  style={{ fontSize: 16 }}
                />
                <button onClick={addDescuento}
                  className="h-9 px-3 rounded-xl bg-[var(--primary)] text-white text-sm font-medium hover:opacity-90">
                  <IconPlus size={14} />
                </button>
                <button onClick={() => { setShowAddDesc(false); setNewConcepto(''); setNewMonto('') }}
                  className="h-9 px-2 text-gray-400 hover:text-gray-600">
                  <IconX size={16} />
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Modal editar */}
      <Modal open={!!editRec} onClose={() => setEditRec(null)} title={`Editar — ${editRec ? fmtFecha(editRec.fecha) : ''}`}>
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-[var(--text-muted)] mb-1.5">Estado</label>
            <select value={editEstado} onChange={e => setEditEstado(e.target.value)}
              className="w-full h-10 px-3 bg-white border border-[var(--border)] rounded-xl text-sm text-[var(--text)] outline-none focus:border-[var(--primary)]"
              style={{ fontSize: 16 }}>
              {estadoOpts.map(o => <option key={o} value={o}>{o}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-[var(--text-muted)] mb-1.5">Entrada</label>
              <input type="time" value={editEntrada} onChange={e => setEditEntrada(e.target.value)}
                className="w-full h-10 px-3 bg-white border border-[var(--border)] rounded-xl text-sm text-[var(--text)] outline-none focus:border-[var(--primary)]"
                style={{ fontSize: 16 }} />
            </div>
            <div>
              <label className="block text-xs font-medium text-[var(--text-muted)] mb-1.5">Salida</label>
              <input type="time" value={editSalida} onChange={e => setEditSalida(e.target.value)}
                className="w-full h-10 px-3 bg-white border border-[var(--border)] rounded-xl text-sm text-[var(--text)] outline-none focus:border-[var(--primary)]"
                style={{ fontSize: 16 }} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-[var(--text-muted)] mb-1.5">Entrada base</label>
              <input type="time" value={editBaseEntrada} onChange={e => setEditBaseEntrada(e.target.value)}
                className="w-full h-10 px-3 bg-white border border-[var(--border)] rounded-xl text-sm text-[var(--text)] outline-none focus:border-[var(--primary)]"
                style={{ fontSize: 16 }} />
            </div>
            <div>
              <label className="block text-xs font-medium text-[var(--text-muted)] mb-1.5">Salida base</label>
              <input type="time" value={editBaseSalida} onChange={e => setEditBaseSalida(e.target.value)}
                className="w-full h-10 px-3 bg-white border border-[var(--border)] rounded-xl text-sm text-[var(--text)] outline-none focus:border-[var(--primary)]"
                style={{ fontSize: 16 }} />
            </div>
          </div>
          {editHoras !== null && (
            <div className="text-xs text-[var(--text-muted)] bg-gray-50 rounded-lg px-3 py-2">
              Horas calculadas: <strong className="text-[var(--text)]">{fmtH(editHoras)}</strong>
            </div>
          )}
          <p className="text-xs text-violet-600 bg-violet-50 rounded-lg px-3 py-2">
            Este registro quedará bloqueado y no se sobreescribirá al regenerar.
          </p>
          <div className="flex gap-2 justify-end pt-1">
            <button onClick={() => setEditRec(null)}
              className="h-9 px-4 rounded-xl text-sm font-medium text-[var(--text-muted)] hover:bg-gray-100 transition-colors">
              Cancelar
            </button>
            <button onClick={saveEdit} disabled={saving}
              className="h-9 px-4 rounded-xl text-sm font-medium bg-[var(--primary)] text-white hover:opacity-90 disabled:opacity-50 transition-opacity">
              {saving ? 'Guardando…' : 'Guardar'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  )
}

// ─── Tab: Todos ───────────────────────────────────────────────────────────────

function TodosTab({ todosDate, setTodosDate, todosData, maxDate, canEdit, onRecordEdited }: {
  todosDate: string
  setTodosDate: (d: string) => void
  todosData: { emp: Empleado; rec: AsistenciaProcesada | null; turno: PrimerTurnoDia | null }[]
  maxDate: string
  canEdit: boolean
  onRecordEdited: () => void
}) {
  const [filterEquipo, setFilterEquipo] = useState('')
  const [filterEstado, setFilterEstado] = useState('')

  // ── edit state ────────────────────────────────────────────────────────────
  const [editRec, setEditRec]               = useState<AsistenciaProcesada | null>(null)
  const [editEmpNombre, setEditEmpNombre]   = useState('')
  const [editEstado, setEditEstado]         = useState('')
  const [editEntrada, setEditEntrada]       = useState('')
  const [editSalida, setEditSalida]         = useState('')
  const [editBaseEntrada, setEditBaseEntrada] = useState('')
  const [editBaseSalida, setEditBaseSalida] = useState('')
  const [saving, setSaving]                 = useState(false)

  function openEdit(rec: AsistenciaProcesada, empNombre: string) {
    setEditRec(rec)
    setEditEmpNombre(empNombre)
    setEditEstado(rec.estado ?? 'Asistió')
    setEditBaseEntrada(rec.horario_base_entrada?.substring(0, 5) ?? '')
    setEditBaseSalida(rec.horario_base_salida?.substring(0, 5) ?? '')
    setEditEntrada(rec.fichada_entrada?.substring(0, 5) ?? '')
    setEditSalida(rec.fichada_salida?.substring(0, 5) ?? '')
  }

  async function saveEdit() {
    if (!editRec) return
    setSaving(true)
    const horas = editEntrada && editSalida
      ? parseFloat(((toMinutes(editSalida) - toMinutes(editEntrada)) / 60).toFixed(2))
      : null
    const res = await fetch('/api/asistencia/editar', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        usuario_id: editRec.usuario_id,
        fecha: editRec.fecha,
        estado: editEstado,
        fichada_entrada: editEntrada || null,
        fichada_salida: editSalida || null,
        horas_fichadas: horas,
        horario_base_entrada: editBaseEntrada || null,
        horario_base_salida: editBaseSalida || null,
        horas_base: editBaseEntrada && editBaseSalida
          ? parseFloat(((toMinutes(editBaseSalida) - toMinutes(editBaseEntrada)) / 60).toFixed(2))
          : null,
      }),
    })
    const data = await res.json()
    setSaving(false)
    if (!data.error) { setEditRec(null); onRecordEdited() }
  }

  const estadoOpts = Object.keys(CHIP_INFO)
  const editHoras = editEntrada && editSalida
    ? parseFloat(((toMinutes(editSalida) - toMinutes(editEntrada)) / 60).toFixed(2))
    : null

  // ── helpers ───────────────────────────────────────────────────────────────
  function prevDay() {
    const d = new Date(todosDate + 'T00:00:00'); d.setDate(d.getDate() - 1)
    setTodosDate(d.toISOString().split('T')[0])
  }
  function nextDay() {
    const d = new Date(todosDate + 'T00:00:00'); d.setDate(d.getDate() + 1)
    const next = d.toISOString().split('T')[0]
    if (next <= maxDate) setTodosDate(next)
  }

  function getBase(rec: AsistenciaProcesada | null) {
    if (rec?.horario_base_entrada) return { entrada: rec.horario_base_entrada, salida: rec.horario_base_salida }
    return null
  }

  // ── memos ─────────────────────────────────────────────────────────────────
  const filteredByEquipo = useMemo(() =>
    filterEquipo ? todosData.filter(({ emp }) => String(emp.equipo?.id) === filterEquipo) : todosData
  , [filterEquipo, todosData])

  const stateCounts = useMemo(() => {
    const map = new Map<string, number>()
    let sinDatos = 0
    for (const { rec } of filteredByEquipo) {
      if (!rec?.estado) { sinDatos++; continue }
      map.set(rec.estado, (map.get(rec.estado) ?? 0) + 1)
    }
    return { byState: map, sinDatos }
  }, [filteredByEquipo])

  const equipos = useMemo(() => {
    const map = new Map<number, string>()
    for (const { emp } of todosData) if (emp.equipo) map.set(emp.equipo.id, emp.equipo.nombre)
    return [...map.entries()].sort(([, a], [, b]) => a.localeCompare(b, 'es'))
  }, [todosData])

  const filtered = useMemo(() =>
    filterEstado
      ? filteredByEquipo.filter(({ rec }) =>
          filterEstado === '__sin_datos__' ? !rec?.estado : rec?.estado === filterEstado
        )
      : filteredByEquipo
  , [filteredByEquipo, filterEstado])

  const grouped = useMemo(() => {
    const ROL_ORD: Record<string, number> = {
      manicura: 0, manicuras: 0,
      masaje: 1, masajista: 1, masajistas: 1,
      peluquer: 2,
      recepcion: 3, recepcionista: 3,
      limpieza: 4,
      admin: 99, administrador: 99,
    }
    const prio = (n: string) => { const l = n.toLowerCase(); for (const [k, v] of Object.entries(ROL_ORD)) if (l.includes(k)) return v; return 50 }
    const map = new Map<string, typeof filtered>()
    for (const item of filtered) {
      const key = item.emp.equipo?.nombre ?? 'Sin equipo'
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(item)
    }
    return [...map.entries()].sort(([a], [b]) => prio(a) - prio(b) || a.localeCompare(b, 'es'))
  }, [filtered])

  const canGoNext = todosDate < maxDate

  return (
    <div className="py-4 space-y-4">

      {/* Navegación de fecha */}
      <div className="flex items-center gap-2">
        <button onClick={prevDay}
          className="w-9 h-9 flex items-center justify-center rounded-xl border border-[var(--border)] bg-white hover:bg-gray-50 cursor-pointer flex-shrink-0">
          <IconChevronLeft size={16} className="text-[var(--text-sub)]" />
        </button>
        <label className="flex-1 relative cursor-pointer">
          <span className="flex h-9 items-center justify-center rounded-xl border border-[var(--border)] bg-white px-3 text-sm font-medium text-[var(--text)] select-none">
            {(() => {
              const [y, m, d] = todosDate.split('-').map(Number)
              const dia = ['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'][new Date(y, m - 1, d).getDay()]
              const mes = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'][m - 1]
              return `${dia} ${d} de ${mes}`
            })()}
          </span>
          <input type="date" value={todosDate} max={maxDate}
            onChange={e => setTodosDate(e.target.value)}
            className="absolute inset-0 opacity-0 w-full h-full cursor-pointer"
            style={{ fontSize: 16 }} />
        </label>
        <button onClick={nextDay} disabled={!canGoNext}
          className="w-9 h-9 flex items-center justify-center rounded-xl border border-[var(--border)] bg-white hover:bg-gray-50 disabled:opacity-40 cursor-pointer flex-shrink-0">
          <IconChevronRight size={16} className="text-[var(--text-sub)]" />
        </button>
      </div>

      {/* Barra resumen — badges por estado, clickables para filtrar */}
      {todosData.length > 0 && (
        <div className="flex gap-1.5 flex-wrap">
          {Object.entries(CHIP_INFO).map(([estado, chip]) => {
            const count = stateCounts.byState.get(estado)
            if (!count) return null
            const active = filterEstado === estado
            return (
              <button key={estado}
                onClick={() => setFilterEstado(active ? '' : estado)}
                className={`px-2 py-0.5 rounded-full text-[10px] font-semibold cursor-pointer transition-all border-2 ${
                  active
                    ? `${chip.bg} ${chip.text} border-current`
                    : `${chip.bg} ${chip.text} border-transparent opacity-75 hover:opacity-100`
                }`}>
                {count} {estado}
              </button>
            )
          })}
          {stateCounts.sinDatos > 0 && (() => {
            const active = filterEstado === '__sin_datos__'
            return (
              <button onClick={() => setFilterEstado(active ? '' : '__sin_datos__')}
                className={`px-2 py-0.5 rounded-full text-[10px] font-semibold cursor-pointer transition-all border-2 ${
                  active ? 'bg-gray-200 text-gray-600 border-gray-400' : 'bg-gray-100 text-gray-400 border-transparent hover:opacity-100'
                }`}>
                {stateCounts.sinDatos} sin datos
              </button>
            )
          })()}
          {filterEstado && (
            <button onClick={() => setFilterEstado('')}
              className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-white text-gray-500 border-2 border-gray-300 cursor-pointer hover:bg-gray-50">
              ✕ todos
            </button>
          )}
        </div>
      )}

      {/* Filtro por equipo */}
      {equipos.length > 1 && (
        <div className="flex gap-2 overflow-x-auto pb-1" style={{ scrollbarWidth: 'none' }}>
          <button onClick={() => setFilterEquipo('')}
            className={`px-3 py-1.5 rounded-xl text-[12px] font-semibold shrink-0 transition-all cursor-pointer ${
              filterEquipo === '' ? 'bg-gray-700 text-white' : 'bg-white text-gray-500 border border-gray-200 hover:border-gray-300'
            }`}>Todos</button>
          {equipos.map(([id, nombre]) => (
            <button key={id} onClick={() => setFilterEquipo(filterEquipo === String(id) ? '' : String(id))}
              className={`px-3 py-1.5 rounded-xl text-[12px] font-semibold shrink-0 transition-all cursor-pointer ${
                filterEquipo === String(id) ? 'bg-[var(--primary)] text-white' : 'bg-white text-gray-500 border border-gray-200 hover:border-gray-300'
              }`}>{nombre}</button>
          ))}
        </div>
      )}

      {/* Cards agrupadas (mobile y desktop comparten el mismo layout) */}
      <div className="space-y-5">
        {grouped.map(([equipo, items]) => (
          <div key={equipo}>
            {!filterEquipo && (
              <p className="text-[10px] font-bold uppercase tracking-widest text-[var(--text-sub)] mb-2 px-1">{equipo}</p>
            )}
            <div className="space-y-2">
              {items.map(({ emp, rec }) => {
                const chip = rec?.estado ? (CHIP_INFO[rec.estado] ?? CHIP_INFO['Ausente']) : null
                const base = getBase(rec)

                return (
                  <div key={emp.id} className="bg-white rounded-xl border border-[var(--border)] px-3 py-3">
                    {/* Fila superior: nombre + chip + edit */}
                    <div className="flex items-center gap-2 mb-1.5">
                      <span className="text-[13px] font-semibold text-[var(--text)] flex-1 truncate">{emp.nombre}</span>
                      {chip
                        ? <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold shrink-0 ${chip.bg} ${chip.text}`}>{rec!.estado}</span>
                        : <span className="text-[10px] text-gray-300 shrink-0">Sin datos</span>}
                      {canEdit && rec && (
                        <button onClick={() => openEdit(rec, emp.nombre)}
                          className="text-gray-400 hover:text-[var(--primary)] transition-colors cursor-pointer shrink-0 ml-1">
                          <IconEdit size={14} />
                        </button>
                      )}
                    </div>
                    {/* Fila base */}
                    {base && (
                      <p className="text-[11px] mb-1.5 text-gray-400">
                        Base: {fmtTime(base.entrada)}–{fmtTime(base.salida)}
                      </p>
                    )}
                    {/* Fila fichadas + horas */}
                    <div className="flex items-center gap-1.5 text-[11px]">
                      {rec?.fichada_entrada
                        ? <span className="px-1.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 font-medium border border-emerald-200">{fmtTime(rec.fichada_entrada)}</span>
                        : <span className="text-gray-300">—</span>}
                      {(rec?.fichada_entrada || rec?.fichada_salida) && <span className="text-gray-300">→</span>}
                      {rec?.fichada_salida
                        ? <span className="px-1.5 py-0.5 rounded-full bg-rose-50 text-rose-600 font-medium border border-rose-200">{fmtTime(rec.fichada_salida)}</span>
                        : rec?.fichada_entrada ? <span className="text-gray-300">—</span> : null}
                      {rec?.horas_fichadas != null && (
                        <span className="font-semibold text-[var(--text)] ml-1">{fmtH(rec.horas_fichadas)}</span>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        ))}
        {filtered.length === 0 && (
          <p className="text-center text-sm text-gray-400 py-10">Sin empleados para este día</p>
        )}
      </div>

      {/* Modal editar */}
      <Modal open={!!editRec} onClose={() => setEditRec(null)}
        title={`Editar — ${editEmpNombre}${editRec ? ' · ' + fmtFecha(editRec.fecha) : ''}`}>
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-[var(--text-muted)] mb-1.5">Estado</label>
            <select value={editEstado} onChange={e => setEditEstado(e.target.value)}
              className="w-full h-10 px-3 bg-white border border-[var(--border)] rounded-xl text-sm text-[var(--text)] outline-none focus:border-[var(--primary)]"
              style={{ fontSize: 16 }}>
              {estadoOpts.map(o => <option key={o} value={o}>{o}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-[var(--text-muted)] mb-1.5">Entrada</label>
              <input type="time" value={editEntrada} onChange={e => setEditEntrada(e.target.value)}
                className="w-full h-10 px-3 bg-white border border-[var(--border)] rounded-xl text-sm text-[var(--text)] outline-none focus:border-[var(--primary)]"
                style={{ fontSize: 16 }} />
            </div>
            <div>
              <label className="block text-xs font-medium text-[var(--text-muted)] mb-1.5">Salida</label>
              <input type="time" value={editSalida} onChange={e => setEditSalida(e.target.value)}
                className="w-full h-10 px-3 bg-white border border-[var(--border)] rounded-xl text-sm text-[var(--text)] outline-none focus:border-[var(--primary)]"
                style={{ fontSize: 16 }} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-[var(--text-muted)] mb-1.5">Entrada base</label>
              <input type="time" value={editBaseEntrada} onChange={e => setEditBaseEntrada(e.target.value)}
                className="w-full h-10 px-3 bg-white border border-[var(--border)] rounded-xl text-sm text-[var(--text)] outline-none focus:border-[var(--primary)]"
                style={{ fontSize: 16 }} />
            </div>
            <div>
              <label className="block text-xs font-medium text-[var(--text-muted)] mb-1.5">Salida base</label>
              <input type="time" value={editBaseSalida} onChange={e => setEditBaseSalida(e.target.value)}
                className="w-full h-10 px-3 bg-white border border-[var(--border)] rounded-xl text-sm text-[var(--text)] outline-none focus:border-[var(--primary)]"
                style={{ fontSize: 16 }} />
            </div>
          </div>
          {editHoras !== null && (
            <div className="text-xs text-[var(--text-muted)] bg-gray-50 rounded-lg px-3 py-2">
              Horas calculadas: <strong className="text-[var(--text)]">{fmtH(editHoras)}</strong>
            </div>
          )}
          <p className="text-xs text-violet-600 bg-violet-50 rounded-lg px-3 py-2">
            Este registro quedará bloqueado y no se sobreescribirá al regenerar.
          </p>
          <div className="flex gap-2 justify-end pt-1">
            <button onClick={() => setEditRec(null)}
              className="h-9 px-4 rounded-xl text-sm font-medium text-[var(--text-muted)] hover:bg-gray-100 transition-colors cursor-pointer">
              Cancelar
            </button>
            <button onClick={saveEdit} disabled={saving}
              className="h-9 px-4 rounded-xl text-sm font-medium bg-[var(--primary)] text-white hover:opacity-90 disabled:opacity-50 transition-opacity cursor-pointer">
              {saving ? 'Guardando…' : 'Guardar'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  )
}

// ─── Tab: Presentismo ─────────────────────────────────────────────────────────

function PresentismoTab({ mes, setMes, isAdmin, statsPerEmp, homeStats, config, weekData, weekEmp, weekEmpId, setWeekEmpId, homeRecords }: {
  mes: string; setMes: (m: string) => void; isAdmin: boolean
  statsPerEmp: { emp: Empleado; stats: ReturnType<typeof calcPresentismo> }[]
  homeStats: ReturnType<typeof calcPresentismo>
  config: AsistenciaConfig
  weekData: { semana: number; stats: ReturnType<typeof calcPresentismo>; de: string; hasta: string }[]
  weekEmp: Empleado | null
  weekEmpId: string | null
  setWeekEmpId: (id: string | null) => void
  homeRecords: AsistenciaProcesada[]
}) {
  const estadoLabel: Record<string, { label: string; cls: string }> = {
    ok:         { label: 'Cumple',     cls: 'text-emerald-600' },
    bajo:       { label: 'Bajo',       cls: 'text-amber-600'   },
    no_cumple:  { label: 'No cumple',  cls: 'text-red-600'     },
    penalizado: { label: 'Penalizado', cls: 'text-red-700 font-bold' },
  }

  function PctBar({ pct }: { pct: number | null }) {
    if (pct == null) return <span className="text-[var(--text-muted)]">—</span>
    const cls = pct >= 100 ? 'text-emerald-600' : pct >= 85 ? 'text-amber-600' : 'text-red-600'
    return <span className={`font-bold ${cls}`}>{pct}%</span>
  }

  // Weekly breakdown in employee view
  const empWeekData = useMemo(() => {
    const byWeek = new Map<number, { records: typeof homeRecords; semana: number }>()
    for (const r of homeRecords) {
      if (r.semana == null) continue
      if (!byWeek.has(r.semana)) byWeek.set(r.semana, { records: [], semana: r.semana })
      byWeek.get(r.semana)!.records.push(r)
    }
    return Array.from(byWeek.values()).sort((a, b) => a.semana - b.semana).map(({ semana, records: wr }) => {
      const stats = calcPresentismo(wr as Parameters<typeof calcPresentismo>[0], config, wr.length)
      const fechas = wr.map(r => r.fecha).sort()
      return { semana, stats, de: fechas[0], hasta: fechas[fechas.length - 1] }
    })
  }, [homeRecords, config])

  return (
    <div className="py-4 space-y-4">
      <div className="flex items-center gap-2">
        <input
          type="month"
          value={mes}
          onChange={e => setMes(e.target.value)}
          className="h-10 px-3 bg-white border border-[var(--border)] rounded-xl text-sm text-[var(--text)] outline-none focus:border-[var(--primary)]"
          style={{ fontSize: 16 }}
        />
        <span className="text-sm text-[var(--text-muted)]">Mín. {fmtH(statsPerEmp[0]?.stats.minimoMensual ?? homeStats.minimoMensual)}</span>
      </div>

      {isAdmin ? (
        // Admin: tabla de todos
        <div className="bg-white rounded-xl border border-[var(--border)] overflow-x-auto">
          <table className="w-full text-sm min-w-[640px]">
            <thead>
              <tr className="border-b border-[var(--border)] bg-gray-50">
                <th className="text-left px-4 py-3 font-semibold text-[var(--text)]">Empleado</th>
                <th className="text-center px-3 py-3 font-semibold text-[var(--text-sub)]">Mínimo</th>
                <th className="text-center px-3 py-3 font-semibold text-[var(--text-sub)]">Reales</th>
                <th className="text-center px-3 py-3 font-semibold text-[var(--text-sub)]">(+Justif)</th>
                <th className="text-center px-3 py-3 font-semibold text-[var(--text-sub)]">Dif</th>
                <th className="text-center px-3 py-3 font-semibold text-[var(--text)]">%</th>
                <th className="text-center px-3 py-3 font-semibold text-[var(--text-sub)]">Estado</th>
                <th className="px-3 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {statsPerEmp.map(({ emp, stats }, idx) => {
                const total = stats.horasReales + stats.horasJustificadas
                const dif = parseFloat((total - stats.minimoMensual).toFixed(1))
                const ei = estadoLabel[stats.estado]
                return (
                  <tr key={emp.id} className={`border-b border-[var(--border)] ${idx % 2 === 0 ? '' : 'bg-gray-50/40'}`}>
                    <td className="px-4 py-2.5 font-medium text-[var(--text)]">{emp.nombre}</td>
                    <td className="px-3 py-2.5 text-center text-[var(--text-sub)]">{fmtH(stats.minimoMensual)}</td>
                    <td className="px-3 py-2.5 text-center font-medium text-emerald-600">{fmtH(stats.horasReales)}</td>
                    <td className="px-3 py-2.5 text-center text-[var(--text-muted)]">{fmtH(stats.horasJustificadas)}</td>
                    <td className={`px-3 py-2.5 text-center font-medium ${dif >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                      {dif >= 0 ? '+' : ''}{fmtH(dif)}
                    </td>
                    <td className="px-3 py-2.5 text-center"><PctBar pct={stats.pct} /></td>
                    <td className={`px-3 py-2.5 text-center text-xs ${ei.cls}`}>{ei.label}</td>
                    <td className="px-3 py-2.5">
                      <button
                        onClick={() => setWeekEmpId(emp.id)}
                        className="text-xs text-[var(--primary)] hover:underline flex items-center gap-0.5"
                      >
                        Semanas <IconChevronRight size={12} />
                      </button>
                    </td>
                  </tr>
                )
              })}
              {statsPerEmp.length === 0 && (
                <tr><td colSpan={8} className="text-center py-10 text-[var(--text-muted)] text-sm">Sin datos para {mesLabel(mes)}</td></tr>
              )}
            </tbody>
          </table>
        </div>
      ) : (
        // Employee: resumen propio + semanas
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
            {[
              { label: 'Mínimo req.', val: fmtH(homeStats.minimoMensual), cls: 'text-[var(--text)]' },
              { label: 'Horas reales', val: fmtH(homeStats.horasReales), cls: 'text-emerald-600' },
              { label: 'Justificadas', val: fmtH(homeStats.horasJustificadas), cls: 'text-blue-600' },
              { label: 'Tardanzas', val: homeStats.tardanzas, cls: 'text-amber-600' },
              { label: 'Ausencias', val: homeStats.ausencias, cls: 'text-red-600' },
              { label: 'Presentismo', val: homeStats.pct != null ? `${homeStats.pct}%` : '—', cls: homeStats.pct == null ? 'text-[var(--text-muted)]' : homeStats.pct >= 100 ? 'text-emerald-600' : homeStats.pct >= 85 ? 'text-amber-600' : 'text-red-600' },
            ].map(({ label, val, cls }) => (
              <div key={label} className="bg-white rounded-xl border border-[var(--border)] p-3 text-center">
                <div className={`text-xl font-bold ${cls}`}>{val}</div>
                <div className="text-[11px] text-[var(--text-muted)] mt-0.5">{label}</div>
              </div>
            ))}
          </div>

          <div className="bg-white rounded-xl border border-[var(--border)] overflow-hidden">
            <div className="px-4 py-3 border-b border-[var(--border)]">
              <h3 className="text-sm font-semibold text-[var(--text)]">Desglose semanal</h3>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--border)] bg-gray-50">
                  <th className="text-left px-4 py-2 text-xs font-semibold text-[var(--text-sub)]">Sem.</th>
                  <th className="text-left px-3 py-2 text-xs font-semibold text-[var(--text-sub)]">Rango</th>
                  <th className="text-center px-3 py-2 text-xs font-semibold text-[var(--text-sub)]">Reales</th>
                  <th className="text-center px-3 py-2 text-xs font-semibold text-[var(--text-sub)]">(+Justif)</th>
                  <th className="text-center px-3 py-2 text-xs font-semibold text-[var(--text)]">%</th>
                </tr>
              </thead>
              <tbody>
                {empWeekData.map(({ semana, stats, de, hasta }) => {
                  const total = stats.horasReales + stats.horasJustificadas
                  const pct = config.minimoSemanal > 0 ? Math.round((total / config.minimoSemanal) * 100) : null
                  return (
                    <tr key={semana} className="border-b border-[var(--border)]">
                      <td className="px-4 py-2 text-[var(--text-muted)]">S{semana}</td>
                      <td className="px-3 py-2 text-xs text-[var(--text-sub)]">{fmtFecha(de)} – {fmtFecha(hasta)}</td>
                      <td className="px-3 py-2 text-center text-emerald-600 font-medium">{fmtH(stats.horasReales)}</td>
                      <td className="px-3 py-2 text-center text-[var(--text-muted)]">{fmtH(stats.horasJustificadas)}</td>
                      <td className="px-3 py-2 text-center">
                        {pct != null ? <span className={`font-bold ${pct >= 100 ? 'text-emerald-600' : pct >= 85 ? 'text-amber-600' : 'text-red-600'}`}>{pct}%</span> : '—'}
                      </td>
                    </tr>
                  )
                })}
                {empWeekData.length === 0 && (
                  <tr><td colSpan={5} className="text-center py-8 text-[var(--text-muted)] text-sm">Sin datos para {mesLabel(mes)}</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modal semanas (admin) */}
      {weekEmpId && weekEmp && (
        <Modal open={!!weekEmpId} onClose={() => setWeekEmpId(null)} title={`Semanas — ${weekEmp.nombre}`}>
          <div className="space-y-3 p-1">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[var(--border)] bg-gray-50">
                    <th className="text-left px-3 py-2 text-xs font-semibold text-[var(--text-sub)]">Sem.</th>
                    <th className="text-left px-3 py-2 text-xs font-semibold text-[var(--text-sub)]">Rango</th>
                    <th className="text-center px-3 py-2 text-xs font-semibold text-[var(--text-sub)]">Reales</th>
                    <th className="text-center px-3 py-2 text-xs font-semibold text-[var(--text-sub)]">(+Justif)</th>
                    <th className="text-center px-3 py-2 text-xs font-semibold text-[var(--text-sub)]">Mín.</th>
                    <th className="text-center px-3 py-2 text-xs font-semibold text-[var(--text)]">%</th>
                  </tr>
                </thead>
                <tbody>
                  {weekData.map(({ semana, stats, de, hasta }) => {
                    const total = stats.horasReales + stats.horasJustificadas
                    const pct = config.minimoSemanal > 0 ? Math.round((total / config.minimoSemanal) * 100) : null
                    return (
                      <tr key={semana} className="border-b border-[var(--border)]">
                        <td className="px-3 py-2 text-[var(--text-muted)]">S{semana}</td>
                        <td className="px-3 py-2 text-xs text-[var(--text-sub)]">{fmtFecha(de)} – {fmtFecha(hasta)}</td>
                        <td className="px-3 py-2 text-center text-emerald-600 font-medium">{fmtH(stats.horasReales)}</td>
                        <td className="px-3 py-2 text-center text-[var(--text-muted)]">{fmtH(stats.horasJustificadas)}</td>
                        <td className="px-3 py-2 text-center text-[var(--text-sub)]">{fmtH(config.minimoSemanal)}</td>
                        <td className="px-3 py-2 text-center">
                          {pct != null ? <span className={`font-bold ${pct >= 100 ? 'text-emerald-600' : pct >= 85 ? 'text-amber-600' : 'text-red-600'}`}>{pct}%</span> : '—'}
                        </td>
                      </tr>
                    )
                  })}
                  {weekData.length === 0 && (
                    <tr><td colSpan={6} className="text-center py-8 text-[var(--text-muted)] text-sm">Sin datos</td></tr>
                  )}
                </tbody>
              </table>
            </div>
            {/* Incidencias */}
            {(weekEmp) && (() => {
              const empRecs = weekData.flatMap(w => [])  // placeholder — incidencias vienen de records principales
              const lts = weekData.reduce((s, w) => s + w.stats.llegadasTardeCount, 0)
              const aus = weekData.reduce((s, w) => s + w.stats.ausenciasInjustificadasCount, 0)
              return (lts > 0 || aus > 0) ? (
                <div className="text-sm space-y-1 pt-2 border-t border-[var(--border)]">
                  <div className="font-semibold text-[var(--text)] mb-2">Incidencias del mes</div>
                  {lts > 0 && (
                    <div className={`flex items-center gap-2 ${lts > config.maxLlegadasTarde ? 'text-red-600' : 'text-amber-600'}`}>
                      <span className="font-medium">{lts} llegada{lts !== 1 ? 's' : ''} tarde</span>
                      <span className="text-xs">({lts > config.maxLlegadasTarde ? 'penaliza' : `límite ${config.maxLlegadasTarde}`})</span>
                    </div>
                  )}
                  {aus > 0 && (
                    <div className={`flex items-center gap-2 ${aus >= config.maxAusenciasInjustificadas ? 'text-red-600' : 'text-[var(--text-sub)]'}`}>
                      <span className="font-medium">{aus} ausencia{aus !== 1 ? 's' : ''} injustificada{aus !== 1 ? 's' : ''}</span>
                      <span className="text-xs">({aus >= config.maxAusenciasInjustificadas ? 'penaliza' : `límite ${config.maxAusenciasInjustificadas}`})</span>
                    </div>
                  )}
                </div>
              ) : null
            })()}
          </div>
        </Modal>
      )}
    </div>
  )
}

// ─── Tab: Ajustes ─────────────────────────────────────────────────────────────

function AjustesTab({ configDraft, setConfigDraft, saveConfig, savingCfg, empList }: {
  configDraft: AsistenciaConfig
  setConfigDraft: (c: AsistenciaConfig) => void
  saveConfig: () => void
  savingCfg: boolean
  empList: Empleado[]
}) {
  function setField<K extends keyof AsistenciaConfig>(key: K, val: AsistenciaConfig[K]) {
    setConfigDraft({ ...configDraft, [key]: val })
  }

  function InputNum({ label, field, unit }: { label: string; field: keyof AsistenciaConfig; unit?: string }) {
    return (
      <div>
        <label className="block text-xs font-medium text-[var(--text-sub)] mb-1">{label}</label>
        <div className="flex items-center gap-2">
          <input
            type="text"
            inputMode="numeric"
            value={configDraft[field] as number}
            onChange={e => setField(field, Number(e.target.value.replace(/\D/g, '')) as AsistenciaConfig[typeof field])}
            className="w-24 h-10 px-3 bg-white border border-[var(--border)] rounded-xl text-sm text-[var(--text)] outline-none focus:border-[var(--primary)]"
            style={{ fontSize: 16 }}
          />
          {unit && <span className="text-xs text-[var(--text-muted)]">{unit}</span>}
        </div>
      </div>
    )
  }

  function InputCsv({ label, field, hint }: { label: string; field: 'equiposPorTurnos' | 'equiposHorarioEstricto'; hint?: string }) {
    return (
      <div>
        <label className="block text-xs font-medium text-[var(--text-sub)] mb-1">{label}</label>
        {hint && <div className="text-[11px] text-[var(--text-muted)] mb-1">{hint}</div>}
        <input
          type="text"
          value={(configDraft[field] as string[]).join(', ')}
          onChange={e => setField(field, e.target.value.split(',').map(s => s.trim()).filter(Boolean) as AsistenciaConfig[typeof field])}
          className="w-full h-10 px-3 bg-white border border-[var(--border)] rounded-xl text-sm text-[var(--text)] outline-none focus:border-[var(--primary)]"
          style={{ fontSize: 16 }}
        />
      </div>
    )
  }

  return (
    <div className="px-4 lg:px-6 py-4 space-y-6 max-w-xl mx-auto">
      <div className="bg-white rounded-2xl border border-[var(--border)] p-4 space-y-5">
        <h2 className="text-sm font-semibold text-[var(--text)]">Tolerancias</h2>
        <div className="grid grid-cols-2 gap-4">
          <InputNum label="Tolerancia entrada" field="toleranciaEntrada" unit="min" />
          <InputNum label="Tolerancia salida" field="toleranciaSalida" unit="min" />
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-[var(--border)] p-4 space-y-5">
        <h2 className="text-sm font-semibold text-[var(--text)]">Penalizaciones</h2>
        <div className="grid grid-cols-2 gap-4">
          <InputNum label="Máx. llegadas tarde" field="maxLlegadasTarde" unit="por mes" />
          <InputNum label="Máx. ausencias injust." field="maxAusenciasInjustificadas" />
        </div>
        <InputNum label="Mínimo semanal" field="minimoSemanal" unit="horas" />
      </div>

      <div className="bg-white rounded-2xl border border-[var(--border)] p-4 space-y-5">
        <h2 className="text-sm font-semibold text-[var(--text)]">Categorías de equipos</h2>
        <InputCsv
          label="Equipos por turnos (sin salida temprana)"
          field="equiposPorTurnos"
          hint="Masajistas, depiladoras. Separar con coma."
        />
        <InputCsv
          label="Equipos horario estricto"
          field="equiposHorarioEstricto"
          hint="Peluqueras. Separar con coma."
        />
      </div>

      <div className="bg-white rounded-2xl border border-[var(--border)] p-4 space-y-3">
        <h2 className="text-sm font-semibold text-[var(--text)]">Empleados en presentismo</h2>
        <p className="text-xs text-[var(--text-muted)]">Sin selección = todas las activas participan.</p>
        <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
          {empList.map(e => (
            <label key={e.id} className="flex items-center gap-2.5 cursor-pointer">
              <input
                type="checkbox"
                checked={configDraft.empleadosPresentismo.length === 0 || configDraft.empleadosPresentismo.includes(e.email)}
                onChange={ev => {
                  const cur = configDraft.empleadosPresentismo
                  if (cur.length === 0) {
                    // pasar de "todas" a lista explícita sin esta
                    if (!ev.target.checked) {
                      setField('empleadosPresentismo', empList.map(x => x.email).filter(email => email !== e.email))
                    }
                  } else {
                    const next = ev.target.checked
                      ? [...cur, e.email]
                      : cur.filter(x => x !== e.email)
                    // Si quedan todas, volver a lista vacía
                    setField('empleadosPresentismo', next.length === empList.length ? [] : next)
                  }
                }}
                className="w-4 h-4 rounded accent-[var(--primary)]"
              />
              <span className="text-sm text-[var(--text)]">{e.nombre}</span>
              {e.equipo && <span className="text-xs text-[var(--text-muted)]">· {e.equipo.nombre}</span>}
            </label>
          ))}
        </div>
      </div>

      <Button onClick={saveConfig} loading={savingCfg} className="w-full">
        Guardar configuración
      </Button>
    </div>
  )
}

// ─── CSV helpers ──────────────────────────────────────────────────────────────

function readFileText(file: File, encoding = 'UTF-8'): Promise<string> {
  return new Promise((res, rej) => {
    const reader = new FileReader()
    reader.onload = e => res(e.target?.result as string ?? '')
    reader.onerror = rej
    reader.readAsText(file, encoding)
  })
}

function csvLine(line: string, sep = ','): string[] {
  const out: string[] = []
  let inQ = false, cur = ''
  for (let i = 0; i < line.length; i++) {
    const c = line[i]
    if (c === '"') {
      if (inQ && line[i + 1] === '"') { cur += '"'; i++ }
      else inQ = !inQ
    } else if (c === sep && !inQ) { out.push(cur.trim()); cur = '' }
    else cur += c
  }
  out.push(cur.trim())
  return out
}

function csvParse(text: string, sep = ','): string[][] {
  return text.replace(/\r\n/g, '\n').split('\n').filter(l => l.trim()).map(l => csvLine(l, sep))
}

const MON_EN: Record<string, string> = {
  Jan: '01', Feb: '02', Mar: '03', Apr: '04', May: '05', Jun: '06',
  Jul: '07', Aug: '08', Sep: '09', Oct: '10', Nov: '11', Dec: '12',
}

function freshaDate(s: string): string {
  const m = s.match(/(\d{1,2})\s+([A-Za-z]{3})\s+(\d{4})/)
  if (!m) return ''
  return `${m[3]}-${MON_EN[m[2]] ?? '01'}-${m[1].padStart(2, '0')}`
}

function freshaTime(s: string): string {
  const m = s.match(/(\d{1,2}):(\d{2})\s*(am|pm)/i)
  if (!m) return ''
  let h = parseInt(m[1])
  if (m[3].toLowerCase() === 'pm' && h !== 12) h += 12
  if (m[3].toLowerCase() === 'am' && h === 12) h = 0
  return `${String(h).padStart(2, '0')}:${m[2]}`
}

function hikDate(s: string): string {
  const parts = s.trim().split('/')
  if (parts.length !== 3) return ''
  return `${parts[2]}-${parts[1]}-${parts[0]}`
}

function hikTime(s: string): string {
  const m = s.trim().match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i)
  if (!m) return s.trim().substring(0, 5)
  let h = parseInt(m[1])
  if (m[3].toUpperCase() === 'PM' && h !== 12) h += 12
  if (m[3].toUpperCase() === 'AM' && h === 12) h = 0
  return `${String(h).padStart(2, '0')}:${m[2]}`
}

function parseTurnosFresha(text: string): { nombre: string; fecha: string; inicio: string; fin: string; horas: number }[] {
  const rows = csvParse(text)
  if (rows.length < 2) return []
  const hdr = rows[0].map(h => h.toLowerCase())
  const iN = hdr.findIndex(h => h.includes('miembro'))
  const iF = hdr.findIndex(h => h === 'fecha')
  const iI = hdr.findIndex(h => h.includes('inicio'))
  const iFin = hdr.findIndex(h => h.includes('fin'))
  const iD = hdr.findIndex(h => h.includes('duraci'))
  if (iN < 0 || iF < 0 || iI < 0 || iFin < 0) return []
  const out = []
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i]
    const nombre = r[iN] ?? ''
    const fecha = freshaDate(r[iF] ?? '')
    const inicio = freshaTime(r[iI] ?? '')
    const fin = freshaTime(r[iFin] ?? '')
    const horas = iD >= 0 ? parseFloat(r[iD] ?? '0') || 0 : 0
    if (!nombre || !fecha || !inicio || !fin) continue
    out.push({ nombre, fecha, inicio, fin, horas })
  }
  return out
}

function parseHIKFichadas(text: string): { reloj: string; fecha: string; hora: string }[] {
  // Auto-detect separator: daily report uses ';', manual export uses ','
  const preview = text.substring(0, 2000)
  const sep = (preview.match(/;/g)?.length ?? 0) > (preview.match(/,/g)?.length ?? 0) ? ';' : ','

  const rows = csvParse(text, sep)

  // Find header row dynamically — scan first 10 rows for one containing 'id'
  let hdrIdx = -1
  let hdr: string[] = []
  for (let i = 0; i < Math.min(rows.length, 10); i++) {
    const row = rows[i].map(h => h.toLowerCase().trim())
    if (row.some(h => h === 'id')) { hdrIdx = i; hdr = row; break }
  }
  if (hdrIdx < 0) return []

  // Support Spanish (daily mail: Fecha/Tiempo) and English (manual export: Date/Time)
  const iId = hdr.findIndex(h => h === 'id')
  const iF = hdr.findIndex(h => h === 'fecha' || h === 'date')
  const iT = hdr.findIndex(h => h === 'tiempo' || h === 'time')
  if (iId < 0 || iF < 0 || iT < 0) return []

  const out = []
  for (let i = hdrIdx + 1; i < rows.length; i++) {
    const r = rows[i]
    const reloj = r[iId]?.trim() ?? ''
    const fecha = hikDate(r[iF] ?? '')
    const hora = hikTime(r[iT] ?? '')
    if (!reloj || !fecha || !hora) continue
    out.push({ reloj, fecha, hora })
  }
  return out
}

function parseCitasFresha(text: string): { nombre: string; fecha: string; primer_turno: string; ultimo_turno: string; cant_citas: number }[] {
  const rows = csvParse(text)
  if (rows.length < 2) return []
  const hdr = rows[0].map(h => h.toLowerCase().trim())
  const iN = hdr.findIndex(h => h.includes('miembro'))
  const iE = hdr.findIndex(h => h === 'estado')
  const iF = hdr.findIndex(h => h.includes('programada'))
  const iFr = hdr.findIndex(h => h.includes('franja'))
  if (iN < 0 || iF < 0 || iFr < 0) return []

  const map = new Map<string, { s: string; e: string }[]>()
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i]
    if (iE >= 0 && r[iE]?.trim().toLowerCase() === 'cancelado') continue
    const nombre = r[iN]?.trim() ?? ''
    const fecha = freshaDate(r[iF] ?? '')
    const franja = r[iFr]?.trim() ?? ''
    if (!nombre || !fecha || !franja.includes('-')) continue
    const [startRaw, endRaw] = franja.split('-')
    const s = (startRaw ?? '').substring(0, 5)
    const e = (endRaw ?? '').substring(0, 5)
    if (!s || !e) continue
    const key = `${nombre}|${fecha}`
    if (!map.has(key)) map.set(key, [])
    map.get(key)!.push({ s, e })
  }

  return Array.from(map.entries()).map(([key, tiempos]) => {
    const [nombre, fecha] = key.split('|')
    const starts = tiempos.map(t => t.s).sort()
    const ends = tiempos.map(t => t.e).sort()
    return { nombre, fecha, primer_turno: starts[0], ultimo_turno: ends[ends.length - 1], cant_citas: tiempos.length }
  })
}

// ─── CSV: solicitudes históricas ──────────────────────────────────────────────

interface SolicitudRowParsed {
  id?: string
  email: string
  nombre: string
  tipo: string
  dias: number | null
  fecha_inicio: string
  fecha_fin: string | null
  motivo: string | null
  estado: string
  fecha_creacion: string | null
  moderador: string | null
  comentario: string | null
  certificado: string | null
  subtipo_horario: string | null
  horario_anterior: string | null
  horario_nuevo: string | null
  fecha_compensacion: string | null
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
  return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`
}

function parseSolicitudesCSV(text: string): SolicitudRowParsed[] {
  const rows = csvParse(text)
  if (rows.length < 2) return []
  const hdr = rows[0].map(h => fixMojibake(h).toLowerCase().trim())

  const idx = (terms: string[]) => hdr.findIndex(h => terms.some(t => h.includes(t)))

  const iId          = idx(['id'])
  const iEmail       = idx(['email'])
  const iNombre      = idx(['nombre'])
  const iTipo        = idx(['tipo'])
  const iDias        = idx(['dias', 'días'])
  const iFechaIni    = idx(['fechainicio', 'fecha inicio', 'fecha_inicio'])
  const iFechaFin    = idx(['fechafin', 'fecha fin', 'fecha_fin'])
  const iMotivo      = idx(['motivo'])
  const iEstado      = idx(['estado'])
  const iFechaCrea   = idx(['fechacreacion', 'fecha creacion', 'fecha_creacion'])
  const iModerador   = idx(['moderador'])
  const iComentario  = idx(['comentario'])
  const iCertificado = idx(['certificado'])
  const iSubtipo     = idx(['cambio dia', 'cambio día'])
  const iHorNormal   = idx(['horario normal'])
  const iHorNuevo    = idx(['nuevo horario'])
  const iDiaNuevo    = idx(['nuevo dia', 'nuevo día'])

  const out: SolicitudRowParsed[] = []
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i]
    const get = (ix: number) => ix >= 0 ? fixMojibake(r[ix] ?? '').trim() : ''

    const email = get(iEmail).toLowerCase()
    const fecha_inicio = parseDDMMYYYY(get(iFechaIni))
    if (!email || !fecha_inicio) continue

    const diasRaw = get(iDias)
    const dias = diasRaw ? parseFloat(diasRaw.replace(',', '.')) || null : null

    const fechaCreacionRaw = get(iFechaCrea)
    let fecha_creacion: string | null = null
    if (fechaCreacionRaw) {
      const parts = fechaCreacionRaw.split(' ')
      const dateStr = parseDDMMYYYY(parts[0] ?? '')
      const timeStr = parts[1] ?? '00:00'
      if (dateStr) fecha_creacion = `${dateStr}T${timeStr}:00.000Z`
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
      moderador: get(iModerador) || null,
      comentario: get(iComentario) || null,
      certificado: get(iCertificado) || null,
      subtipo_horario: get(iSubtipo) || null,
      horario_anterior: get(iHorNormal) || null,
      horario_nuevo: get(iHorNuevo) || null,
      fecha_compensacion: parseDDMMYYYY(get(iDiaNuevo)) || null,
    })
  }
  return out
}

// ─── Tab: Importar ────────────────────────────────────────────────────────────

type ImportStep = 'idle' | 'working' | 'done' | 'error'
interface ImportResult { ok: number; noEncontrados: string[]; total: number }

function ImportarTab() {
  const [turnosFile, setTurnosFile] = useState<File | null>(null)
  const [turnosStep, setTurnosStep] = useState<ImportStep>('idle')
  const [turnosResult, setTurnosResult] = useState<ImportResult | null>(null)
  const [turnosErr, setTurnosErr] = useState('')

  const [hikFile, setHikFile] = useState<File | null>(null)
  const [hikStep, setHikStep] = useState<ImportStep>('idle')
  const [hikResult, setHikResult] = useState<ImportResult | null>(null)
  const [hikErr, setHikErr] = useState('')

  const [citasFile, setCitasFile] = useState<File | null>(null)
  const [citasStep, setCitasStep] = useState<ImportStep>('idle')
  const [citasResult, setCitasResult] = useState<ImportResult | null>(null)
  const [citasErr, setCitasErr] = useState('')

  async function run(
    parse: () => Promise<unknown[]>,
    endpoint: string,
    setStep: (s: ImportStep) => void,
    setResult: (r: ImportResult | null) => void,
    setErr: (e: string) => void,
  ) {
    setStep('working'); setErr(''); setResult(null)
    try {
      const rows = await parse()
      if (!rows.length) { setErr('No se encontraron filas válidas en el archivo'); setStep('error'); return }
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rows }),
      })
      const data = await res.json()
      if (data.error) { setErr(data.error); setStep('error') }
      else { setResult(data as ImportResult); setStep('done') }
    } catch {
      setErr('Error al procesar el archivo'); setStep('error')
    }
  }

  return (
    <div className="py-4 space-y-4">
      <ImportSection
        title="Turnos programados Fresha"
        desc="Reporte de turnos del equipo exportado desde Fresha. Puede cubrir varios meses. Se guarda en horarios base."
        file={turnosFile}
        onFile={f => { setTurnosFile(f); setTurnosStep('idle'); setTurnosResult(null); setTurnosErr('') }}
        step={turnosStep} result={turnosResult} error={turnosErr}
        onImport={() => run(
          async () => parseTurnosFresha(await readFileText(turnosFile!)),
          '/api/importar/turnos-fresha',
          setTurnosStep, setTurnosResult, setTurnosErr,
        )}
      />
      <ImportSection
        title="Fichadas HIKVISION"
        desc="Reporte del reloj biométrico. Encoding Latin-1, separador punto y coma, primeras 3 filas son basura. Se matchea por ID de reloj."
        file={hikFile}
        onFile={f => { setHikFile(f); setHikStep('idle'); setHikResult(null); setHikErr('') }}
        step={hikStep} result={hikResult} error={hikErr}
        onImport={() => run(
          async () => parseHIKFichadas(await readFileText(hikFile!, 'ISO-8859-1')),
          '/api/importar/fichadas-hik',
          setHikStep, setHikResult, setHikErr,
        )}
      />
      <ImportSection
        title="Citas Fresha"
        desc="Reporte de citas atendidas. Determina el primer/último turno del día y presencia efectiva de cada empleado."
        file={citasFile}
        onFile={f => { setCitasFile(f); setCitasStep('idle'); setCitasResult(null); setCitasErr('') }}
        step={citasStep} result={citasResult} error={citasErr}
        onImport={() => run(
          async () => parseCitasFresha(await readFileText(citasFile!)),
          '/api/importar/citas-fresha',
          setCitasStep, setCitasResult, setCitasErr,
        )}
      />

    </div>
  )
}

function ImportSection({ title, desc, file, onFile, step, result, error, onImport }: {
  title: string; desc: string
  file: File | null; onFile: (f: File | null) => void
  step: ImportStep; result: ImportResult | null; error: string
  onImport: () => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const working = step === 'working'

  return (
    <div className="bg-white rounded-2xl border border-[var(--border)] p-4 space-y-3">
      <div>
        <div className="text-sm font-semibold text-[var(--text)]">{title}</div>
        <div className="text-xs text-[var(--text-muted)] mt-0.5 leading-relaxed">{desc}</div>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <input
          ref={inputRef} type="file" accept=".csv" className="hidden"
          onChange={e => onFile(e.target.files?.[0] ?? null)}
        />
        <button
          onClick={() => inputRef.current?.click()}
          disabled={working}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm border border-[var(--border)] rounded-lg text-[var(--text-sub)] hover:border-[var(--primary)] hover:text-[var(--primary)] disabled:opacity-50 transition-colors truncate max-w-xs"
        >
          <IconUpload size={14} className="flex-shrink-0" />
          <span className="truncate">{file ? file.name : 'Seleccionar CSV…'}</span>
        </button>

        {file && (
          <>
            <button
              onClick={onImport}
              disabled={working}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg bg-[var(--primary)] text-white font-medium disabled:opacity-60 hover:opacity-90 transition-opacity flex-shrink-0"
            >
              {working && <Spinner size={12} inline />}
              {working ? 'Importando…' : 'Importar'}
            </button>
            {!working && (
              <button
                onClick={() => onFile(null)}
                className="text-xs text-[var(--text-muted)] hover:text-red-500 transition-colors flex-shrink-0"
              >
                Quitar
              </button>
            )}
          </>
        )}
      </div>

      {step === 'done' && result && (
        <div className="space-y-1 pt-0.5">
          <div className="flex items-center gap-1.5 text-sm text-emerald-600 font-medium">
            <IconCheck size={15} className="flex-shrink-0" />
            {result.ok.toLocaleString('es-AR')} registros importados de {result.total.toLocaleString('es-AR')}
          </div>
          {result.noEncontrados.length > 0 && (
            <div className="text-xs text-amber-600">
              No encontrados ({result.noEncontrados.length}): {result.noEncontrados.slice(0, 5).join(', ')}
              {result.noEncontrados.length > 5 ? ` y ${result.noEncontrados.length - 5} más` : ''}
            </div>
          )}
        </div>
      )}

      {step === 'error' && error && (
        <div className="text-sm text-red-600">{error}</div>
      )}
    </div>
  )
}
