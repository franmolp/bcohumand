'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useState } from 'react'
import type { SessionUser } from '@/types'
import {
  IconHome, IconUsers, IconClipboard, IconFileText,
  IconLogout, IconBell, IconShoppingBag, IconWall,
  IconDollar, IconSettings, IconX
} from '@/components/ui/Icons'

const navSections = [
  {
    label: 'General',
    items: [
      { href: '/dashboard', label: 'Inicio', icon: IconHome },
      { href: '/dashboard/empleados', label: 'Empleados', icon: IconUsers, admin: true },
      { href: '/dashboard/asistencia', label: 'Asistencia', icon: IconClipboard, admin: true },
      { href: '/dashboard/solicitudes', label: 'Solicitudes', icon: IconFileText },
    ]
  },
  {
    label: 'Gestión',
    items: [
      { href: '/dashboard/liquidador', label: 'Liquidador', icon: IconDollar, admin: true },
      { href: '/dashboard/compras', label: 'Compras', icon: IconShoppingBag, admin: true },
      { href: '/dashboard/muro', label: 'Muro Social', icon: IconWall },
      { href: '/dashboard/notificaciones', label: 'Notificaciones', icon: IconBell },
    ]
  },
]

// Items que se muestran en el bottom nav mobile (max 5)
const mobileNavItems = [
  { href: '/dashboard', label: 'Inicio', icon: IconHome },
  { href: '/dashboard/asistencia', label: 'Asistencia', icon: IconClipboard, admin: true },
  { href: '/dashboard/solicitudes', label: 'Solicitudes', icon: IconFileText },
  { href: '/dashboard/notificaciones', label: 'Alertas', icon: IconBell },
]

