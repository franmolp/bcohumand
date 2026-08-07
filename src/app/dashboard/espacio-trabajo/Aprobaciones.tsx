'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { Spinner, Confirm } from '@/components/ui'
import { IconCheck, IconX, IconRefresh, IconClock, IconSettings, IconBell, IconTrash } from '@/components/ui/Icons'
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

type SubtabKey = 'pending' | 'approved' | 'rejected' | 'ajustes'

export default function Aprobaciones({ isAdmin }: { isAdmin: boolean }) {
  const SUBTABS: { key: SubtabKey; label: string }[] = [
    { key: 'pending', label: 'Pendientes' },
    { key: 'approved', label: 'Aprobadas' },
    { key: 'rejected', label: 'Rechazadas' },
    ...(isAdmin ? [{ key: 'ajustes' as const, label: 'Ajustes' }] : []),
  ]
  const [subtab, setSubtab] = useState<SubtabKey>('pending')
  const [items, setItems] = useState<Solicitud[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [procesando, setProcesando] = useState<string | null>(null)
  const [pendingCount, setPendingCount] = useState(0)
  const [confirmAccion, setConfirmAccion] = useState<{ solicitud: Solicitud; accion: 'approve' | 'reject' } | null>(null)
  const [confirmDeshacer, setConfirmDeshacer] = useState<Solicitud | null>(null)
  const [confirmEliminar, setConfirmEliminar] = useState<Solicitud | null>(null)

  const cargar = useCallback((estado: string) => {
    setLoading(true)
    fetch(`/api/puestos-disponibles/aprobaciones?estado=${estado}`)
      .then(r => r.json())
      .then(d => { if (Array.isArray(d)) setItems(d); else setItems([]) })
      .catch(() => setItems([]))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { if (subtab !== 'ajustes') cargar(subtab) }, [subtab, cargar])

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
    } finally { setProcesando(null); setConfirmAccion(null) }
  }

  async function deshacer(id: string) {
    setProcesando(id)
    try {
      await fetch(`/api/puestos-disponibles/aprobaciones/${id}/deshacer`, { method: 'POST' })
      cargar(subtab)
    } finally { setProcesando(null); setConfirmDeshacer(null) }
  }

  async function eliminar(id: string) {
    setProcesando(id)
    try {
      await fetch(`/api/puestos-disponibles/aprobaciones/${id}`, { method: 'DELETE' })
      cargar(subtab)
    } finally { setProcesando(null); setConfirmEliminar(null) }
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
            className={`flex-1 min-w-0 px-1.5 py-1.5 text-sm font-medium rounded-lg transition-all cursor-pointer flex items-center justify-center gap-1 ${
              subtab === t.key ? 'bg-white text-[var(--text)] shadow-sm' : 'text-[var(--text-muted)] hover:text-[var(--text-sub)]'
            }`}>
            <span className="truncate">{t.label}</span>
            {t.key === 'pending' && pendingCount > 0 && (
              <span className="flex-shrink-0 inline-flex items-center justify-center min-w-[16px] h-4 px-1 rounded-full bg-red-500 text-white text-[10px] font-bold">
                {pendingCount}
              </span>
            )}
          </button>
        ))}
      </div>

      {subtab === 'ajustes' ? (
        <AjustesEquipos />
      ) : loading ? (
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
                          {isAdmin && (
                            <button onClick={() => setConfirmEliminar(s)} disabled={procesando === s.id}
                              className="p-2 border border-gray-200 text-gray-400 rounded-lg cursor-pointer hover:bg-red-50 hover:text-red-500 hover:border-red-200 disabled:opacity-40">
                              <IconTrash size={14} />
                            </button>
                          )}
                          <button onClick={() => setConfirmAccion({ solicitud: s, accion: 'reject' })} disabled={procesando === s.id}
                            className="p-2 border border-red-200 text-red-500 rounded-lg cursor-pointer hover:bg-red-50 disabled:opacity-40">
                            <IconX size={14} />
                          </button>
                          <button onClick={() => setConfirmAccion({ solicitud: s, accion: 'approve' })} disabled={procesando === s.id}
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
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  <button onClick={() => setConfirmDeshacer(s)} disabled={procesando === s.id}
                    className="flex items-center gap-1.5 px-3 py-2 border border-[var(--border)] text-[var(--text-muted)] hover:text-red-500 hover:border-red-200 rounded-xl text-[12px] font-medium cursor-pointer disabled:opacity-40">
                    <IconRefresh size={13} /> Deshacer
                  </button>
                  {isAdmin && (
                    <button onClick={() => setConfirmEliminar(s)} disabled={procesando === s.id}
                      className="p-2 border border-gray-200 text-gray-400 rounded-lg cursor-pointer hover:bg-red-50 hover:text-red-500 hover:border-red-200 disabled:opacity-40">
                      <IconTrash size={14} />
                    </button>
                  )}
                </div>
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
              <div key={s.id} className="bg-white rounded-2xl border border-[var(--border)] p-4 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[13px] font-semibold text-[var(--text)]">{s.empleado_nombre}</p>
                  <p className="text-[12px] text-[var(--text-muted)] capitalize">{s.tipo_recurso} · {s.equipo_nombre}</p>
                  <p className="text-[12px] text-[var(--text-muted)]">{fmtFechaLarga(s.fecha)} · {s.hora_inicio.slice(0, 5)}–{s.hora_fin.slice(0, 5)}</p>
                  {s.motivo && <p className="text-[12px] text-red-500 mt-1 italic">{s.motivo}</p>}
                </div>
                {isAdmin && (
                  <button onClick={() => setConfirmEliminar(s)} disabled={procesando === s.id}
                    className="p-2 border border-gray-200 text-gray-400 rounded-lg cursor-pointer hover:bg-red-50 hover:text-red-500 hover:border-red-200 disabled:opacity-40 flex-shrink-0">
                    <IconTrash size={14} />
                  </button>
                )}
              </div>
            ))}
          </div>
        )
      )}

      <Confirm
        open={!!confirmAccion}
        title={confirmAccion?.accion === 'approve' ? '¿Aprobás esta solicitud?' : '¿Rechazás esta solicitud?'}
        message={confirmAccion
          ? `${confirmAccion.solicitud.empleado_nombre} solicitó el ${fmtFechaLarga(confirmAccion.solicitud.fecha)}, de ${confirmAccion.solicitud.hora_inicio.slice(0, 5)} a ${confirmAccion.solicitud.hora_fin.slice(0, 5)}.${confirmAccion.accion === 'approve' ? ' Al aprobarla, las demás solicitudes para este mismo puesto se rechazan automáticamente.' : ''}`
          : ''}
        confirmLabel={confirmAccion?.accion === 'approve' ? 'Aprobar' : 'Rechazar'}
        danger={confirmAccion?.accion === 'reject'}
        loading={!!confirmAccion && procesando === confirmAccion.solicitud.id}
        onConfirm={() => confirmAccion && resolver(confirmAccion.solicitud.id, confirmAccion.accion)}
        onClose={() => setConfirmAccion(null)}
      />
      <Confirm
        open={!!confirmDeshacer}
        title="¿Deshacer esta aprobación?"
        message={confirmDeshacer
          ? `Le aprobaste a ${confirmDeshacer.empleado_nombre} el ${fmtFechaLarga(confirmDeshacer.fecha)}, de ${confirmDeshacer.hora_inicio.slice(0, 5)} a ${confirmDeshacer.hora_fin.slice(0, 5)}. Si deshacés, el puesto vuelve a quedar disponible para que otra persona lo pueda pedir.`
          : ''}
        confirmLabel="Deshacer"
        danger
        loading={!!confirmDeshacer && procesando === confirmDeshacer.id}
        onConfirm={() => confirmDeshacer && deshacer(confirmDeshacer.id)}
        onClose={() => setConfirmDeshacer(null)}
      />
      <Confirm
        open={!!confirmEliminar}
        title="¿Eliminar esta solicitud?"
        message={confirmEliminar
          ? `Se va a eliminar para siempre la solicitud de ${confirmEliminar.empleado_nombre} del ${fmtFechaLarga(confirmEliminar.fecha)}, de ${confirmEliminar.hora_inicio.slice(0, 5)} a ${confirmEliminar.hora_fin.slice(0, 5)}. Esta acción no se puede deshacer.`
          : ''}
        confirmLabel="Eliminar"
        danger
        loading={!!confirmEliminar && procesando === confirmEliminar.id}
        onConfirm={() => confirmEliminar && eliminar(confirmEliminar.id)}
        onClose={() => setConfirmEliminar(null)}
      />
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

