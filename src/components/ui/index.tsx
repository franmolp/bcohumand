'use client'

import { ButtonHTMLAttributes, InputHTMLAttributes, forwardRef, useState, ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { IconEye, IconEyeOff, IconX, IconCheck, IconAlertCircle, IconBell } from './Icons'

// ─── Button ───
interface BtnProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost'
  size?: 'sm' | 'md'
  loading?: boolean
  icon?: ReactNode
}
const bv = {
  primary: 'bg-[image:var(--gradient)] text-white hover:brightness-110 shadow-sm',
  secondary: 'bg-gray-50 text-[var(--text)] border border-gray-300 hover:bg-gray-100',
  danger: 'bg-red-500 text-white hover:bg-red-600 shadow-sm',
  ghost: 'text-[var(--text-sub)] hover:bg-gray-100',
}
const bs = { sm: 'h-9 px-3.5 text-[13px]', md: 'h-11 px-5 text-sm' }

export function Button({ variant = 'primary', size = 'md', loading, icon, children, disabled, className = '', ...r }: BtnProps) {
  return (
    <button disabled={disabled || loading}
      className={`inline-flex items-center justify-center font-semibold rounded-xl transition active:opacity-75 disabled:opacity-40 disabled:pointer-events-none cursor-pointer gap-2 ${bv[variant]} ${bs[size]} ${className}`} {...r}>
      {loading ? <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : icon}
      {children}
    </button>
  )
}

// ─── Input ───
interface InpProps extends InputHTMLAttributes<HTMLInputElement> { label?: string; error?: string; icon?: ReactNode }

export const Input = forwardRef<HTMLInputElement, InpProps>(({ label, error, icon, type, className = '', style, ...r }, ref) => {
  const [show, setShow] = useState(false)
  const isPw = type === 'password'
  const isDate = type === 'date'
  return (
    <div className="min-w-0">
      {label && <label className="block text-[13px] font-medium text-[var(--text-sub)] mb-1.5">{label}</label>}
      <div className="relative">
        {icon && <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--text-muted)]">{icon}</div>}
        <input ref={ref} type={isPw && show ? 'text' : type}
          style={{ fontSize: 16, ...(isDate ? { WebkitAppearance: 'none' } : {}), ...style }}
          className={`w-full min-w-0 h-11 bg-white border border-[var(--border)] rounded-xl text-[var(--text)] placeholder:text-[var(--text-muted)] outline-none transition focus:border-[var(--primary)] focus:ring-2 focus:ring-[var(--primary-light)] ${icon ? 'pl-11' : 'pl-3'} ${isPw ? 'pr-11' : 'pr-3'} ${error ? 'border-red-300' : ''} ${className}`}
          {...r} />
        {isPw && <button type="button" onClick={() => setShow(!show)} tabIndex={-1}
          className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[var(--text-muted)] hover:text-[var(--text-sub)] cursor-pointer">
          {show ? <IconEyeOff size={18} /> : <IconEye size={18} />}
        </button>}
      </div>
      {error && <p className="text-[13px] text-red-500 mt-1">{error}</p>}
    </div>
  )
})
Input.displayName = 'Input'

// ─── Select ───
export function Select({ label, value, onChange, children, className = '' }: { label?: string; value: string; onChange: (v: string) => void; children: ReactNode; className?: string }) {
  return (
    <div>
      {label && <label className="block text-[13px] font-medium text-[var(--text-sub)] mb-1.5">{label}</label>}
      <select value={value} onChange={e => onChange(e.target.value)}
        className={`w-full h-11 px-4 bg-white border border-[var(--border)] rounded-xl text-[var(--text)] outline-none transition focus:border-[var(--primary)] focus:ring-2 focus:ring-[var(--primary-light)] cursor-pointer ${className}`}>
        {children}
      </select>
    </div>
  )
}

// ─── Spinner ───
export function Spinner({ size = 32, inline = false }: { size?: number; inline?: boolean }) {
  const s = `${size}px`
  return (
    <div className={inline ? 'inline-flex items-center justify-center' : 'flex items-center justify-center py-20'}>
      <div className="border-[3px] border-gray-200 border-t-[var(--primary)] rounded-full animate-spin" style={{ width: s, height: s }} />
    </div>
  )
}

// ─── Modal ───
export function Modal({ open, onClose, title, children, footer }: {
  open: boolean; onClose: () => void; title: string; children: ReactNode; footer?: ReactNode
}) {
  if (!open) return null
  return createPortal(
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div onClick={e => e.stopPropagation()}
        className="bg-white rounded-2xl w-full max-w-lg shadow-2xl max-h-[90dvh] flex flex-col" style={{ overflow: 'hidden', overflowX: 'hidden' }}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 flex-shrink-0">
          <h2 className="font-bold text-[17px]">{title}</h2>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 cursor-pointer"><IconX size={16} /></button>
        </div>
        <div className="p-5 flex-1 overflow-auto space-y-4">{children}</div>
        {footer && <div className="flex gap-3 px-5 pb-5 pt-3 border-t border-gray-100 flex-shrink-0">{footer}</div>}
      </div>
    </div>,
    document.body
  )
}

// ─── Toast ───
export function Toast({ message, visible, type = 'success', onClose }: { message: string; visible: boolean; type?: 'success' | 'error' | 'info'; onClose?: () => void }) {
  if (!visible) return null
  const bg = type === 'error' ? 'bg-red-600' : type === 'info' ? 'bg-[var(--primary)]' : 'bg-gray-900'
  return createPortal(
    <div className="fixed bottom-20 lg:bottom-6 left-4 right-4 lg:left-auto lg:right-6 lg:w-auto z-[60] fade-in">
      <div className={`flex items-center gap-2 px-4 py-3 rounded-xl shadow-lg mx-auto lg:mx-0 w-fit text-white ${bg}`}>
        {type === 'error'
          ? <IconAlertCircle size={16} className="shrink-0" />
          : type === 'info'
          ? <IconBell size={16} className="shrink-0" />
          : <IconCheck size={16} className="text-emerald-400 shrink-0" />}
        <span className="text-sm font-medium">{message}</span>
        {onClose && (
          <button onClick={onClose} className="ml-1 opacity-70 hover:opacity-100 cursor-pointer">
            <IconX size={14} />
          </button>
        )}
      </div>
    </div>,
    document.body
  )
}

// ─── Confirm ───
export function Confirm({ open, onClose, onConfirm, title, message, confirmLabel = 'Confirmar', danger = false, loading = false }: {
  open: boolean; onClose: () => void; onConfirm: () => void; title: string; message: string; confirmLabel?: string; danger?: boolean; loading?: boolean
}) {
  if (!open) return null
  return createPortal(
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[55] flex items-center justify-center p-4" onClick={onClose}>
      <div onClick={e => e.stopPropagation()}
        className="bg-white rounded-2xl w-full max-w-sm overflow-hidden shadow-2xl p-6">
        <div className="w-11 h-11 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-3"><IconAlertCircle size={22} className="text-red-500" /></div>
        <h3 className="text-base font-bold text-center mb-1.5">{title}</h3>
        <p className="text-sm text-[var(--text-sub)] text-center mb-6">{message}</p>
        <div className="flex gap-3">
          <Button variant="secondary" className="flex-1" onClick={onClose} disabled={loading}>Cancelar</Button>
          <Button variant={danger ? 'danger' : 'primary'} className="flex-1" onClick={onConfirm} loading={loading}>{confirmLabel}</Button>
        </div>
      </div>
    </div>,
    document.body
  )
}
