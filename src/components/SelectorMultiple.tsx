'use client'

import { useEffect, useRef, useState } from 'react'
import { IconChevronDown } from '@/components/ui/Icons'

// Desplegable con tildes para elegir varias opciones (regla: nunca una fila de botones para elegir).
// opciones: [valor, texto]. `deshabilitadas`: valores que no se pueden tildar (ej. ya usados en otro lado).
export default function SelectorMultiple<T extends string | number>({ opciones, valor, onChange, nombre = 'opciones', deshabilitadas = [], className = '' }: {
  opciones: [T, string][]; valor: T[]; onChange: (v: T[]) => void; nombre?: string; deshabilitadas?: T[]; className?: string
}) {
  const [abierto, setAbierto] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!abierto) return
    const fuera = (e: MouseEvent | TouchEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setAbierto(false) }
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setAbierto(false) }
    document.addEventListener('mousedown', fuera); document.addEventListener('touchstart', fuera); document.addEventListener('keydown', esc)
    return () => { document.removeEventListener('mousedown', fuera); document.removeEventListener('touchstart', fuera); document.removeEventListener('keydown', esc) }
  }, [abierto])
  const textoDe = (v: T) => opciones.find(o => o[0] === v)?.[1] ?? String(v)
  const elegidas = opciones.filter(o => valor.includes(o[0]))
  const texto = !elegidas.length ? `Elegir ${nombre}` : elegidas.length <= 2 ? elegidas.map(o => o[1]).join(', ') : `${elegidas.length} ${nombre} elegidas`
  const cambiar = (v: T) => onChange(valor.includes(v) ? valor.filter(x => x !== v) : [...valor, v])
  return (
    <div ref={ref} className={`relative w-full min-w-0 ${className}`}>
      <button type="button" onClick={() => setAbierto(!abierto)}
        className="w-full h-11 px-4 rounded-xl border border-gray-300 bg-white flex items-center gap-2 text-[14px] text-left cursor-pointer hover:border-gray-400">
        <span className={`flex-1 min-w-0 truncate ${elegidas.length ? 'text-[var(--text)]' : 'text-gray-400'}`}>{texto}</span>
        <IconChevronDown size={16} className={`shrink-0 text-gray-500 transition-transform ${abierto ? 'rotate-180' : ''}`} />
      </button>
      {abierto && (
        <div className="absolute z-40 mt-1.5 w-full bg-white border border-gray-200 rounded-xl shadow-lg py-1.5 max-h-[300px] overflow-auto">
          {opciones.map(([v]) => {
            const off = deshabilitadas.includes(v) && !valor.includes(v)
            return (
              <label key={String(v)} className={`flex items-center gap-2.5 px-3.5 py-2.5 text-[14px] ${off ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer hover:bg-gray-50'}`}>
                <input type="checkbox" disabled={off} checked={valor.includes(v)} onChange={() => cambiar(v)} className="w-4 h-4 accent-[var(--primary)]" />
                <span className="flex-1 min-w-0">{textoDe(v)}</span>
              </label>
            )
          })}
        </div>
      )}
    </div>
  )
}
