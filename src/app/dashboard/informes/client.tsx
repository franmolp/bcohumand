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

export default function InformesClient({ user }: { user: SessionUser }) {
  const [mes, setMes] = useState(mesActual)
  const [datos, setDatos] = useState<ApiData | null>(null)
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)

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

  return (
    <div className="pb-6">
      <div className="flex items-center gap-3 mb-5">
        <IconBarChart size={22} className="text-[var(--primary)]" />
        <h1 className="text-[19px] font-bold text-[var(--text)]">Informes</h1>
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
            <KpiCard label="Balance estimado" value={fmt$(k.balance)} color={k.balance >= 0 ? 'text-green-600' : 'text-red-500'} />
            {k.sueldos > 0 && (
              <div className="col-span-2">
                <KpiCard label="Masa salarial" value={fmt$(k.sueldos)} sub="Total liquidaciones cargadas del mes" />
              </div>
            )}
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
              <div className="lg:hidden">
                <div className="flex items-center px-4 py-2 border-b border-gray-100 text-[9px] text-[var(--text-muted)] uppercase tracking-wide">
                  <span className="flex-1">Empleada</span>
                  <span className="w-8 text-right">Citas</span>
                  <span className="w-[80px] text-right">Ventas</span>
                  <span className="w-[72px] text-right">Sueldo</span>
                  <span className="w-10 text-right">Ocup.</span>
                </div>
                {datos.productividad.map((e, i) => (
                  <div key={i} className="flex items-center px-4 py-2.5 border-b border-gray-50 last:border-0">
                    <span className="flex-1 text-[12px] font-semibold truncate pr-2">{e.nombre}</span>
                    <span className="w-8 text-right text-[12px] text-[var(--text-muted)]">{e.citas}</span>
                    <span className="w-[80px] text-right text-[12px] font-semibold">{fmt$(e.ventaNeta)}</span>
                    <span className="w-[72px] text-right text-[12px]">
                      {e.sueldo !== null ? <span className="font-semibold text-amber-600">{fmt$(e.sueldo)}</span> : <span className="text-gray-300">—</span>}
                    </span>
                    <span className="w-10 text-right text-[12px]">
                      {e.ocupacionPct !== null
                        ? <span className={`font-semibold ${e.ocupacionPct >= 70 ? 'text-green-600' : e.ocupacionPct >= 40 ? 'text-amber-500' : 'text-red-500'}`}>{e.ocupacionPct}%</span>
                        : <span className="text-gray-300">—</span>}
                    </span>
                  </div>
                ))}
              </div>

              {/* Desktop */}
              <div className="hidden lg:block overflow-x-auto">
                <table className="w-full text-[12px]">
                  <thead>
                    <tr className="border-b border-[var(--border)] text-[var(--text-muted)]">
                      <th className="text-left px-4 py-2.5 font-medium">Empleada</th>
                      <th className="text-right px-3 py-2.5 font-medium">Citas</th>
                      <th className="text-right px-3 py-2.5 font-medium">Ventas (Loyverse)</th>
                      <th className="text-right px-3 py-2.5 font-medium">Sueldo</th>
                      <th className="text-right px-3 py-2.5 font-medium">T. ocup.</th>
                      <th className="text-right px-3 py-2.5 font-medium">T. libre</th>
                      <th className="text-right px-3 py-2.5 font-medium">% ocup.</th>
                      <th className="text-right px-4 py-2.5 font-medium">Asist.</th>
                    </tr>
                  </thead>
                  <tbody>
                    {datos.productividad.map((e, i) => (
                      <tr key={i} className="border-b border-gray-50 last:border-0">
                        <td className="px-4 py-3 font-medium text-[var(--text)]">{e.nombre}</td>
                        <td className="px-3 py-3 text-right text-[var(--text-muted)]">{e.citas}</td>
                        <td className="px-3 py-3 text-right font-semibold text-[var(--text)]">{e.ventaNeta > 0 ? fmt$(e.ventaNeta) : <span className="text-gray-300">—</span>}</td>
                        <td className="px-3 py-3 text-right">
                          {e.sueldo !== null ? <span className="font-semibold text-amber-600">{fmt$(e.sueldo)}</span> : <span className="text-gray-300">—</span>}
                        </td>
                        <td className="px-3 py-3 text-right text-[var(--text-muted)]">{e.minOcupada > 0 ? fmtMin(e.minOcupada) : <span className="text-gray-300">—</span>}</td>
                        <td className="px-3 py-3 text-right text-[var(--text-muted)]">{e.minLibre > 0 ? fmtMin(e.minLibre) : <span className="text-gray-300">—</span>}</td>
                        <td className="px-3 py-3 text-right">
                          {e.ocupacionPct !== null
                            ? <span className={`font-semibold ${e.ocupacionPct >= 70 ? 'text-green-600' : e.ocupacionPct >= 40 ? 'text-amber-500' : 'text-red-500'}`}>{e.ocupacionPct}%</span>
                            : <span className="text-gray-300">—</span>}
                        </td>
                        <td className="px-4 py-3 text-right text-[var(--text-muted)]">{e.diasHabiles > 0 ? `${e.diasPresente}/${e.diasHabiles}d` : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="px-4 py-2 text-[10px] text-[var(--text-muted)] border-t border-gray-50">
                Ventas: precio de lista -10% (bruto Loyverse, incluye servicios de cortesía) · Sueldo: bruto hoja "Todas" del Excel · Ocup.: tiempo en citas vs horario base (Fresha)
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
