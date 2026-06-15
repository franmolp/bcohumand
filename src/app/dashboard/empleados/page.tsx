'use client'

import { useState, useEffect, useCallback } from 'react'
import { Button, Input, Select, Spinner, Modal, Toast, Confirm } from '@/components/ui'
import { IconPlus, IconSearch, IconEdit, IconAlertCircle, IconRefresh, IconArchive, IconLock, IconLockOpen, IconUsers, IconBell } from '@/components/ui/Icons'

interface Equipo { id: number; nombre: string }
interface Rol { id: number; nombre: string }
interface Empleado {
  id: string; usuario: string; reloj: string | null; nombre: string; email: string
  estado_cuenta: string; foto_perfil?: string | null; telefono: string | null; dni: string | null
  fecha_nacimiento: string | null; ultimo_login: string | null
  equipo: Equipo | null; rol: Rol | null
}

function EmpAvatar({ emp, size }: { emp: Empleado; size: number }) {
  const ini = emp.nombre.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()
  if (emp.foto_perfil) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={emp.foto_perfil} alt="" className="rounded-full object-cover shrink-0 shadow-sm" style={{ width: size, height: size }} />
  }
  return (
    <div className="bg-[image:var(--gradient)] rounded-full flex items-center justify-center shrink-0 shadow-sm" style={{ width: size, height: size }}>
      <span className="font-bold text-white" style={{ fontSize: size * 0.3 }}>{ini}</span>
    </div>
  )
}

const blank = { nombre: '', email: '', usuario: '', telefono: '', dni: '', fecha_nacimiento: '', reloj: '', password: '', equipo_id: '', rol_id: '2' }

