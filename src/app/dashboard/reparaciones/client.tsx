'use client'

import { useState, useEffect, useCallback } from 'react'
import type { SessionUser } from '@/types'
import { IconPlus, IconWrench, IconAlertCircle } from '@/components/ui/Icons'
import { Modal, Button, Input, Select, Toast } from '@/components/ui'

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
  { value: 'electrico',      label: 'Eléctrico',           hint: 'luces, enchufes, tomacorrientes',      bg: 'bg-yellow-50',  text: 'text-yellow-700' },
  { value: 'agua_plomeria',  label: 'Agua / Plomería',     hint: 'piletas, canillas, desagüe, calefón',  bg: 'bg-cyan-50',    text: 'text-cyan-600'   },
  { value: 'electronicos',   label: 'Equipos electrónicos',hint: 'secadores, planchas, máquinas',        bg: 'bg-indigo-50',  text: 'text-indigo-600' },
  { value: 'mobiliario',     label: 'Mobiliario',          hint: 'sillones, espejos, muebles, mostrador',bg: 'bg-orange-50',  text: 'text-orange-600' },
  { value: 'climatizacion',  label: 'Climatización',       hint: 'aire acondicionado, calefacción',      bg: 'bg-sky-50',     text: 'text-sky-600'    },
  { value: 'limpieza',       label: 'Limpieza',            hint: 'limpieza profunda, manchas, plagas',   bg: 'bg-teal-50',    text: 'text-teal-600'   },
  { value: 'compra_insumo',  label: 'Compra / Insumo',     hint: 'algo roto para reponer, falta stock',  bg: 'bg-pink-50',    text: 'text-pink-600'   },
  { value: 'mejora',         label: 'Mejora',              hint: 'propuesta de cambio o incorporación',  bg: 'bg-violet-50',  text: 'text-violet-600' },
  { value: 'otro',           label: 'Otro',                hint: 'lo que no entra en ninguna',           bg: 'bg-gray-100',   text: 'text-gray-500'   },
]

const PRIORIDADES = [
  { value: 'alta',  label: 'Alta',   bg: 'bg-red-100',   text: 'text-red-700'   },
  { value: 'media', label: 'Media',  bg: 'bg-amber-100', text: 'text-amber-700' },
  { value: 'baja',  label: 'Baja',   bg: 'bg-gray-100',  text: 'text-gray-500'  },
]

