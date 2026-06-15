'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import type { SessionUser } from '@/types'
import {
  IconBell, IconCheck, IconX, IconFileText, IconCalendar,
  IconShoppingBag, IconDollar, IconWall, IconAlertCircle, IconPlus, IconTrash,
} from '@/components/ui/Icons'
import { Spinner, Modal, Button, Input, Select, Toast } from '@/components/ui'

interface Equipo { id: number; nombre: string }
interface Empleado { id: string; nombre: string; usuario: string }

interface Notif {
  id: string | number
  titulo: string
  mensaje: string
  tipo: string
  leida: boolean
  created_at: string
}

function tipoConfig(tipo: string) {
  const map: Record<string, { icon: React.ReactNode; bg: string; color: string; href: string }> = {
    aviso:                 { icon: <IconBell size={14} />,         bg: 'bg-indigo-100',  color: 'text-indigo-600',  href: '/dashboard' },
    solicitud_aprobada:    { icon: <IconCheck size={14} />,        bg: 'bg-emerald-100', color: 'text-emerald-600', href: '/dashboard/solicitudes' },
    solicitud_rechazada:   { icon: <IconX size={14} />,            bg: 'bg-red-100',     color: 'text-red-500',     href: '/dashboard/solicitudes' },
    solicitud_nueva:       { icon: <IconFileText size={14} />,     bg: 'bg-amber-100',   color: 'text-amber-600',   href: '/dashboard/solicitudes' },
    solicitud_creada_admin:{ icon: <IconFileText size={14} />,     bg: 'bg-blue-100',    color: 'text-blue-600',    href: '/dashboard/solicitudes' },
    evento_especial:       { icon: <IconCalendar size={14} />,     bg: 'bg-violet-100',  color: 'text-violet-600',  href: '/dashboard/calendario' },
    feriado:               { icon: <IconCalendar size={14} />,     bg: 'bg-violet-100',  color: 'text-violet-600',  href: '/dashboard/calendario' },
    compra:                { icon: <IconShoppingBag size={14} />,  bg: 'bg-pink-100',    color: 'text-pink-600',    href: '/dashboard/compras' },
    monotributo:           { icon: <IconDollar size={14} />,       bg: 'bg-indigo-100',  color: 'text-indigo-600',  href: '/dashboard/liquidador' },
    mural_post:            { icon: <IconWall size={14} />,         bg: 'bg-teal-100',    color: 'text-teal-600',    href: '/dashboard/muro' },
    mural_respuesta:       { icon: <IconWall size={14} />,         bg: 'bg-teal-100',    color: 'text-teal-600',    href: '/dashboard/muro' },
  }
  return map[tipo] ?? { icon: <IconBell size={14} />, bg: 'bg-gray-100', color: 'text-gray-500', href: '/dashboard' }
}

function timeAgo(dateStr: string): string {
  const date = new Date(dateStr)
  const now  = new Date()
  const diff = now.getTime() - date.getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1)  return 'ahora'
  if (mins < 60) return `hace ${mins}m`
  const hs = Math.floor(mins / 60)
  if (hs < 24)   return `hace ${hs}h`
  const todayMid = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  const dateMid  = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()
  const days = Math.round((todayMid - dateMid) / 86400000)
  if (days === 1) return 'ayer'
  if (days < 7)   return `hace ${days}d`
  return date.toLocaleDateString('es-AR', { day: 'numeric', month: 'short' })
}

const blankForm = { titulo: '', mensaje: '', destinatario: 'todos', equipo_id: '', usuario_id: '' }

