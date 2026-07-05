'use client'

import { useState, useEffect } from 'react'
import { Modal, Button, Input, Confirm, Spinner } from '@/components/ui'
import { IconSettings, IconEdit, IconTrash, IconPlus, IconUsers } from '@/components/ui/Icons'

// ─── Types ───────────────────────────────────────────────────────────────────

interface Equipo { id: number; nombre: string }
interface Rol { id: number; nombre: string; descripcion: string | null; permisos: string[] | null }

// Módulos que se pueden configurar por rol (los admin-only están excluidos — son fijos)
const MODULOS = [
  { href: '/dashboard/asistencia',      label: 'Asistencia',         sub: 'Gestión de fichadas de todos · ≠ Mi Asistencia' },
  { href: '/dashboard/empleados',       label: 'Empleados',          sub: 'CRUD de empleados, roles y equipos' },
  { href: '/dashboard/liquidador',      label: 'Liquidaciones',      sub: 'Firmar y subir recibos de todos · ≠ Mi Liquidación' },
  { href: '/dashboard/espacio-trabajo', label: 'Espacio de trabajo', sub: 'Gestión de recursos y turnos del local' },
  { href: '/dashboard/compras',         label: 'Compras',            sub: 'Registro de gastos y proveedores' },
  { href: '/dashboard/monotributo',     label: 'Monotributo',        sub: 'Archivos de monotributo de todos' },
]

// ─── Equipos ─────────────────────────────────────────────────────────────────

function EquiposTab() {
  const [equipos, setEquipos] = useState<Equipo[]>([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(false)
  const [editTarget, setEditTarget] = useState<Equipo | null>(null)
  const [nombre, setNombre] = useState('')
  const [saving, setSaving] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<Equipo | null>(null)
  const [deleting, setDeleting] = useState(false)

  async function load() {
    setLoading(true)
    const r = await fetch('/api/equipos')
    if (r.ok) setEquipos(await r.json())
    setLoading(false)
  }
  useEffect(() => { load() }, [])

  function openNew() { setEditTarget(null); setNombre(''); setModal(true) }
  function openEdit(e: Equipo) { setEditTarget(e); setNombre(e.nombre); setModal(true) }

  async function handleSave(ev: React.FormEvent) {
    ev.preventDefault()
    setSaving(true)
    const url = editTarget ? `/api/equipos/${editTarget.id}` : '/api/equipos'
    const method = editTarget ? 'PUT' : 'POST'
    const r = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ nombre }) })
    if (r.ok) { await load(); setModal(false) }
    setSaving(false)
  }

  async function handleDelete() {
    if (!deleteTarget) return
    setDeleting(true)
    await fetch(`/api/equipos/${deleteTarget.id}`, { method: 'DELETE' })
    setEquipos(prev => prev.filter(e => e.id !== deleteTarget.id))
    setDeleteTarget(null)
    setDeleting(false)
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-[13px] text-[var(--text-muted)]">{equipos.length} equipos</p>
        <Button size="sm" onClick={openNew}><IconPlus size={15} className="mr-1"/>Nuevo equipo</Button>
      </div>

      <div className="bg-white rounded-2xl border border-[var(--border)] shadow-sm divide-y divide-[var(--border)]">
        {loading ? <div className="py-12"><Spinner /></div> : equipos.length === 0 ? (
          <p className="py-10 text-center text-[var(--text-muted)] text-sm">Sin equipos</p>
        ) : equipos.map(e => (
          <div key={e.id} className="flex items-center justify-between px-4 py-3">
            <span className="text-[14px] font-medium text-[var(--text)]">{e.nombre}</span>
            <div className="flex gap-2">
              <button onClick={() => openEdit(e)} className="p-1.5 rounded-lg text-[var(--primary)] hover:bg-indigo-50 transition-colors"><IconEdit size={15}/></button>
              <button onClick={() => setDeleteTarget(e)} className="p-1.5 rounded-lg text-red-400 hover:bg-red-50 transition-colors"><IconTrash size={15}/></button>
            </div>
          </div>
        ))}
      </div>

      <Modal open={modal} onClose={() => setModal(false)} title={editTarget ? 'Editar equipo' : 'Nuevo equipo'}>
        <form onSubmit={handleSave} className="space-y-4">
          <Input label="Nombre *" value={nombre} onChange={e => setNombre(e.target.value)} placeholder="Ej: Manicuras" required autoFocus />
          <div className="flex gap-3">
            <Button type="submit" loading={saving} className="flex-1">Guardar</Button>
            <Button type="button" variant="secondary" onClick={() => setModal(false)}>Cancelar</Button>
          </div>
        </form>
      </Modal>

      <Confirm
        open={!!deleteTarget}
        title="Eliminar equipo"
        message={`¿Eliminás el equipo "${deleteTarget?.nombre}"? Los empleados asignados quedarán sin equipo.`}
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
        loading={deleting}
        danger
      />
    </div>
  )
}

