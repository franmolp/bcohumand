'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import type { SessionUser } from '@/types'
import { IconHome, IconUsers, IconClipboard, IconFileText, IconLogout, IconBell, IconShoppingBag, IconWall, IconDollar, IconSettings, IconX, IconMore, IconCalendar, IconReceipt, IconShield } from '@/components/ui/Icons'
import { Toast } from '@/components/ui'

const allNav = [
  { href: '/dashboard',              label: 'Inicio',         icon: IconHome,        mobile: true },
  { href: '/dashboard/notificaciones', label: 'Notificaciones', icon: IconBell,      mobile: true },
  { href: '/dashboard/asistencia',   label: 'Asistencia',     icon: IconClipboard,   roles: ['Admin', 'admin', 'HR', 'Encargada'], mobile: true },
  { href: '/dashboard/solicitudes',  label: 'Solicitudes',    labelEmp: 'Mis Solicitudes', icon: IconFileText, mobile: true },
  { href: '/dashboard/empleados',    label: 'Empleados',      icon: IconUsers,       roles: ['Admin', 'admin', 'HR'] },
  { href: '/dashboard/liquidador',   label: 'Liquidaciones',  labelEmp: 'Mi Liquidación', icon: IconDollar },
  { href: '/dashboard/mi-asistencia', label: 'Mi Asistencia', icon: IconClipboard, notAdmin: true, mobile: true },
  { href: '/dashboard/compras',      label: 'Compras',        icon: IconShoppingBag, roles: ['Admin', 'admin', 'Compras', 'Encargada'] },
  { href: '/dashboard/monotributo',  label: 'Monotributo',    icon: IconReceipt },
  { href: '/dashboard/calendario',   label: 'Calendario',     icon: IconCalendar,    mobile: true },
  { href: '/dashboard/muro',         label: 'Muro Social',    icon: IconWall },
  { href: '/dashboard/equipos',      label: 'Equipos y Roles', icon: IconSettings,   admin: true },
  { href: '/dashboard/seguridad',    label: 'Seguridad',      icon: IconShield,      admin: true },
]

