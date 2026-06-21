'use client'

import { useState, useEffect, useCallback } from 'react'
import type { SessionUser } from '@/types'
import { IconPlus, IconX, IconWrench } from '@/components/ui/Icons'

type Reparacion = {
  id: string
  titulo: string
  descripcion: string | null
  categoria: string
  prioridad: string
  estado: string
  usuario_id: string
  nombre_empleada: string | null
  creado_en: string
  resuelto_en: string | null
  comentario_admin: string | null
}

type Empleada = { id: string; nombre: string }

const CATEGORIAS = [
  { value: 'electricidad', label: 'Electricidad', emoji: '💡' },
  { value: 'plomeria',     label: 'Plomería',     emoji: '🔧' },
  { value: 'equipamiento', label: 'Equipamiento', emoji: '⚙️' },
  { value: 'limpieza',     label: 'Limpieza',     emoji: '🧹' },
  { value: 'mejoras',      label: 'Mejoras',      emoji: '✨' },
  { value: 'otro',         label: 'Otro',         emoji: '📋' },
]

const PRIORIDADES = [
  { value: 'alta',  label: 'Alta',   bg: 'bg-red-100',   text: 'text-red-700'   },
  { value: 'media', label: 'Media',  bg: 'bg-amber-100', text: 'text-amber-700' },
  { value: 'baja',  label: 'Baja',   bg: 'bg-gray-100',  text: 'text-gray-500'  },
]

const ESTADOS = [
  { value: 'pendiente', label: 'Pendiente', bg: 'bg-amber-50',  text: 'text-amber-700' },
  { value: 'resuelto',  label: 'Resuelto',  bg: 'bg-green-50',  text: 'text-green-700' },
  { value: 'rechazado', label: 'Rechazado', bg: 'bg-red-50',    text: 'text-red-700'   },
]

const FILTERS = [
  { value: 'todos',     label: 'Todos'      },
  { value: 'pendiente', label: 'Pendientes' },
  { value: 'resuelto',  label: 'Resueltas'  },
  { value: 'rechazado', label: 'Rechazadas' },
]

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('es-AR', { day: 'numeric', month: 'short', year: 'numeric' })
}
function getCat(v: string) { return CATEGORIAS.find(c => c.value === v) ?? CATEGORIAS[5] }
function getPrio(v: string) { return PRIORIDADES.find(p => p.value === v) ?? PRIORIDADES[1] }
function getEst(v: string) { return ESTADOS.find(e => e.value === v) ?? ESTADOS[0] }