export default function EmpleadosPage() {
  const [list, setList] = useState<Empleado[]>([])
  const [equipos, setEquipos] = useState<Equipo[]>([])
  const [roles, setRoles] = useState<Rol[]>([])
  const [loading, setLoading] = useState(true)
  const [estado, setEstado] = useState('activo')
  const [eqFilter, setEqFilter] = useState('')
  const [q, setQ] = useState('')
  const [modal, setModal] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [form, setForm] = useState(blank)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [toast, setToast] = useState('')
  const [archiveId, setArchiveId]     = useState<string | null>(null)
  const [unarchiveId, setUnarchiveId] = useState<string | null>(null)
  const [blockId, setBlockId]         = useState<string | null>(null)
  const [unblockId, setUnblockId]     = useState<string | null>(null)
  const [vacMap, setVacMap]           = useState<Record<string, { total: number; usadas: number; restantes: number }>>({})
  const [pushSet, setPushSet]         = useState<Set<string>>(new Set())

  const load = useCallback(async () => {
    setLoading(true)
    const p = new URLSearchParams({ estado })
    if (eqFilter) p.set('equipo', eqFilter)
    if (q) p.set('q', q)
    const r = await fetch(`/api/empleados?${p}`)
    const d = await r.json()
    setList(Array.isArray(d) ? d : [])
    setLoading(false)
  }, [estado, eqFilter, q])

  useEffect(() => { load() }, [load])
  useEffect(() => { fetch('/api/equipos').then(r => r.json()).then(setEquipos); fetch('/api/roles').then(r => r.json()).then(setRoles) }, [])
  useEffect(() => { fetch('/api/empleados/vacaciones').then(r => r.json()).then(d => { if (d && typeof d === 'object') setVacMap(d) }) }, [])
  useEffect(() => { fetch('/api/push/subscribe').then(r => r.ok ? r.json() : []).then((ids: string[]) => setPushSet(new Set(ids))) }, [])
  useEffect(() => { if (toast) { const t = setTimeout(() => setToast(''), 3000); return () => clearTimeout(t) } }, [toast])

  function openNew() { setForm(blank); setEditId(null); setError(''); setModal(true) }
  function openEdit(e: Empleado) {
    setForm({ nombre: e.nombre, email: e.email, usuario: e.usuario || '', telefono: e.telefono || '', dni: e.dni || '', fecha_nacimiento: e.fecha_nacimiento?.split('T')[0] || '', reloj: e.reloj || '', password: '', equipo_id: e.equipo?.id?.toString() || '', rol_id: e.rol?.id?.toString() || '2' })
    setEditId(e.id); setError(''); setModal(true)
  }

  function formatNombre(s: string): string {
    return s.trim().split(/\s+/).filter(Boolean)
      .map(w => w[0] === w[0].toLowerCase() ? w[0].toUpperCase() + w.slice(1) : w)
      .join(' ')
  }

  async function save() {
    setError(''); setSaving(true)
    if (!editId && !form.password) { setError('Contraseña requerida'); setSaving(false); return }
    if (form.email && !form.email.includes('@')) { setError('El email debe contener @'); setSaving(false); return }
    if (form.password && form.password.length < 6) { setError('La contraseña debe tener al menos 6 caracteres'); setSaving(false); return }
    const cleanTel = form.telefono.replace(/[\s-]/g, '')
    const cleanDni = form.dni.replace(/[\s-]/g, '')
    const body: Record<string, unknown> = {
      ...form,
      nombre:    formatNombre(form.nombre),
      usuario:   form.usuario.toLowerCase().trim(),
      telefono:  cleanTel || null,
      dni:       cleanDni || null,
      equipo_id: form.equipo_id ? +form.equipo_id : null,
      rol_id:    form.rol_id ? +form.rol_id : 2,
    }
    if (!body.password) delete body.password
    try {
      const r = await fetch(editId ? `/api/empleados/${editId}` : '/api/empleados', { method: editId ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      const d = await r.json()
      if (!r.ok) { setError(d.error || 'Error'); setSaving(false); return }
      setModal(false); setToast(editId ? 'Empleado actualizado' : 'Empleado creado'); load()
    } catch { setError('Error de conexión') } finally { setSaving(false) }
  }

  async function archive() {
    if (!archiveId) return
    await fetch(`/api/empleados/${archiveId}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ estado_cuenta: 'archivado' }) })
    setArchiveId(null); setToast('Empleado archivado'); load()
  }

  async function unarchive() {
    if (!unarchiveId) return
    await fetch(`/api/empleados/${unarchiveId}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ estado_cuenta: 'activo' }) })
    setUnarchiveId(null); setToast('Empleado reactivado'); load()
  }

  async function block() {
    if (!blockId) return
    await fetch(`/api/empleados/${blockId}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ estado_cuenta: 'bloqueada' }) })
    setBlockId(null); setToast('Cuenta bloqueada'); load()
  }

  async function unblock() {
    if (!unblockId) return
    await fetch(`/api/empleados/${unblockId}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ estado_cuenta: 'activo' }) })
    setUnblockId(null); setToast('Cuenta desbloqueada'); load()
  }

  const fmtDate = (d: string | null) => {
    if (!d) return '—'
    return new Date(d).toLocaleString('es-AR', {
      timeZone: 'America/Argentina/Buenos_Aires',
      day: '2-digit', month: '2-digit', year: '2-digit',
      hour: '2-digit', minute: '2-digit',
    })
  }
  const initials = (n: string) => n.split(' ').map(w => w[0]).join('').slice(0, 2)
  const f = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [k]: e.target.value })

  const estadoLabel = (s: string) => {
    const map: Record<string, { bg: string; text: string; label: string }> = {
      activo: { bg: 'bg-emerald-50', text: 'text-emerald-700', label: 'Activo' },
      archivado: { bg: 'bg-gray-100', text: 'text-gray-500', label: 'Archivado' },
      bloqueada: { bg: 'bg-red-50', text: 'text-red-600', label: 'Bloqueado' },
    }
    const c = map[s] || map.activo
    return <span className={`text-[11px] font-semibold px-2.5 py-1 rounded-lg ${c.bg} ${c.text}`}>{c.label}</span>
  }

  return (
    <div className="py-4 fade-in">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-[image:var(--gradient)] flex items-center justify-center flex-shrink-0 shadow-sm">
            <IconUsers size={18} className="text-white" />
          </div>
          <div>
            <h1 className="text-[17px] font-bold text-[var(--text)]">Empleados</h1>
            <p className="text-xs text-[var(--text-muted)]">{list.length} resultado{list.length !== 1 ? 's' : ''}</p>
          </div>
        </div>
        <Button icon={<IconPlus size={16}/>} onClick={openNew} size="sm">Nuevo</Button>
      </div>

      {/* Filters - stacked on mobile */}
      <div className="bg-white rounded-xl border border-gray-200/60 p-3 mb-4 space-y-2 lg:space-y-0 lg:flex lg:items-center lg:gap-2.5">
        <div className="relative flex-1">
          <IconSearch size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input type="text" placeholder="Buscar..." value={q} onChange={e => setQ(e.target.value)}
            className="w-full h-10 pl-9 pr-3 border border-gray-200 rounded-xl outline-none focus:border-[var(--primary)] bg-white" />
        </div>
        <div className="flex gap-2">
          <select value={eqFilter} onChange={e => setEqFilter(e.target.value)}
            className="h-10 px-3 border border-gray-200 rounded-xl bg-white cursor-pointer flex-1 lg:flex-none lg:w-40 min-w-0">
            <option value="">Equipo</option>
            {equipos.map(e => <option key={e.id} value={e.id}>{e.nombre}</option>)}
          </select>
          <div className="flex bg-gray-100 rounded-xl p-0.5 shrink-0">
            {['activo', 'archivado', 'todos'].map(s => (
              <button key={s} onClick={() => setEstado(s)}
                className={`px-2 lg:px-3 py-2 text-[11px] font-medium rounded-[10px] cursor-pointer transition-all whitespace-nowrap ${estado === s ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'}`}>
                {s[0].toUpperCase() + s.slice(1)}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Content */}
      {loading ? <Spinner /> : list.length === 0 ? (
        <div className="text-center py-16"><IconSearch size={36} className="mx-auto text-gray-300 mb-2" /><p className="text-sm text-[var(--text-sub)]">No se encontraron empleados</p></div>
      ) : (
        <>
          {/* MOBILE: cards */}
          <div className="lg:hidden space-y-2">
            {list.map(emp => (
              <div key={emp.id} className={`bg-white rounded-xl border border-gray-200/60 p-3 flex items-center gap-3 ${emp.estado_cuenta !== 'activo' ? 'opacity-50' : ''}`}>
                <EmpAvatar emp={emp} size={40} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <p className="text-sm font-semibold truncate">{emp.nombre}</p>
                    {pushSet.has(emp.id) && <IconBell size={11} className="text-gray-400 shrink-0" />}
                  </div>
                  <p className="text-[11px] text-[var(--primary)] mt-0.5">{emp.equipo?.nombre || '—'} · {(() => { const v = vacMap[emp.id] ?? { total: 14, restantes: 14 }; return `${v.restantes}/${v.total} vac.` })()}</p>
                </div>
                <div className="flex gap-1 shrink-0">
                  <button onClick={() => openEdit(emp)} className="p-2 text-gray-400 active:bg-gray-100 rounded-lg cursor-pointer"><IconEdit size={16}/></button>
                  {emp.estado_cuenta === 'archivado' ? (
                    <button onClick={() => setUnarchiveId(emp.id)} className="p-2 text-emerald-500 active:bg-emerald-50 rounded-lg cursor-pointer" title="Reactivar"><IconRefresh size={16}/></button>
                  ) : (
                    <button onClick={() => setArchiveId(emp.id)} className="p-2 text-gray-400 active:bg-amber-50 rounded-lg cursor-pointer" title="Archivar"><IconArchive size={16}/></button>
                  )}
                  {emp.estado_cuenta === 'bloqueada' ? (
                    <button onClick={() => setUnblockId(emp.id)} className="p-2 text-amber-500 active:bg-amber-50 rounded-lg cursor-pointer" title="Desbloquear"><IconLockOpen size={16}/></button>
                  ) : emp.estado_cuenta === 'activo' ? (
                    <button onClick={() => setBlockId(emp.id)} className="p-2 text-gray-400 active:bg-red-50 rounded-lg cursor-pointer" title="Bloquear"><IconLock size={16}/></button>
                  ) : null}
                </div>
              </div>
            ))}
          </div>

          {/* DESKTOP: table */}
          <div className="hidden lg:block bg-white rounded-xl border border-gray-200/60 overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="bg-gray-50 text-[11px] text-gray-500 uppercase tracking-wider">
                  <th className="text-left py-3 px-4 font-semibold">Nombre</th>
                  <th className="text-left py-3 px-4 font-semibold">Usuario</th>
                  <th className="text-left py-3 px-4 font-semibold">Equipo</th>
                  <th className="text-left py-3 px-4 font-semibold">Vacaciones</th>
                  <th className="text-left py-3 px-4 font-semibold">Estado</th>
                  <th className="text-left py-3 px-4 font-semibold">Último login</th>
                  <th className="w-24"></th>
                </tr>
              </thead>
              <tbody>
                {list.map(emp => (
                  <tr key={emp.id} className={`text-sm border-t border-gray-100 hover:bg-gray-50/50 transition-colors ${emp.estado_cuenta !== 'activo' ? 'opacity-50' : ''}`}>
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-2.5">
                        <EmpAvatar emp={emp} size={32} />
                        <span className="font-medium">{emp.nombre}</span>
                        {pushSet.has(emp.id) && <IconBell size={12} className="text-gray-400 shrink-0" />}
                      </div>
                    </td>
                    <td className="py-3 px-4 text-gray-500 text-[13px]">{emp.usuario}</td>
                    <td className="py-3 px-4 text-[var(--primary)] text-[13px] font-medium">{emp.equipo?.nombre || '—'}</td>
                    <td className="py-3 px-4 text-[13px]">
                      {(() => {
                        const v = vacMap[emp.id] ?? { total: 14, usadas: 0, restantes: 14 }
                        return (
                          <span className={v.restantes > 7 ? 'text-emerald-600' : v.restantes > 3 ? 'text-amber-600' : 'text-red-500'}>
                            {v.restantes} <span className="text-gray-400 font-normal">/ {v.total}</span>
                          </span>
                        )
                      })()}
                    </td>
                    <td className="py-3 px-4">{estadoLabel(emp.estado_cuenta)}</td>
                    <td className="py-3 px-4 text-gray-500 text-[13px]">{fmtDate(emp.ultimo_login)}</td>
                    <td className="py-3 px-4">
                      <div className="flex gap-0.5 justify-end">
                        <button onClick={() => openEdit(emp)} className="p-1.5 text-gray-400 hover:text-[var(--primary)] hover:bg-[var(--primary-light)] rounded-lg cursor-pointer" title="Editar"><IconEdit size={15}/></button>
                        {emp.estado_cuenta === 'archivado' ? (
                          <button onClick={() => setUnarchiveId(emp.id)} className="p-1.5 text-emerald-500 hover:bg-emerald-50 rounded-lg cursor-pointer" title="Reactivar"><IconRefresh size={15}/></button>
                        ) : (
                          <button onClick={() => setArchiveId(emp.id)} className="p-1.5 text-gray-400 hover:text-amber-600 hover:bg-amber-50 rounded-lg cursor-pointer" title="Archivar"><IconArchive size={15}/></button>
                        )}
                        {emp.estado_cuenta === 'bloqueada' ? (
                          <button onClick={() => setUnblockId(emp.id)} className="p-1.5 text-amber-500 hover:bg-amber-50 rounded-lg cursor-pointer" title="Desbloquear cuenta"><IconLockOpen size={15}/></button>
                        ) : emp.estado_cuenta === 'activo' ? (
                          <button onClick={() => setBlockId(emp.id)} className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg cursor-pointer" title="Bloquear cuenta"><IconLock size={15}/></button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* Modal */}
      <Modal open={modal} onClose={() => setModal(false)} title={editId ? 'Editar empleado' : 'Nuevo empleado'}
        footer={<><Button variant="secondary" onClick={() => setModal(false)} className="flex-1 lg:flex-none">Cancelar</Button><Button onClick={save} loading={saving} className="flex-1 lg:flex-none">{editId ? 'Guardar' : 'Crear'}</Button></>}>
        <div className="space-y-4">
          <Input label="Nombre completo" value={form.nombre} onChange={f('nombre')} placeholder="Nombre Apellido" required />
          <Input label="Usuario" value={form.usuario} onChange={f('usuario')} placeholder="usuario" />
          <Input label="Email" type="email" value={form.email} onChange={f('email')} placeholder="email@ejemplo.com" required />
          <div className="grid grid-cols-2 gap-3">
            <Select label="Equipo" value={form.equipo_id} onChange={v => setForm({ ...form, equipo_id: v })}><option value="">Sin equipo</option>{equipos.map(e => <option key={e.id} value={e.id}>{e.nombre}</option>)}</Select>
            <Select label="Rol" value={form.rol_id} onChange={v => setForm({ ...form, rol_id: v })}>{roles.map(r => <option key={r.id} value={r.id}>{r.nombre}</option>)}</Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Input label="Teléfono" value={form.telefono} onChange={f('telefono')} placeholder="2216044653" />
            <Input label="DNI" value={form.dni} onChange={f('dni')} placeholder="36778408" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Input label="Nacimiento" type="date" value={form.fecha_nacimiento} onChange={f('fecha_nacimiento')} />
            <Input label="ID Reloj" value={form.reloj} onChange={f('reloj')} placeholder="HIKVISION" />
          </div>
          <Input label={editId ? 'Nueva contraseña (vacío = sin cambio)' : 'Contraseña'} type="password" value={form.password} onChange={f('password')} placeholder={editId ? '••••••' : 'Contraseña'} required={!editId} />
          {error && <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-100 rounded-xl"><IconAlertCircle size={16} className="text-red-500 shrink-0"/><p className="text-[13px] text-red-600 font-medium">{error}</p></div>}
        </div>
      </Modal>

      <Confirm open={!!archiveId}   onClose={() => setArchiveId(null)}   onConfirm={archive}   title="Archivar empleado"     message="El empleado quedará archivado y no podrá acceder al sistema."  confirmLabel="Archivar"     danger />
      <Confirm open={!!unarchiveId} onClose={() => setUnarchiveId(null)} onConfirm={unarchive} title="Reactivar empleado"    message="El empleado podrá volver a acceder al sistema."                  confirmLabel="Reactivar"           />
      <Confirm open={!!blockId}     onClose={() => setBlockId(null)}     onConfirm={block}     title="Bloquear cuenta"      message="El empleado no podrá iniciar sesión hasta que se desbloquee."  confirmLabel="Bloquear"     danger />
      <Confirm open={!!unblockId}   onClose={() => setUnblockId(null)}   onConfirm={unblock}   title="Desbloquear cuenta"   message="El empleado podrá volver a iniciar sesión normalmente."          confirmLabel="Desbloquear"         />
      <Toast message={toast} visible={!!toast} />
    </div>
  )
}
