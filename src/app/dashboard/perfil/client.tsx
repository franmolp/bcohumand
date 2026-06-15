'use client'

import { useState, useEffect } from 'react'
import type { SessionUser } from '@/types'
import { Toast, Spinner } from '@/components/ui'
import { IconLock, IconEye, IconEyeOff, IconCamera } from '@/components/ui/Icons'
import PhotoCropModal from '@/components/PhotoCropModal'

interface PerfilData {
  id: string
  usuario: string
  nombre: string
  email: string
  telefono: string | null
  dni: string | null
  fecha_nacimiento: string | null
  estado_cuenta: string
  foto_perfil: string | null
  equipo: { nombre: string } | null
  rol: { nombre: string } | null
  vacaciones_usadas: number
  vacaciones_total: number
}

function fmtFecha(iso: string | null): string {
  if (!iso) return '—'
  const [y, m, d] = iso.split('T')[0].split('-')
  return `${d}/${m}/${y}`
}

function InfoRow({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="py-2.5 border-b border-gray-100 last:border-0">
      <p className="text-[11px] text-gray-400 mb-0.5">{label}</p>
      <p className="text-[14px] font-medium text-[var(--text)]">{value || '—'}</p>
    </div>
  )
}

function PasswordInput({
  label, value, onChange, show, onToggle,
}: {
  label: string; value: string; onChange: (v: string) => void; show: boolean; onToggle: () => void
}) {
  return (
    <div>
      <label className="text-[13px] font-medium text-[var(--text)] mb-1 block">{label}</label>
      <div className="relative">
        <input
          type={show ? 'text' : 'password'}
          value={value}
          onChange={e => onChange(e.target.value)}
          className="w-full border border-gray-200 rounded-xl px-3 py-2.5 pr-10 text-[14px] outline-none focus:border-[var(--primary)] focus:ring-1 focus:ring-[var(--primary)]/20"
          style={{ fontSize: 16 }}
          autoComplete="new-password"
        />
        <button
          type="button"
          onClick={onToggle}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 cursor-pointer"
        >
          {show ? <IconEyeOff size={16} /> : <IconEye size={16} />}
        </button>
      </div>
    </div>
  )
}

