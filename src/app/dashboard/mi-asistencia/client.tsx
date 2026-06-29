'use client'

import { useState, useEffect, useMemo } from 'react'
import { Spinner } from '@/components/ui'
import { IconClipboard } from '@/components/ui/Icons'
import { CHIP_INFO } from '@/lib/asistencia'
import type { SessionUser } from '@/types'

interface Registro {
  fecha: string
  dia_semana: string | null
  estado: string | null
  fichada_entrada: string | null
  fichada_salida: string | null
  horas_fichadas: number | null
  horas_base: number | null
  minutos_tarde: number | null
  tiene_justificacion: boolean | null
  horario_base_entrada: string | null
  horario_base_salida: string | null
  motivo: string | null
  tipo_ausencia?: string | null
  comentario_admin?: string | null
}

function daysInMonth(mes: string): number {
  const [y, m] = mes.split('-').map(Number)
  return new Date(y, m, 0).getDate()
}

function padDay(mes: string, d: number): string {
  return `${mes}-${String(d).padStart(2, '0')}`
}

const DOW_SHORT = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']
const DOW_FULL  = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado']

function getDow(mes: string, d: number) {
  const [y, m] = mes.split('-').map(Number)
  const idx = new Date(y, m - 1, d).getDay()
  return { short: DOW_SHORT[idx], full: DOW_FULL[idx], isSun: idx === 0 }
}

function fmt5(t: string | null | undefined): string | null {
  return t ? t.substring(0, 5) : null
}

function fmtH(h: number): string {
  const hrs  = Math.floor(h)
  const mins = Math.round((h - hrs) * 60)
  if (hrs === 0) return `${mins}m`
  return mins > 0 ? `${hrs}h ${mins}m` : `${hrs}h`
}

function mesLabel(mes: string): string {
  const [y, m] = mes.split('-').map(Number)
  const raw = new Date(y, m - 1, 1).toLocaleDateString('es-AR', { month: 'long', year: 'numeric' })
  return raw.charAt(0).toUpperCase() + raw.slice(1)
}

function buildMeses(): string[] {
  const hoy = new Date()
  const prev = new Date(hoy.getFullYear(), hoy.getMonth() - 1, 1)
  const fmt = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  return [fmt(prev), fmt(hoy)]
}