export default function NotificacionesClient({ session }: { session: SessionUser }) {
  const [notifs, setNotifs]     = useState<Notif[]>([])
  const [loading, setLoading]   = useState(true)
  const [marking, setMarking]   = useState(false)
  const [createModal, setCreateModal] = useState(false)
  const [form, setForm]         = useState(blankForm)
  const [saving, setSaving]     = useState(false)
  const [formError, setFormError] = useState('')
  const [toast, setToast]       = useState('')
  const [equipos, setEquipos]   = useState<Equipo[]>([])
  const [empleados, setEmpleados] = useState<Empleado[]>([])
  const isAdmin = session.rol === 'admin' || session.rol === 'Admin'

  const fetchNotifs = useCallback(async () => {
    const res = await fetch('/api/notificaciones')
    if (res.ok) setNotifs(await res.json())
    setLoading(false)
  }, [])

  useEffect(() => { fetchNotifs() }, [fetchNotifs])
  useEffect(() => { if (toast) { const t = setTimeout(() => setToast(''), 3000); return () => clearTimeout(t) } }, [toast])
  useEffect(() => {
    if (!isAdmin) return
    fetch('/api/equipos').then(r => r.json()).then(d => setEquipos(Array.isArray(d) ? d : []))
    fetch('/api/empleados?estado=activo').then(r => r.json()).then(d => setEmpleados(Array.isArray(d) ? d : []))
  }, [isAdmin])

  async function sendNotif() {
    if (!form.titulo.trim()) { setFormError('El título es requerido'); return }
    if (form.destinatario === 'equipo' && !form.equipo_id) { setFormError('Seleccioná un equipo'); return }
    if (form.destinatario === 'empleado' && !form.usuario_id) { setFormError('Seleccioná un empleado'); return }
    setSaving(true); setFormError('')
    const res = await fetch('/api/notificaciones', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        titulo: form.titulo,
        mensaje: form.mensaje,
        destinatario: form.destinatario,
        equipo_id: form.destinatario === 'equipo' ? +form.equipo_id : undefined,
        usuario_id: form.destinatario === 'empleado' ? form.usuario_id : undefined,
      }),
    })
    const d = await res.json()
    setSaving(false)
    if (res.ok) {
      setCreateModal(false)
      setForm(blankForm)
      setToast(d.enviadas > 0 ? `Notificación enviada a ${d.enviadas} empleado${d.enviadas !== 1 ? 's' : ''}` : 'Sin destinatarios activos')
    } else {
      setFormError(d.error || 'Error al enviar')
    }
  }

  async function markOne(id: string | number) {
    setNotifs(prev => prev.map(n => n.id === id ? { ...n, leida: true } : n))
    await fetch('/api/notificaciones', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    })
    window.dispatchEvent(new Event('notif-updated'))
  }

  async function deleteAviso(n: Notif) {
    const titulo = n.titulo
    setNotifs(prev => prev.filter(x => !(x.tipo === 'aviso' && x.titulo === titulo)))
    const res = await fetch('/api/notificaciones', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: n.id }),
    })
    const d = await res.json()
    if (res.ok) {
      setToast(`Aviso eliminado para ${d.eliminadas} empleado${d.eliminadas !== 1 ? 's' : ''}`)
      window.dispatchEvent(new Event('notif-updated'))
    } else {
      fetchNotifs()
    }
  }

  async function markAll() {
    setMarking(true)
    setNotifs(prev => prev.map(n => ({ ...n, leida: true })))
    await fetch('/api/notificaciones', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ all: true }),
    })
    setMarking(false)
    window.dispatchEvent(new Event('notif-updated'))
  }

  const unread = notifs.filter(n => !n.leida).length

  if (loading) return (
    <div className="flex justify-center py-20"><Spinner size={32} /></div>
  )

  return (
    <div className="py-4 fade-in">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-[image:var(--gradient)] flex items-center justify-center flex-shrink-0 shadow-sm">
            <IconBell size={18} className="text-white" />
          </div>
          <div className="flex items-center gap-2">
            <h1 className="text-[17px] font-bold text-[var(--text)]">Notificaciones</h1>
            {unread > 0 && (
              <span className="text-[11px] font-bold bg-[var(--primary)] text-white rounded-full px-2 py-0.5">
                {unread}
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-3">
          {unread > 0 && (
            <button
              onClick={markAll}
              disabled={marking}
              className="text-[12px] text-[var(--primary)] font-medium hover:opacity-70 transition-opacity cursor-pointer flex items-center gap-1"
            >
              <IconCheck size={13} />
              Marcar todas como leídas
            </button>
          )}
          {isAdmin && (
            <Button size="sm" icon={<IconPlus size={15}/>} onClick={() => { setForm(blankForm); setFormError(''); setCreateModal(true) }}>
              Crear notificación
            </Button>
          )}
        </div>
      </div>

      {/* List */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        {notifs.length === 0 && (
          <div className="flex flex-col items-center py-16 text-center">
            <div className="w-14 h-14 bg-gray-100 rounded-full flex items-center justify-center mb-3">
              <IconBell size={24} className="text-gray-300" />
            </div>
            <p className="text-[14px] font-medium text-gray-400">Sin notificaciones</p>
            <p className="text-[12px] text-gray-300 mt-1">Acá aparecerán tus notificaciones</p>
          </div>
        )}

        <div className="divide-y divide-gray-50">
          {notifs.map(n => {
            const cfg = tipoConfig(n.tipo)
            return (
              <div key={n.id} className={`flex items-start gap-3 px-4 py-3.5 ${!n.leida ? 'bg-[var(--primary-light)]/40' : ''}`}>
                {/* Icon */}
                <div className={`w-8 h-8 rounded-full ${cfg.bg} flex items-center justify-center flex-shrink-0 mt-0.5`}>
                  <span className={cfg.color}>{cfg.icon}</span>
                </div>

                {/* Content — clickable → navigate */}
                <Link href={cfg.href} className="flex-1 min-w-0 hover:opacity-80 transition-opacity">
                  <p className={`text-[13px] leading-snug ${!n.leida ? 'font-semibold text-[var(--text)]' : 'font-medium text-gray-700'}`}>
                    {n.titulo}
                  </p>
                  {n.mensaje && (
                    <p className="text-[12px] text-gray-400 mt-0.5 line-clamp-2">{n.mensaje}</p>
                  )}
                  <p className="text-[11px] text-gray-400 mt-1">{timeAgo(n.created_at)}</p>
                </Link>

                {/* Actions */}
                <div className="flex items-center gap-1 flex-shrink-0 mt-0.5">
                  {!n.leida && (
                    <button
                      onClick={() => markOne(n.id)}
                      title="Marcar como leída"
                      className="w-6 h-6 rounded-full flex items-center justify-center hover:bg-[var(--primary)] hover:text-white text-[var(--primary)] transition-colors cursor-pointer"
                    >
                      <IconCheck size={12} />
                    </button>
                  )}
                  {isAdmin && n.tipo === 'aviso' && (
                    <button
                      onClick={() => deleteAviso(n)}
                      title="Eliminar para todos"
                      className="w-6 h-6 rounded-full flex items-center justify-center hover:bg-red-100 hover:text-red-500 text-gray-300 transition-colors cursor-pointer"
                    >
                      <IconTrash size={12} />
                    </button>
                  )}
                  {n.leida && !(isAdmin && n.tipo === 'aviso') && <div className="w-6" />}
                </div>
              </div>
            )
          })}
        </div>
      </div>
      {/* Create notification modal (admin only) */}
      <Modal
        open={createModal}
        onClose={() => setCreateModal(false)}
        title="Crear notificación"
        footer={
          <>
            <Button variant="secondary" onClick={() => setCreateModal(false)} className="flex-1 lg:flex-none">Cancelar</Button>
            <Button onClick={sendNotif} loading={saving} className="flex-1 lg:flex-none">Enviar</Button>
          </>
        }
      >
        <div className="space-y-4">
          <Input
            label="Título"
            value={form.titulo}
            onChange={e => setForm({ ...form, titulo: e.target.value })}
            placeholder="Ej: Reunión de equipo el viernes"
            required
          />
          <div>
            <label className="block text-[13px] font-medium text-[var(--text)] mb-1.5">Mensaje</label>
            <textarea
              value={form.mensaje}
              onChange={e => setForm({ ...form, mensaje: e.target.value })}
              placeholder="Descripción opcional..."
              rows={3}
              className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-[14px] outline-none focus:border-[var(--primary)] resize-none"
            />
          </div>
          <div>
            <label className="block text-[13px] font-medium text-[var(--text)] mb-1.5">Destinatario</label>
            <div className="flex bg-gray-100 rounded-xl p-0.5 gap-0.5">
              {(['todos', 'equipo', 'empleado'] as const).map(d => (
                <button
                  key={d}
                  onClick={() => setForm({ ...form, destinatario: d, equipo_id: '', usuario_id: '' })}
                  className={`flex-1 py-2 text-[12px] font-medium rounded-[10px] transition-all cursor-pointer ${form.destinatario === d ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'}`}
                >
                  {d === 'todos' ? 'Todos' : d === 'equipo' ? 'Equipo' : 'Empleado'}
                </button>
              ))}
            </div>
          </div>
          {form.destinatario === 'equipo' && (
            <Select
              label="Equipo"
              value={form.equipo_id}
              onChange={v => setForm({ ...form, equipo_id: v })}
            >
              <option value="">Seleccionar equipo</option>
              {equipos.map(e => <option key={e.id} value={e.id}>{e.nombre}</option>)}
            </Select>
          )}
          {form.destinatario === 'empleado' && (
            <Select
              label="Empleado"
              value={form.usuario_id}
              onChange={v => setForm({ ...form, usuario_id: v })}
            >
              <option value="">Seleccionar empleado</option>
              {empleados.map(e => <option key={e.id} value={e.id}>{e.nombre}</option>)}
            </Select>
          )}
          {formError && (
            <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-100 rounded-xl">
              <IconAlertCircle size={15} className="text-red-500 shrink-0" />
              <p className="text-[13px] text-red-600 font-medium">{formError}</p>
            </div>
          )}
        </div>
      </Modal>
      <Toast message={toast} visible={!!toast} />
    </div>
  )
}
