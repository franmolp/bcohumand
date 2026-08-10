'use client'

import { useState, useEffect } from 'react'
import { Spinner } from '@/components/ui'
import { IconCalendarCheck, IconClock } from '@/components/ui/Icons'

interface Turno { inicio: string; fin: string; origen: 'fresha' | 'aprobado'; equipo: string }
interface Dia { fecha: string; turnos: Turno[]; ausencia: string | null }

const DIAS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado']
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']

const AUSENCIA_LABEL: Record<string, string> = {
  'Vacaciones': 'Vacaciones',
  'Solicitud de Días': 'Día pedido',
  'Ausencia por Salud': 'Ausencia por salud',
  'Feriado/Local cerrado': 'Local cerrado',
}

function diaLabel(fecha: string) {
  const d = new Date(fecha + 'T12:00:00Z')
  return { dia: DIAS[d.getUTCDay()], num: d.getUTCDate(), mes: MESES[d.getUTCMonth()] }
}

export default function MisHorarios() {
  const [data, setData] = useState<{ hoy: string; dias: Dia[] } | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    fetch('/api/mi-horario')
      .then(async r => {
        const d = await r.json()
        if (!r.ok) throw new Error(d.error ?? 'No se pudo cargar')
        setData(d)
      })
      .catch(e => setError(e instanceof Error ? e.message : 'No se pudo cargar'))
  }, [])

  if (error) return <div className="py-10 text-center text-sm text-red-500">{error}</div>
  if (!data) return <div className="py-16"><Spinner /></div>

  return (
    <div className="space-y-2.5">
      {data.dias.map((d, i) => {
        const { dia, num, mes } = diaLabel(d.fecha)
        const esHoy = d.fecha === data.hoy
        const esInicioSemana2 = i === 6
        return (
          <div key={d.fecha}>
            {esInicioSemana2 && (
              <div className="flex items-center gap-2 pb-2.5 pt-1">
                <span className="text-[11px] font-bold uppercase tracking-wide text-[var(--text-muted)]">La semana que viene</span>
                <div className="flex-1 h-px bg-[var(--border)]" />
              </div>
            )}
            <div className={`rounded-2xl border p-3.5 flex items-center gap-3 ${
              esHoy ? 'bg-[var(--primary-light)] border-[var(--primary)]/40' : 'bg-white border-[var(--border)]'
            }`}>
              <div className={`w-11 h-11 rounded-xl flex flex-col items-center justify-center flex-shrink-0 ${
                esHoy ? 'bg-[var(--primary)] text-white' : 'bg-gray-50 text-[var(--text-sub)]'
              }`}>
                <span className="text-[13px] font-bold leading-none">{num}</span>
                <span className="text-[9px] uppercase leading-none mt-0.5">{mes}</span>
              </div>
              <div className="flex-1 min-w-0">
                <p className={`text-[13px] font-semibold ${esHoy ? 'text-[var(--primary)]' : 'text-[var(--text)]'}`}>
                  {dia}{esHoy ? ' · Hoy' : ''}
                </p>
                {d.ausencia ? (
                  <span className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-1 rounded-lg bg-violet-50 text-violet-700 border border-violet-100 mt-1">
                    <IconCalendarCheck size={11} />
                    {AUSENCIA_LABEL[d.ausencia] ?? d.ausencia}
                  </span>
                ) : d.turnos.length === 0 ? (
                  <p className="text-[12px] text-[var(--text-muted)] mt-0.5">Sin turnos</p>
                ) : (
                  <div className="flex flex-wrap gap-1.5 mt-1">
                    {d.turnos.map((t, ti) => (
                      <span key={ti} className={`text-[11px] font-medium px-2 py-1 rounded-lg flex items-center gap-1 border ${
                        t.origen === 'aprobado'
                          ? 'bg-amber-50 text-amber-700 border-amber-100'
                          : 'bg-gray-50 text-[var(--text-sub)] border-gray-100'
                      }`}>
                        <IconClock size={11} />
                        {t.inicio}–{t.fin}
                        {t.origen === 'aprobado' && ' (extra)'}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )
      })}

      {data.dias.every(d => d.turnos.length === 0 && !d.ausencia) && (
        <div className="bg-white rounded-2xl border border-[var(--border)] py-14 text-center px-6 mt-2">
          <IconCalendarCheck size={32} className="mx-auto mb-3 text-gray-200" />
          <p className="text-sm text-[var(--text-muted)]">No tenés turnos cargados estas dos semanas</p>
        </div>
      )}
    </div>
  )
}