export default function Navigation({ user }: { user: SessionUser }) {
  const path = usePathname()
  const router = useRouter()
  const isAdmin = user.rol === 'admin' || user.rol === 'Admin'
  const isHR = user.rol === 'HR'
  const isAdminOrHR = isAdmin || isHR
  const isEncargada = user.rol === 'Encargada'
  const [drawer, setDrawer] = useState(false)
  const [unread, setUnread] = useState(0)
  const [toast, setToast] = useState({ visible: false, msg: '' })
  const prevUnread = useRef<number | null>(null)

  const items = allNav.filter(i => {
    if (i.admin && !isAdmin) return false
    if ((i as {notAdmin?: boolean}).notAdmin && (isAdmin || isEncargada || isHR)) return false
    if (isHR && (i.href === '/dashboard/monotributo' || i.href === '/dashboard/liquidador')) return false
    if (i.roles && !i.roles.includes(user.rol)) return false
    return true
  })
  const mobileItems = items.filter(i => i.mobile).slice(0, 4)
  const initials = user.nombre.split(' ').map(n => n[0]).join('').slice(0, 2)

  async function logout() { await fetch('/api/auth/logout', { method: 'POST' }); router.push('/login') }

  useEffect(() => {
    async function fetchUnread() {
      try {
        const res = await fetch('/api/notificaciones?count=true')
        if (!res.ok) return
        const { count, titulo } = await res.json()
        if (prevUnread.current !== null && count > prevUnread.current) {
          const diff = count - prevUnread.current
          const msg = diff === 1 && titulo ? titulo : `Tenés ${diff} notificaciones nuevas`
          setToast({ visible: true, msg })
          setTimeout(() => setToast(t => ({ ...t, visible: false })), 5000)
        }
        prevUnread.current = count
        setUnread(count)
      } catch { /* ignore */ }
    }
    fetchUnread()
    const interval = setInterval(fetchUnread, 5000)
    window.addEventListener('notif-updated', fetchUnread)
    return () => { clearInterval(interval); window.removeEventListener('notif-updated', fetchUnread) }
  }, [])

  return (
    <>
      <Toast visible={toast.visible} message={toast.msg} type="info" onClose={() => setToast(t => ({ ...t, visible: false }))} />
      {/* ─── DESKTOP: Top header ─── */}
      <header className="hidden lg:flex fixed top-0 left-0 right-0 h-14 bg-[image:var(--gradient)] z-40 items-center justify-between px-6 shadow-sm">
        <div className="flex items-center gap-2.5">
          <span className="bg-white/15 text-white text-[10px] font-bold px-2 py-0.5 rounded backdrop-blur">BCO</span>
          <span className="text-[15px] font-bold text-white tracking-tight">HUMAND</span>
        </div>
        <div className="flex items-center gap-4">
          <Link href="/dashboard/notificaciones" className="relative text-white/70 hover:text-white transition-colors">
            <IconBell size={19} />
            {unread > 0 && (
              <span className="absolute -top-1.5 -right-1.5 min-w-[16px] h-4 bg-red-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center px-0.5">
                {unread > 99 ? '99+' : unread}
              </span>
            )}
          </Link>
          <Link href="/dashboard/perfil" className="w-8 h-8 bg-white/15 hover:bg-white/25 rounded-full flex items-center justify-center border border-white/10 transition-colors" title="Mi perfil">
            <span className="text-[11px] font-bold text-white">{initials}</span>
          </Link>
        </div>
      </header>

      {/* ─── DESKTOP: Side nav ─── */}
      <aside className="hidden lg:flex w-52 fixed top-14 bottom-0 left-0 bg-white border-r border-gray-200/60 flex-col z-30">
        <nav className="flex-1 py-3 px-2.5 overflow-y-auto">
          {items.map(item => {
            const active = path === item.href; const Icon = item.icon
            const label = (!isAdminOrHR && (item as {labelEmp?: string}).labelEmp) || item.label
            return (
              <Link key={item.href} href={item.href}
                className={`flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-[13px] mb-0.5 transition-colors ${
                  active ? 'bg-[var(--primary-light)] text-[var(--primary)] font-semibold' : 'text-[var(--text-sub)] hover:bg-gray-50 hover:text-[var(--text)]'}`}>
                <Icon size={18} className={active ? 'text-[var(--primary)]' : 'text-gray-400'} />{label}
              </Link>
            )
          })}
        </nav>
        <div className="p-3 border-t border-gray-100">
          <Link href="/dashboard/perfil" className="flex items-center gap-2.5 px-2 py-2 rounded-xl hover:bg-gray-50 transition-colors group">
            <div className="w-8 h-8 bg-[image:var(--gradient)] rounded-full flex items-center justify-center shadow-sm">
              <span className="text-[10px] font-bold text-white">{initials}</span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[13px] font-medium truncate group-hover:text-[var(--primary)]">{user.nombre}</p>
              <p className="text-[10px] text-gray-400 truncate">{user.equipo}</p>
            </div>
            <button onClick={e => { e.preventDefault(); logout() }} className="p-1 text-gray-400 hover:text-red-500 rounded cursor-pointer" title="Salir"><IconLogout size={15} /></button>
          </Link>
        </div>
      </aside>

      {/* ─── MOBILE: Top bar ─── */}
      <header className="lg:hidden fixed top-0 left-0 right-0 bg-[image:var(--gradient)] z-40 px-4 flex items-center justify-between"
        style={{ height: 'calc(48px + env(safe-area-inset-top, 0px))', paddingTop: 'env(safe-area-inset-top, 0px)' }}>
        <div className="flex items-center gap-2">
          <span className="bg-white/15 text-white text-[9px] font-bold px-1.5 py-0.5 rounded">BCO</span>
          <span className="text-[13px] font-bold text-white">HUMAND</span>
        </div>
        <div className="flex items-center gap-3">
          <Link href="/dashboard/notificaciones" className="relative text-white/70">
            <IconBell size={18} />
            {unread > 0 && (
              <span className="absolute -top-1.5 -right-1.5 min-w-[14px] h-3.5 bg-red-500 text-white text-[8px] font-bold rounded-full flex items-center justify-center px-0.5">
                {unread > 99 ? '99+' : unread}
              </span>
            )}
          </Link>
          <Link href="/dashboard/perfil" className="w-7 h-7 bg-white/15 rounded-full flex items-center justify-center">
            <span className="text-[9px] font-bold text-white">{initials}</span>
          </Link>
        </div>
      </header>

      {/* ─── MOBILE: Bottom nav ─── */}
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 z-40"
        style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}>
        <div className="flex">
          {mobileItems.map(item => {
            const active = path === item.href; const Icon = item.icon
            const label = (!isAdminOrHR && (item as {labelEmp?: string}).labelEmp) || item.label
            return (
              <Link key={item.href} href={item.href}
                className={`flex-1 flex flex-col items-center pt-3 pb-4 gap-1 min-h-[68px] ${active ? 'text-[var(--primary)]' : 'text-gray-400'}`}>
                <Icon size={22} /><span className="text-[10px] font-medium">{label}</span>
              </Link>
            )
          })}
          <button onClick={() => setDrawer(true)} className="flex-1 flex flex-col items-center pt-3 pb-4 gap-1 min-h-[68px] text-gray-400 cursor-pointer">
            <IconMore size={22} /><span className="text-[10px] font-medium">Más</span>
          </button>
        </div>
      </nav>

      {/* ─── MOBILE: Drawer (portal) ─── */}
      {drawer && createPortal(
        <div className="fixed inset-0 z-50 lg:hidden" onClick={() => setDrawer(false)}>
          <div className="absolute inset-0 bg-black/50" />
          <div className="absolute bottom-0 left-0 right-0 bg-white rounded-t-2xl shadow-2xl max-h-[75dvh] overflow-y-auto"
            onClick={e => e.stopPropagation()}>
            <div className="flex justify-center pt-2.5 pb-1"><div className="w-9 h-1 bg-gray-300 rounded-full" /></div>
            <div className="px-5 py-3 border-b border-gray-100 flex items-center gap-3">
              <Link href="/dashboard/perfil" onClick={() => setDrawer(false)} className="flex items-center gap-3 flex-1 min-w-0">
                <div className="w-10 h-10 bg-[image:var(--gradient)] rounded-full flex items-center justify-center shadow-sm flex-shrink-0">
                  <span className="text-xs font-bold text-white">{initials}</span>
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold truncate">{user.nombre}</p>
                  <p className="text-[11px] text-gray-400 truncate">{user.equipo}</p>
                </div>
              </Link>
              <button onClick={() => setDrawer(false)} className="p-2 text-gray-400 rounded-full cursor-pointer flex-shrink-0"><IconX size={18} /></button>
            </div>
            <div className="px-3 py-2">
              {items.map(item => {
                const active = path === item.href; const Icon = item.icon
                const label = (!isAdminOrHR && (item as {labelEmp?: string}).labelEmp) || item.label
                return (
                  <Link key={item.href} href={item.href} onClick={() => setDrawer(false)}
                    className={`flex items-center gap-3.5 px-4 py-3.5 rounded-xl text-[15px] ${
                      active ? 'bg-[var(--primary-light)] text-[var(--primary)] font-semibold' : 'text-[var(--text)] active:bg-gray-50'}`}>
                    <Icon size={20} className={active ? 'text-[var(--primary)]' : 'text-gray-400'} />{label}
                  </Link>
                )
              })}
              <hr className="my-2 border-gray-100" />
              {isAdmin && (
                <Link href="/dashboard/configuracion" onClick={() => setDrawer(false)} className="flex items-center gap-3.5 px-4 py-3.5 rounded-xl text-[15px] text-[var(--text)] active:bg-gray-50">
                  <IconSettings size={20} className="text-gray-400" /> Configuración
                </Link>
              )}
              <button onClick={logout} className="flex items-center gap-3.5 px-4 py-3.5 rounded-xl text-[15px] text-red-500 w-full active:bg-red-50 cursor-pointer">
                <IconLogout size={20} /> Cerrar sesión
              </button>
            </div>
            <div className="h-4" />
          </div>
        </div>,
        document.body
      )}
    </>
  )
}
