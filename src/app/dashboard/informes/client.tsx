'use client'

import { useState, useEffect } from 'react'
import type { SessionUser } from '@/types'
import { Spinner } from '@/components/ui'
import { IconBarChart, IconChevronLeft, IconChevronRight, IconDollar, IconCalendarCheck, IconClock, IconUsers } from '@/components/ui/Icons'

interface Kpis {
  totalCitas: number
  canceladas: number
  tasaCancelacion: number
  ventasNetas: number
  gastos: number
  balance: number
  proyeccion: number | null
  diasTranscurridos: number
  diasDelMes: number
  fuenteVentas: 'liquidacion' | 'fresha'
}

interface EmpleadaRow {
  nombre: string
  citas: number
  ventaNeta: number
  comision: number | null
  diasPresente: number
  diasAusente: number
  tardanzas: number
  duracionMin: number
  horasBase: number
  ocupacionPct: number | null
}

interface ServicioRow {
  servicio: string
  categoria: string
  cantidad: number
  ventaNeta: number
  duracionMin: number
  precioPorHora: number | null
}

interface ApiData {
  kpis: Kpis
  productividad: EmpleadaRow[]
  servicios: ServicioRow[]
  rentabilidad: ServicioRow[]
}

function fmt$(n: number) {
  return '$' + Math.round(n).toLocaleString('es-AR')
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
      .then(d => {
        if (d.error) setError(d.error)
        else setDatos(d)
      })
      .catch(() => setError('Error al cargar'))
      .finally(() => setCargando(false))
  }, [mes])

  const actual = mesActual()
  const puedeAvanzar = mes < actual
  const k = datos?.kpis

  return (
    <div className="pb-6">
      {/* Header */}
      <div className="flex items-center gap-3 mb-5">
        <IconBarChart size={22} className="text-[var(--primary)]" />
        <h1 className="text-[19px] font-bold text-[var(--text)]">Informes</h1>
      </div>

      {/* Selector de mes */}
      <div className="flex items-center justify-between bg-white rounded-2xl border border-[var(--border)] px-4 py-3 mb-5">
        <button
          onClick={() => setMes(prevMes)}
          className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-gray-50 transition-colors cursor-pointer"
        >
          <IconChevronLeft size={18} />
        </button>
        <span className="text-[15px] font-semibold text-[var(--text)]">{fmtMes(mes)}</span>
        <button
          onClick={() => puedeAvanzar && setMes(nextMes)}
          className={`p-1.5 rounded-lg transition-colors ${puedeAvanzar ? 'text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-gray-50 cursor-pointer' : 'text-gray-200 cursor-default'}`}
        >
          <IconChevronRight size={18} />
        </button>
      </div>

      {cargando && <div className="flex justify-center py-16"><Spinner /></div>}

      {error && !cargando && (
        <div className="flex items-center gap-2 text-red-500 text-[14px] py-8 justify-center">
          {error}
        </div>
      )}

      {datos && !cargando && k && (
        <div className="flex flex-col gap-5">

          {/* KPI cards principales */}
          <div className="grid grid-cols-2 gap-3">
            <KpiCard label="Citas realizadas" value={String(k.totalCitas)} sub={k.canceladas > 0 ? `${k.canceladas} canceladas (${k.tasaCancelacion}%)` : undefined} />
            <KpiCard label="Ventas netas" value={fmt$(k.ventasNetas)} sub={k.fuenteVentas === 'fresha' ? 'Estimado (Fresha)' : undefined} />
            <KpiCard label="Gastos" value={fmt$(k.gastos)} />
            <KpiCard
              label="Balance estimado"
              value={fmt$(k.balance)}
              color={k.balance >= 0 ? 'text-green-600' : 'text-red-500'}
            />
          </div>

          {/* Proyección */}
          {k.proyeccion !== null && (
            <div className="bg-white rounded-2xl border border-[var(--border)] px-4 py-4">
              <p className="text-[11px] text-[var(--text-muted)] font-medium uppercase tracking-wide mb-2">Proyección del mes</p>
              <div className="flex items-end gap-2 mb-2">
                <span className="text-[20px] font-bold text-[var(--primary)]">{fmt$(k.proyeccion)}</span>
                <span className="text-[12px] text-[var(--text-muted)] mb-0.5">estimado cierre</span>
              </div>
              <div className="flex items-center gap-2">
                <BaraCSS pct={k.diasTranscurridos / k.diasDelMes * 100} color="var(--primary)" />
                <span className="text-[11px] text-[var(--text-muted)] whitespace-nowrap">
                  Día {k.diasTranscurridos}/{k.diasDelMes}
                </span>
              </div>
              <p className="text-[11px] text-[var(--text-muted)] mt-1.5">
                {fmt$(k.ventasNetas)} registrados hasta hoy
              </p>
            </div>
          )}

          {/* Productividad por empleada */}
          {datos.productividad.length > 0 && (
            <div className="bg-white rounded-2xl border border-[var(--border)] overflow-hidden">
              <div className="px-4 py-3 border-b border-[var(--border)] flex items-center justify-between">
                <p className="text-[13px] font-semibold text-[var(--text)] flex items-center gap-2">
                  <IconUsers size={15} className="text-[var(--primary)]" /> Productividad por empleada
                </p>
                <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${k.fuenteVentas === 'liquidacion' ? 'bg-green-50 text-green-700' : 'bg-amber-50 text-amber-700'}`}>
                  {k.fuenteVentas === 'liquidacion' ? 'Desde liquidación' : 'Estimado (Fresha)'}
                </span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-[12px]">
                  <thead>
                    <tr className="border-b border-[var(--border)] text-[var(--text-muted)]">
                      <th className="text-left px-4 py-2.5 font-medium">Empleada</th>
                      <th className="text-right px-3 py-2.5 font-medium">Citas</th>
                      <th className="text-right px-3 py-2.5 font-medium">Ventas</th>
                      {datos.productividad.some(e => e.comision !== null) && (
                        <th className="text-right px-3 py-2.5 font-medium">Comisión</th>
                      )}
                      <th className="text-right px-3 py-2.5 font-medium">Asist.</th>
                      <th className="text-right px-4 py-2.5 font-medium">Ocup.</th>
                    </tr>
                  </thead>
                  <tbody>
                    {datos.productividad.map((e, i) => (
                      <tr key={i} className="border-b border-gray-50 last:border-0">
                        <td className="px-4 py-3 font-medium text-[var(--text)]">{e.nombre}</td>
                        <td className="px-3 py-3 text-right text-[var(--text-muted)]">{e.citas}</td>
                        <td className="px-3 py-3 text-right font-semibold text-[var(--text)]">{fmt$(e.ventaNeta)}</td>
                        {datos.productividad.some(e => e.comision !== null) && (
                          <td className="px-3 py-3 text-right text-[var(--primary)] font-medium">
                            {e.comision !== null ? fmt$(e.comision) : <span className="text-gray-300">—</span>}
                          </td>
                        )}
                        <td className="px-3 py-3 text-right text-[var(--text-muted)]">
                          {e.diasPresente}d{e.tardanzas > 0 ? ` · ${e.tardanzas}t` : ''}{e.diasAusente > 0 ? ` · ${e.diasAusente}a` : ''}
                        </td>
                        <td className="px-4 py-3 text-right">
                          {e.ocupacionPct !== null ? (
                            <span className={`font-semibold ${e.ocupacionPct >= 70 ? 'text-green-600' : e.ocupacionPct >= 40 ? 'text-amber-500' : 'text-red-500'}`}>
                              {e.ocupacionPct}%
                            </span>
                          ) : <span className="text-gray-300">—</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="px-4 py-2 text-[10px] text-[var(--text-muted)] border-t border-gray-50">
                Asist. = días presentes · t tardanzas · a ausencias · Ocup. = tiempo en citas / horas base
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
                        <div className="flex items-center gap-2 text-[12px] shrink-0">
                          <span className="font-semibold text-[var(--text)]">{s.cantidad} citas</span>
                          <span className="text-[var(--text-muted)]">{fmt$(s.ventaNeta)}</span>
                        </div>
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
                        <td className="px-3 py-3 text-right text-[var(--text-muted)]">{fmt$(s.ventaNeta / s.cantidad)}</td>
                        <td className="px-4 py-3 text-right">
                          <span className="font-semibold text-[var(--primary)]">{fmt$(s.precioPorHora!)}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="px-4 py-2 text-[10px] text-[var(--text-muted)] border-t border-gray-50">
                $/hora = precio promedio del servicio ÷ duración promedio en horas
              </p>
            </div>
          )}

          {k.totalCitas === 0 && datos.productividad.length === 0 && (
            <div className="text-center py-10 text-[var(--text-muted)] text-[14px]">
              Sin datos de citas para este mes.
              <p className="text-[12px] mt-1">Los informes se actualizan diariamente con la importación de Fresha.</p>
            </div>
          )}

        </div>
      )}
    </div>
  )
}