export default function PerfilClient({ user }: { user: SessionUser }) {
  const [perfil, setPerfil] = useState<PerfilData | null>(null)
  const [loading, setLoading] = useState(true)
  const [showCrop, setShowCrop] = useState(false)

  const [current, setCurrent] = useState('')
  const [nueva, setNueva] = useState('')
  const [confirmar, setConfirmar] = useState('')
  const [showCurrent, setShowCurrent] = useState(false)
  const [showNueva, setShowNueva] = useState(false)
  const [showConfirmar, setShowConfirmar] = useState(false)
  const [saving, setSaving] = useState(false)

  const [toastMsg, setToastMsg] = useState('')
  const [toastVisible, setToastVisible] = useState(false)
  const [toastType, setToastType] = useState<'success' | 'error'>('success')

  function showToast(msg: string, type: 'success' | 'error' = 'success') {
    setToastMsg(msg); setToastType(type); setToastVisible(true)
    setTimeout(() => setToastVisible(false), 3500)
  }

  useEffect(() => {
    fetch('/api/perfil')
      .then(r => r.json())
      .then(setPerfil)
      .finally(() => setLoading(false))
  }, [])

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault()
    if (!current || !nueva || !confirmar) { showToast('Completá todos los campos', 'error'); return }
    if (nueva !== confirmar) { showToast('Las contraseñas nuevas no coinciden', 'error'); return }
    if (nueva.length < 6) { showToast('La nueva contraseña debe tener al menos 6 caracteres', 'error'); return }

    setSaving(true)
    try {
      const r = await fetch('/api/perfil/password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ current, nueva, confirmar }),
      })
      const body = await r.json()
      if (!r.ok) showToast(body.error ?? 'Error al cambiar la contraseña', 'error')
      else { showToast('Contraseña actualizada correctamente'); setCurrent(''); setNueva(''); setConfirmar('') }
    } finally {
      setSaving(false)
    }
  }

  function handlePhotoSaved(url: string) {
    setPerfil(p => p ? { ...p, foto_perfil: url } : p)
    setShowCrop(false)
    showToast('Foto actualizada')
    // Notify Navigation to refresh
    if (typeof window !== 'undefined') {
      localStorage.setItem('bco_foto_perfil', url)
      window.dispatchEvent(new CustomEvent('bco-foto-updated', { detail: { url } }))
    }
  }

  function handlePhotoDeleted() {
    setPerfil(p => p ? { ...p, foto_perfil: null } : p)
    setShowCrop(false)
    showToast('Foto eliminada')
    if (typeof window !== 'undefined') {
      localStorage.removeItem('bco_foto_perfil')
      window.dispatchEvent(new CustomEvent('bco-foto-updated', { detail: { url: null } }))
    }
  }

  const initials = user.nombre.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()
  const vacRestantes = perfil ? perfil.vacaciones_total - perfil.vacaciones_usadas : null
  const fotoUrl = perfil?.foto_perfil ?? null

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-4xl mx-auto px-4 lg:px-6 py-5 lg:py-8">

        {/* Photo + header */}
        <div className="flex flex-col items-center gap-3 mb-7">
          <div className="relative group cursor-pointer" onClick={() => setShowCrop(true)}>
            <div className="w-24 h-24 rounded-full overflow-hidden bg-[image:var(--gradient)] flex items-center justify-center shadow-lg ring-4 ring-white">
              {fotoUrl
                ? <img src={fotoUrl} alt="" className="w-full h-full object-cover" />
                : <span className="text-2xl font-bold text-white">{initials}</span>
              }
            </div>
            <div className="absolute inset-0 rounded-full bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
              <IconCamera size={22} className="text-white" />
            </div>
            <div className="absolute bottom-0 right-0 w-7 h-7 bg-[image:var(--gradient)] rounded-full border-2 border-white flex items-center justify-center shadow-sm">
              <IconCamera size={12} className="text-white" />
            </div>
          </div>
          <div className="text-center">
            <h1 className="text-[18px] lg:text-[22px] font-bold text-[var(--text)]">{user.nombre}</h1>
            <p className="text-[12px] text-gray-400">{user.equipo} · {user.rol}</p>
          </div>
          <button
            onClick={() => setShowCrop(true)}
            className="text-[12px] text-[var(--primary)] font-medium hover:underline cursor-pointer"
          >
            {fotoUrl ? 'Cambiar foto de perfil' : 'Agregar foto de perfil'}
          </button>
        </div>

        {loading ? (
          <div className="flex justify-center py-20"><Spinner size={32} /></div>
        ) : (
          <div className="grid lg:grid-cols-2 gap-4 lg:gap-6">

            {/* ── Información personal ── */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
              <h2 className="text-[14px] font-bold text-[var(--text)] mb-4">Información Personal</h2>

              <InfoRow label="Usuario"             value={perfil?.usuario} />
              <InfoRow label="Nombre Completo"     value={perfil?.nombre} />
              <InfoRow label="Email"               value={perfil?.email} />
              <InfoRow label="Teléfono"            value={perfil?.telefono} />
              <InfoRow label="DNI"                 value={perfil?.dni} />
              <InfoRow label="Fecha de Nacimiento" value={fmtFecha(perfil?.fecha_nacimiento ?? null)} />
              <InfoRow label="Equipo"              value={perfil?.equipo?.nombre} />
              <InfoRow label="Rol"                 value={perfil?.rol?.nombre} />

              {vacRestantes !== null && (
                <div className="py-2.5">
                  <p className="text-[11px] text-gray-400 mb-0.5">Vacaciones Disponibles</p>
                  <div className="flex items-center gap-2">
                    <div
                      className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[13px] font-semibold"
                      style={{
                        backgroundColor: vacRestantes > 0 ? '#ede9fe' : '#fee2e2',
                        color: vacRestantes > 0 ? '#6d28d9' : '#dc2626',
                      }}
                    >
                      {vacRestantes} de {perfil?.vacaciones_total} días
                    </div>
                    {perfil && perfil.vacaciones_usadas > 0 && (
                      <span className="text-[12px] text-gray-400">{perfil.vacaciones_usadas} usados</span>
                    )}
                  </div>
                </div>
              )}

              <div className="mt-4 p-3 bg-amber-50 border border-amber-200 rounded-xl">
                <p className="text-[12px] text-amber-700">
                  <span className="font-semibold">Nota:</span> Si necesitás modificar algún dato personal, por favor comunicate con el administrador.
                </p>
              </div>
            </div>

            {/* ── Cambiar contraseña ── */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
              <div className="flex items-center gap-2 mb-5">
                <IconLock size={16} className="text-[var(--primary)]" />
                <h2 className="text-[14px] font-bold text-[var(--text)]">Cambiar Contraseña</h2>
              </div>

              <form onSubmit={handleChangePassword} className="space-y-4">
                <PasswordInput label="Contraseña Actual"         value={current}   onChange={setCurrent}   show={showCurrent}   onToggle={() => setShowCurrent(s => !s)} />
                <PasswordInput label="Nueva Contraseña"          value={nueva}     onChange={setNueva}     show={showNueva}     onToggle={() => setShowNueva(s => !s)} />
                <PasswordInput label="Confirmar Nueva Contraseña" value={confirmar} onChange={setConfirmar} show={showConfirmar} onToggle={() => setShowConfirmar(s => !s)} />

                {nueva && confirmar && nueva !== confirmar && (
                  <p className="text-[12px] text-red-500">Las contraseñas no coinciden</p>
                )}

                <button
                  type="submit"
                  disabled={saving}
                  className="w-full py-3 rounded-xl bg-[image:var(--gradient)] text-white text-[14px] font-semibold disabled:opacity-60 cursor-pointer flex items-center justify-center gap-2"
                >
                  {saving ? <Spinner size={16} inline /> : <IconLock size={16} />}
                  {saving ? 'Guardando…' : 'Cambiar Contraseña'}
                </button>
              </form>

              <div className="mt-5 pt-5 border-t border-gray-100">
                <p className="text-[12px] text-gray-400 leading-relaxed">
                  Tu contraseña debe tener al menos 6 caracteres. Por seguridad, te recomendamos usar una combinación de letras, números y símbolos.
                </p>
              </div>
            </div>

          </div>
        )}
      </div>

      <Toast message={toastMsg} visible={toastVisible} type={toastType} />

      {showCrop && (
        <PhotoCropModal
          currentUrl={fotoUrl}
          initials={initials}
          onClose={() => setShowCrop(false)}
          onSaved={handlePhotoSaved}
          onDeleted={handlePhotoDeleted}
        />
      )}
    </div>
  )
}
