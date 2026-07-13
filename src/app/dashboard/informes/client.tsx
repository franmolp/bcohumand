'use client'

import { useState, useEffect } from 'react'
import type { SessionUser } from '@/types'
import { Spinner } from '@/components/ui'
import { IconBarChart, IconChevronLeft, IconChevronRight, IconDollar, IconCalendarCheck, IconUsers, IconReceipt } from '@/components/ui/Icons'

interface Kpis {
  totalCitas: number
  canceladas: number
  tasaCancelacion: number
  ventasNetas: number
  gastos: number
  sueldos: number
  balance: number
  proyeccion: number | null
  diasTranscurridos: number
  diasDelMes: number
}

interface EmpleadaRow {
  nombre: string
  citas: number
  ventaNeta: number
  sueldo: number | null
  minOcupada: number
  minLibre: number
  ocupacionPct: number | null
  diasPresente: number
  diasHabiles: number
}

interface ServicioRow {
  servicio: string
  categoria: string
  cantidad: number
  ventaNeta: number
  duracionMin: number | null
  precioPorHora: number | null
}

interface PagoRow {
  tipo: string
  total: number
}

interface ApiData {
  kpis: Kpis
  pagosPorTipo: PagoRow[]
  productividad: EmpleadaRow[]
  servicios: ServicioRow[]
  rentabilidad: ServicioRow[]
}

function fmt$(n: number) {
  return '$' + Math.round(n).toLocaleString('es-AR')
}

function fmtMin(m: number) {
  const h = Math.floor(m / 60)
  const min = m % 60
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

function mesActual() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' }).substring(0, 7)
}

function prevMes(mes: string) {
  const [y, m] = mes.split('-').map(Number)
  return new Date(y, m - 2, 1).toLocaleDateString('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' }).substring(0, 7)
}

function nextMes(mes: string) {
  const [y, m] = mes.split('-').map(Number)
  return new Date(y, m, 1).toLocaleDateString('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' }).substring(0, 7)
}

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

type SortKey = 'nombre' | 'citas' | 'ventas' | 'sueldo' | 'coef' | 'ocup' | 'asist'

function coefPct(e: EmpleadaRow): number | null {
  if (e.sueldo === null || e.ventaNeta <= 0) return null
  return Math.round(e.sueldo / e.ventaNeta * 100)
}

export default function InformesClient({ user }: { user: SessionUser }) {
  const [mes, setMes] = useState(mesActual)
  const [datos, setDatos] = useState<ApiData | null>(null)
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [sortKey, setSortKey] = useState<SortKey>('coef')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')

  function toggleSort(k: SortKey) {
    if (sortKey === k) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(k); setSortDir('desc') }
  }

  useEffect(() => {
    setCargando(true)
    setError(null)
    fetch(`/api/informes?mes=${mes}`)
      .then(r => r.json())
      .then(d => { if (d.error) setError(d.error); else setDatos(d) })
      .catch(() => setError('Error al cargar'))
      .finally(() => setCargando(false))
  }, [mes])

  const actual = mesActual()
  const puedeAvanzar = mes < actual
  const k = datos?.kpis

  const prodOrdenada = [...(datos?.productividad ?? [])].sort((a, b) => {
    const dir = sortDir === 'asc' ? 1 : -1
    // helper: null siempre al fondo independientemente de la dirección
    function cmp(va: number | null, vb: number | null): number {
      if (va === null && vb === null) return 0
      if (va === null) return 1
      if (vb === null) return -1
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

  return (
    <div className="py-4 fade-in">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-9 h-9 rounded-xl bg-[image:var(--gradient)] flex items-center justify-center flex-shrink-0 shadow-sm">
          <IconBarChart size={18} className="text-white" />
        </div>
        <h1 className="text-[17px] font-bold text-[var(--text)]">Informes</h1>
      </div>

      <div className="flex items-center justify-between bg-white rounded-2xl border border-[var(--border)] px-4 py-3 mb-5">
        <button onClick={() => setMes(prevMes)} className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-gray-50 transition-colors cursor-pointer">
          <IconChevronLeft size={18} />
        </button>
        <span className="text-[15px] font-semibold text-[var(--text)]">{fmtMes(mes)}</span>
        <button onClick={() => puedeAvanzar && setMes(nextMes)} className={`p-1.5 rounded-lg transition-colors ${puedeAvanzar ? 'text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-gray-50 cursor-pointer' : 'text-gray-200 cursor-default'}`}>
          <IconChevronRight size={18} />
        </button>
      </div>

      {cargando && <div className="flex justify-center py-16"><Spinner /></div>}
      {error && !cargando && <div className="text-red-500 text-[14px] py-8 text-center">{error}</div>}

      {datos && !cargando && k && (
        <div className="flex flex-col gap-5">

          {/* KPIs principales */}
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

          {/* Proyección */}
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

          {/* Ventas por tipo de pago */}
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

          {/* Productividad por empleada */}
          {datos.productividad.length > 0 && (
            <div className="bg-white rounded-2xl border border-[var(--border)] overflow-hidden">
              <div className="px-4 py-3 border-b border-[var(--border)]">
                <p className="text-[13px] font-semibold text-[var(--text)] flex items-center gap-2">
                  <IconUsers size={15} className="text-[var(--primary)]" /> Productividad por empleada
                </p>
              </div>

              {/* Mobile */}
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

              {/* Desktop */}
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
                          <td className="px-3 py-3 text-right font-semibold text-[var(--text)]">{e.ventaNeta > 0 ? fmt$(e.ventaNeta) : <span className="text-gray-300">—</span>}</td>
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
                Ventas: precio Loyverse ×0.9 (canjes al precio del servicio base) · Sueldo: bruto hoja "Todas" · Coef.: sueldo/ventas · Ocup.: tiempo en citas vs horario base
              </p>
            </div>
          )}

          {/* Servicios más pedidos */}
          {datos.servicios.length > 0 && (
            <div className="bg-white rounded-2xl border border-[var(--border)] overflow-hidden">
              <div className="px-4 py-3 border-b border-[var(--border)]">
                <p className="text-[13px] font-semibold text-[var(--text)] flex items-center gap-2">
                  <IconCalendarCheck size={15} className="text-[var(--primary)]" /> Servicios
                </p>
              </div>
              <div className="px-4 py-3 flex flex-col gap-3">
                {(() => {
                  const maxCant = Math.max(...datos.servicios.map(s => s.cantidad), 1)
                  return datos.servicios.map((s, i) => (
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

          {/* Rentabilidad por servicio */}
          {datos.rentabilidad.length > 0 && (
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
                    {datos.rentabilidad.map((s, i) => (
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

          {k.totalCitas === 0 && datos.productividad.length === 0 && (
            <div className="text-center py-10 text-[var(--text-muted)] text-[14px]">
              Sin datos para este mes.
            </div>
          )}

        </div>
      )}
    </div>
  )
}
