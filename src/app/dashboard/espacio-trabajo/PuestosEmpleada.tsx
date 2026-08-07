'use client'

import { useState, useEffect, useCallback } from 'react'
import { Spinner } from '@/components/ui'
import { IconLayoutGrid, IconCalendarCheck, IconX, IconClock } from '@/components/ui/Icons'
import { fmtFechaLarga } from '@/lib/fecha'

interface Puesto {
  id: string
  fecha: string
  hora_inicio: string
  hora_fin: string
  horas: number
  tipo_recurso: 'mesa' | 'box'
  mi_solicitud: 'none' | 'pending'
}

function todayStr() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' })
}

export default function PuestosEmpleadaView() {
  const [puestos, setPuestos] = useState<Puesto[] | null>(null)
  const [tipoRecurso, setTipoRecurso] = useState<'mesa' | 'box'>('mesa')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [enviando, setEnviando] = useState<string | null>(null)
  const [toast, setToast] = useState('')

  const cargar = useCallback(() => {
    setLoading(true); setError('')
    fetch('/api/puestos-disponibles')
      .then(r => r.json())
      .then(d => { if (d.error) setError(d.error); else { setPuestos(d.puestos); setTipoRecurso(d.tipo_recurso) } })
      .catch(() => setError('No se pudo cargar'))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { cargar() }, [cargar])

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(''), 3000)
    return () => clearTimeout(t)
  }, [toast])

  async function solicitar(id: string) {
    setEnviando(id)
    try {
      const res = await fetch('/api/puestos-disponibles/solicitar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      })
      const d = await res.json()
      if (!res.ok) { setToast(d.error ?? 'No se pudo solicitar'); return }
      setToast('Solicitud enviada — te avisamos cuando se apruebe')
      cargar()
    } finally { setEnviando(null) }
  }

  async function cancelar(rowId: string) {
    setEnviando(rowId)
    try {
      await fetch(`/api/puestos-disponibles/${rowId}`, { method: 'DELETE' })
      setToast('Solicitud cancelada')
      cargar()
    } finally { setEnviando(null) }
  }

  const hoy = todayStr()
  const proximos = puestos?.filter(p => p.fecha >= hoy) ?? []

  return (
    <div className="py-4 space-y-4">
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-xl bg-[image:var(--gradient)] flex items-center justify-center flex-shrink-0 shadow-sm">
          <IconLayoutGrid size={17} className="text-white" />
        </div>
        <div>
          <h1 className="text-[17px] font-bold text-[var(--text)] leading-tight">Puestos disponibles</h1>
          <p className="text-[12px] text-[var(--text-muted)]">Sumá horas cubriendo un {tipoRecurso} libre esta semana o la próxima</p>
        </div>
      </div>

      {loading ? (
        <div className="py-16"><Spinner /></div>
      ) : error ? (
        <div className="py-10 text-center text-sm text-red-500">{error}</div>
      ) : proximos.length === 0 ? (
        <div className="bg-white rounded-2xl border border-[var(--border)] py-14 text-center px-6">
          <IconCalendarCheck size={32} className="mx-auto mb-3 text-gray-200" />
          <p className="text-sm text-[var(--text-muted)]">No hay puestos libres por ahora</p>
          <p className="text-xs text-[var(--text-muted)] mt-1">Te avisamos apenas se libere alguno</p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {proximos.map(p => {
            const solicitando = enviando === p.id
            return (
              <div key={p.id} className="bg-white rounded-2xl border border-[var(--border)] p-4 flex items-center justify-between gap-3">
                <div>
                  <p className="text-[13px] font-semibold text-[var(--text)] capitalize">
                    {p.tipo_recurso === 'box' ? 'Box' : 'Mesa'} disponible
                  </p>
                  <p className="text-[13px] text-[var(--text)] mt-1">{fmtFechaLarga(p.fecha)}</p>
                  <p className="text-[12px] text-[var(--text-muted)] flex items-center gap-1 mt-0.5">
                    <IconClock size={12} />
                    {p.hora_inicio} – {p.hora_fin} · {p.horas}hs disponibles
                  </p>
                </div>
                {p.mi_solicitud === 'pending' ? (
                  <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
                    <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-amber-50 text-amber-600 border border-amber-100">
                      Pendiente
                    </span>
                    <button
                      onClick={() => cancelar(p.id)}
                      disabled={solicitando}
                      className="flex items-center gap-1 text-[11px] text-red-400 hover:text-red-600 cursor-pointer disabled:opacity-40">
                      <IconX size={11} /> Cancelar
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => solicitar(p.id)}
                    disabled={solicitando}
                    className="flex-shrink-0 px-4 py-2 bg-[image:var(--gradient)] text-white rounded-xl text-[13px] font-semibold cursor-pointer disabled:opacity-50">
                    {solicitando ? '...' : 'Solicitar'}
                  </button>
                )}
              </div>
            )
          })}
        </div>
      )}

      {toast && (
        <div className="fixed bottom-20 left-1/2 -translate-x-1/2 bg-gray-900 text-white text-[13px] px-4 py-2.5 rounded-xl shadow-lg z-50">
          {toast}
        </div>
      )}
    </div>
  )
}
