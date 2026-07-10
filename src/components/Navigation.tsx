'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import type { SessionUser } from '@/types'
import { IconHome, IconUsers, IconClipboard, IconLogout, IconBell, IconShoppingBag, IconWall, IconDollar, IconSettings, IconX, IconMore, IconCalendar, IconReceipt, IconShield, IconCamera, IconCalendarCheck, IconWrench, IconStar, IconLayoutGrid, IconBarChart } from '@/components/ui/Icons'
import PhotoCropModal from '@/components/PhotoCropModal'

const allNav = [
  { href: '/dashboard',              label: 'Inicio',         icon: IconHome,        mobile: true },
  { href: '/dashboard/asistencia',   label: 'Asistencia',     icon: IconClipboard,   roles: ['Admin', 'admin', 'HR', 'Encargada'], mobile: true },
  { href: '/dashboard/solicitudes',  label: 'Solicitudes',    labelEmp: 'Mis Solicitudes', icon: IconCalendarCheck, mobile: true },
  { href: '/dashboard/empleados',    label: 'Empleados',      icon: IconUsers,       roles: ['Admin', 'admin', 'HR'] },
  { href: '/dashboard/liquidador',   label: 'Liquidaciones',  labelEmp: 'Mi Liquidación', icon: IconDollar },
  { href: '/dashboard/adelantos',    label: 'Adelantos',      labelEmp: 'Mis Adelantos', icon: IconDollar },
  { href: '/dashboard/mi-asistencia', label: 'Mi Asistencia', icon: IconClipboard, notAdmin: true, mobile: true },
  { href: '/dashboard/espacio-trabajo', label: 'Espacio de trabajo', icon: IconLayoutGrid, roles: ['Admin', 'admin', 'HR', 'Encargada', 'Compras'] },
  { href: '/dashboard/compras',      label: 'Compras',        icon: IconShoppingBag, roles: ['Admin', 'admin', 'Compras', 'Encargada'] },
  { href: '/dashboard/monotributo',  label: 'Monotributo',    icon: IconReceipt },
  { href: '/dashboard/calendario',   label: 'Calendario',     icon: IconCalendar,    mobile: true },
  { href: '/dashboard/muro',          label: 'Muro Social',     icon: IconWall },
  { href: '/dashboard/reparaciones',  label: 'Reparaciones',    icon: IconWrench },
  { href: '/dashboard/juegos',        label: 'Juegos',          icon: IconStar,        mobile: true },
  { href: '/dashboard/informes',       label: 'Informes',        icon: IconBarChart,   roles: ['Admin', 'admin'] },
  { href: '/dashboard/equipos',       label: 'Equipos y Roles', icon: IconSettings,   admin: true },
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
  const [modulos, setModulos] = useState<Record<string, number>>({})
  const [toast, setToast] = useState({ visible: false, msg: '' })
  const prevUnread = useRef<number | null>(null)

  // Photo state
  const [fotoUrl, setFotoUrl] = useState<string | null>(null)
  const [showCrop, setShowCrop] = useState(false)
  const [showPhotoPrompt, setShowPhotoPrompt] = useState(false)

  const items = allNav.filter(i => {
    if (i.admin && !isAdmin) return false
    if ((i as {notAdmin?: boolean}).notAdmin && (isAdmin || isEncargada || isHR)) return false
    if (isHR && (i.href === '/dashboard/monotributo' || i.href === '/dashboard/liquidador')) return false
    if (i.roles && !i.roles.includes(user.rol)) return false
    return true
  })
  const mobileHrefs = isAdmin
    ? ['/dashboard', '/dashboard/asistencia', '/dashboard/solicitudes', '/dashboard/calendario', '/dashboard/informes']
    : isHR
    ? ['/dashboard', '/dashboard/asistencia', '/dashboard/solicitudes', '/dashboard/empleados', '/dashboard/calendario']
    : ['/dashboard', '/dashboard/mi-asistencia', '/dashboard/solicitudes', '/dashboard/liquidador', '/dashboard/calendario']
  const mobileItems = mobileHrefs.map(href => items.find(i => i.href === href)).filter(Boolean) as typeof items
  const initials = user.nombre.split(' ').map(n => n[0]).join('').slice(0, 2)

  async function logout() { await fetch('/api/auth/logout', { method: 'POST' }); router.push('/login') }

  // Load photo from cache then server
  useEffect(() => {
    const FOTO_KEY   = `bco_foto_perfil_${user.id}`
    const PROMPT_KEY = `bco_foto_prompt_${user.id}`

    const cached = localStorage.getItem(FOTO_KEY)
    if (cached) setFotoUrl(cached)

    fetch('/api/perfil/foto')
      .then(r => r.json())
      .then(({ url }) => {
        setFotoUrl(url)
        if (url) localStorage.setItem(FOTO_KEY, url)
        else {
          localStorage.removeItem(FOTO_KEY)
          // Show first-login photo prompt if not dismissed
          if (!localStorage.getItem(PROMPT_KEY)) {
            setTimeout(() => setShowPhotoPrompt(true), 1500)
          }
        }
      })
      .catch(() => {})

    const onFotoUpdated = (e: Event) => {
      const url = (e as CustomEvent<{ url: string | null }>).detail.url
      setFotoUrl(url)
      if (url) localStorage.setItem(FOTO_KEY, url)
      else localStorage.removeItem(FOTO_KEY)
    }
    window.addEventListener('bco-foto-updated', onFotoUpdated)
    return () => window.removeEventListener('bco-foto-updated', onFotoUpdated)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Notifications polling — pauses when tab is backgrounded, restarts cleanly on resume
  useEffect(() => {
    async function fetchUnread() {
      try {
        const res = await fetch('/api/notificaciones?count=true')
        if (!res.ok) return
        const { count, titulo, modulos: mods } = await res.json()
        if (prevUnread.current !== null && count > prevUnread.current) {
          const diff = count - prevUnread.current
          const msg = diff === 1 && titulo ? titulo : `Tenés ${diff} notificaciones nuevas`
          setToast({ visible: true, msg })
          setTimeout(() => setToast(t => ({ ...t, visible: false })), 5000)
        }
        prevUnread.current = count
        setUnread(count)
        setModulos(mods ?? {})
      } catch { /* ignore */ }
    }
    let interval: ReturnType<typeof setInterval> | null = setInterval(fetchUnread, 5000)
    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        // Restart interval fresh — prevents burst of stale ticks after iOS resume
        if (interval) clearInterval(interval)
        interval = setInterval(fetchUnread, 5000)
        // Force iOS Safari to recalculate touch targets (clears stale layout cache)
        document.documentElement.getBoundingClientRect()
        fetchUnread()
      } else {
        if (interval) clearInterval(interval)
        interval = null
      }
    }
    fetchUnread()
    window.addEventListener('notif-updated', fetchUnread)
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      if (interval) clearInterval(interval)
      window.removeEventListener('notif-updated', fetchUnread)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [])

  function handlePhotoSaved(url: string) {
    setFotoUrl(url)
    localStorage.setItem(`bco_foto_perfil_${user.id}`, url)
    localStorage.setItem(`bco_foto_prompt_${user.id}`, '1')
    setShowCrop(false)
    setShowPhotoPrompt(false)
    window.dispatchEvent(new CustomEvent('bco-foto-updated', { detail: { url } }))
  }

  function handlePhotoDeleted() {
    setFotoUrl(null)
    localStorage.removeItem(`bco_foto_perfil_${user.id}`)
    setShowCrop(false)
    window.dispatchEvent(new CustomEvent('bco-foto-updated', { detail: { url: null } }))
  }

  function dismissPhotoPrompt() {
    localStorage.setItem(`bco_foto_prompt_${user.id}`, '1')
    setShowPhotoPrompt(false)
  }

  // Inline avatar helper
  function Avatar({ size, border = false, white = false }: { size: number; border?: boolean; white?: boolean }) {
    const imgClass = `rounded-full object-cover flex-shrink-0${border ? ' border-2 border-white/30' : ''}`
    if (fotoUrl) {
      return (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={fotoUrl} alt="" className={imgClass} style={{ width: size, height: size }} />
      )
    }
    return (
      <div
        className={`rounded-full flex items-center justify-center flex-shrink-0 ${white ? 'bg-white/15' : 'bg-[image:var(--gradient)]'}`}
        style={{ width: size, height: size }}
      >
        <span className="font-bold text-white" style={{ fontSize: Math.round(size * 0.37) }}>{initials}</span>
      </div>
    )
  }

  return (
    <>
      {toast.visible && (
        <div className="fixed top-12 lg:top-14 right-4 lg:right-6 z-[60] fade-in max-w-[calc(100vw-2rem)] lg:max-w-xs">
          <div className="flex items-start gap-2 px-4 py-3 rounded-xl shadow-lg text-white bg-[var(--primary)]">
            <IconBell size={16} className="shrink-0 mt-0.5" />
            <Link
              href="/dashboard/notificaciones"
              onClick={() => setToast(t => ({ ...t, visible: false }))}
              className="flex-1 text-sm font-medium leading-snug"
            >
              {toast.msg}
            </Link>
            <button onClick={() => setToast(t => ({ ...t, visible: false }))} className="ml-1 opacity-70 hover:opacity-100 cursor-pointer shrink-0 mt-0.5">
              <IconX size={14} />
            </button>
          </div>
        </div>
      )}

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
          <Link href="/dashboard/perfil" className="rounded-full overflow-hidden border-2 border-white/30 hover:border-white/60 transition-all" title="Mi perfil" style={{ width: 32, height: 32 }}>
            <Avatar size={32} white />
          </Link>
        </div>
      </header>

      {/* ─── DESKTOP: Side nav ─── */}
      <aside className="hidden lg:flex w-52 fixed top-14 bottom-0 left-0 bg-white border-r border-gray-200/60 flex-col z-30">
        <nav className="flex-1 py-3 px-2.5 overflow-y-auto">
          {items.map(item => {
            const active = path === item.href; const Icon = item.icon
            const label = (!isAdminOrHR && (item as {labelEmp?: string}).labelEmp) || item.label
            const badge = modulos[item.href] ?? 0
            return (
              <Link key={item.href} href={item.href}
                className={`flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-[13px] mb-0.5 transition-colors ${
                  active ? 'bg-[var(--primary-light)] text-[var(--primary)] font-semibold' : 'text-[var(--text-sub)] hover:bg-gray-50 hover:text-[var(--text)]'}`}>
                <Icon size={18} className={active ? 'text-[var(--primary)]' : 'text-gray-400'} />
                <span className="flex-1">{label}</span>
                {badge > 0 && !active && (
                  <span className="min-w-[18px] h-[18px] bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center px-1">
                    {badge > 99 ? '99+' : badge}
                  </span>
                )}
              </Link>
            )
          })}
        </nav>
        <div className="p-3 border-t border-gray-100">
          <Link href="/dashboard/perfil" className="flex items-center gap-2.5 px-2 py-2 rounded-xl hover:bg-gray-50 transition-colors group">
            <div className="w-8 h-8 flex-shrink-0">
              <Avatar size={32} />
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
        style={{ height: 'calc(48px + env(safe-area-inset-top, 0px))', paddingTop: 'env(safe-area-inset-top, 0px)', transform: 'translateZ(0)', WebkitTransform: 'translateZ(0)' }}>
        <div className="flex items-center gap-2">
          <span className="bg-white/15 text-white text-[9px] font-bold px-1.5 py-0.5 rounded">BCO</span>
          <span className="text-[13px] font-bold text-white">HUMAND</span>
        </div>
        <div className="flex items-center gap-3">
          <Link href="/dashboard/notificaciones" className="text-white/70 p-2 -mr-1 flex items-center justify-center">
            <span className="relative inline-flex items-center justify-center">
              <IconBell size={18} />
              {unread > 0 && (
                <span className="absolute -top-1.5 -right-1.5 min-w-[14px] h-3.5 bg-red-500 text-white text-[8px] font-bold rounded-full flex items-center justify-center px-0.5">
                  {unread > 99 ? '99+' : unread}
                </span>
              )}
            </span>
          </Link>
          <Link href="/dashboard/perfil" className="rounded-full overflow-hidden border-2 border-white/30 flex items-center justify-center flex-shrink-0" style={{ width: 32, height: 32 }}>
            <Avatar size={28} white />
          </Link>
        </div>
      </header>

      {/* ─── MOBILE: Bottom nav ─── */}
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 z-40"
        style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)', transform: 'translateZ(0)', WebkitTransform: 'translateZ(0)' }}>
        <div className="flex px-3 h-[90px]">
          {mobileItems.map(item => {
            const active = path === item.href; const Icon = item.icon
            const fullLabel = (!isAdminOrHR && (item as {labelEmp?: string}).labelEmp) || item.label
            const label = fullLabel.replace(/^Mi[s]? /, '')
            const badge = modulos[item.href] ?? 0
            return (
              <Link key={item.href} href={item.href}
                className={`flex-1 flex flex-col items-center pt-4 gap-1 overflow-hidden ${active ? 'text-[var(--primary)]' : 'text-gray-400'}`}>
                <span className="relative flex-shrink-0">
                  <Icon size={20} />
                  {badge > 0 && !active && (
                    <span className="absolute -top-1 -right-1.5 min-w-[14px] h-3.5 bg-red-500 text-white text-[8px] font-bold rounded-full flex items-center justify-center px-0.5">
                      {badge > 99 ? '99+' : badge}
                    </span>
                  )}
                </span>
                <span className="text-[10px] font-medium w-full text-center truncate px-0.5">{label}</span>
              </Link>
            )
          })}
          <button onClick={() => setDrawer(true)} className="flex-1 flex flex-col items-center pt-4 gap-1 overflow-hidden text-gray-400 cursor-pointer">
            <IconMore size={20} className="flex-shrink-0" /><span className="text-[10px] font-medium w-full text-center truncate px-0.5">Más</span>
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
                <div className="w-10 h-10 rounded-full overflow-hidden flex-shrink-0">
                  <Avatar size={40} />
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
                const badge = modulos[item.href] ?? 0
                return (
                  <Link key={item.href} href={item.href} onClick={() => setDrawer(false)}
                    className={`flex items-center gap-3.5 px-4 py-3.5 rounded-xl text-[15px] ${
                      active ? 'bg-[var(--primary-light)] text-[var(--primary)] font-semibold' : 'text-[var(--text)] active:bg-gray-50'}`}>
                    <Icon size={20} className={active ? 'text-[var(--primary)]' : 'text-gray-400'} />
                    <span className="flex-1">{label}</span>
                    {badge > 0 && !active && (
                      <span className="min-w-[20px] h-5 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center px-1">
                        {badge > 99 ? '99+' : badge}
                      </span>
                    )}
                  </Link>
                )
              })}
              <hr className="my-2 border-gray-100" />
              <button onClick={logout} className="flex items-center gap-3.5 px-4 py-3.5 rounded-xl text-[15px] text-red-500 w-full active:bg-red-50 cursor-pointer">
                <IconLogout size={20} /> Cerrar sesión
              </button>
            </div>
            <div className="h-4" />
          </div>
        </div>,
        document.body
      )}

      {/* ─── First-login photo prompt ─── */}
      {showPhotoPrompt && createPortal(
        <div className="fixed inset-0 z-[60] flex items-center justify-center px-5" onClick={dismissPhotoPrompt}>
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6" onClick={e => e.stopPropagation()}>
            <button onClick={dismissPhotoPrompt} className="absolute top-4 right-4 p-1.5 text-gray-400 hover:bg-gray-100 rounded-full cursor-pointer">
              <IconX size={16} />
            </button>
            <div className="flex flex-col items-center gap-4 text-center">
              <div className="w-20 h-20 rounded-full bg-[image:var(--gradient)] flex items-center justify-center shadow-lg">
                <IconCamera size={32} className="text-white" />
              </div>
              <div>
                <h3 className="text-[16px] font-bold text-[var(--text)] mb-1">¿Agregás una foto de perfil?</h3>
                <p className="text-[13px] text-gray-400 leading-relaxed">
                  Personalizá tu cuenta con una foto. La podés cambiar cuando quieras desde Mi Perfil.
                </p>
              </div>
              <div className="flex gap-3 w-full">
                <button
                  onClick={dismissPhotoPrompt}
                  className="flex-1 py-2.5 border border-gray-200 rounded-xl text-[14px] text-gray-500 cursor-pointer hover:bg-gray-50"
                >
                  Después
                </button>
                <button
                  onClick={() => { setShowPhotoPrompt(false); setShowCrop(true) }}
                  className="flex-1 py-2.5 bg-[image:var(--gradient)] text-white text-[14px] font-semibold rounded-xl cursor-pointer flex items-center justify-center gap-2"
                >
                  <IconCamera size={15} /> Agregar foto
                </button>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Photo crop modal */}
      {showCrop && (
        <PhotoCropModal
          currentUrl={fotoUrl}
          initials={initials}
          onClose={() => setShowCrop(false)}
          onSaved={handlePhotoSaved}
          onDeleted={handlePhotoDeleted}
        />
      )}
    </>
  )
}