const ESTADOS = [
  { value: 'pendiente', label: 'Pendiente', bg: 'bg-amber-50',  text: 'text-amber-700'  },
  { value: 'resuelto',  label: 'Resuelto',  bg: 'bg-green-50',  text: 'text-green-700'  },
  { value: 'rechazado', label: 'Rechazado', bg: 'bg-red-50',    text: 'text-red-700'    },
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

const blankForm = { titulo: '', descripcion: '', categoria: 'otro', prioridad: 'media', usuario_id: '', nombre_empleada: '' }

export default function ReparacionesClient({
  user,
  empleadasList,
}: {
  user: SessionUser
  empleadasList: Empleada[]
}) {
  const isAdmin = user.rol === 'admin' || user.rol === 'Admin'

  const [items, setItems]   = useState<Reparacion[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter]   = useState('pendiente')
  const [filterCat, setFilterCat] = useState('')
  const [toast, setToast]   = useState('')

  const [showCreate, setShowCreate] = useState(false)
  const [creating, setCreating]     = useState(false)
  const [form, setForm]             = useState(blankForm)
  const [formError, setFormError]   = useState('')

  const [actionId, setActionId]   = useState<string | null>(null)
  const [actionForm, setActionForm] = useState({ estado: '', comentario: '' })
  const [updating, setUpdating]   = useState(false)

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

  const byStatus = filter === 'todos' ? items : items.filter(i => i.estado === filter)
  const filtered = filterCat ? byStatus.filter(i => i.categoria === filterCat) : byStatus
  const counts = {
    todos:     items.length,
    pendiente: items.filter(i => i.estado === 'pendiente').length,
    resuelto:  items.filter(i => i.estado === 'resuelto').length,
    rechazado: items.filter(i => i.estado === 'rechazado').length,
  }
  const usedCats = [...new Set(items.map(i => i.categoria))]

  function openCreate() { setForm(blankForm); setFormError(''); setShowCreate(true) }

  async function handleCreate() {
    if (!form.titulo.trim()) { setFormError('El título es obligatorio'); return }
    setCreating(true)
    setFormError('')
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
        setToast('Solicitud enviada')
      } else {
        const e = await r.json()
        setFormError(e.error ?? 'Error al enviar')
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
        setToast('Cambios guardados')
      }
    } finally {
      setUpdating(false)
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('¿Eliminar esta solicitud?')) return
    await fetch(`/api/reparaciones/${id}`, { method: 'DELETE' })
    setItems(prev => prev.filter(i => i.id !== id))
    setToast('Solicitud eliminada')
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
              : 'Reportá cualquier problema o mejora que notes en el salón'}
          </p>
        </div>
        <Button onClick={openCreate} icon={<IconPlus size={14} />} size="sm">
          Nueva
        </Button>
      </div>

      {/* Info banner — solo empleadas */}
      {!isAdmin && (
        <div className="bg-[var(--primary-light)] border border-[var(--primary)]/20 rounded-2xl p-4 space-y-2">
          <div className="flex items-center gap-2">
            <IconWrench size={15} className="text-[var(--primary)] shrink-0" />
            <p className="text-[13px] font-semibold text-[var(--primary)]">¿Cómo funciona este módulo?</p>
          </div>
          <ul className="space-y-1 pl-1">
            {[
              'Cargá cualquier cosa que veas rota, que no funcione bien o que se pueda mejorar en el salón.',
              'Elegí la categoría que mejor describa el problema y poné una prioridad alta si es urgente o una prioridad media/baja si es algo que puede esperar.',
              'El admin va a revisar tu solicitud y te va a notificar cuando esté resuelta o si hay algún comentario.',
              'Podés ver el estado de todas tus solicitudes en cualquier momento desde este módulo.',
            ].map((t, i) => (
              <li key={i} className="text-[12px] text-[var(--primary)]/80 flex gap-2">
                <span className="shrink-0 mt-0.5 w-4 h-4 rounded-full bg-[var(--primary)]/15 flex items-center justify-center text-[9px] font-bold text-[var(--primary)]">{i + 1}</span>
                {t}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Status filters */}
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

      {/* Category filters — only show categories that have at least one item */}
      {usedCats.length > 1 && (
        <div className="flex gap-2 overflow-x-auto pb-1" style={{ scrollbarWidth: 'none' }}>
          <button
            onClick={() => setFilterCat('')}
            className={`px-3 py-1.5 rounded-xl text-[12px] font-semibold shrink-0 transition-all cursor-pointer ${
              filterCat === ''
                ? 'bg-gray-700 text-white'
                : 'bg-white text-gray-500 border border-gray-200 hover:border-gray-300'
            }`}
          >
            Todas las categorías
          </button>
          {usedCats.map(v => {
            const cat = getCat(v)
            return (
              <button
                key={v}
                onClick={() => setFilterCat(filterCat === v ? '' : v)}
                className={`px-3 py-1.5 rounded-xl text-[12px] font-semibold shrink-0 transition-all cursor-pointer ${
                  filterCat === v
                    ? `${cat.bg} ${cat.text} ring-1 ring-current`
                    : 'bg-white text-gray-500 border border-gray-200 hover:border-gray-300'
                }`}
              >
                {cat.label}
              </button>
            )
          })}
        </div>
      )}

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
            <p className="text-[12px] text-gray-300 mt-1">Tocá "Nueva" para cargar la primera</p>
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
              <div key={item.id} className="bg-white rounded-2xl border border-[var(--border)] shadow-sm overflow-hidden">
                <div className="p-4">
                  {/* Category + status + priority */}
                  <div className="flex items-center gap-2 mb-2 flex-wrap">
                    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${cat.bg} ${cat.text}`}>
                      {cat.label}
                    </span>
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
                    <p className="text-[12px] text-[var(--text-sub)] mt-1 leading-relaxed">{item.descripcion}</p>
                  )}

                  <div className="flex items-center gap-2 mt-2 flex-wrap">
                    {isAdmin && item.nombre_empleada && (
                      <>
                        <span className="text-[11px] font-semibold text-[var(--primary)]">{item.nombre_empleada}</span>
                        <span className="text-gray-300 text-[11px]">·</span>
                      </>
                    )}
                    <span className="text-[11px] text-[var(--text-sub)]">{fmtDate(item.creado_en)}</span>
                    {item.resuelto_en && (
                      <>
                        <span className="text-gray-300 text-[11px]">·</span>
                        <span className="text-[11px] text-green-500">Resuelto {fmtDate(item.resuelto_en)}</span>
                      </>
                    )}
                  </div>

                  {item.comentario_admin && !isOpen && (
                    <div className="mt-2.5 px-3 py-2 bg-gray-50 rounded-xl">
                      <p className="text-[10px] text-[var(--text-sub)] font-semibold mb-0.5">Comentario</p>
                      <p className="text-[12px] text-[var(--text)]">{item.comentario_admin}</p>
                    </div>
                  )}

                  {isAdmin && (
                    <div className="flex items-center gap-3 mt-3 pt-3 border-t border-gray-100">
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
                  <div className="px-4 pb-4 pt-3 border-t border-[var(--border)] bg-gray-50/40 space-y-3">
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
                      style={{ fontSize: 16 }}
                      className="w-full px-4 py-3 bg-white border border-[var(--border)] rounded-xl text-[var(--text)] placeholder:text-[var(--text-muted)] outline-none transition focus:border-[var(--primary)] focus:ring-2 focus:ring-[var(--primary-light)] resize-none text-[13px]"
                    />
                    <Button onClick={() => handleUpdate(item.id)} loading={updating} className="w-full">
                      Guardar cambios
                    </Button>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* ─── Modal: Nueva solicitud ─── */}
      <Modal
        open={showCreate}
        onClose={() => setShowCreate(false)}
        title="Nueva solicitud"
        footer={<>
          <Button variant="secondary" onClick={() => setShowCreate(false)} className="flex-1 lg:flex-none">Cancelar</Button>
          <Button onClick={handleCreate} loading={creating} className="flex-1 lg:flex-none">Enviar</Button>
        </>}
      >
        <div className="space-y-4">
          {isAdmin && (
            <Select
              label="Para empleada"
              value={form.usuario_id}
              onChange={v => {
                const emp = empleadasList.find(x => x.id === v)
                setForm(f => ({ ...f, usuario_id: v, nombre_empleada: emp?.nombre ?? '' }))
              }}
            >
              <option value="">Cargada por mí (admin)</option>
              {empleadasList.map(e => (
                <option key={e.id} value={e.id}>{e.nombre}</option>
              ))}
            </Select>
          )}

          <Input
            label="Título *"
            value={form.titulo}
            onChange={e => setForm(f => ({ ...f, titulo: e.target.value }))}
            placeholder="Ej: Luz quemada en el baño"
          />

          <div>
            <label className="block text-[13px] font-medium text-[var(--text-sub)] mb-1.5">Descripción</label>
            <textarea
              value={form.descripcion}
              onChange={e => setForm(f => ({ ...f, descripcion: e.target.value }))}
              placeholder="Contá más detalles del problema o lo que se necesita…"
              rows={3}
              style={{ fontSize: 16 }}
              className="w-full px-4 py-3 bg-white border border-[var(--border)] rounded-xl text-[var(--text)] placeholder:text-[var(--text-muted)] outline-none transition focus:border-[var(--primary)] focus:ring-2 focus:ring-[var(--primary-light)] resize-none text-sm"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Select
              label="Categoría"
              value={form.categoria}
              onChange={v => setForm(f => ({ ...f, categoria: v }))}
            >
              {CATEGORIAS.map(c => (
                <option key={c.value} value={c.value}>{c.label} ({c.hint})</option>
              ))}
            </Select>

            <Select
              label="Prioridad"
              value={form.prioridad}
              onChange={v => setForm(f => ({ ...f, prioridad: v }))}
            >
              {PRIORIDADES.map(p => (
                <option key={p.value} value={p.value}>{p.label}</option>
              ))}
            </Select>
          </div>

          {formError && (
            <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-100 rounded-xl">
              <IconAlertCircle size={16} className="text-red-500 shrink-0" />
              <p className="text-[13px] text-red-600 font-medium">{formError}</p>
            </div>
          )}
        </div>
      </Modal>

      <Toast message={toast} visible={!!toast} onClose={() => setToast('')} />
    </div>
  )
}
