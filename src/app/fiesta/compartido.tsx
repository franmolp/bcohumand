'use client'

// Piezas que usan la laptop y los celulares
import { useMemo } from 'react'
import { mezclar } from '@/lib/fiesta'

// Imagen que se va destapando de a cuadros, repartidos parejo en el tiempo: cuando queda 1 segundo
// ya está toda destapada. `totalMs` = tiempo real de la pregunta (más corto si se tocó "Últimos 5 segundos")
const COLS = 8, FILAS = 5
// Orden de destape con suspenso: primero bordes y parte de abajo; a mitad de camino un solo cuadro de la
// zona de la cara (arriba al medio) para tentar, y el resto de la cara al final, el centro de todo último
function ordenDestape(semilla: string) {
  const todos = Array.from({ length: COLS * FILAS }, (_, i) => i)
  const fila = (i: number) => Math.floor(i / COLS), col = (i: number) => i % COLS
  const esCara = (i: number) => fila(i) <= 2 && col(i) >= 2 && col(i) <= 5
  const esCentro = (i: number) => fila(i) <= 1 && col(i) >= 3 && col(i) <= 4
  const resto = mezclar(todos.filter(i => !esCara(i)), semilla)
  const cara = mezclar(todos.filter(i => esCara(i) && !esCentro(i)), semilla + 'c')
  const centro = mezclar(todos.filter(esCentro), semilla + 'n')
  const mitad = Math.floor(resto.length * 0.6)
  return [...resto.slice(0, mitad), cara[0], ...resto.slice(mitad), ...cara.slice(1), ...centro]
}
export function ImagenOculta({ id, imagen, totalMs, transcurrido, revelada, clase }: {
  id: string; imagen: string; totalMs: number; transcurrido: number; revelada: boolean; clase: string
}) {
  const orden = useMemo(() => ordenDestape(id), [id])
  const prog = Math.min(1, Math.max(0, transcurrido) / Math.max(1, totalMs - 1000))
  const destapados = revelada ? orden.length : Math.floor(prog * orden.length)
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
