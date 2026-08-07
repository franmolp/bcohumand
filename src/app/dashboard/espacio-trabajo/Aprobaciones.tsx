'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { Spinner } from '@/components/ui'
import { IconCheck, IconX, IconRefresh, IconClock } from '@/components/ui/Icons'
import { fmtFechaLarga } from '@/lib/fecha'

interface Solicitud {
  id: string
  usuario_id: string
  empleado_nombre: string
  equipo_nombre: string
  tipo_recurso: 'mesa' | 'box'
  fecha: string
  hora_inicio: string
  hora_fin: string
  lane: number
  estado: 'pending' | 'approved' | 'rejected' | 'cancelled'
  motivo: string | null
  resuelto_por_nombre: string | null
  resuelto_en: string | null
  created_at: string
}

const SUBTABS = [
  { key: 'pending', label: 'Pendientes' },
  { key: 'approved', label: 'Aprobadas' },
  { key: 'rejected', label: 'Rechazadas' },
] as const

export default function Aprobaciones() {
  const [subtab, setSubtab] = useState<'pending' | 'approved' | 'rejected'>('pending')
  const [items, setItems] = useState<Solicitud[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [procesando, setProcesando] = useState<string | null>(null)
  const [pendingCount, setPendingCount] = useState(0)

  const cargar = useCallback((estado: string) => {
    setLoading(true)
    fetch(`/api/puestos-disponibles/aprobaciones?estado=${estado}`)
      .then(r => r.json())
      .then(d => { if (Array.isArray(d)) setItems(d); else setItems([]) })
      .catch(() => setItems([]))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { cargar(subtab) }, [subtab, cargar])

  useEffect(() => {
    fetch('/api/puestos-disponibles/aprobaciones?estado=pending')
      .then(r => r.json())
      .then(d => setPendingCount(Array.isArray(d) ? d.length : 0))
      .catch(() => {})
  }, [items])

  async function resolver(id: string, accion: 'approve' | 'reject') {
    setProcesando(id)
    try {
      await fetch(`/api/puestos-disponibles/aprobaciones/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accion }),
      })
      cargar(subtab)
    } finally { setProcesando(null) }
  }

  async function deshacer(id: string) {
    setProcesando(id)
    try {
      await fetch(`/api/puestos-disponibles/aprobaciones/${id}/deshacer`, { method: 'POST' })
      cargar(subtab)
    } finally { setProcesando(null) }
  }

  const grupos = useMemo(() => {
    if (subtab !== 'pending' || !items) return []
    const map = new Map<string, Solicitud[]>()
    for (const s of items) {
      const key = `${s.fecha}|${s.equipo_nombre}|${s.lane}|${s.hora_inicio}|${s.hora_fin}`
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(s)
    }
    return [...map.values()]
  }, [items, subtab])

  return (
    <div className="space-y-3">
      <div className="flex gap-1 bg-gray-100 rounded-xl p-1">
        {SUBTABS.map(t => (
          <button key={t.key} onClick={() => setSubtab(t.key)}
            className={`flex-1 py-1.5 text-sm font-medium rounded-lg transition-all cursor-pointer ${
              subtab === t.key ? 'bg-white text-[var(--text)] shadow-sm' : 'text-[var(--text-muted)] hover:text-[var(--text-sub)]'
            }`}>
            {t.label}
            {t.key === 'pending' && pendingCount > 0 && (
              <span className="ml-1.5 inline-flex items-center justify-center min-w-[16px] h-4 px-1 rounded-full bg-red-500 text-white text-[10px] font-bold">
                {pendingCount}
              </span>
            )}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="py-14"><Spinner /></div>
      ) : subtab === 'pending' ? (
        grupos.length === 0 ? (
          <EmptyState texto="Sin solicitudes pendientes" />
        ) : (
          <div className="space-y-3">
            {grupos.map(grupo => {
              const primero = grupo[0]
              return (
                <div key={primero.id} className="bg-white rounded-2xl border border-[var(--border)] overflow-hidden">
                  <div className="px-4 py-2.5 bg-gray-50/70 border-b border-[var(--border)]">
                    <p className="text-[13px] font-semibold text-[var(--text)] capitalize">
                      {primero.tipo_recurso} · {primero.equipo_nombre}
                    </p>
                    <p className="text-[12px] text-[var(--text-muted)]">
                      {fmtFechaLarga(primero.fecha)} · {primero.hora_inicio.slice(0, 5)}–{primero.hora_fin.slice(0, 5)}
                    </p>
                  </div>
                  <div className="divide-y divide-gray-50">
                    {grupo.map((s, i) => (
                      <div key={s.id} className="px-4 py-3 flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2 min-w-0">
                          {i === 0 && grupo.length > 1 && (
                            <span className="text-[10px] font-bold text-[var(--primary)] bg-[var(--primary-light)] rounded-full w-4 h-4 flex items-center justify-center flex-shrink-0">1º</span>
                          )}
                          <div className="min-w-0">
                            <p className="text-[13px] font-medium text-[var(--text)] truncate">{s.empleado_nombre}</p>
                            <p className="text-[11px] text-[var(--text-muted)] flex items-center gap-1">
                              <IconClock size={10} /> {relTime(s.created_at)}
                            </p>
                          </div>
                        </div>
                        <div className="flex gap-1.5 flex-shrink-0">
                          <button onClick={() => resolver(s.id, 'reject')} disabled={procesando === s.id}
                            className="p-2 border border-red-200 text-red-500 rounded-lg cursor-pointer hover:bg-red-50 disabled:opacity-40">
                            <IconX size={14} />
                          </button>
                          <button onClick={() => resolver(s.id, 'approve')} disabled={procesando === s.id}
                            className="p-2 bg-green-500 text-white rounded-lg cursor-pointer hover:bg-green-600 disabled:opacity-40">
                            <IconCheck size={14} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        )
      ) : subtab === 'approved' ? (
        !items || items.length === 0 ? (
          <EmptyState texto="Sin puestos aprobados" />
        ) : (
          <div className="space-y-2.5">
            {items.map(s => (
              <div key={s.id} className="bg-white rounded-2xl border border-[var(--border)] p-4 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[13px] font-semibold text-[var(--text)]">{s.empleado_nombre}</p>
                  <p className="text-[12px] text-[var(--text-muted)] capitalize">{s.tipo_recurso} · {s.equipo_nombre}</p>
                  <p className="text-[12px] text-[var(--text-muted)]">{fmtFechaLarga(s.fecha)} · {s.hora_inicio.slice(0, 5)}–{s.hora_fin.slice(0, 5)}</p>
                </div>
                <button onClick={() => deshacer(s.id)} disabled={procesando === s.id}
                  className="flex items-center gap-1.5 px-3 py-2 border border-[var(--border)] text-[var(--text-muted)] hover:text-red-500 hover:border-red-200 rounded-xl text-[12px] font-medium cursor-pointer disabled:opacity-40 flex-shrink-0">
                  <IconRefresh size={13} /> Deshacer
                </button>
              </div>
            ))}
          </div>
        )
      ) : (
        !items || items.length === 0 ? (
          <EmptyState texto="Sin solicitudes rechazadas" />
        ) : (
          <div className="space-y-2.5">
            {items.map(s => (
              <div key={s.id} className="bg-white rounded-2xl border border-[var(--border)] p-4">
                <p className="text-[13px] font-semibold text-[var(--text)]">{s.empleado_nombre}</p>
                <p className="text-[12px] text-[var(--text-muted)] capitalize">{s.tipo_recurso} · {s.equipo_nombre}</p>
                <p className="text-[12px] text-[var(--text-muted)]">{fmtFechaLarga(s.fecha)} · {s.hora_inicio.slice(0, 5)}–{s.hora_fin.slice(0, 5)}</p>
                {s.motivo && <p className="text-[12px] text-red-500 mt-1 italic">{s.motivo}</p>}
              </div>
            ))}
          </div>
        )
      )}
    </div>
  )
}

function EmptyState({ texto }: { texto: string }) {
  return (
    <div className="bg-white rounded-2xl border border-[var(--border)] py-12 text-center">
      <p className="text-sm text-[var(--text-muted)]">{texto}</p>
    </div>
  )
}

function relTime(iso: string): string {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000)
  if (mins < 1) return 'recién'
  if (mins < 60) return `hace ${mins} min`
  const hs = Math.floor(mins / 60)
  if (hs < 24) return `hace ${hs}h`
  const ds = Math.floor(hs / 24)
  return ds === 1 ? 'ayer' : `hace ${ds} días`
}
