'use client'

import { useState, useEffect, useMemo } from 'react'
import { Modal, Spinner } from '@/components/ui'
import { IconSearch } from '@/components/ui/Icons'

interface Empleado {
  id: string
  nombre: string
  usuario: string
  foto_perfil: string | null
  equipo: string
  rol: string
}

function normalizar(s: string) {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
}

export default function ImpersonarModal({ onClose }: { onClose: () => void }) {
  const [empleados, setEmpleados] = useState<Empleado[] | null>(null)
  const [error, setError] = useState('')
  const [buscar, setBuscar] = useState('')
  const [eligiendo, setEligiendo] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/auth/impersonar')
      .then(async r => {
        const d = await r.json()
        if (!r.ok) throw new Error(d.error ?? 'Error al cargar empleados')
        setEmpleados(Array.isArray(d) ? d : [])
      })
      .catch(e => setError(e instanceof Error ? e.message : 'Error al cargar empleados'))
  }, [])

  const filtrados = useMemo(() => {
    if (!empleados) return []
    const q = normalizar(buscar.trim())
    if (!q) return empleados
    return empleados.filter(e => normalizar(e.nombre).includes(q) || normalizar(e.equipo).includes(q))
  }, [empleados, buscar])

  async function elegir(empleadoId: string) {
    setEligiendo(empleadoId)
    try {
      const res = await fetch('/api/auth/impersonar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ empleadoId }),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        setError(d.error ?? 'No se pudo cambiar de usuario')
        setEligiendo(null)
        return
      }
      window.location.href = '/dashboard'
    } catch {
      setError('No se pudo cambiar de usuario')
      setEligiendo(null)
    }
  }

  return (
    <Modal open onClose={onClose} title="Ver como empleado">
      <p className="text-[12px] text-[var(--text-muted)] -mt-1 mb-1">
        Vas a navegar la app con los permisos y datos de la persona que elijas, hasta que vuelvas a la cuenta Prueba.
      </p>

      <div className="relative">
        <IconSearch size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          value={buscar}
          onChange={e => setBuscar(e.target.value)}
          placeholder="Buscar por nombre o equipo…"
          className="w-full border border-[var(--border)] rounded-xl pl-9 pr-3 py-2.5 text-[13px] focus:outline-none focus:border-[var(--primary)] focus:ring-2 focus:ring-[var(--primary-light)]"
        />
      </div>

      {error && <p className="text-[12px] text-red-500">{error}</p>}

      {!empleados && !error ? (
        <div className="py-8"><Spinner /></div>
      ) : (
        <div className="max-h-[50vh] overflow-y-auto -mx-1 px-1 space-y-1">
          {filtrados.length === 0 && (
            <p className="text-center text-[13px] text-gray-400 py-8">Sin resultados</p>
          )}
          {filtrados.map(e => {
            const initials = e.nombre.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()
            const cargando = eligiendo === e.id
            return (
              <button
                key={e.id}
                onClick={() => elegir(e.id)}
                disabled={!!eligiendo}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-gray-50 transition-colors cursor-pointer disabled:opacity-50 text-left"
              >
                {e.foto_perfil ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={e.foto_perfil} alt="" className="w-9 h-9 rounded-full object-cover flex-shrink-0" />
                ) : (
                  <div className="w-9 h-9 rounded-full bg-[image:var(--gradient)] flex items-center justify-center flex-shrink-0">
                    <span className="text-white text-[12px] font-bold">{initials}</span>
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-medium text-[var(--text)] truncate">{e.nombre}</p>
                  <p className="text-[11px] text-gray-400 truncate">{e.rol}{e.equipo ? ` · ${e.equipo}` : ''}</p>
                </div>
                {cargando && <Spinner size={16} inline />}
              </button>
            )
          })}
        </div>
      )}
    </Modal>
  )
}
