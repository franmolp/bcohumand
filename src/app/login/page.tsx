'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Button, Input } from '@/components/ui'
import { IconUser, IconLock, IconAlertCircle } from '@/components/ui/Icons'

function PwaInstallHint() {
  const [platform, setPlatform] = useState<'ios' | 'android' | null>(null)

  useEffect(() => {
    const isStandalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      (navigator as { standalone?: boolean }).standalone === true
    if (isStandalone) return

    const ua = navigator.userAgent
    if (/iphone|ipad|ipod/i.test(ua)) setPlatform('ios')
    else if (/android/i.test(ua)) setPlatform('android')
  }, [])

  if (!platform) return null

  if (platform === 'ios') {
    return (
      <div className="mt-6 p-4 rounded-2xl bg-gray-50 border border-gray-100">
        <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-3">Agregar a pantalla de inicio</p>
        <div className="space-y-3">
          {[
            {
              num: 1,
              text: <span>Tocá el botón <strong className="text-gray-700">Compartir</strong></span>,
              icon: (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5 text-[#667eea] shrink-0">
                  <path d="M12 3v10m-4-4l4-4 4 4M5 17v2a1 1 0 001 1h12a1 1 0 001-1v-2"/>
                </svg>
              ),
            },
            {
              num: 2,
              text: <span>Seleccioná <strong className="text-gray-700">"Agregar a inicio"</strong></span>,
              icon: (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5 text-[#667eea] shrink-0">
                  <rect x="3" y="3" width="18" height="18" rx="3"/><path d="M12 8v8m-4-4h8"/>
                </svg>
              ),
            },
            {
              num: 3,
              text: <span>Tocá <strong className="text-gray-700">"Agregar"</strong> para confirmar</span>,
              icon: (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5 text-[#667eea] shrink-0">
                  <path d="M9 12l2 2 4-4"/><circle cx="12" cy="12" r="9"/>
                </svg>
              ),
            },
          ].map(({ num, text, icon }) => (
            <div key={num} className="flex items-center gap-3">
              <span className="w-5 h-5 rounded-full bg-[#667eea]/10 text-[#667eea] text-[11px] font-bold flex items-center justify-center shrink-0">{num}</span>
              {icon}
              <span className="text-xs text-gray-600 leading-snug">{text}</span>
            </div>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="mt-6 p-4 rounded-2xl bg-gray-50 border border-gray-100 flex items-start gap-3">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5 text-[#667eea] shrink-0 mt-0.5">
        <rect x="3" y="3" width="18" height="18" rx="3"/><path d="M12 8v8m-4-4h8"/>
      </svg>
      <p className="text-xs text-gray-600 leading-relaxed">
        Abrí el menú <strong className="text-gray-700">⋮</strong> de tu navegador y tocá{' '}
        <strong className="text-gray-700">"Agregar a pantalla de inicio"</strong> para instalar la app.
      </p>
    </div>
  )
}

export default function LoginPage() {
  const [usuario, setUsuario] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [bloqueada, setBloqueada] = useState(false)
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault(); setError(''); setBloqueada(false); setLoading(true)
    try {
      const res = await fetch('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ usuario: usuario.toLowerCase().trim(), password }) })
      const data = await res.json()
      if (!res.ok) {
        if (res.status === 403) {
          setBloqueada(true)
          setError(data.error || 'Cuenta bloqueada.')
        } else if (data.intento) {
          setError(`Contraseña incorrecta. Intento ${data.intento} de ${data.maxIntentos}.`)
        } else {
          setError(data.error || 'Error')
        }
        return
      }
      router.push('/dashboard')
    } catch { setError('Error de conexión') } finally { setLoading(false) }
  }

  return (
    <div className="min-h-[100dvh] flex flex-col lg:flex-row bg-white">
      {/* Gradient - mobile: header compacto, desktop: panel izquierdo */}
      <div className="bg-[image:var(--gradient)] px-6 pt-12 pb-8 lg:w-[46%] lg:min-h-screen lg:flex lg:items-center lg:justify-center lg:pt-0 lg:pb-0 relative overflow-hidden">
        <div className="absolute top-[10%] left-[8%] w-48 h-48 lg:w-60 lg:h-60 bg-white/[.05] rounded-full blur-3xl" />
        <div className="absolute bottom-[5%] right-[5%] w-64 lg:w-80 h-64 lg:h-80 bg-white/[.04] rounded-full blur-3xl" />
        <div className="relative z-10 text-center lg:px-12 fade-in">
          <div className="w-12 h-12 lg:w-20 lg:h-20 bg-white/10 backdrop-blur rounded-xl lg:rounded-2xl flex items-center justify-center mx-auto mb-3 lg:mb-6 border border-white/10">
            <svg className="w-6 h-6 lg:w-9 lg:h-9" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 7m-4 0a4 4 0 108 0a4 4 0 10-8 0"/><path d="M3 21v-2a4 4 0 014-4h4a4 4 0 014 4v2"/>
              <path d="M16 3.13a4 4 0 010 7.75"/><path d="M21 21v-2a4 4 0 00-3-3.85"/>
            </svg>
          </div>
          <div className="flex items-center justify-center gap-2 mb-1 lg:mb-3">
            <span className="bg-white/15 text-white font-bold text-[11px] lg:text-sm px-2 lg:px-2.5 py-0.5 lg:py-1 rounded-md backdrop-blur">BCO</span>
            <span className="text-lg lg:text-3xl font-bold text-white tracking-tight">HUMAND</span>
          </div>
          <p className="text-white/60 text-xs lg:text-sm hidden lg:block max-w-[260px] mx-auto">Gestión de recursos humanos simple, moderna y eficiente</p>
        </div>
      </div>

      {/* Formulario */}
      <div className="flex-1 flex items-start lg:items-center justify-center px-5 pt-6 pb-10 lg:px-16">
        <div className="w-full max-w-sm fade-in" style={{ animationDelay: '100ms' }}>
          <h2 className="text-xl lg:text-[22px] font-bold mb-1">Iniciar sesión</h2>
          <p className="text-sm text-[var(--text-sub)] mb-6">Ingresá tus credenciales</p>
          <form onSubmit={handleSubmit} className="space-y-4">
            <Input label="Usuario" value={usuario} onChange={e => setUsuario(e.target.value)} placeholder="nombre de usuario" icon={<IconUser size={18}/>} required autoComplete="username"/>
            <Input label="Contraseña" type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Tu contraseña" icon={<IconLock size={18}/>} required autoComplete="current-password"/>
            {error && (
              <div className={`flex items-start gap-2 p-3 rounded-xl border fade-in ${bloqueada ? 'bg-amber-50 border-amber-100' : 'bg-red-50 border-red-100'}`}>
                <IconAlertCircle size={16} className={`shrink-0 mt-0.5 ${bloqueada ? 'text-amber-500' : 'text-red-500'}`}/>
                <p className={`text-[13px] font-medium leading-snug ${bloqueada ? 'text-amber-700' : 'text-red-600'}`}>{error}</p>
              </div>
            )}
            <Button type="submit" loading={loading} className="w-full" size="md">Ingresar</Button>
          </form>
          <PwaInstallHint />
          <p className="mt-6 text-center text-xs text-gray-300">BCO HUMAND · Beauty Co</p>
        </div>
      </div>
    </div>
  )
}
