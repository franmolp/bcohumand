'use client'

import { useRef } from 'react'
import { IconCalendar } from '@/components/ui/Icons'

// Campo de fecha (regla: nunca <input type="date"> suelto). Muestra la fecha con mayúscula ("Mié 23 Dic 2026") y
// al tocarlo abre el selector nativo del teléfono o la compu. El input nativo queda invisible encima: así el
// ancho lo maneja este campo (el de iOS ignora el ancho y se desborda).
const DIAS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']
const MESES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']
export const textoFecha = (f: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(f)) return ''
  const d = new Date(f + 'T12:00:00Z')
  return `${DIAS[d.getUTCDay()]} ${d.getUTCDate()} ${MESES[d.getUTCMonth()]} ${d.getUTCFullYear()}`
}

export default function CampoFecha({ value, onChange, min, max, placeholder = 'Elegir fecha', className = '', disabled = false }: {
  value: string; onChange: (v: string) => void; min?: string; max?: string; placeholder?: string; className?: string; disabled?: boolean
}) {
  const ref = useRef<HTMLInputElement>(null)
  const abrir = () => { try { ref.current?.showPicker?.() } catch { /* el navegador lo abre solo al tocar */ } }
  return (
    <div className={`relative w-full min-w-0 h-11 rounded-xl border border-[var(--border)] bg-white flex items-center gap-2 px-3 overflow-hidden focus-within:border-[var(--primary)] focus-within:ring-2 focus-within:ring-[var(--primary-light)] ${disabled ? 'opacity-50' : ''} ${className}`}>
      <IconCalendar size={16} className="shrink-0 text-gray-400" />
      <span className={`flex-1 min-w-0 truncate text-[15px] lg:text-sm ${value ? 'text-[var(--text)]' : 'text-[var(--text-muted)]'}`}>{value ? textoFecha(value) : placeholder}</span>
      <input ref={ref} type="date" value={value} min={min} max={max} disabled={disabled} onClick={abrir}
        onChange={e => onChange(e.target.value)} aria-label={placeholder}
        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer appearance-none" style={{ fontSize: 16, minWidth: 0 }} />
    </div>
  )
}