export default function Sidebar({ user }: { user: SessionUser }) {
  const pathname = usePathname()
  const router = useRouter()
  const isAdmin = user.rol === 'admin' || user.rol === 'Admin'
  const [drawerOpen, setDrawerOpen] = useState(false)

  async function handleLogout() {
    await fetch('/api/auth/logout', { method: 'POST' })
    router.push('/login')
  }

  const allItems = navSections.flatMap(s => s.items).filter(item => !item.admin || isAdmin)
  const visibleMobileItems = mobileNavItems.filter(item => !item.admin || isAdmin).slice(0, 4)

  // Ícono "Más" para abrir drawer en mobile
  const moreIcon = () => (
    <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="1" /><circle cx="12" cy="5" r="1" /><circle cx="12" cy="19" r="1" />
    </svg>
  )

  return (
    <>
      {/* ═══ DESKTOP SIDEBAR ═══ */}
      <aside className="hidden lg:flex w-[260px] bg-white border-r border-neutral-200/60 fixed h-screen flex-col shadow-[var(--shadow-sm)] z-30">
        <div className="bg-primary-gradient p-5 pb-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-white/15 rounded-lg flex items-center justify-center shrink-0 backdrop-blur-sm border border-white/10">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 7m-4 0a4 4 0 1 0 8 0a4 4 0 1 0 -8 0" /><path d="M3 21v-2a4 4 0 0 1 4 -4h4a4 4 0 0 1 4 4v2" />
              </svg>
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="bg-white/15 text-white text-[11px] font-bold px-2 py-0.5 rounded backdrop-blur-sm">BCO</span>
                <span className="text-sm font-bold text-white">HUMAND</span>
              </div>
              <p className="text-[11px] text-white/60 mt-0.5">Beauty Co</p>
            </div>
          </div>
        </div>

        <nav className="flex-1 px-3 pt-4 overflow-y-auto">
          {navSections.map((section, si) => {
            const visibleItems = section.items.filter(item => !item.admin || isAdmin)
            if (visibleItems.length === 0) return null
            return (
              <div key={si} className={si > 0 ? 'mt-6' : ''}>
                <p className="px-3 mb-2 text-[11px] font-semibold text-neutral-400 uppercase tracking-wider">{section.label}</p>
                <div className="space-y-0.5">
                  {visibleItems.map((item, ii) => {
                    const active = pathname === item.href
                    const Icon = item.icon
                    return (
                      <Link key={item.href} href={item.href}
                        className={`flex items-center gap-3 px-3 py-2.5 rounded-[var(--radius-sm)] text-[13px] transition-all duration-200 animate-slide-in ${
                          active ? 'bg-primary-50 text-primary-700 font-semibold border-l-[3px] border-primary-500 pl-[9px]'
                            : 'text-neutral-600 hover:bg-neutral-50 hover:text-neutral-900'
                        }`}
                        style={{ animationDelay: `${(si * 4 + ii) * 30}ms` }}>
                        <Icon size={18} className={active ? 'text-primary-600' : 'text-neutral-400'} />
                        {item.label}
                      </Link>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </nav>

        <div className="p-3 border-t border-neutral-100">
          <Link href="/dashboard/configuracion"
            className="flex items-center gap-3 px-3 py-2 rounded-[var(--radius-sm)] text-[13px] text-neutral-600 hover:bg-neutral-50 transition-colors mb-1">
            <IconSettings size={18} className="text-neutral-400" />Configuración
          </Link>
          <div className="flex items-center gap-3 px-3 py-2.5">
            <div className="w-8 h-8 bg-primary-gradient rounded-full flex items-center justify-center shrink-0 shadow-sm">
              <span className="text-[11px] font-bold text-white">{user.nombre.split(' ').map(n => n[0]).join('').slice(0, 2)}</span>
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[13px] font-semibold text-neutral-800 truncate">{user.nombre}</p>
              <p className="text-[11px] text-neutral-400 truncate">{user.equipo}</p>
            </div>
            <button onClick={handleLogout} className="p-1.5 text-neutral-400 hover:text-red-500 hover:bg-red-50 rounded-md transition-all cursor-pointer" title="Cerrar sesión">
              <IconLogout size={16} />
            </button>
          </div>
        </div>
      </aside>

      {/* ═══ MOBILE BOTTOM NAV ═══ */}
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-neutral-200 z-40 safe-area-bottom">
        <div className="flex items-stretch">
          {visibleMobileItems.map(item => {
            const active = pathname === item.href
            const Icon = item.icon
            return (
              <Link key={item.href} href={item.href}
                className={`flex-1 flex flex-col items-center justify-center py-2 pt-2.5 gap-0.5 transition-colors ${
                  active ? 'text-primary-600' : 'text-neutral-400'
                }`}>
                <Icon size={20} />
                <span className="text-[10px] font-medium">{item.label}</span>
              </Link>
            )
          })}
          {/* Botón Más */}
          <button onClick={() => setDrawerOpen(true)}
            className="flex-1 flex flex-col items-center justify-center py-2 pt-2.5 gap-0.5 text-neutral-400 cursor-pointer">
            {moreIcon()}
            <span className="text-[10px] font-medium">Más</span>
          </button>
        </div>
      </nav>

      {/* ═══ MOBILE DRAWER ═══ */}
      {drawerOpen && (
        <div className="lg:hidden fixed inset-0 z-50" onClick={() => setDrawerOpen(false)}>
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
          <div className="absolute bottom-0 left-0 right-0 bg-white rounded-t-[20px] shadow-[var(--shadow-xl)] animate-slide-up max-h-[80dvh] overflow-y-auto"
            onClick={e => e.stopPropagation()}>
            {/* Handle */}
            <div className="flex justify-center pt-3 pb-1">
              <div className="w-10 h-1 bg-neutral-300 rounded-full" />
            </div>

            {/* User info */}
            <div className="px-5 py-4 border-b border-neutral-100">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-primary-gradient rounded-full flex items-center justify-center shadow-sm">
                  <span className="text-sm font-bold text-white">{user.nombre.split(' ').map(n => n[0]).join('').slice(0, 2)}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-neutral-900 truncate">{user.nombre}</p>
                  <p className="text-[12px] text-neutral-400 truncate">{user.equipo}</p>
                </div>
                <button onClick={() => setDrawerOpen(false)} className="p-2 text-neutral-400 hover:bg-neutral-100 rounded-full cursor-pointer">
                  <IconX size={20} />
                </button>
              </div>
            </div>

            {/* All nav items */}
            <div className="px-3 py-3">
              {allItems.map(item => {
                const active = pathname === item.href
                const Icon = item.icon
                return (
                  <Link key={item.href} href={item.href} onClick={() => setDrawerOpen(false)}
                    className={`flex items-center gap-3.5 px-4 py-3.5 rounded-xl text-[15px] transition-all ${
                      active ? 'bg-primary-50 text-primary-700 font-semibold' : 'text-neutral-700 active:bg-neutral-50'
                    }`}>
                    <Icon size={20} className={active ? 'text-primary-600' : 'text-neutral-400'} />
                    {item.label}
                  </Link>
                )
              })}

              <div className="border-t border-neutral-100 mt-2 pt-2">
                <Link href="/dashboard/configuracion" onClick={() => setDrawerOpen(false)}
                  className="flex items-center gap-3.5 px-4 py-3.5 rounded-xl text-[15px] text-neutral-700 active:bg-neutral-50">
                  <IconSettings size={20} className="text-neutral-400" />Configuración
                </Link>
                <button onClick={handleLogout}
                  className="flex items-center gap-3.5 px-4 py-3.5 rounded-xl text-[15px] text-red-500 active:bg-red-50 w-full cursor-pointer">
                  <IconLogout size={20} />Cerrar sesión
                </button>
              </div>
            </div>

            {/* Safe area bottom padding */}
            <div className="h-6" />
          </div>
        </div>
      )}
    </>
  )
}