export default function ReparacionesClient({
  user,
  empleadasList,
}: {
  user: SessionUser
  empleadasList: Empleada[]
}) {
  const isAdmin = user.rol === 'admin' || user.rol === 'Admin'

  const [items, setItems] = useState<Reparacion[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('todos')

  const [showCreate, setShowCreate] = useState(false)
  const [creating, setCreating] = useState(false)
  const [form, setForm] = useState({
    titulo: '', descripcion: '', categoria: 'otro', prioridad: 'media',
    usuario_id: '', nombre_empleada: '',
  })

  const [actionId, setActionId] = useState<string | null>(null)
  const [actionForm, setActionForm] = useState({ estado: '', comentario: '' })
  const [updating, setUpdating] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const r = await fetch('/api/reparaciones')
      if (r.ok) setItems(await r.json())
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const filtered = filter === 'todos' ? items : items.filter(i => i.estado === filter)
  const counts = {
    todos:     items.length,
    pendiente: items.filter(i => i.estado === 'pendiente').length,
    resuelto:  items.filter(i => i.estado === 'resuelto').length,
    rechazado: items.filter(i => i.estado === 'rechazado').length,
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    if (!form.titulo.trim()) return
    setCreating(true)
    try {
      const body: Record<string, string> = {
        titulo: form.titulo, descripcion: form.descripcion,
        categoria: form.categoria, prioridad: form.prioridad,
      }
      if (isAdmin && form.usuario_id) {
        body.usuario_id = form.usuario_id
        body.nombre_empleada = form.nombre_empleada
      }
      const r = await fetch('/api/reparaciones', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (r.ok) {
        const item = await r.json()
        setItems(prev => [item, ...prev])
        setShowCreate(false)
        setForm({ titulo: '', descripcion: '', categoria: 'otro', prioridad: 'media', usuario_id: '', nombre_empleada: '' })
      }
    } finally {
      setCreating(false)
    }
  }

  async function handleUpdate(id: string) {
    setUpdating(true)
    try {
      const r = await fetch(`/api/reparaciones/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ estado: actionForm.estado, comentario_admin: actionForm.comentario }),
      })
      if (r.ok) {
        const updated = await r.json()
        setItems(prev => prev.map(i => i.id === id ? updated : i))
        setActionId(null)
      }
    } finally {
      setUpdating(false)
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('¿Eliminar esta solicitud?')) return
    await fetch(`/api/reparaciones/${id}`, { method: 'DELETE' })
    setItems(prev => prev.filter(i => i.id !== id))
  }

  function openAction(item: Reparacion) {
    if (actionId === item.id) { setActionId(null); return }
    setActionId(item.id)
    setActionForm({ estado: item.estado, comentario: item.comentario_admin ?? '' })
  }

  return (
    <div className="py-4 space-y-5 fade-in">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-[20px] lg:text-[22px] font-bold text-[var(--text)]">Reparaciones y mejoras</h1>
          <p className="text-[13px] text-[var(--text-sub)] mt-0.5">
            {isAdmin
              ? 'Gestioná los pedidos de arreglo y mejora del local'
              : 'Reportá arreglos, mejoras o cosas que viste mal en el local'}
          </p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-1.5 bg-[var(--primary)] text-white px-3.5 py-2 rounded-xl text-[13px] font-semibold shrink-0 hover:opacity-90 transition-opacity active:scale-95 cursor-pointer"
        >
          <IconPlus size={14} />
          Nueva
        </button>
      </div>

      {/* Filters */}
      <div className="flex gap-2 overflow-x-auto pb-1" style={{ scrollbarWidth: 'none' }}>
        {FILTERS.map(f => (
          <button
            key={f.value}
            onClick={() => setFilter(f.value)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[12px] font-semibold shrink-0 transition-all cursor-pointer ${
              filter === f.value
                ? 'bg-[var(--primary)] text-white'
                : 'bg-white text-gray-500 border border-gray-200 hover:border-gray-300'
            }`}
          >
            {f.label}
            <span className={`text-[10px] font-bold rounded-full px-1.5 py-0.5 min-w-[18px] text-center ${
              filter === f.value ? 'bg-white/25 text-white' : 'bg-gray-100 text-gray-500'
            }`}>
              {counts[f.value as keyof typeof counts]}
            </span>
          </button>
        ))}
      </div>

      {/* List */}
      {loading ? (
        <div className="space-y-3 animate-pulse">
          {[1, 2, 3].map(i => <div key={i} className="h-28 bg-gray-100 rounded-2xl" />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16">
          <div className="w-12 h-12 bg-gray-100 rounded-2xl flex items-center justify-center mx-auto mb-3">
            <IconWrench size={22} className="text-gray-300" />
          </div>
          <p className="text-[14px] font-medium text-gray-400">
            {filter === 'todos' ? 'Sin solicitudes aún' : `Sin solicitudes ${FILTERS.find(f => f.value === filter)?.label.toLowerCase()}`}
          </p>
          {filter === 'todos' && (
            <p className="text-[12px] text-gray-300 mt-1">Tocá "+ Nueva" para cargar la primera</p>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(item => {
            const cat  = getCat(item.categoria)
            const prio = getPrio(item.prioridad)
            const est  = getEst(item.estado)
            const isOpen = actionId === item.id

            return (
              <div key={item.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                <div className="p-4">
                  {/* Category + status + priority */}
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-[14px]">{cat.emoji}</span>
                    <span className="text-[10px] text-gray-400 font-semibold uppercase tracking-wide">{cat.label}</span>
                    <span className="flex-1" />
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${est.bg} ${est.text}`}>
                      {est.label}
                    </span>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${prio.bg} ${prio.text}`}>
                      {prio.label}
                    </span>
                  </div>

                  <p className="text-[14px] font-semibold text-[var(--text)] leading-snug">{item.titulo}</p>

                  {item.descripcion && (
                    <p className="text-[12px] text-gray-500 mt-1 leading-relaxed">{item.descripcion}</p>
                  )}

                  <div className="flex items-center gap-2 mt-2 flex-wrap">
                    {isAdmin && item.nombre_empleada && (
                      <>
                        <span className="text-[11px] font-semibold text-[var(--primary)]">{item.nombre_empleada}</span>
                        <span className="text-gray-300 text-[11px]">·</span>
                      </>
                    )}
                    <span className="text-[11px] text-gray-400">{fmtDate(item.creado_en)}</span>
                    {item.resuelto_en && (
                      <>
                        <span className="text-gray-300 text-[11px]">·</span>
                        <span className="text-[11px] text-green-500">Resuelto {fmtDate(item.resuelto_en)}</span>
                      </>
                    )}
                  </div>

                  {item.comentario_admin && !isOpen && (
                    <div className="mt-2.5 px-3 py-2 bg-gray-50 rounded-xl">
                      <p className="text-[10px] text-gray-400 font-semibold mb-0.5">Comentario</p>
                      <p className="text-[12px] text-gray-600">{item.comentario_admin}</p>
                    </div>
                  )}

                  {isAdmin && (
                    <div className="flex items-center gap-3 mt-3 pt-3 border-t border-gray-50">
                      <button
                        onClick={() => openAction(item)}
                        className="text-[12px] font-semibold text-[var(--primary)] hover:opacity-75 transition-opacity cursor-pointer"
                      >
                        {isOpen ? 'Cancelar' : 'Actualizar'}
                      </button>
                      <span className="flex-1" />
                      <button
                        onClick={() => handleDelete(item.id)}
                        className="text-[12px] text-red-400 hover:text-red-600 transition-colors font-medium cursor-pointer"
                      >
                        Eliminar
                      </button>
                    </div>
                  )}
                </div>

                {/* Admin action panel */}
                {isAdmin && isOpen && (
                  <div className="px-4 pb-4 pt-3 border-t border-gray-100 bg-gray-50/40 space-y-3">
                    <div className="grid grid-cols-3 gap-2">
                      {ESTADOS.map(e => (
                        <button
                          key={e.value}
                          onClick={() => setActionForm(f => ({ ...f, estado: e.value }))}
                          className={`py-2 rounded-xl text-[12px] font-semibold transition-all border cursor-pointer ${
                            actionForm.estado === e.value
                              ? `${e.bg} ${e.text} border-transparent`
                              : 'bg-white text-gray-400 border-gray-200 hover:border-gray-300'
                          }`}
                        >
                          {e.label}
                        </button>
                      ))}
                    </div>
                    <textarea
                      value={actionForm.comentario}
                      onChange={e => setActionForm(f => ({ ...f, comentario: e.target.value }))}
                      placeholder="Comentario para la empleada (opcional)…"
                      rows={2}
                      className="w-full text-[13px] rounded-xl border border-gray-200 px-3 py-2 resize-none focus:outline-none focus:border-[var(--primary)] bg-white"
                    />
                    <button
                      onClick={() => handleUpdate(item.id)}
                      disabled={updating}
                      className="w-full py-2.5 bg-[var(--primary)] text-white rounded-xl text-[13px] font-semibold hover:opacity-90 transition-opacity disabled:opacity-50 cursor-pointer"
                    >
                      {updating ? 'Guardando…' : 'Guardar cambios'}
                    </button>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Create modal */}
      {showCreate && (
        <div
          className="fixed inset-0 bg-black/40 z-50 flex items-end lg:items-center justify-center p-4 lg:p-6"
          onClick={e => { if (e.target === e.currentTarget) setShowCreate(false) }}
        >
          <div className="bg-white rounded-2xl w-full max-w-md max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <h2 className="text-[15px] font-bold text-[var(--text)]">Nueva solicitud</h2>
              <button onClick={() => setShowCreate(false)} className="text-gray-400 hover:text-gray-600 cursor-pointer">
                <IconX size={18} />
              </button>
            </div>

            <form onSubmit={handleCreate} className="px-5 py-4 space-y-4">
              {isAdmin && (
                <div>
                  <label className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-1.5 block">
                    Para empleada
                  </label>
                  <select
                    value={form.usuario_id}
                    onChange={e => {
                      const emp = empleadasList.find(x => x.id === e.target.value)
                      setForm(f => ({ ...f, usuario_id: e.target.value, nombre_empleada: emp?.nombre ?? '' }))
                    }}
                    className="w-full text-[13px] rounded-xl border border-gray-200 px-3 py-2.5 focus:outline-none focus:border-[var(--primary)] bg-white"
                  >
                    <option value="">Cargada por mí (admin)</option>
                    {empleadasList.map(e => (
                      <option key={e.id} value={e.id}>{e.nombre}</option>
                    ))}
                  </select>
                </div>
              )}

              <div>
                <label className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-1.5 block">
                  Título *
                </label>
                <input
                  value={form.titulo}
                  onChange={e => setForm(f => ({ ...f, titulo: e.target.value }))}
                  placeholder="Ej: Luz quemada en el baño"
                  required
                  className="w-full text-[13px] rounded-xl border border-gray-200 px-3 py-2.5 focus:outline-none focus:border-[var(--primary)]"
                />
              </div>

              <div>
                <label className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-1.5 block">
                  Descripción
                </label>
                <textarea
                  value={form.descripcion}
                  onChange={e => setForm(f => ({ ...f, descripcion: e.target.value }))}
                  placeholder="Contá más detalles del problema o lo que se necesita…"
                  rows={3}
                  className="w-full text-[13px] rounded-xl border border-gray-200 px-3 py-2.5 resize-none focus:outline-none focus:border-[var(--primary)]"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-1.5 block">
                    Categoría
                  </label>
                  <select
                    value={form.categoria}
                    onChange={e => setForm(f => ({ ...f, categoria: e.target.value }))}
                    className="w-full text-[13px] rounded-xl border border-gray-200 px-3 py-2.5 focus:outline-none focus:border-[var(--primary)] bg-white"
                  >
                    {CATEGORIAS.map(c => (
                      <option key={c.value} value={c.value}>{c.emoji} {c.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-1.5 block">
                    Prioridad
                  </label>
                  <select
                    value={form.prioridad}
                    onChange={e => setForm(f => ({ ...f, prioridad: e.target.value }))}
                    className="w-full text-[13px] rounded-xl border border-gray-200 px-3 py-2.5 focus:outline-none focus:border-[var(--primary)] bg-white"
                  >
                    {PRIORIDADES.map(p => (
                      <option key={p.value} value={p.value}>{p.label}</option>
                    ))}
                  </select>
                </div>
              </div>

              <button
                type="submit"
                disabled={creating || !form.titulo.trim()}
                className="w-full py-3 bg-[var(--primary)] text-white rounded-xl text-[14px] font-semibold hover:opacity-90 transition-opacity disabled:opacity-50 cursor-pointer"
              >
                {creating ? 'Enviando…' : 'Enviar solicitud'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