interface EquipoConfig {
  id: number
  nombre: string
  tipo_recurso: 'mesa' | 'box'
  habilitado: boolean
}

function AjustesEquipos() {
  const [equipos, setEquipos] = useState<EquipoConfig[] | null>(null)
  const [seleccionados, setSeleccionados] = useState<Set<number>>(new Set())
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [notificando, setNotificando] = useState(false)
  const [toast, setToast] = useState('')

  useEffect(() => {
    fetch('/api/puestos-disponibles/config')
      .then(async r => {
        const d = await r.json()
        if (!r.ok) throw new Error(d.error ?? 'Error al cargar equipos')
        const lista: EquipoConfig[] = d.equipos ?? []
        setEquipos(lista)
        setSeleccionados(new Set(lista.filter(e => e.habilitado).map(e => e.id)))
      })
      .catch(e => setError(e instanceof Error ? e.message : 'Error al cargar equipos'))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(''), 4000)
    return () => clearTimeout(t)
  }, [toast])

  function toggle(id: number) {
    setSeleccionados(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function guardar() {
    setGuardando(true)
    try {
      const res = await fetch('/api/puestos-disponibles/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ equipoIds: [...seleccionados] }),
      })
      setToast(res.ok ? 'Ajustes guardados' : 'Error al guardar')
    } finally { setGuardando(false) }
  }

  async function notificarAhora() {
    setNotificando(true)
    try {
      const res = await fetch('/api/cron/puestos-disponibles-semana', { method: 'POST' })
      const d = await res.json()
      if (!res.ok) { setToast(d.error ?? 'Error al enviar'); return }
      const conHuecos = (d.resultados ?? []).filter((r: { huecos: number }) => r.huecos > 0)
      setToast(conHuecos.length > 0
        ? `Aviso enviado a ${conHuecos.map((r: { equipo: string }) => r.equipo).join(', ')}`
        : 'No hay puestos libres la próxima semana en ningún equipo — no se envió nada')
    } finally { setNotificando(false) }
  }

  if (loading) return <div className="py-14"><Spinner /></div>

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-2xl border border-[var(--border)] overflow-hidden">
        <div className="px-4 py-3 border-b border-[var(--border)] flex items-center gap-2">
          <IconSettings size={15} className="text-[var(--text-muted)]" />
          <p className="text-[13px] font-semibold text-[var(--text)]">Equipos con acceso a puestos libres</p>
        </div>
        <p className="text-[12px] text-[var(--text-muted)] px-4 pt-3">
          Solo las personas de los equipos marcados van a ver la sección de puestos disponibles y podrán solicitarlos.
        </p>
        <div className="divide-y divide-gray-50 mt-2">
          {(equipos ?? []).map(e => (
            <label key={e.id} className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-gray-50/60">
              <input
                type="checkbox"
                checked={seleccionados.has(e.id)}
                onChange={() => toggle(e.id)}
                className="w-4 h-4 rounded border-gray-300 text-[var(--primary)] cursor-pointer"
              />
              <span className="text-[13px] text-[var(--text)] flex-1">{e.nombre}</span>
              <span className="text-[11px] text-[var(--text-muted)] capitalize">{e.tipo_recurso}</span>
            </label>
          ))}
          {error && (
            <p className="text-center text-[13px] text-red-500 py-8 px-4">{error}</p>
          )}
          {!error && (equipos ?? []).length === 0 && (
            <p className="text-center text-[13px] text-gray-400 py-8">No hay equipos cargados</p>
          )}
        </div>
        <div className="p-4">
          <button onClick={guardar} disabled={guardando}
            className="w-full py-2.5 bg-[image:var(--gradient)] text-white rounded-xl text-[13px] font-semibold cursor-pointer disabled:opacity-50">
            {guardando ? 'Guardando…' : 'Guardar'}
          </button>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-[var(--border)] p-4">
        <div className="flex items-center gap-2 mb-1.5">
          <IconBell size={15} className="text-[var(--text-muted)]" />
          <p className="text-[13px] font-semibold text-[var(--text)]">Aviso semanal</p>
        </div>
        <p className="text-[12px] text-[var(--text-muted)] mb-3">
          Todos los sábados se avisa automáticamente a cada equipo si tiene puestos libres la semana próxima.
          Usá este botón para mandarlo ahora mismo, sin esperar al sábado.
        </p>
        <button onClick={notificarAhora} disabled={notificando}
          className="w-full flex items-center justify-center gap-2 py-2.5 border border-[var(--border)] text-[var(--text)] hover:bg-gray-50 rounded-xl text-[13px] font-semibold cursor-pointer disabled:opacity-50">
          <IconBell size={14} />
          {notificando ? 'Enviando…' : 'Enviar aviso ahora'}
        </button>
      </div>

      {toast && (
        <div className="fixed bottom-20 left-1/2 -translate-x-1/2 bg-gray-900 text-white text-[13px] px-4 py-2.5 rounded-xl shadow-lg z-50 max-w-[90vw] text-center">
          {toast}
        </div>
      )}
    </div>
  )
}
