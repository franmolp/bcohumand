'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import type { SessionUser } from '@/types'
import {
  IconBell, IconCheck, IconX, IconFileText, IconCalendar,
  IconShoppingBag, IconDollar, IconWall, IconAlertCircle, IconPlus, IconTrash, IconFilter,
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

interface EnviadaNotif {
  id: string | number
  titulo: string
  mensaje: string
  tipo: string
  leida: boolean
  created_at: string
  usuario_id: string
  usuario: { nombre: string } | null
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
    monotributo:           { icon: <IconDollar size={14} />,       bg: 'bg-indigo-100',  color: 'text-indigo-600',  href: '/dashboard/monotributo' },
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

function urlBase64ToUint8Array(b64: string): Uint8Array {
  const pad = '='.repeat((4 - (b64.length % 4)) % 4)
  const raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'))
  return Uint8Array.from([...raw].map(c => c.charCodeAt(0)))
}

export default function NotificacionesClient({ session }: { session: SessionUser }) {
  const isAdmin = session.rol === 'admin' || session.rol === 'Admin'

  // Tab (admin only)
  const [tab, setTab] = useState<'recibidas' | 'enviadas'>('recibidas')

  // Recibidas
  const [notifs, setNotifs]     = useState<Notif[]>([])
  const [loading, setLoading]   = useState(true)
  const [marking, setMarking]   = useState(false)

  // Enviadas
  const [enviadas, setEnviadas]           = useState<EnviadaNotif[]>([])
  const [loadingEnv, setLoadingEnv]       = useState(false)
  const [envEmpleado, setEnvEmpleado]     = useState('')
  const [envDesde, setEnvDesde]           = useState('')
  const [envHasta, setEnvHasta]           = useState('')
  const [envLoaded, setEnvLoaded]         = useState(false)

  // Create modal
  const [createModal, setCreateModal] = useState(false)
  const [form, setForm]         = useState(blankForm)
  const [saving, setSaving]     = useState(false)
  const [formError, setFormError] = useState('')
  const [toast, setToast]       = useState('')
  const [equipos, setEquipos]   = useState<Equipo[]>([])
  const [empleados, setEmpleados] = useState<Empleado[]>([])

  // Push permission state
  const [pushPerm, setPushPerm] = useState<NotificationPermission | 'unsupported' | null>(null)
  const [pushLoading, setPushLoading] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined' || !('Notification' in window)) {
      setPushPerm('unsupported')
    } else {
      setPushPerm(Notification.permission)
    }
  }, [])

  async function activatePush() {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return
    setPushLoading(true)
    try {
      const perm = await Notification.requestPermission()
      setPushPerm(perm)
      if (perm !== 'granted') return
      const res = await fetch('/api/push/vapid-public-key')
      if (!res.ok) return
      const { publicKey } = await res.json()
      const reg = await navigator.serviceWorker.register('/sw.js', { scope: '/' })
      await navigator.serviceWorker.ready
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey).buffer as ArrayBuffer,
      })
      await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(sub),
      })
      await fetch('/api/push/test', { method: 'POST' })
      setToast('Notificaciones activadas')
    } catch (e) {
      console.warn('[push]', e)
    } finally {
      setPushLoading(false)
    }
  }

  const fetchNotifs = useCallback(async () => {
    const res = await fetch('/api/notificaciones')
    if (res.ok) setNotifs(await res.json())
    setLoading(false)
  }, [])

  async function fetchEnviadas() {
    setLoadingEnv(true)
    const params = new URLSearchParams({ view: 'enviadas' })
    if (envEmpleado) params.set('usuario_id', envEmpleado)
    if (envDesde)    params.set('fecha_desde', envDesde)
    if (envHasta)    params.set('fecha_hasta', envHasta)
    const res = await fetch(`/api/notificaciones?${params}`)
    if (res.ok) setEnviadas(await res.json())
    setLoadingEnv(false)
    setEnvLoaded(true)
  }

  useEffect(() => { fetchNotifs() }, [fetchNotifs])
  // Auto-mark all as read 1 second after opening the module
  useEffect(() => {
    const t = setTimeout(() => { markAll() }, 1000)
    return () => clearTimeout(t)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  useEffect(() => { if (toast) { const t = setTimeout(() => setToast(''), 3000); return () => clearTimeout(t) } }, [toast])
  useEffect(() => {
    if (!isAdmin) return
    fetch('/api/equipos').then(r => r.json()).then(d => setEquipos(Array.isArray(d) ? d : []))
    fetch('/api/empleados?estado=activo').then(r => r.json()).then(d => setEmpleados(Array.isArray(d) ? d.sort((a: Empleado, b: Empleado) => a.nombre.localeCompare(b.nombre, 'es')) : []))
  }, [isAdmin])

  // Auto-load enviadas when switching to that tab
  useEffect(() => {
    if (tab === 'enviadas' && isAdmin && !envLoaded) fetchEnviadas()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab])

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
      setEnvLoaded(false)
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

  async function deleteSingleEnviada(id: string | number) {
    setEnviadas(prev => prev.filter(n => n.id !== id))
    await fetch('/api/notificaciones', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, single: true }),
    })
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
            {tab === 'recibidas' && unread > 0 && (
              <span className="text-[11px] font-bold bg-[var(--primary)] text-white rounded-full px-2 py-0.5">
                {unread}
              </span>
            )}
          </div>
        </div>
        {isAdmin && (
          <Button size="sm" icon={<IconPlus size={15}/>} onClick={() => { setForm(blankForm); setFormError(''); setCreateModal(true) }}>
            Crear notificación
          </Button>
        )}
      </div>

      {/* Tab switcher (admin only) */}
      {isAdmin && (
        <div className="flex bg-gray-100 rounded-xl p-0.5 gap-0.5 mb-4">
          <button
            onClick={() => setTab('recibidas')}
            className={`flex-1 py-2 text-[13px] font-medium rounded-[10px] transition-all cursor-pointer ${tab === 'recibidas' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'}`}
          >
            Recibidas
          </button>
          <button
            onClick={() => setTab('enviadas')}
            className={`flex-1 py-2 text-[13px] font-medium rounded-[10px] transition-all cursor-pointer ${tab === 'enviadas' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'}`}
          >
            Enviadas
          </button>
        </div>
      )}

      {/* ─── RECIBIDAS TAB ─── */}
      {tab === 'recibidas' && (
        <>
          {/* Push permission card */}
          {pushPerm !== null && pushPerm !== 'unsupported' && (
            <div className={`mb-4 flex items-center gap-3 px-4 py-3.5 rounded-2xl border ${
              pushPerm === 'granted'
                ? 'bg-emerald-50 border-emerald-100'
                : pushPerm === 'denied'
                ? 'bg-gray-50 border-gray-200'
                : 'bg-[var(--primary-light)]/60 border-[var(--primary)]/20'
            }`}>
              <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
                pushPerm === 'granted' ? 'bg-emerald-100' : pushPerm === 'denied' ? 'bg-gray-200' : 'bg-[var(--primary)]/10'
              }`}>
                <IconBell size={15} className={
                  pushPerm === 'granted' ? 'text-emerald-600' : pushPerm === 'denied' ? 'text-gray-400' : 'text-[var(--primary)]'
                } />
              </div>
              <div className="flex-1 min-w-0">
                {pushPerm === 'granted' && (
                  <>
                    <p className="text-[13px] font-semibold text-emerald-700">Notificaciones activadas</p>
                    <p className="text-[11px] text-emerald-600 mt-0.5">Vas a recibir notificaciones en este dispositivo</p>
                  </>
                )}
                {pushPerm === 'denied' && (
                  <>
                    <p className="text-[13px] font-semibold text-gray-600">Notificaciones bloqueadas</p>
                    <p className="text-[11px] text-gray-400 mt-0.5 leading-snug">
                      Desbloqueá desde Ajustes del navegador → Privacidad → Notificaciones
                    </p>
                  </>
                )}
                {pushPerm === 'default' && (
                  <>
                    <p className="text-[13px] font-semibold text-[var(--primary)]">Activá las notificaciones</p>
                    <p className="text-[11px] text-gray-500 mt-0.5">Recibí alertas en tu dispositivo cuando haya novedades</p>
                  </>
                )}
              </div>
              {pushPerm === 'default' && (
                <button
                  onClick={activatePush}
                  disabled={pushLoading}
                  className="shrink-0 px-3 py-1.5 rounded-xl bg-[var(--primary)] text-white text-[12px] font-semibold hover:opacity-90 transition-opacity disabled:opacity-50 cursor-pointer"
                >
                  {pushLoading ? '...' : 'Activar'}
                </button>
              )}
            </div>
          )}

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
                    <div className={`w-8 h-8 rounded-full ${cfg.bg} flex items-center justify-center flex-shrink-0 mt-0.5`}>
                      <span className={cfg.color}>{cfg.icon}</span>
                    </div>
                    <Link href={cfg.href} className="flex-1 min-w-0 hover:opacity-80 transition-opacity">
                      <p className={`text-[13px] leading-snug ${!n.leida ? 'font-semibold text-[var(--text)]' : 'font-medium text-gray-700'}`}>
                        {n.titulo}
                      </p>
                      {n.mensaje && (
                        <p className="text-[12px] text-gray-400 mt-0.5 line-clamp-2">{n.mensaje}</p>
                      )}
                      <p className="text-[11px] text-gray-400 mt-1">{timeAgo(n.created_at)}</p>
                    </Link>
                    <div className="flex items-center gap-1 flex-shrink-0 mt-0.5">
                      {isAdmin && n.tipo === 'aviso' && (
                        <button
                          onClick={() => deleteAviso(n)}
                          title="Eliminar para todos"
                          className="w-6 h-6 rounded-full flex items-center justify-center hover:bg-red-100 hover:text-red-500 text-gray-300 transition-colors cursor-pointer"
                        >
                          <IconTrash size={12} />
                        </button>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </>
      )}

      {/* ─── ENVIADAS TAB ─── */}
      {tab === 'enviadas' && isAdmin && (
        <>
          {/* Filters */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 mb-4 space-y-3">
            <div className="flex items-center gap-2">
              <IconFilter size={15} className="text-gray-400 shrink-0" />
              <span className="text-[13px] font-medium text-[var(--text-sub)]">Filtros</span>
            </div>
            <Select
              label=""
              value={envEmpleado}
              onChange={v => setEnvEmpleado(v)}
            >
              <option value="">Todos los empleados</option>
              {empleados.map(e => <option key={e.id} value={e.id}>{e.nombre}</option>)}
            </Select>
            <div className="grid grid-cols-2 gap-3">
              <Input
                label="Desde"
                type="date"
                value={envDesde}
                onChange={e => setEnvDesde(e.target.value)}
              />
              <Input
                label="Hasta"
                type="date"
                value={envHasta}
                onChange={e => setEnvHasta(e.target.value)}
              />
            </div>
            <Button
              size="sm"
              className="w-full"
              onClick={() => { setEnvLoaded(false); fetchEnviadas() }}
              loading={loadingEnv}
            >
              Buscar
            </Button>
          </div>

          {/* Enviadas list */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            {loadingEnv && (
              <div className="flex justify-center py-10"><Spinner size={28} /></div>
            )}
            {!loadingEnv && enviadas.length === 0 && (
              <div className="flex flex-col items-center py-16 text-center">
                <div className="w-14 h-14 bg-gray-100 rounded-full flex items-center justify-center mb-3">
                  <IconBell size={24} className="text-gray-300" />
                </div>
                <p className="text-[14px] font-medium text-gray-400">Sin notificaciones enviadas</p>
                <p className="text-[12px] text-gray-300 mt-1">{envLoaded ? 'No hay resultados con esos filtros' : 'Usá los filtros para buscar'}</p>
              </div>
            )}
            <div className="divide-y divide-gray-50">
              {enviadas.map(n => {
                const cfg = tipoConfig(n.tipo)
                return (
                  <div key={n.id} className="flex items-start gap-3 px-4 py-3.5">
                    <div className={`w-8 h-8 rounded-full ${cfg.bg} flex items-center justify-center flex-shrink-0 mt-0.5`}>
                      <span className={cfg.color}>{cfg.icon}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-[13px] font-semibold text-[var(--text)] leading-snug">{n.titulo}</p>
                        <span className={`text-[10px] px-2 py-0.5 rounded-full shrink-0 ${n.leida ? 'bg-emerald-100 text-emerald-600' : 'bg-amber-100 text-amber-600'}`}>
                          {n.leida ? 'Leída' : 'No leída'}
                        </span>
                      </div>
                      {n.mensaje && (
                        <p className="text-[12px] text-gray-400 mt-0.5 line-clamp-2">{n.mensaje}</p>
                      )}
                      <p className="text-[11px] text-gray-400 mt-1">
                        <span className="font-medium">{n.usuario?.nombre ?? 'Empleado'}</span>
                        {' · '}{timeAgo(n.created_at)}
                      </p>
                    </div>
                    <button
                      onClick={() => deleteSingleEnviada(n.id)}
                      title="Eliminar esta notificación"
                      className="w-7 h-7 rounded-full flex items-center justify-center hover:bg-red-100 hover:text-red-500 text-gray-300 transition-colors cursor-pointer flex-shrink-0 mt-0.5"
                    >
                      <IconTrash size={13} />
                    </button>
                  </div>
                )
              })}
            </div>
          </div>
        </>
      )}

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
