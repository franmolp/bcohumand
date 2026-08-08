'use client'

import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import type { SessionUser } from '@/types'
import { Spinner } from '@/components/ui'
import {
  IconBarChart, IconChevronLeft, IconChevronRight, IconDollar, IconCalendarCheck,
  IconUsers, IconReceipt, IconClock, IconX, IconEdit, IconPlus,
  IconLock, IconLockOpen, IconArchive, IconAlertCircle, IconCheck, IconShoppingBag,
} from '@/components/ui/Icons'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function relTime(iso: string): string {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000)
  if (mins < 60) return `hace ${mins} min`
  const hs = Math.floor(mins / 60)
  if (hs < 24) return `hace ${hs}h`
  const ds = Math.floor(hs / 24)
  return ds === 1 ? 'ayer' : `hace ${ds} días`
}

function fmt$(n: number) {
  return '$' + Math.round(n).toLocaleString('es-AR')
}

function fmtMin(m: number) {
  const h = Math.floor(m / 60); const min = m % 60
  if (h === 0) return `${min}m`
  if (min === 0) return `${h}h`
  return `${h}h ${min}m`
}

function fmtMes(mes: string) {
  const [y, m] = mes.split('-').map(Number)
  const d = new Date(y, m - 1, 1)
  const label = d.toLocaleString('es', { month: 'long' })
  return label.charAt(0).toUpperCase() + label.slice(1) + ' ' + y
}

function fmtFecha(fecha: string) {
  const [y, m, d] = fecha.split('-').map(Number)
  const dt = new Date(y, m - 1, d)
  const dia = dt.toLocaleString('es', { weekday: 'long' })
  return `${dia.charAt(0).toUpperCase() + dia.slice(1)} ${d} ${dt.toLocaleString('es', { month: 'short' }).replace('.', '')} ${y}`
}

function mesActual() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' }).substring(0, 7)
}

function todayAR() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' })
}

function prevMes(mes: string) {
  const [y, m] = mes.split('-').map(Number)
  return new Date(y, m - 2, 1).toLocaleDateString('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' }).substring(0, 7)
}

function nextMes(mes: string) {
  const [y, m] = mes.split('-').map(Number)
  return new Date(y, m, 1).toLocaleDateString('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' }).substring(0, 7)
}

// ─── Shared UI ────────────────────────────────────────────────────────────────

function KpiCard({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <div className="bg-white rounded-2xl border border-[var(--border)] p-4 flex flex-col gap-1">
      <p className="text-[11px] text-[var(--text-muted)] font-medium uppercase tracking-wide">{label}</p>
      <p className={`text-[22px] font-bold leading-tight ${color ?? 'text-[var(--text)]'}`}>{value}</p>
      {sub && <p className="text-[11px] text-[var(--text-muted)]">{sub}</p>}
    </div>
  )
}

function BaraCSS({ pct, color = 'var(--primary)' }: { pct: number; color?: string }) {
  return (
    <div className="h-2 rounded-full bg-gray-100 overflow-hidden flex-1">
      <div className="h-full rounded-full transition-all" style={{ width: `${Math.min(100, Math.max(0, pct))}%`, background: color }} />
    </div>
  )
}

// ─── Informes API types ───────────────────────────────────────────────────────

interface Kpis {
  totalCitas: number; canceladas: number; tasaCancelacion: number
  ventasNetas: number; gastos: number; sueldos: number; balance: number
  proyeccion: number | null; diasTranscurridos: number; diasDelMes: number
}

interface EmpleadaRow {
  nombre: string; citas: number; ventaNeta: number; sueldo: number | null
  minOcupada: number; minLibre: number; ocupacionPct: number | null
  diasPresente: number; diasHabiles: number
}

interface ServicioRow {
  servicio: string; categoria: string; cantidad: number; ventaNeta: number
  duracionMin: number | null; precioPorHora: number | null
}

interface PagoRow { tipo: string; total: number }

interface ApiData {
  kpis: Kpis; pagosPorTipo: PagoRow[]; productividad: EmpleadaRow[]
  servicios: ServicioRow[]; rentabilidad: ServicioRow[]
  ultimaActualizacion: string | null
}

// ─── Caja types ───────────────────────────────────────────────────────────────

interface CajaConfig {
  saldo_inicial: number
  fecha_inicio: string
  payment_name_efectivo: string
}

interface RetiroItem {
  id: string; monto: number; descripcion: string | null; tipo: string; created_at: string
}

interface Evento {
  tipo: 'apertura' | 'cierre' | 'retiro' | 'sobre' | 'ajuste' | 'compra' | 'pago_in' | 'pago_out'
  hora: string
  monto: number
  ventas?: number
  contado?: number
  discrepancia?: number | null
  detalle?: string | null
  id?: string
  explicado?: boolean
}

interface DiaData {
  fecha: string
  efectivo_vendido: number
  retiros: number
  sobres: number
  saldo: number | null
  starting_cash: number | null
  discrepancia: number | null
  tiene_cierre_loyverse: boolean
  tiene_seguimiento: boolean
  tiene_discrepancia: boolean
  ajuste: { saldo_nuevo: number; motivo: string | null } | null
  retiros_list: RetiroItem[]
  eventos: Evento[]
  alerta_salida: { loyverse: number; sobres: number; compras: number } | null
  salidas_sin_explicar: number
}

interface CajaResumen {
  configurado: boolean
  config?: CajaConfig
  dias: DiaData[]
  kpis: { efectivo_mes: number; retiros_mes: number; sobres_mes: number; saldo_actual: number | null; caja_fuerte: number }
}

const EVENTO_CFG: Record<Evento['tipo'], { Icon: typeof IconLock; label: string; color: string }> = {
  apertura: { Icon: IconLockOpen, label: 'Apertura', color: 'text-[var(--text)]' },
  cierre: { Icon: IconLock, label: 'Cierre', color: 'text-[var(--text)]' },
  retiro: { Icon: IconDollar, label: 'Retiro', color: 'text-amber-600' },
  sobre: { Icon: IconArchive, label: 'Sobre', color: 'text-purple-600' },
  ajuste: { Icon: IconEdit, label: 'Ajuste', color: 'text-blue-600' },
  compra: { Icon: IconShoppingBag, label: 'Compra', color: 'text-slate-500' },
  pago_in: { Icon: IconDollar, label: 'Entrada de caja', color: 'text-green-600' },
  pago_out: { Icon: IconDollar, label: 'Salida de caja', color: 'text-slate-500' },
}

// ─── Tab Caja ─────────────────────────────────────────────────────────────────

