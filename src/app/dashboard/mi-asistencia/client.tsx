'use client'

import { useState, useEffect } from 'react'
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
  minutos_antes: number | null
  tiene_justificacion: boolean | null
  horario_base_entrada: string | null
  horario_base_salida: string | null
}

function getMeses(): { key: string; label: string }[] {
  const hoy = new Date()
  return [1, 0].map(offset => {
    const d = new Date(hoy.getFullYear(), hoy.getMonth() - offset, 1)
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    const raw = d.toLocaleDateString('es-AR', { month: 'long', year: 'numeric' })
    return { key, label: raw.charAt(0).toUpperCase() + raw.slice(1) }
  })
}

function fmt5(t: string | null | undefined): string | null {
  return t ? t.substring(0, 5) : null
}

function fmtHoras(h: number | null): string | null {
  if (h == null) return null
  const hrs = Math.floor(h)
  const mins = Math.round((h - hrs) * 60)
  if (hrs === 0) return `${mins}min`
  return mins > 0 ? `${hrs}h ${mins}min` : `${hrs}h`
}

export default function MiAsistenciaClient({ user }: { user: SessionUser }) {
  const meses = getMeses()
  const [mesSel, setMesSel] = useState(meses[0].key)
  const [registros, setRegistros] = useState<Registro[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    setLoading(true)
    setError('')
    fetch(`/api/mi-asistencia?mes=${mesSel}`)
      .then(r => r.json())
      .then(d => {
        setRegistros(Array.isArray(d) ? d : [])
        if (!Array.isArray(d)) setError(d.error || 'Error al cargar')
        setLoading(false)
      })
      .catch(() => { setError('Error de conexión'); setLoading(false) })
  }, [mesSel])

  const presentes    = registros.filter(r => CHIP_INFO[r.estado ?? '']?.present).length
  const tardanzas    = registros.filter(r => (r.minutos_tarde ?? 0) > 0 && !r.tiene_justificacion).length
  const ausentes     = registros.filter(r => r.estado === 'Ausente' || r.estado === 'Ausencia injustificada').length
  const justificados = registros.filter(r => CHIP_INFO[r.estado ?? '']?.justificado).length

  const mesLabel = meses.find(m => m.key === mesSel)?.label ?? mesSel

  return (
    <div className="py-4 fade-in">

      {/* ─── Header ─── */}
      <div className="flex items-center gap-3 mb-4">
        <div className="w-9 h-9 rounded-xl bg-[image:var(--gradient)] flex items-center justify-center flex-shrink-0 shadow-sm">
          <IconClipboard size={18} className="text-white" />
        </div>
        <div>
          <h1 className="text-[17px] font-bold text-[var(--text)]">Mi Asistencia</h1>
          <p className="text-xs text-[var(--text-muted)]">{user.nombre}</p>
        </div>
      </div>

      {/* ─── Tabs de mes ─── */}
      <div className="flex bg-white border border-gray-200/60 rounded-xl p-0.5 mb-4 w-fit">
        {meses.map(m => (
          <button key={m.key} onClick={() => setMesSel(m.key)}
            className={`px-4 py-2 text-[12px] font-medium rounded-[10px] cursor-pointer transition-all whitespace-nowrap ${mesSel === m.key ? 'bg-[var(--primary)] text-white shadow-sm' : 'text-gray-500 hover:text-gray-800'}`}>
            {m.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><Spinner size={28} /></div>
      ) : error ? (
        <div className="text-center py-16 text-sm text-red-500">{error}</div>
      ) : registros.length === 0 ? (
        <div className="text-center py-16">
          <IconClipboard size={36} className="mx-auto text-gray-300 mb-2" />
          <p className="text-sm text-[var(--text-sub)]">Sin registros para {mesLabel}</p>
        </div>
      ) : (
        <>
          {/* ─── Stats ─── */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 mb-4">
            <div className="bg-white rounded-2xl border border-gray-200/60 p-3.5 shadow-sm">
              <p className="text-[26px] font-bold text-emerald-600 leading-none">{presentes}</p>
              <p className="text-[12px] text-[var(--text-sub)] mt-1">Días presentes</p>
            </div>
            <div className="bg-white rounded-2xl border border-gray-200/60 p-3.5 shadow-sm">
              <p className="text-[26px] font-bold text-amber-500 leading-none">{tardanzas}</p>
              <p className="text-[12px] text-[var(--text-sub)] mt-1">Tardanzas</p>
            </div>
            <div className="bg-white rounded-2xl border border-gray-200/60 p-3.5 shadow-sm">
              <p className="text-[26px] font-bold text-red-500 leading-none">{ausentes}</p>
              <p className="text-[12px] text-[var(--text-sub)] mt-1">Ausencias</p>
            </div>
            <div className="bg-white rounded-2xl border border-gray-200/60 p-3.5 shadow-sm">
              <p className="text-[26px] font-bold text-teal-500 leading-none">{justificados}</p>
              <p className="text-[12px] text-[var(--text-sub)] mt-1">Justificados</p>
            </div>
          </div>

          {/* ─── MOBILE: lista ─── */}
          <div className="lg:hidden bg-white rounded-2xl border border-gray-200/60 shadow-sm overflow-hidden">
            <div className="divide-y divide-gray-50">
              {registros.map(r => {
                const chip = CHIP_INFO[r.estado ?? ''] ?? CHIP_INFO['Ausente']
                const dia = parseInt(r.fecha.split('-')[2], 10)
                const entrada = fmt5(r.fichada_entrada)
                const salida  = fmt5(r.fichada_salida)
                const baseEnt = fmt5(r.horario_base_entrada)
                const baseSal = fmt5(r.horario_base_salida)
                const horas   = fmtHoras(r.horas_fichadas)
                return (
                  <div key={r.fecha} className="flex items-center gap-3 px-4 py-3.5">
                    {/* Fecha */}
                    <div className="w-10 text-center flex-shrink-0">
                      <p className="text-[20px] font-bold text-[var(--text)] leading-none">{dia}</p>
                      <p className="text-[10px] text-gray-400 mt-0.5 uppercase">{(r.dia_semana ?? '').slice(0, 3)}</p>
                    </div>

                    {/* Estado + horas base */}
                    <div className="flex-1 min-w-0">
                      <span className={`inline-block text-[11px] font-semibold px-2.5 py-1 rounded-lg ${chip.bg} ${chip.text}`}>
                        {r.estado}
                      </span>
                      {(r.minutos_tarde ?? 0) > 0 && !r.tiene_justificacion && (
                        <span className="text-[11px] text-amber-600 ml-1.5">+{r.minutos_tarde}min</span>
                      )}
                      {baseEnt && baseSal && (
                        <p className="text-[11px] text-gray-400 mt-0.5">Base: {baseEnt} → {baseSal}</p>
                      )}
                    </div>

                    {/* Fichadas */}
                    <div className="text-right flex-shrink-0">
                      {entrada || salida ? (
                        <>
                          <p className="text-[12px] font-medium text-[var(--text)]">
                            {entrada ?? '—'} → {salida ?? '—'}
                          </p>
                          {horas && <p className="text-[10px] text-gray-400 mt-0.5">{horas}</p>}
                        </>
                      ) : (
                        <p className="text-[11px] text-gray-300">Sin fichada</p>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* ─── DESKTOP: tabla ─── */}
          <div className="hidden lg:block bg-white rounded-2xl border border-gray-200/60 shadow-sm overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="bg-gray-50 text-[11px] text-gray-500 uppercase tracking-wider border-b border-gray-100">
                  <th className="text-left py-3 px-4 font-semibold w-36">Día</th>
                  <th className="text-left py-3 px-4 font-semibold">Estado</th>
                  <th className="text-left py-3 px-4 font-semibold">Horario base</th>
                  <th className="text-left py-3 px-4 font-semibold">Entrada</th>
                  <th className="text-left py-3 px-4 font-semibold">Salida</th>
                  <th className="text-left py-3 px-4 font-semibold">Horas</th>
                </tr>
              </thead>
              <tbody>
                {registros.map(r => {
                  const chip    = CHIP_INFO[r.estado ?? ''] ?? CHIP_INFO['Ausente']
                  const dia     = parseInt(r.fecha.split('-')[2], 10)
                  const baseEnt = fmt5(r.horario_base_entrada)
                  const baseSal = fmt5(r.horario_base_salida)
                  return (
                    <tr key={r.fecha} className="border-t border-gray-50 hover:bg-gray-50/50 transition-colors">
                      <td className="py-3 px-4">
                        <span className="text-[13px] font-semibold text-[var(--text)]">{r.dia_semana} {dia}</span>
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2">
                          <span className={`text-[11px] font-semibold px-2.5 py-1 rounded-lg ${chip.bg} ${chip.text}`}>
                            {r.estado}
                          </span>
                          {(r.minutos_tarde ?? 0) > 0 && !r.tiene_justificacion && (
                            <span className="text-[11px] text-amber-600">+{r.minutos_tarde}min</span>
                          )}
                        </div>
                      </td>
                      <td className="py-3 px-4 text-[13px] text-gray-500">
                        {baseEnt && baseSal
                          ? <>{baseEnt} → {baseSal}</>
                          : <span className="text-gray-300">—</span>}
                      </td>
                      <td className="py-3 px-4 text-[13px] text-[var(--text)]">
                        {fmt5(r.fichada_entrada) ?? <span className="text-gray-300">—</span>}
                      </td>
                      <td className="py-3 px-4 text-[13px] text-[var(--text)]">
                        {fmt5(r.fichada_salida) ?? <span className="text-gray-300">—</span>}
                      </td>
                      <td className="py-3 px-4 text-[13px] text-gray-500">
                        {fmtHoras(r.horas_fichadas) ?? <span className="text-gray-300">—</span>}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}