// ─── Roles ───────────────────────────────────────────────────────────────────

function RolesTab() {
  const [roles, setRoles] = useState<Rol[]>([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(false)
  const [editTarget, setEditTarget] = useState<Rol | null>(null)
  const [form, setForm] = useState({ nombre: '', descripcion: '', permisos: [] as string[] })
  const [saving, setSaving] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<Rol | null>(null)
  const [deleting, setDeleting] = useState(false)

  async function load() {
    setLoading(true)
    const r = await fetch('/api/roles')
    if (r.ok) setRoles(await r.json())
    setLoading(false)
  }
  useEffect(() => { load() }, [])

  function openNew() {
    setEditTarget(null)
    setForm({ nombre: '', descripcion: '', permisos: [] })
    setModal(true)
  }
  function openEdit(r: Rol) {
    setEditTarget(r)
    setForm({ nombre: r.nombre, descripcion: r.descripcion ?? '', permisos: r.permisos ?? [] })
    setModal(true)
  }

  function toggleModulo(href: string) {
    setForm(f => ({
      ...f,
      permisos: f.permisos.includes(href)
        ? f.permisos.filter(p => p !== href)
        : [...f.permisos, href],
    }))
  }

  async function handleSave(ev: React.FormEvent) {
    ev.preventDefault()
    setSaving(true)
    const body = { nombre: form.nombre, descripcion: form.descripcion || null, permisos: form.permisos }
    const url = editTarget ? `/api/roles/${editTarget.id}` : '/api/roles'
    const method = editTarget ? 'PUT' : 'POST'
    const r = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    if (r.ok) { await load(); setModal(false) }
    setSaving(false)
  }

  async function handleDelete() {
    if (!deleteTarget) return
    setDeleting(true)
    await fetch(`/api/roles/${deleteTarget.id}`, { method: 'DELETE' })
    setRoles(prev => prev.filter(r => r.id !== deleteTarget.id))
    setDeleteTarget(null)
    setDeleting(false)
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-[13px] text-[var(--text-muted)]">{roles.length} roles</p>
        <Button size="sm" onClick={openNew}><IconPlus size={15} className="mr-1"/>Nuevo rol</Button>
      </div>

      <div className="space-y-3">
        {loading ? <div className="py-12"><Spinner /></div> : roles.map(r => (
          <div key={r.id} className="bg-white rounded-2xl border border-[var(--border)] shadow-sm p-4">
            <div className="flex items-start justify-between">
              <div className="flex-1 min-w-0">
                <p className="text-[14px] font-semibold text-[var(--text)]">{r.nombre}</p>
                {r.descripcion && <p className="text-[12px] text-[var(--text-muted)] mt-0.5">{r.descripcion}</p>}
                <p className="text-[11px] text-[var(--text-muted)] mt-1">
                  {r.permisos === null
                    ? <span className="text-amber-500">Sin configurar (usa defaults)</span>
                    : r.permisos.length === 0
                      ? <span className="text-gray-400">Sin módulos asignados</span>
                      : r.permisos.map(h => MODULOS.find(m => m.href === h)?.label).filter(Boolean).join(' · ')}
                </p>
              </div>
              <div className="flex gap-2 ml-3">
                <button onClick={() => openEdit(r)} className="p-1.5 rounded-lg text-[var(--primary)] hover:bg-indigo-50 transition-colors"><IconEdit size={15}/></button>
                <button onClick={() => setDeleteTarget(r)} className="p-1.5 rounded-lg text-red-400 hover:bg-red-50 transition-colors"><IconTrash size={15}/></button>
              </div>
            </div>
          </div>
        ))}
      </div>

      <Modal open={modal} onClose={() => setModal(false)} title={editTarget ? 'Editar rol' : 'Nuevo rol'}>
        <form onSubmit={handleSave} className="space-y-4">
          <Input label="Nombre *" value={form.nombre} onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))} placeholder="Ej: Encargada" required autoFocus />
          <Input label="Descripción" value={form.descripcion} onChange={e => setForm(f => ({ ...f, descripcion: e.target.value }))} placeholder="Descripción del rol" />

          <div>
            <p className="text-[12px] font-semibold text-[var(--text-sub)] mb-2">Módulos visibles</p>
            <div className="rounded-xl border border-[var(--border)] divide-y divide-[var(--border)]">
              {MODULOS.map(m => {
                const on = form.permisos.includes(m.href)
                return (
                  <button key={m.href} type="button" onClick={() => toggleModulo(m.href)}
                    className="w-full flex items-center justify-between px-3 py-2.5 hover:bg-gray-50 transition-colors cursor-pointer gap-3">
                    <div className="text-left">
                      <p className="text-[13px] font-medium text-[var(--text)]">{m.label}</p>
                      <p className="text-[11px] text-[var(--text-muted)]">{m.sub}</p>
                    </div>
                    <div className={`w-9 h-5 rounded-full transition-colors relative shrink-0 ${on ? 'bg-[var(--primary)]' : 'bg-gray-200'}`}>
                      <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow-sm transition-all ${on ? 'left-4' : 'left-0.5'}`} />
                    </div>
                  </button>
                )
              })}
            </div>
            <p className="text-[11px] text-[var(--text-muted)] mt-1.5">
              Inicio, Solicitudes, Adelantos, Calendario, Muro, Reparaciones y Juegos son visibles para todos.
            </p>
          </div>

          <div className="flex gap-3 pt-1">
            <Button type="submit" loading={saving} className="flex-1">Guardar</Button>
            <Button type="button" variant="secondary" onClick={() => setModal(false)}>Cancelar</Button>
          </div>
        </form>
      </Modal>

      <Confirm
        open={!!deleteTarget}
        title="Eliminar rol"
        message={`¿Eliminás el rol "${deleteTarget?.nombre}"? Los empleados con este rol quedarán sin rol asignado.`}
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
        loading={deleting}
        danger
      />
    </div>
  )
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function EquiposClient() {
  const [tab, setTab] = useState<'equipos' | 'roles'>('equipos')

  return (
    <div className="py-4 fade-in">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-9 h-9 rounded-xl bg-[image:var(--gradient)] flex items-center justify-center flex-shrink-0 shadow-sm">
          <IconSettings size={18} className="text-white" />
        </div>
        <h1 className="text-[17px] font-bold text-[var(--text)]">Equipos y Roles</h1>
      </div>

      {/* Tabs */}
      <div className="flex bg-gray-100 rounded-xl p-0.5 mb-5 w-fit">
        {([['equipos', 'Equipos', IconUsers], ['roles', 'Roles', IconSettings]] as const).map(([key, label, Icon]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`flex items-center gap-1.5 px-4 py-2 text-[13px] font-medium rounded-[10px] transition-all ${tab === key ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'}`}
          >
            <Icon size={14} />
            {label}
          </button>
        ))}
      </div>

      {tab === 'equipos' ? <EquiposTab /> : <RolesTab />}
    </div>
  )
}