function TabCaja({ mes }: { mes: string }) {
  const [resumen, setResumen] = useState<CajaResumen | null>(null)
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [modalRetiro, setModalRetiro] = useState<{ fecha: string } | null>(null)
  const [rfFecha, setRfFecha] = useState('')
  const [rfMonto, setRfMonto] = useState('')
  const [rfDesc, setRfDesc] = useState('')
  const [rfTipo, setRfTipo] = useState<'retiro' | 'sobre'>('retiro')
  const [rfSaving, setRfSaving] = useState(false)
  const [rfError, setRfError] = useState('')

  const [modalAjuste, setModalAjuste] = useState<{ fecha: string; saldo_actual: number } | null>(null)
  const [afSaldo, setAfSaldo] = useState('')
  const [afMotivo, setAfMotivo] = useState('')
  const [afSaving, setAfSaving] = useState(false)
  const [afError, setAfError] = useState('')

  const [modalConfig, setModalConfig] = useState(false)
  const [cfSaldoInicial, setCfSaldoInicial] = useState('')
  const [cfFechaInicio, setCfFechaInicio] = useState(todayAR())
  const [cfPaymentName, setCfPaymentName] = useState('Efectivo')
  const [cfSaving, setCfSaving] = useState(false)
  const [cfError, setCfError] = useState('')

  const [reimportando, setReimportando] = useState(false)
  const [reimportMsg, setReimportMsg] = useState('')
  const [logAbierto, setLogAbierto] = useState<string | null>(null)

  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [editRetiro, setEditRetiro] = useState<(RetiroItem & { fecha: string }) | null>(null)
  const [erMonto, setErMonto] = useState('')
  const [erDesc, setErDesc] = useState('')
  const [erTipo, setErTipo] = useState<'retiro' | 'sobre'>('retiro')
  const [erSaving, setErSaving] = useState(false)

  function cargar() {
    setCargando(true); setError(null)
    fetch(`/api/caja/resumen?mes=${mes}`)
      .then(r => r.json())
      .then(d => { if (d.error) setError(d.error); else setResumen(d) })
      .catch(() => setError('Error al cargar'))
      .finally(() => setCargando(false))
  }

  async function reimportarCierres() {
    setReimportando(true); setReimportMsg('')
    try {
      const from = `${mes}-01`
      const to = todayAR()
      const res = await fetch('/api/importar/loyverse-cierres', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ from, to }),
      })
      const d = await res.json()
      if (!res.ok) { setReimportMsg(d.error ?? 'Error'); return }
      setReimportMsg(`${d.ok ?? 0} cierres importados`)
      cargar()
    } finally {
      setReimportando(false)
      setTimeout(() => setReimportMsg(''), 4000)
    }
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { cargar() }, [mes])

  function abrirModalRetiro(fecha: string) {
    setRfFecha(fecha); setRfMonto(''); setRfDesc(''); setRfTipo('retiro'); setRfError('')
    setModalRetiro({ fecha })
  }

  async function guardarRetiro() {
    const monto = parseFloat(rfMonto.replace(',', '.'))
    if (!rfFecha || isNaN(monto) || monto <= 0) { setRfError('Ingresá un monto válido'); return }
    setRfSaving(true); setRfError('')
    try {
      const res = await fetch('/api/caja/retiros', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fecha: rfFecha, monto, descripcion: rfDesc || null, tipo: rfTipo }),
      })
      const d = await res.json()
      if (!res.ok) { setRfError(d.error ?? 'Error al guardar'); return }
      setModalRetiro(null); cargar()
    } finally { setRfSaving(false) }
  }

  async function eliminarRetiro(id: string) {
    setDeletingId(id)
    await fetch(`/api/caja/retiros/${id}`, { method: 'DELETE' })
    setDeletingId(null); cargar()
  }

  function abrirEditRetiro(r: RetiroItem, fecha: string) {
    setEditRetiro({ ...r, fecha })
    setErMonto(String(r.monto)); setErDesc(r.descripcion ?? ''); setErTipo(r.tipo === 'sobre' ? 'sobre' : 'retiro')
  }

  async function guardarEditRetiro() {
    if (!editRetiro) return
    const monto = parseFloat(erMonto.replace(',', '.'))
    if (isNaN(monto) || monto <= 0) return
    setErSaving(true)
    try {
      await fetch(`/api/caja/retiros/${editRetiro.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fecha: editRetiro.fecha, monto, descripcion: erDesc || null, tipo: erTipo }),
      })
      setEditRetiro(null); cargar()
    } finally { setErSaving(false) }
  }

  function abrirAjuste(fecha: string, saldo_actual: number) {
    setAfSaldo(String(Math.round(saldo_actual))); setAfMotivo(''); setAfError('')
    setModalAjuste({ fecha, saldo_actual })
  }

  async function guardarAjuste() {
    const saldo = parseFloat(afSaldo.replace(',', '.'))
    if (!modalAjuste?.fecha || isNaN(saldo)) { setAfError('Ingresá un saldo válido'); return }
    setAfSaving(true); setAfError('')
    try {
      const res = await fetch('/api/caja/ajustes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fecha: modalAjuste.fecha, saldo_nuevo: saldo, motivo: afMotivo || null }),
      })
      const d = await res.json()
      if (!res.ok) { setAfError(d.error ?? 'Error al guardar'); return }
      setModalAjuste(null); cargar()
    } finally { setAfSaving(false) }
  }

  async function guardarConfig() {
    const saldo = parseFloat(cfSaldoInicial.replace(',', '.'))
    if (isNaN(saldo) || !cfFechaInicio) { setCfError('Completá todos los campos'); return }
    setCfSaving(true); setCfError('')
    try {
      const res = await fetch('/api/caja/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ saldo_inicial: saldo, fecha_inicio: cfFechaInicio, payment_name_efectivo: cfPaymentName }),
      })
      const d = await res.json()
      if (!res.ok) { setCfError(d.error ?? 'Error al guardar'); return }
      setModalConfig(false); cargar()
    } finally { setCfSaving(false) }
  }

  function abrirConfig() {
    const cfg = resumen?.config
    setCfSaldoInicial(cfg ? String(cfg.saldo_inicial) : '')
    setCfFechaInicio(cfg?.fecha_inicio ?? todayAR())
    setCfPaymentName(cfg?.payment_name_efectivo ?? 'Efectivo')
    setCfError(''); setModalConfig(true)
  }

  if (cargando) return <div className="flex justify-center py-16"><Spinner /></div>
  if (error) return <div className="text-red-500 text-[14px] py-8 text-center">{error}</div>
  if (!resumen) return null

  // First-time setup
  if (!resumen.configurado) {
    return (
      <div className="fade-in">
        <div className="bg-white rounded-2xl border border-[var(--border)] p-5 flex flex-col gap-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-green-50 border border-green-100 flex items-center justify-center flex-shrink-0">
              <IconDollar size={18} className="text-green-600" />
            </div>
            <div>
              <p className="text-[14px] font-semibold text-[var(--text)]">Configurar control de caja</p>
              <p className="text-[12px] text-[var(--text-muted)]">Iniciá el seguimiento de efectivo diario</p>
            </div>
          </div>
          <div className="flex flex-col gap-3">
            <div>
              <p className="text-[12px] font-medium text-gray-500 mb-1.5">Saldo actual en caja</p>
              <div className="relative">
                <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[14px] text-gray-400">$</span>
                <input type="number" min="0" step="100" value={cfSaldoInicial}
                  onChange={e => setCfSaldoInicial(e.target.value)} placeholder="0"
                  className="w-full border border-gray-200 rounded-xl pl-7 pr-3 py-2.5 text-[14px] focus:outline-none focus:border-[var(--primary)]" />
              </div>
            </div>
            <div>
              <p className="text-[12px] font-medium text-gray-500 mb-1.5">Fecha de inicio de seguimiento</p>
              <input type="date" value={cfFechaInicio} max={todayAR()}
                onChange={e => setCfFechaInicio(e.target.value)}
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-[14px] focus:outline-none focus:border-[var(--primary)]" />
            </div>
            <div>
              <p className="text-[12px] font-medium text-gray-500 mb-1.5">Nombre del pago en efectivo en Loyverse</p>
              <input type="text" value={cfPaymentName} onChange={e => setCfPaymentName(e.target.value)} placeholder="Efectivo"
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-[14px] focus:outline-none focus:border-[var(--primary)]" />
              <p className="text-[11px] text-gray-400 mt-1">Tal como figura en Loyverse (ej: &quot;Efectivo&quot;, &quot;Cash&quot;)</p>
            </div>
            {cfError && <p className="text-red-500 text-[12px]">{cfError}</p>}
            <button onClick={guardarConfig} disabled={cfSaving}
              className="w-full py-3 bg-[image:var(--gradient)] text-white rounded-xl text-[14px] font-semibold cursor-pointer disabled:opacity-40">
              {cfSaving ? 'Guardando…' : 'Iniciar seguimiento'}
            </button>
          </div>
        </div>
      </div>
    )
  }

  const { kpis, dias } = resumen
  const hasDisco = dias.some(d => d.tiene_discrepancia || (d.discrepancia !== null && Math.abs(d.discrepancia) >= 1) || d.alerta_salida || d.salidas_sin_explicar > 0)

  return (
    <div className="fade-in flex flex-col gap-4">

      {/* KPI Cards */}
      <div className="grid grid-cols-2 gap-3">
        <KpiCard label="Efectivo del mes" value={fmt$(kpis.efectivo_mes)} sub="ventas en efectivo" />
        <KpiCard
          label="Retirado del mes"
          value={fmt$(kpis.retiros_mes + kpis.sobres_mes)}
          sub={kpis.sobres_mes > 0 ? `sobre ${fmt$(kpis.sobres_mes)} · retiro ${fmt$(kpis.retiros_mes)}` : 'lo que salió de la caja'}
        />
        <KpiCard
          label="Saldo en caja"
          value={kpis.saldo_actual === null ? '—' : fmt$(kpis.saldo_actual)}
          color={kpis.saldo_actual !== null && kpis.saldo_actual < 0 ? 'text-red-500' : 'text-green-600'}
          sub="estimado actual"
        />
        <KpiCard label="Caja fuerte" value={fmt$(kpis.caja_fuerte)} sub="total histórico en sobres" />
      </div>

      {/* Alert for discrepancies */}
      {hasDisco && (
        <div className="bg-red-50 border border-red-200 rounded-xl px-3.5 py-2.5 flex items-center gap-2">
          <IconAlertCircle size={15} className="text-red-500 shrink-0" />
          <p className="text-[12px] text-red-700"><span className="font-semibold">Diferencias en caja este mes.</span> Revisá los días en rojo y usá &quot;Ajustar&quot;.</p>
        </div>
      )}

      {/* Config edit + reimport */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <button onClick={reimportarCierres} disabled={reimportando}
            className="flex items-center gap-1.5 text-[12px] text-[var(--text-muted)] hover:text-green-600 transition-colors cursor-pointer disabled:opacity-40">
            <IconReceipt size={13} /> {reimportando ? 'Importando…' : 'Reimportar Loyverse'}
          </button>
          {reimportMsg && <span className="text-[11px] text-green-600">{reimportMsg}</span>}
        </div>
        <button onClick={abrirConfig}
          className="flex items-center gap-1.5 text-[12px] text-[var(--text-muted)] hover:text-[var(--primary)] transition-colors cursor-pointer">
          <IconEdit size={13} /> Configuración
        </button>
      </div>

      {/* Day cards */}
      {dias.length === 0 && (
        <div className="text-center py-10 text-[var(--text-muted)] text-[14px]">Sin datos para este período.</div>
      )}

      {dias.map(dia => {
        const hasDisc = dia.tiene_discrepancia || (dia.discrepancia !== null && Math.abs(dia.discrepancia) >= 1) || !!dia.alerta_salida || dia.salidas_sin_explicar > 0
        const chequeado = dia.eventos.some(e => e.tipo === 'apertura' && e.discrepancia !== null && e.discrepancia !== undefined)
        return (
          <div key={dia.fecha} className={`bg-white rounded-2xl border overflow-hidden ${hasDisc ? 'border-red-200' : 'border-[var(--border)]'}`}>
            {/* Header */}
            <div className={`px-4 py-2.5 flex items-center justify-between border-b ${hasDisc ? 'bg-red-50 border-red-100' : 'bg-gray-50/70 border-[var(--border)]'}`}>
              <div className="flex items-center gap-1.5">
                {hasDisc && <IconAlertCircle size={13} className="text-red-500" />}
                <p className="text-[13px] font-semibold text-[var(--text)]">{fmtFecha(dia.fecha)}</p>
              </div>
              <div className="text-right">
                {dia.tiene_seguimiento ? (
                  <p className={`text-[15px] font-bold ${dia.saldo! < 0 ? 'text-red-500' : 'text-green-600'}`}>{fmt$(dia.saldo!)}</p>
                ) : (
                  <p className="text-[11px] text-[var(--text-muted)] italic">sin seguimiento</p>
                )}
              </div>
            </div>

            <div className="px-4 py-2.5 flex flex-col gap-2">
              {/* Metrics */}
              <div className="flex gap-3 flex-wrap text-[13px]">
                <span className="text-[var(--text)]">
                  <span className="text-[var(--text-muted)]">Efectivo </span>
                  <span className="font-semibold">{fmt$(dia.efectivo_vendido)}</span>
                </span>
                {(dia.retiros + dia.sobres) > 0 && (
                  <span className="text-amber-600 font-semibold">Retirado {fmt$(dia.retiros + dia.sobres)}</span>
                )}
                {dia.ajuste && (
                  <span className="text-blue-600 font-semibold">Ajuste → {fmt$(dia.ajuste.saldo_nuevo)}</span>
                )}
              </div>

              {/* Discrepancy: compara cada apertura de turno contra el cierre inmediato anterior */}
              {dia.discrepancia !== null && Math.abs(dia.discrepancia) >= 1 ? (
                <div className="bg-red-50 border border-red-100 rounded-lg px-2.5 py-1.5 flex items-center gap-1.5">
                  <IconAlertCircle size={13} className="text-red-500 shrink-0" />
                  <p className="text-[12px] text-red-700">No coincide con el cierre anterior: diferencia de <span className="font-semibold">{fmt$(dia.discrepancia)}</span></p>
                </div>
              ) : dia.tiene_discrepancia ? (
                <div className="bg-red-50 border border-red-100 rounded-lg px-2.5 py-1.5 flex items-center gap-1.5">
                  <IconAlertCircle size={13} className="text-red-500 shrink-0" />
                  <p className="text-[12px] text-red-700">El cierre de un turno no coincide con la apertura del siguiente — mirá el log</p>
                </div>
              ) : chequeado && (
                <div className="bg-green-50 border border-green-100 rounded-lg px-2.5 py-1.5 flex items-center gap-1.5">
                  <IconCheck size={13} className="text-green-600 shrink-0" />
                  <p className="text-[12px] text-green-700">Todas las aperturas coinciden con el cierre anterior</p>
                </div>
              )}

              {/* Salida de Loyverse que no cuadra contra sobres + compras en efectivo — fallback
                  para turnos importados antes de tener el detalle de movimientos por Loyverse */}
              {dia.alerta_salida && (
                <div className="bg-amber-50 border border-amber-100 rounded-lg px-2.5 py-2 flex items-start gap-1.5">
                  <IconAlertCircle size={13} className="text-amber-600 shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <p className="text-[12px] font-semibold text-amber-700">Salida sin explicar en Loyverse</p>
                    <p className="text-[11px] text-amber-700 mt-0.5">
                      Loyverse: {fmt$(dia.alerta_salida.loyverse)} · Sobre: {fmt$(dia.alerta_salida.sobres)} · Compras: {fmt$(dia.alerta_salida.compras)}
                    </p>
                    <p className="text-[11px] text-amber-600 mt-0.5">Revisá si falta cargar un sobre o una compra.</p>
                  </div>
                </div>
              )}

              {/* Salidas individuales de Loyverse que no matchean con ningún sobre/compra cargado */}
              {dia.salidas_sin_explicar > 0 && (
                <div className="bg-amber-50 border border-amber-100 rounded-lg px-2.5 py-1.5 flex items-center gap-1.5">
                  <IconAlertCircle size={13} className="text-amber-600 shrink-0" />
                  <p className="text-[12px] text-amber-700">
                    {dia.salidas_sin_explicar} salida{dia.salidas_sin_explicar !== 1 ? 's' : ''} de caja sin sobre ni compra que la{dia.salidas_sin_explicar !== 1 ? 's' : ''} explique — mirá el log
                  </p>
                </div>
              )}

              {/* Retiro list */}
              {dia.retiros_list.length > 0 && (
                <div className="flex flex-col gap-1">
                  {dia.retiros_list.map(r => (
                    <div key={r.id} className="flex items-center gap-2 text-[12px]">
                      {r.tipo === 'sobre'
                        ? <IconArchive size={13} className="text-purple-600 shrink-0" />
                        : <IconDollar size={13} className="text-amber-600 shrink-0" />}
                      <span className={`font-semibold ${r.tipo === 'sobre' ? 'text-purple-600' : 'text-amber-600'}`}>{fmt$(r.monto)}</span>
                      {r.descripcion && <span className="text-[var(--text-muted)] truncate">{r.descripcion}</span>}
                      <div className="flex-1" />
                      <button onClick={() => abrirEditRetiro(r, dia.fecha)}
                        className="p-1 text-gray-300 hover:text-[var(--primary)] rounded-lg transition-colors cursor-pointer">
                        <IconEdit size={12} />
                      </button>
                      <button onClick={() => eliminarRetiro(r.id)} disabled={deletingId === r.id}
                        className="p-1 text-gray-300 hover:text-red-500 rounded-lg transition-colors cursor-pointer disabled:opacity-40">
                        <IconX size={12} />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* Log cronológico del día */}
              {dia.eventos.length > 0 && (
                <div className="border-t border-gray-100 pt-1.5">
                  <button onClick={() => setLogAbierto(logAbierto === dia.fecha ? null : dia.fecha)}
                    className="flex items-center gap-1.5 text-[11px] font-medium text-[var(--text-muted)] hover:text-[var(--primary)] transition-colors cursor-pointer">
                    <IconClock size={12} />
                    {logAbierto === dia.fecha ? 'Ocultar log' : 'Ver log de turnos'}
                  </button>

                  {logAbierto === dia.fecha && (
                    <div className="mt-1.5 flex flex-col">
                      {dia.eventos.map((ev, i) => {
                        const checked = ev.tipo === 'apertura' && ev.discrepancia !== null && ev.discrepancia !== undefined
                        const evDisc = checked && Math.abs(ev.discrepancia!) >= 1
                        const pagoOutExplicado = ev.tipo === 'pago_out' && ev.explicado === true
                        const pagoOutSinExplicar = ev.tipo === 'pago_out' && ev.explicado === false
                        const c = EVENTO_CFG[ev.tipo]
                        const sub = ev.tipo === 'cierre' && ev.ventas !== undefined
                          ? `Vendieron ${fmt$(ev.ventas)}`
                          : ev.detalle
                        return (
                          <div key={i} className={`py-2 ${i > 0 ? 'border-t border-gray-50' : ''} ${evDisc ? 'bg-red-50 -mx-1.5 px-1.5 rounded-lg' : ''}`}>
                            <div className="flex items-center gap-1.5">
                              <c.Icon size={13} className={`shrink-0 ${evDisc ? 'text-red-500' : pagoOutSinExplicar ? 'text-amber-500' : c.color}`} />
                              <span className={`text-[12px] font-semibold ${evDisc ? 'text-red-600' : pagoOutSinExplicar ? 'text-amber-600' : c.color}`}>{c.label}</span>
                              <span className="text-[10px] text-[var(--text-muted)]">{ev.hora}hs</span>
                              <div className="flex-1" />
                              {((checked && !evDisc) || pagoOutExplicado) && <IconCheck size={12} className="text-green-500 shrink-0" />}
                              {evDisc && <IconAlertCircle size={13} className="text-red-500 shrink-0" />}
                              {pagoOutSinExplicar && <IconAlertCircle size={13} className="text-amber-500 shrink-0" />}
                              <span className={`text-[13px] font-semibold shrink-0 ${evDisc ? 'text-red-600' : 'text-[var(--text)]'}`}>{fmt$(ev.monto)}</span>
                            </div>
                            {(sub || ev.contado !== undefined || evDisc || pagoOutSinExplicar) && (
                              <div className="pl-5 mt-1 flex flex-col gap-0.5">
                                {sub && <p className="text-[11px] text-[var(--text-muted)] leading-snug break-words">{sub}</p>}
                                {ev.contado !== undefined && (
                                  <>
                                    <p className="text-[11px] text-amber-600 leading-snug">Conteo del local: {fmt$(ev.contado)}</p>
                                    <p className="text-[11px] font-semibold text-red-600 leading-snug">
                                      {ev.contado - ev.monto < 0 ? 'Faltante' : 'Sobante'} de {fmt$(Math.abs(ev.contado - ev.monto))}
                                    </p>
                                  </>
                                )}
                                {evDisc && (
                                  <p className="text-[11px] font-semibold text-red-600 leading-snug">
                                    No coincide con el cierre anterior — diferencia de {fmt$(ev.discrepancia!)}
                                  </p>
                                )}
                                {pagoOutSinExplicar && (
                                  <p className="text-[11px] font-semibold text-amber-600 leading-snug">Sin sobre ni compra que la explique</p>
                                )}
                              </div>
                            )}
                          </div>
                        )
                      })}
                      {dia.tiene_seguimiento && (
                        <div className="flex items-center justify-between pt-1.5 mt-0.5 border-t border-gray-100">
                          <span className="text-[11px] font-medium text-[var(--text-muted)]">Apertura esperada mañana</span>
                          <span className={`text-[13px] font-bold ${dia.saldo! < 0 ? 'text-red-500' : 'text-green-600'}`}>{fmt$(dia.saldo!)}</span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Actions */}
              <div className="flex gap-2 pt-0.5">
                <button onClick={() => abrirModalRetiro(dia.fecha)}
                  className="flex-1 flex items-center justify-center gap-1.5 py-1.5 border border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--primary)] hover:border-[var(--primary)] rounded-xl text-[12px] font-medium transition-colors cursor-pointer">
                  <IconPlus size={13} /> Agregar retiro
                </button>
                <button onClick={() => abrirAjuste(dia.fecha, dia.saldo ?? 0)}
                  className="flex items-center gap-1.5 px-3 py-1.5 border border-[var(--border)] text-[var(--text-muted)] hover:text-blue-600 hover:border-blue-300 rounded-xl text-[12px] font-medium transition-colors cursor-pointer">
                  <IconEdit size={13} /> Ajustar
                </button>
              </div>
            </div>
          </div>
        )
      })}

      {/* Modal: Agregar retiro */}
      {modalRetiro && createPortal(
        <div className="fixed inset-0 z-50 flex items-end lg:items-center justify-center" onClick={() => setModalRetiro(null)}>
          <div className="absolute inset-0 bg-black/40" />
          <div className="relative bg-white w-full lg:max-w-md rounded-t-3xl lg:rounded-2xl shadow-2xl p-5 pb-8 lg:pb-5" onClick={e => e.stopPropagation()}>
            <div className="flex justify-center mb-3 lg:hidden"><div className="w-9 h-1 bg-gray-300 rounded-full" /></div>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-[16px] font-bold text-[var(--text)]">Registrar movimiento</h3>
              <button onClick={() => setModalRetiro(null)} className="p-1.5 rounded-full text-gray-400 hover:bg-gray-100 cursor-pointer"><IconX size={16} /></button>
            </div>
            <div className="flex flex-col gap-3">
              {/* Tipo toggle */}
              <div className="flex rounded-xl border border-gray-200 overflow-hidden">
                <button
                  onClick={() => setRfTipo('retiro')}
                  className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 text-[13px] font-semibold transition-colors cursor-pointer ${rfTipo === 'retiro' ? 'bg-amber-500 text-white' : 'bg-white text-gray-400 hover:bg-gray-50'}`}>
                  <IconDollar size={14} /> Retiro personal
                </button>
                <button
                  onClick={() => setRfTipo('sobre')}
                  className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 text-[13px] font-semibold transition-colors cursor-pointer ${rfTipo === 'sobre' ? 'bg-purple-500 text-white' : 'bg-white text-gray-400 hover:bg-gray-50'}`}>
                  <IconArchive size={14} /> Sobre / caja fuerte
                </button>
              </div>
              <p className="text-[11px] text-gray-400 -mt-1">
                {rfTipo === 'retiro' ? 'Plata que te llevás vos. Reduce el saldo de caja.' : 'Plata que va al sobre o bóveda del salón. También reduce el saldo de caja.'}
              </p>
              <div>
                <p className="text-[12px] font-medium text-gray-500 mb-1.5">Fecha</p>
                <input type="date" value={rfFecha} max={todayAR()} onChange={e => setRfFecha(e.target.value)}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-[14px] focus:outline-none focus:border-[var(--primary)]" />
              </div>
              <div>
                <p className="text-[12px] font-medium text-gray-500 mb-1.5">Monto</p>
                <div className="relative">
                  <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[14px] text-gray-400">$</span>
                  <input type="number" min="1" step="100" value={rfMonto} onChange={e => setRfMonto(e.target.value)}
                    placeholder="0" autoFocus
                    className="w-full border border-gray-200 rounded-xl pl-7 pr-3 py-2.5 text-[14px] focus:outline-none focus:border-[var(--primary)]" />
                </div>
              </div>
              <div>
                <p className="text-[12px] font-medium text-gray-500 mb-1.5">Descripción <span className="font-normal text-gray-400">(opcional)</span></p>
                <input type="text" value={rfDesc} onChange={e => setRfDesc(e.target.value)}
                  placeholder={rfTipo === 'sobre' ? 'ej: Sobre del mediodía, pago proveedor' : 'ej: Retiro fin de día'}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-[14px] focus:outline-none focus:border-[var(--primary)]" />
              </div>
              {rfError && <p className="text-red-500 text-[12px]">{rfError}</p>}
              <div className="flex gap-2 pt-1">
                <button onClick={() => setModalRetiro(null)}
                  className="px-4 py-2.5 border border-gray-200 text-gray-500 rounded-xl text-[13px] cursor-pointer hover:bg-gray-50">Cancelar</button>
                <button onClick={guardarRetiro} disabled={rfSaving}
                  className="flex-1 py-2.5 bg-[image:var(--gradient)] text-white rounded-xl text-[13px] font-semibold cursor-pointer disabled:opacity-40">
                  {rfSaving ? 'Guardando…' : rfTipo === 'sobre' ? 'Guardar sobre' : 'Guardar retiro'}
                </button>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Modal: Editar retiro */}
      {editRetiro && createPortal(
        <div className="fixed inset-0 z-50 flex items-end lg:items-center justify-center" onClick={() => setEditRetiro(null)}>
          <div className="absolute inset-0 bg-black/40" />
          <div className="relative bg-white w-full lg:max-w-md rounded-t-3xl lg:rounded-2xl shadow-2xl p-5 pb-8 lg:pb-5" onClick={e => e.stopPropagation()}>
            <div className="flex justify-center mb-3 lg:hidden"><div className="w-9 h-1 bg-gray-300 rounded-full" /></div>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-[16px] font-bold text-[var(--text)]">Editar movimiento</h3>
              <button onClick={() => setEditRetiro(null)} className="p-1.5 rounded-full text-gray-400 hover:bg-gray-100 cursor-pointer"><IconX size={16} /></button>
            </div>
            <div className="flex flex-col gap-3">
              <div className="flex rounded-xl border border-gray-200 overflow-hidden">
                <button onClick={() => setErTipo('retiro')}
                  className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-[13px] font-semibold transition-colors cursor-pointer ${erTipo === 'retiro' ? 'bg-amber-500 text-white' : 'bg-white text-gray-400 hover:bg-gray-50'}`}>
                  <IconDollar size={14} /> Retiro personal
                </button>
                <button onClick={() => setErTipo('sobre')}
                  className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-[13px] font-semibold transition-colors cursor-pointer ${erTipo === 'sobre' ? 'bg-purple-500 text-white' : 'bg-white text-gray-400 hover:bg-gray-50'}`}>
                  <IconArchive size={14} /> Sobre
                </button>
              </div>
              <div>
                <p className="text-[12px] font-medium text-gray-500 mb-1.5">Monto</p>
                <div className="relative">
                  <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[14px] text-gray-400">$</span>
                  <input type="number" min="1" value={erMonto} onChange={e => setErMonto(e.target.value)}
                    className="w-full border border-gray-200 rounded-xl pl-7 pr-3 py-2.5 text-[14px] focus:outline-none focus:border-[var(--primary)]" />
                </div>
              </div>
              <div>
                <p className="text-[12px] font-medium text-gray-500 mb-1.5">Descripción</p>
                <input type="text" value={erDesc} onChange={e => setErDesc(e.target.value)}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-[14px] focus:outline-none focus:border-[var(--primary)]" />
              </div>
              <div className="flex gap-2 pt-1">
                <button onClick={() => setEditRetiro(null)}
                  className="px-4 py-2.5 border border-gray-200 text-gray-500 rounded-xl text-[13px] cursor-pointer hover:bg-gray-50">Cancelar</button>
                <button onClick={guardarEditRetiro} disabled={erSaving}
                  className="flex-1 py-2.5 bg-[image:var(--gradient)] text-white rounded-xl text-[13px] font-semibold cursor-pointer disabled:opacity-40">
                  {erSaving ? 'Guardando…' : 'Guardar'}
                </button>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Modal: Ajuste de saldo */}
      {modalAjuste && createPortal(
        <div className="fixed inset-0 z-50 flex items-end lg:items-center justify-center" onClick={() => setModalAjuste(null)}>
          <div className="absolute inset-0 bg-black/40" />
          <div className="relative bg-white w-full lg:max-w-md rounded-t-3xl lg:rounded-2xl shadow-2xl p-5 pb-8 lg:pb-5" onClick={e => e.stopPropagation()}>
            <div className="flex justify-center mb-3 lg:hidden"><div className="w-9 h-1 bg-gray-300 rounded-full" /></div>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-[16px] font-bold text-[var(--text)]">Ajuste de saldo</h3>
              <button onClick={() => setModalAjuste(null)} className="p-1.5 rounded-full text-gray-400 hover:bg-gray-100 cursor-pointer"><IconX size={16} /></button>
            </div>
            <p className="text-[13px] text-[var(--text-muted)] mb-3">
              Para el {fmtFecha(modalAjuste.fecha)} · Saldo calculado: <strong>{fmt$(modalAjuste.saldo_actual)}</strong>
            </p>
            <div className="flex flex-col gap-3">
              <div>
                <p className="text-[12px] font-medium text-gray-500 mb-1.5">Saldo real en caja</p>
                <div className="relative">
                  <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[14px] text-gray-400">$</span>
                  <input type="number" value={afSaldo} onChange={e => setAfSaldo(e.target.value)} autoFocus
                    className="w-full border border-gray-200 rounded-xl pl-7 pr-3 py-2.5 text-[14px] focus:outline-none focus:border-[var(--primary)]" />
                </div>
              </div>
              <div>
                <p className="text-[12px] font-medium text-gray-500 mb-1.5">Motivo <span className="font-normal text-gray-400">(opcional)</span></p>
                <input type="text" value={afMotivo} onChange={e => setAfMotivo(e.target.value)} placeholder="ej: Conteo manual de cierre"
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-[14px] focus:outline-none focus:border-[var(--primary)]" />
              </div>
              {afError && <p className="text-red-500 text-[12px]">{afError}</p>}
              <div className="flex gap-2 pt-1">
                <button onClick={() => setModalAjuste(null)}
                  className="px-4 py-2.5 border border-gray-200 text-gray-500 rounded-xl text-[13px] cursor-pointer hover:bg-gray-50">Cancelar</button>
                <button onClick={guardarAjuste} disabled={afSaving}
                  className="flex-1 py-2.5 bg-[image:var(--gradient)] text-white rounded-xl text-[13px] font-semibold cursor-pointer disabled:opacity-40">
                  {afSaving ? 'Guardando…' : 'Guardar ajuste'}
                </button>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Modal: Configuración */}
      {modalConfig && createPortal(
        <div className="fixed inset-0 z-50 flex items-end lg:items-center justify-center" onClick={() => setModalConfig(false)}>
          <div className="absolute inset-0 bg-black/40" />
          <div className="relative bg-white w-full lg:max-w-md rounded-t-3xl lg:rounded-2xl shadow-2xl p-5 pb-8 lg:pb-5" onClick={e => e.stopPropagation()}>
            <div className="flex justify-center mb-3 lg:hidden"><div className="w-9 h-1 bg-gray-300 rounded-full" /></div>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-[16px] font-bold text-[var(--text)]">Configuración de caja</h3>
              <button onClick={() => setModalConfig(false)} className="p-1.5 rounded-full text-gray-400 hover:bg-gray-100 cursor-pointer"><IconX size={16} /></button>
            </div>
            <div className="flex flex-col gap-3">
              <div>
                <p className="text-[12px] font-medium text-gray-500 mb-1.5">Saldo inicial</p>
                <div className="relative">
                  <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[14px] text-gray-400">$</span>
                  <input type="number" min="0" value={cfSaldoInicial} onChange={e => setCfSaldoInicial(e.target.value)}
                    className="w-full border border-gray-200 rounded-xl pl-7 pr-3 py-2.5 text-[14px] focus:outline-none focus:border-[var(--primary)]" />
                </div>
              </div>
              <div>
                <p className="text-[12px] font-medium text-gray-500 mb-1.5">Fecha de inicio</p>
                <input type="date" value={cfFechaInicio} max={todayAR()} onChange={e => setCfFechaInicio(e.target.value)}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-[14px] focus:outline-none focus:border-[var(--primary)]" />
              </div>
              <div>
                <p className="text-[12px] font-medium text-gray-500 mb-1.5">Medio de pago efectivo en Loyverse</p>
                <input type="text" value={cfPaymentName} onChange={e => setCfPaymentName(e.target.value)}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-[14px] focus:outline-none focus:border-[var(--primary)]" />
              </div>
              {cfError && <p className="text-red-500 text-[12px]">{cfError}</p>}
              <div className="flex gap-2 pt-1">
                <button onClick={() => setModalConfig(false)}
                  className="px-4 py-2.5 border border-gray-200 text-gray-500 rounded-xl text-[13px] cursor-pointer hover:bg-gray-50">Cancelar</button>
                <button onClick={guardarConfig} disabled={cfSaving}
                  className="flex-1 py-2.5 bg-[image:var(--gradient)] text-white rounded-xl text-[13px] font-semibold cursor-pointer disabled:opacity-40">
                  {cfSaving ? 'Guardando…' : 'Guardar'}
                </button>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  )
}

// ─── Tab Productividad ────────────────────────────────────────────────────────

type SortKey = 'nombre' | 'citas' | 'ventas' | 'sueldo' | 'coef' | 'ocup' | 'asist'

function coefPct(e: EmpleadaRow): number | null {
  if (e.sueldo === null || e.ventaNeta <= 0) return null
  return Math.round(e.sueldo / e.ventaNeta * 100)
}

function TabProductividad({ data }: { data: ApiData }) {
  const [sortKey, setSortKey] = useState<SortKey>('coef')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')

  function toggleSort(k: SortKey) {
    if (sortKey === k) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(k); setSortDir('desc') }
  }

  const prodOrdenada = [...data.productividad].sort((a, b) => {
    const dir = sortDir === 'asc' ? 1 : -1
    function cmp(va: number | null, vb: number | null): number {
      if (va === null && vb === null) return 0
      if (va === null) return 1; if (vb === null) return -1
      return dir * (va - vb)
    }
    switch (sortKey) {
      case 'nombre': return dir * a.nombre.localeCompare(b.nombre, 'es')
      case 'citas':  return dir * (a.citas - b.citas)
      case 'ventas': return dir * (a.ventaNeta - b.ventaNeta)
      case 'sueldo': return cmp(a.sueldo, b.sueldo)
      case 'coef':   return cmp(coefPct(a), coefPct(b))
      case 'ocup':   return cmp(a.ocupacionPct, b.ocupacionPct)
      case 'asist': {
        const ra = a.diasHabiles > 0 ? a.diasPresente / a.diasHabiles : null
        const rb = b.diasHabiles > 0 ? b.diasPresente / b.diasHabiles : null
        return cmp(ra, rb)
      }
      default: return 0
    }
  })

  const sortIcon = (k: SortKey) => sortKey === k ? (sortDir === 'asc' ? ' ↑' : ' ↓') : ''
  const thCls = (k: SortKey, right = true) =>
    `${right ? 'text-right' : 'text-left'} px-3 py-2.5 font-medium cursor-pointer select-none hover:text-[var(--text)] whitespace-nowrap transition-colors`

  if (!data.productividad.length) return (
    <div className="text-center py-10 text-[var(--text-muted)] text-[14px]">Sin datos de productividad para este mes.</div>
  )

  return (
    <div className="bg-white rounded-2xl border border-[var(--border)] overflow-hidden">
      <div className="px-4 py-3 border-b border-[var(--border)]">
        <p className="text-[13px] font-semibold text-[var(--text)] flex items-center gap-2">
          <IconUsers size={15} className="text-[var(--primary)]" /> Productividad por empleada
        </p>
      </div>
      <div className="lg:hidden overflow-x-auto">
        <table className="w-full text-[11px] min-w-[380px]">
          <thead>
            <tr className="border-b border-gray-100 text-[var(--text-muted)] uppercase tracking-wide">
              <th className={thCls('nombre', false) + ' pl-4'} onClick={() => toggleSort('nombre')}>Empleada{sortIcon('nombre')}</th>
              <th className={thCls('citas')} onClick={() => toggleSort('citas')}>Citas{sortIcon('citas')}</th>
              <th className={thCls('ventas')} onClick={() => toggleSort('ventas')}>Ventas{sortIcon('ventas')}</th>
              <th className={thCls('sueldo')} onClick={() => toggleSort('sueldo')}>Sueldo{sortIcon('sueldo')}</th>
              <th className={thCls('coef') + ' pr-4'} onClick={() => toggleSort('coef')}>Coef.{sortIcon('coef')}</th>
            </tr>
          </thead>
          <tbody>
            {prodOrdenada.map((e, i) => {
              const c = coefPct(e)
              return (
                <tr key={i} className="border-b border-gray-50 last:border-0">
                  <td className="pl-4 pr-2 py-2.5 font-semibold text-[var(--text)] max-w-[120px] truncate">{e.nombre}</td>
                  <td className="px-3 py-2.5 text-right text-[var(--text-muted)]">{e.citas}</td>
                  <td className="px-3 py-2.5 text-right font-semibold">{fmt$(e.ventaNeta)}</td>
                  <td className="px-3 py-2.5 text-right">
                    {e.sueldo !== null ? <span className="font-semibold text-amber-600">{fmt$(e.sueldo)}</span> : <span className="text-gray-300">—</span>}
                  </td>
                  <td className="pr-4 pl-3 py-2.5 text-right">
                    {c !== null
                      ? <span className={`font-bold ${c > 65 ? 'text-red-500' : c > 50 ? 'text-amber-500' : 'text-green-600'}`}>{c}%</span>
                      : <span className="text-gray-300">—</span>}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <div className="hidden lg:block overflow-x-auto">
        <table className="w-full text-[12px]">
          <thead>
            <tr className="border-b border-[var(--border)] text-[var(--text-muted)]">
              <th className={thCls('nombre', false) + ' pl-4'} onClick={() => toggleSort('nombre')}>Empleada{sortIcon('nombre')}</th>
              <th className={thCls('citas')} onClick={() => toggleSort('citas')}>Citas{sortIcon('citas')}</th>
              <th className={thCls('ventas')} onClick={() => toggleSort('ventas')}>Ventas{sortIcon('ventas')}</th>
              <th className={thCls('sueldo')} onClick={() => toggleSort('sueldo')}>Sueldo{sortIcon('sueldo')}</th>
              <th className={thCls('coef')} onClick={() => toggleSort('coef')}>Coef. sueldo/ventas{sortIcon('coef')}</th>
              <th className={thCls('ocup')} onClick={() => toggleSort('ocup')}>T. ocup.{sortIcon('ocup')}</th>
              <th className="text-right px-3 py-2.5 font-medium text-[var(--text-muted)] whitespace-nowrap">T. libre</th>
              <th className={thCls('ocup')} onClick={() => toggleSort('ocup')}>% ocup.{sortIcon('ocup')}</th>
              <th className={thCls('asist') + ' pr-4'} onClick={() => toggleSort('asist')}>Asist.{sortIcon('asist')}</th>
            </tr>
          </thead>
          <tbody>
            {prodOrdenada.map((e, i) => {
              const c = coefPct(e)
              return (
                <tr key={i} className="border-b border-gray-50 last:border-0">
                  <td className="pl-4 pr-3 py-3 font-medium text-[var(--text)]">{e.nombre}</td>
                  <td className="px-3 py-3 text-right text-[var(--text-muted)]">{e.citas}</td>
                  <td className="px-3 py-3 text-right font-semibold">{e.ventaNeta > 0 ? fmt$(e.ventaNeta) : <span className="text-gray-300">—</span>}</td>
                  <td className="px-3 py-3 text-right">
                    {e.sueldo !== null ? <span className="font-semibold text-amber-600">{fmt$(e.sueldo)}</span> : <span className="text-gray-300">—</span>}
                  </td>
                  <td className="px-3 py-3 text-right">
                    {c !== null
                      ? <span className={`font-bold ${c > 65 ? 'text-red-500' : c > 50 ? 'text-amber-500' : 'text-green-600'}`}>{c}%</span>
                      : <span className="text-gray-300">—</span>}
                  </td>
                  <td className="px-3 py-3 text-right text-[var(--text-muted)]">{e.minOcupada > 0 ? fmtMin(e.minOcupada) : <span className="text-gray-300">—</span>}</td>
                  <td className="px-3 py-3 text-right text-[var(--text-muted)]">{e.minLibre > 0 ? fmtMin(e.minLibre) : <span className="text-gray-300">—</span>}</td>
                  <td className="px-3 py-3 text-right">
                    {e.ocupacionPct !== null
                      ? <span className={`font-semibold ${e.ocupacionPct >= 70 ? 'text-green-600' : e.ocupacionPct >= 40 ? 'text-amber-500' : 'text-red-500'}`}>{e.ocupacionPct}%</span>
                      : <span className="text-gray-300">—</span>}
                  </td>
                  <td className="pr-4 pl-3 py-3 text-right text-[var(--text-muted)]">{e.diasHabiles > 0 ? `${e.diasPresente}/${e.diasHabiles}d` : '—'}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <p className="px-4 py-2 text-[10px] text-[var(--text-muted)] border-t border-gray-50">
        Ventas: precio Loyverse ×0.9 (canjes al precio del servicio base) · Sueldo: bruto hoja &quot;Todas&quot; · Coef.: sueldo/ventas · Ocup.: tiempo en citas vs horario base
      </p>
    </div>
  )
}

// ─── Tab Servicios ────────────────────────────────────────────────────────────

function TabServicios({ data }: { data: ApiData }) {
  if (!data.servicios.length && !data.rentabilidad.length) return (
    <div className="text-center py-10 text-[var(--text-muted)] text-[14px]">Sin datos de servicios para este mes.</div>
  )
  return (
    <div className="flex flex-col gap-5">
      {data.servicios.length > 0 && (
        <div className="bg-white rounded-2xl border border-[var(--border)] overflow-hidden">
          <div className="px-4 py-3 border-b border-[var(--border)]">
            <p className="text-[13px] font-semibold text-[var(--text)] flex items-center gap-2">
              <IconCalendarCheck size={15} className="text-[var(--primary)]" /> Servicios más pedidos
            </p>
          </div>
          <div className="px-4 py-3 flex flex-col gap-3">
            {(() => {
              const maxCant = Math.max(...data.servicios.map(s => s.cantidad), 1)
              return data.servicios.map((s, i) => (
                <div key={i}>
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex-1 min-w-0 mr-3">
                      <p className="text-[13px] font-medium text-[var(--text)] truncate">{s.servicio}</p>
                      {s.categoria && <p className="text-[10px] text-[var(--text-muted)]">{s.categoria}</p>}
                    </div>
                    <span className="text-[12px] font-semibold text-[var(--text)] shrink-0">{s.cantidad} citas</span>
                  </div>
                  <BaraCSS pct={s.cantidad / maxCant * 100} />
                </div>
              ))
            })()}
          </div>
        </div>
      )}
      {data.rentabilidad.length > 0 && (
        <div className="bg-white rounded-2xl border border-[var(--border)] overflow-hidden">
          <div className="px-4 py-3 border-b border-[var(--border)]">
            <p className="text-[13px] font-semibold text-[var(--text)] flex items-center gap-2">
              <IconDollar size={15} className="text-[var(--primary)]" /> Rentabilidad por servicio
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-[12px]">
              <thead>
                <tr className="border-b border-[var(--border)] text-[var(--text-muted)]">
                  <th className="text-left px-4 py-2.5 font-medium">Servicio</th>
                  <th className="text-right px-3 py-2.5 font-medium">Citas</th>
                  <th className="text-right px-3 py-2.5 font-medium">Duración</th>
                  <th className="text-right px-3 py-2.5 font-medium">Precio prom.</th>
                  <th className="text-right px-4 py-2.5 font-medium">$/hora</th>
                </tr>
              </thead>
              <tbody>
                {data.rentabilidad.map((s, i) => (
                  <tr key={i} className="border-b border-gray-50 last:border-0">
                    <td className="px-4 py-3">
                      <p className="font-medium text-[var(--text)]">{s.servicio}</p>
                      {s.categoria && <p className="text-[10px] text-[var(--text-muted)]">{s.categoria}</p>}
                    </td>
                    <td className="px-3 py-3 text-right text-[var(--text-muted)]">{s.cantidad}</td>
                    <td className="px-3 py-3 text-right text-[var(--text-muted)]">{s.duracionMin !== null ? fmtMin(s.duracionMin) : '—'}</td>
                    <td className="px-3 py-3 text-right text-[var(--text-muted)]">{fmt$(s.ventaNeta / s.cantidad)}</td>
                    <td className="px-4 py-3 text-right font-semibold text-[var(--primary)]">{fmt$(s.precioPorHora!)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="px-4 py-2 text-[10px] text-[var(--text-muted)] border-t border-gray-50">
            $/hora = precio promedio ÷ duración promedio · Fuente: Fresha
          </p>
        </div>
      )}
    </div>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────

type Tab = 'resumen' | 'caja' | 'productividad' | 'servicios'

export default function InformesClient({ user: _user }: { user: SessionUser }) {
  const [mes, setMes] = useState(mesActual)
  const [tab, setTab] = useState<Tab>('resumen')
  const [datos, setDatos] = useState<ApiData | null>(null)
  const [ultimaActualizacion, setUltimaActualizacion] = useState<string | null>(null)
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const topRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setCargando(true); setError(null)
    fetch(`/api/informes?mes=${mes}`)
      .then(r => r.json())
      .then(d => {
        if (d.error) setError(d.error)
        else {
          setDatos(d)
          if (d.ultimaActualizacion) setUltimaActualizacion(d.ultimaActualizacion)
        }
      })
      .catch(() => setError('Error al cargar'))
      .finally(() => setCargando(false))
  }, [mes])

  const actual = mesActual()
  const puedeAvanzar = mes < actual
  const k = datos?.kpis

  const TABS: { key: Tab; label: string }[] = [
    { key: 'resumen', label: 'Resumen' },
    { key: 'caja', label: 'Caja' },
    { key: 'productividad', label: 'Productividad' },
    { key: 'servicios', label: 'Servicios' },
  ]

  return (
    <div className="py-4 fade-in" ref={topRef}>
      {/* Header */}
      <div className="flex items-center gap-3 mb-4">
        <div className="w-9 h-9 rounded-xl bg-[image:var(--gradient)] flex items-center justify-center flex-shrink-0 shadow-sm">
          <IconBarChart size={18} className="text-white" />
        </div>
        <div>
          <h1 className="text-[17px] font-bold text-[var(--text)] leading-tight">Contabilidad</h1>
          {ultimaActualizacion && (
            <p className="text-[11px] text-[var(--text-muted)] flex items-center gap-1 mt-0.5">
              <IconClock size={11} />
              Actualizado {relTime(ultimaActualizacion)}
            </p>
          )}
        </div>
      </div>

      {/* Month navigator */}
      <div className="flex items-center justify-between bg-white rounded-2xl border border-[var(--border)] px-4 py-3 mb-4">
        <button onClick={() => setMes(prevMes)} className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-gray-50 transition-colors cursor-pointer">
          <IconChevronLeft size={18} />
        </button>
        <span className="text-[15px] font-semibold text-[var(--text)]">{fmtMes(mes)}</span>
        <button onClick={() => puedeAvanzar && setMes(nextMes)} className={`p-1.5 rounded-lg transition-colors ${puedeAvanzar ? 'text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-gray-50 cursor-pointer' : 'text-gray-200 cursor-default'}`}>
          <IconChevronRight size={18} />
        </button>
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 bg-gray-100 rounded-2xl p-1 mb-5 overflow-x-auto">
        {TABS.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`flex-1 min-w-fit px-3 py-2 rounded-xl text-[12px] font-semibold whitespace-nowrap transition-all cursor-pointer ${
              tab === t.key ? 'bg-white text-[var(--primary)] shadow-sm' : 'text-[var(--text-muted)] hover:text-[var(--text)]'
            }`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Caja tab — independent loading */}
      {tab === 'caja' && <TabCaja mes={mes} />}

      {/* Other tabs — share informes API data */}
      {tab !== 'caja' && (
        <>
          {cargando && <div className="flex justify-center py-16"><Spinner /></div>}
          {error && !cargando && <div className="text-red-500 text-[14px] py-8 text-center">{error}</div>}

          {datos && !cargando && k && tab === 'resumen' && (
            <div className="flex flex-col gap-5">
              <div className="grid grid-cols-2 gap-3">
                <KpiCard label="Citas realizadas" value={String(k.totalCitas)} sub={k.canceladas > 0 ? `${k.canceladas} canceladas (${k.tasaCancelacion}%)` : undefined} />
                <KpiCard label="Ventas netas" value={fmt$(k.ventasNetas)} sub="Loyverse" />
                <KpiCard label="Gastos" value={fmt$(k.gastos)} />
                <KpiCard label="Masa salarial" value={k.sueldos > 0 ? fmt$(k.sueldos) : '—'} sub={k.sueldos > 0 ? 'Liquidaciones del mes' : 'Sin liquidaciones cargadas'} />
                <div className="col-span-2">
                  {(() => {
                    const rem = k.ventasNetas - k.sueldos - k.gastos
                    return <KpiCard label="Remanente del mes" value={fmt$(rem)} color={rem >= 0 ? 'text-green-600' : 'text-red-500'} sub="Ventas netas − sueldos − compras" />
                  })()}
                </div>
              </div>

              {k.proyeccion !== null && (
                <div className="bg-white rounded-2xl border border-[var(--border)] px-4 py-4">
                  <p className="text-[11px] text-[var(--text-muted)] font-medium uppercase tracking-wide mb-2">Proyección del mes · Loyverse</p>
                  <div className="flex items-end gap-2 mb-2">
                    <span className="text-[20px] font-bold text-[var(--primary)]">{fmt$(k.proyeccion)}</span>
                    <span className="text-[12px] text-[var(--text-muted)] mb-0.5">estimado cierre</span>
                  </div>
                  <div className="flex items-center gap-2 mb-1">
                    <BaraCSS pct={k.diasTranscurridos / k.diasDelMes * 100} />
                    <span className="text-[11px] text-[var(--text-muted)] whitespace-nowrap">Día {k.diasTranscurridos}/{k.diasDelMes}</span>
                  </div>
                  <p className="text-[11px] text-[var(--text-muted)]">{fmt$(k.ventasNetas)} acumulados</p>
                </div>
              )}

              {datos.pagosPorTipo.length > 0 && (
                <div className="bg-white rounded-2xl border border-[var(--border)] overflow-hidden">
                  <div className="px-4 py-3 border-b border-[var(--border)]">
                    <p className="text-[13px] font-semibold text-[var(--text)] flex items-center gap-2">
                      <IconReceipt size={15} className="text-[var(--primary)]" /> Ventas por medio de pago
                    </p>
                  </div>
                  <div className="px-4 py-3 flex flex-col gap-3">
                    {(() => {
                      const maxTotal = Math.max(...datos.pagosPorTipo.map(p => p.total), 1)
                      return datos.pagosPorTipo.map((p, i) => (
                        <div key={i}>
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-[13px] font-medium text-[var(--text)]">{p.tipo}</span>
                            <span className="text-[13px] font-semibold text-[var(--text)]">{fmt$(p.total)}</span>
                          </div>
                          <BaraCSS pct={p.total / maxTotal * 100} />
                        </div>
                      ))
                    })()}
                  </div>
                  <p className="px-4 py-2 text-[10px] text-[var(--text-muted)] border-t border-gray-50">
                    Monto neto cobrado por medio · Fuente: Loyverse
                  </p>
                </div>
              )}

              {k.totalCitas === 0 && datos.productividad.length === 0 && (
                <div className="text-center py-10 text-[var(--text-muted)] text-[14px]">Sin datos para este mes.</div>
              )}
            </div>
          )}

          {datos && !cargando && tab === 'productividad' && <TabProductividad data={datos} />}
          {datos && !cargando && tab === 'servicios' && <TabServicios data={datos} />}
        </>
      )}
    </div>
  )
}
