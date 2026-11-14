'use client'

// Piezas que usan la laptop y los celulares
import { useMemo } from 'react'
import { mezclar } from '@/lib/fiesta'

// Imagen que se va destapando de a cuadros: hasta el 85% a lo largo del 90% del tiempo; al revelar, toda
const COLS = 8, FILAS = 5
export function ImagenOculta({ id, imagen, duracion, transcurrido, revelada, clase }: {
  id: string; imagen: string; duracion: number; transcurrido: number; revelada: boolean; clase: string
}) {
  const orden = useMemo(() => mezclar(Array.from({ length: COLS * FILAS }, (_, i) => i), id), [id])
  const prog = Math.min(1, Math.max(0, transcurrido) / (duracion * 1000 * 0.9))
  const destapados = revelada ? orden.length : Math.floor(prog * orden.length * 0.85)
  const visibles = new Set(orden.slice(0, destapados))
  return (
    <div className="relative rounded-2xl overflow-hidden shadow-2xl">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={imagen} alt="" className={`${clase} object-contain block`} />
      <div className="absolute inset-0 grid" style={{ gridTemplateColumns: `repeat(${COLS}, 1fr)`, gridTemplateRows: `repeat(${FILAS}, 1fr)` }}>
        {Array.from({ length: COLS * FILAS }, (_, i) => (
          <div key={i} className="transition-all duration-700 border border-black/10" style={{ background: '#3b1a6e', opacity: visibles.has(i) ? 0 : 1, transform: visibles.has(i) ? 'scale(0.6) rotate(8deg)' : 'none' }} />
        ))}
      </div>
    </div>
  )
}