export default function MiAsistenciaClient({ user }: { user: SessionUser }) {
  const MESES = useMemo(buildMeses, [])
  const defaultMes = MESES[1]

  const [mes, setMes]             = useState(defaultMes)
  const [registros, setRegistros] = useState<Registro[]>([])
  const [loading, setLoading]     = useState(false)
  const [error, setError]         = useState('')

  useEffect(() => {
    setLoading(true)
    setError('')
    fetch(`/api/mi-asistencia?mes=${mes}`)
      .then(r => r.json())
      .then(d => {
        setRegistros(Array.isArray(d) ? d : [])
        if (!Array.isArray(d)) setError(d.error || 'Error al cargar')
        setLoading(false)
      })
      .catch(() => { setError('Error de conexión'); setLoading(false) })
  }, [mes])

  const dayMap = new Map(registros.map(r => [r.fecha, r]))
  const days   = Array.from({ length: daysInMonth(mes) }, (_, i) => i + 1)

  const presentes = registros.filter(r => CHIP_INFO[r.estado ?? '']?.present).length
  const tardanzas = registros.filter(r =>
    ['Llegada tarde', 'Llegada tarde/Salida temprana'].includes(r.estado ?? '')
  ).length
  const ausentes  = registros.filter(r =>
    ['Ausente', 'Ausencia injustificada'].includes(r.estado ?? '')
  ).length

  const horasTotal = parseFloat(registros.reduce((sum, r) => {
    const chip = CHIP_INFO[r.estado ?? '']
    if (chip?.present)     return sum + (r.horas_fichadas ?? 0)
    if (chip?.justificado) return sum + (r.horas_base ?? 0)
    return sum
  }, 0).toFixed(2))

  const hasData = registros.length > 0

  return (
    <div className="py-4 space-y-4 fade-in">

      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-xl bg-[image:var(--gradient)] flex items-center justify-center flex-shrink-0 shadow-sm">
          <IconClipboard size={18} className="text-white" />
        </div>
        <div>
          <h1 className="text-[17px] font-bold text-[var(--text)]">Mi Asistencia</h1>
          <p className="text-xs text-[var(--text-muted)]">{user.nombre}</p>
        </div>
      </div>

      {/* Selector de mes (2 tabs) */}
      <div className="flex rounded-xl border border-[var(--border)] overflow-hidden bg-white">
        {MESES.map(m => (
          <button key={m} onClick={() => setMes(m)}
            className={`flex-1 py-2.5 text-sm font-medium transition-colors ${mes === m ? 'bg-[image:var(--gradient)] text-white' : 'text-[var(--text-muted)] hover:bg-gray-50'}`}>
            {mesLabel(m)}
          </button>
        ))}
      </div>

      {loading ? (
        <Spinner />
      ) : error ? (
        <p className="text-center py-16 text-sm text-red-500">{error}</p>
      ) : (
        <>
          {/* Card resumen */}
          {hasData && (
            <div className="bg-white rounded-2xl border border-[var(--border)] p-4 flex items-center gap-4">
              <div>
                <div className="text-xs text-[var(--text-muted)] mb-0.5">Horas {mesLabel(mes)}</div>
                <div className="text-2xl font-bold text-[var(--text)]">{fmtH(horasTotal)}</div>
              </div>
              <div className="ml-auto flex gap-4 text-center">
                <div>
                  <div className="text-lg font-bold text-emerald-600">{presentes}</div>
                  <div className="text-[10px] text-[var(--text-muted)]">Pres.</div>
                </div>
                <div>
                  <div className="text-lg font-bold text-amber-600">{tardanzas}</div>
                  <div className="text-[10px] text-[var(--text-muted)]">Tard.</div>
                </div>
                <div>
                  <div className="text-lg font-bold text-red-600">{ausentes}</div>
                  <div className="text-[10px] text-[var(--text-muted)]">Aus.</div>
                </div>
              </div>
            </div>
          )}

          {/* ── Mobile: cards ── */}
          <div className="lg:hidden space-y-1.5">
            {days.map(d => {
              const fecha = padDay(mes, d)
              const rec   = dayMap.get(fecha) ?? null
              const dow   = getDow(mes, d)

              if (dow.isSun && !rec) return (
                <div key={d} className="py-1 px-3">
                  <span className="text-xs text-gray-300">{d} Dom</span>
                </div>
              )

              if (!rec) return (
                <div key={d} className="flex items-center gap-3 px-3 py-2.5 bg-white rounded-xl border border-[var(--border)]">
                  <div className="w-10 flex-shrink-0 text-center">
                    <div className="text-sm font-bold text-[var(--text)]">{d}</div>
                    <div className="text-[10px] text-[var(--text-muted)]">{dow.short}</div>
                  </div>
                  <span className="text-xs text-gray-300">—</span>
                </div>
              )

              const chip = CHIP_INFO[rec.estado ?? ''] ?? CHIP_INFO['Ausente']
              return (
                <div key={d} className="flex items-center gap-2 px-3 py-2.5 bg-white rounded-xl border border-[var(--border)]">
                  {/* Columna de fecha — siempre centrada verticalmente */}
                  <div className="w-10 flex-shrink-0 text-center">
                    <div className="text-sm font-bold text-[var(--text)]">{d}</div>
                    <div className="text-[10px] text-[var(--text-muted)]">{dow.short}</div>
                  </div>
                  {/* Contenido */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 text-[11px]">
                      <span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold flex-shrink-0 ${chip.bg} ${chip.text}`}>
                        {rec.estado}
                      </span>
                      <div className="ml-auto flex items-center gap-1.5">
                        <span className={`px-1.5 py-0.5 rounded-full font-medium border min-w-[44px] text-center inline-block ${rec.fichada_entrada ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'invisible'}`}>
                          {fmt5(rec.fichada_entrada) ?? ''}
                        </span>
                        <span className={`text-gray-300 ${!rec.fichada_entrada && !rec.fichada_salida ? 'invisible' : ''}`}>→</span>
                        <span className={`px-1.5 py-0.5 rounded-full font-medium border min-w-[44px] text-center inline-block ${rec.fichada_salida ? 'bg-rose-50 text-rose-600 border-rose-200' : 'invisible'}`}>
                          {fmt5(rec.fichada_salida) ?? ''}
                        </span>
                        {rec.horas_fichadas != null && (
                          <span className="font-semibold text-[var(--text)] ml-1">{fmtH(rec.horas_fichadas)}</span>
                        )}
                      </div>
                    </div>
                    {(rec.tipo_ausencia || rec.motivo || rec.comentario_admin) && (
                      <div className="text-[10px] text-gray-400 mt-0.5 truncate">{[rec.tipo_ausencia, rec.motivo, rec.comentario_admin].filter(Boolean).join(' | ')}</div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>

          {/* ── Desktop: tabla ── */}
          {hasData && (
            <div className="hidden lg:block bg-white rounded-2xl border border-[var(--border)] overflow-hidden">
              <table className="w-full">
                <thead>
                  <tr className="bg-gray-50 border-b border-[var(--border)]">
                    <th className="text-left px-5 py-3 text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wide">Fecha</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wide">Entrada</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wide">Salida</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wide">Horas</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wide">Estado</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border)]">
                  {days.map(d => {
                    const fecha = padDay(mes, d)
                    const rec   = dayMap.get(fecha) ?? null
                    const dow   = getDow(mes, d)

                    if (dow.isSun && !rec) return (
                      <tr key={d} className="bg-gray-50/50">
                        <td colSpan={5} className="px-5 py-2 text-xs text-gray-300">{dow.full} {d}</td>
                      </tr>
                    )
                    if (!rec) return (
                      <tr key={d} className="hover:bg-gray-50/40 transition-colors">
                        <td className="px-5 py-3.5">
                          <div className="text-sm font-semibold text-[var(--text)]">{dow.full} {d}</div>
                        </td>
                        <td colSpan={4} className="px-4 py-3.5 text-sm text-gray-300">—</td>
                      </tr>
                    )

                    const chip = CHIP_INFO[rec.estado ?? ''] ?? CHIP_INFO['Ausente']
                    return (
                      <tr key={d} className="hover:bg-gray-50/40 transition-colors">
                        <td className="px-5 py-3.5">
                          <div className="text-sm font-semibold text-[var(--text)]">{dow.full} {d}</div>
                          {(rec.horario_base_entrada || rec.horario_base_salida) && (
                            <div className="text-xs text-gray-400 mt-0.5">
                              Base: {fmt5(rec.horario_base_entrada)} – {fmt5(rec.horario_base_salida)}
                            </div>
                          )}
                          {(rec.tipo_ausencia || rec.motivo || rec.comentario_admin) && (
                            <div className="text-xs text-gray-400 mt-0.5">{[rec.tipo_ausencia, rec.motivo, rec.comentario_admin].filter(Boolean).join(' | ')}</div>
                          )}
                        </td>
                        <td className="px-4 py-3.5">
                          {rec.fichada_entrada
                            ? <span className="inline-flex px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">{fmt5(rec.fichada_entrada)}</span>
                            : <span className="text-gray-300 text-sm">—</span>}
                        </td>
                        <td className="px-4 py-3.5">
                          {rec.fichada_salida
                            ? <span className="inline-flex px-2.5 py-1 rounded-full text-xs font-semibold bg-rose-50 text-rose-600 border border-rose-200">{fmt5(rec.fichada_salida)}</span>
                            : <span className="text-gray-300 text-sm">—</span>}
                        </td>
                        <td className="px-4 py-3.5 text-sm font-medium text-[var(--text)]">
                          {rec.horas_fichadas != null ? fmtH(rec.horas_fichadas) : '—'}
                        </td>
                        <td className="px-4 py-3.5">
                          <span className={`inline-flex px-2.5 py-1 rounded-full text-xs font-semibold ${chip.bg} ${chip.text}`}>{rec.estado}</span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}

          {!hasData && (
            <div className="text-center py-20">
              <IconClipboard size={36} className="mx-auto text-gray-300 mb-2" />
              <p className="text-sm text-[var(--text-muted)]">Sin registros para {mesLabel(mes)}</p>
            </div>
          )}
        </>
      )}
    </div>
  )
}
