'use client'

import { useEffect, useState } from 'react'

// ─── Efecto ambiental de primavera: flores cayendo suave en el home ───────────
// Se activa SOLO durante la ventana de fechas de abajo y después se apaga solo
// (no hay que acordarse de sacar el componente). Las fechas se comparan en
// horario de Argentina. Overlay fijo, sin bloquear clics (pointer-events:none),
// por debajo de modales/toasts (z-index 30). Respeta "reduce motion".
//
// Para repetir el efecto otra temporada: cambiar INICIO/FIN (o los emojis).
const INICIO = '2026-09-29'
const FIN    = '2026-10-06' // inclusive — una semanita

// "Alegre y colorido": hibisco, girasol, tulipán, flor de cerezo.
const FLORES = ['🌺', '🌻', '🌷', '🌸']
const COUNT = 16 // sutil

interface Flor {
  id: number
  x: number        // posición horizontal inicial (%)
  emoji: string
  size: number     // px
  delay: number    // ms (negativo → arranca a mitad de ciclo, para que no quede vacío al inicio)
  duration: number // ms
  sway: number     // deriva horizontal (px)
  spin: number     // rotación total (deg)
  op: number       // opacidad máxima
}

function makeFlor(id: number): Flor {
  const duration = 9000 + Math.random() * 7000 // 9–16s, caída lenta
  return {
    id,
    x: Math.random() * 100,
    emoji: FLORES[Math.floor(Math.random() * FLORES.length)],
    size: 16 + Math.random() * 12, // 16–28px
    delay: -Math.random() * duration, // reparte las flores por toda la pantalla desde el arranque
    duration,
    sway: (Math.random() - 0.5) * 140, // deriva suave a izq/der
    spin: Math.random() * 360 - 180,
    op: 0.5 + Math.random() * 0.25, // 0.5–0.75, sutil
  }
}

export default function Flores() {
  const [activo, setActivo] = useState(false)
  const [flores] = useState<Flor[]>(() => Array.from({ length: COUNT }, (_, i) => makeFlor(i)))

  useEffect(() => {
    // No molestar a quien pidió menos animaciones
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    if (reduce) return
    const hoy = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' })
    setActivo(hoy >= INICIO && hoy <= FIN)
  }, [])

  if (!activo) return null

  return (
    <>
      <style>{`
        @keyframes florcaer {
          0%   { transform: translateY(-12vh) translateX(0) rotate(0deg); opacity: 0; }
          8%   { opacity: var(--fl-op); }
          92%  { opacity: var(--fl-op); }
          100% { transform: translateY(112vh) translateX(var(--fl-sway)) rotate(var(--fl-spin)); opacity: 0; }
        }
      `}</style>
      <div
        aria-hidden="true"
        style={{
          position: 'fixed',
          inset: 0,
          pointerEvents: 'none',
          zIndex: 30,
          overflow: 'hidden',
        }}
      >
        {flores.map(f => (
          <span
            key={f.id}
            style={{
              position: 'absolute',
              top: 0,
              left: `${f.x}%`,
              fontSize: `${f.size}px`,
              lineHeight: 1,
              opacity: 0,
              willChange: 'transform, opacity',
              animation: `florcaer ${f.duration}ms ${f.delay}ms linear infinite`,
              ['--fl-op' as string]: `${f.op}`,
              ['--fl-sway' as string]: `${f.sway}px`,
              ['--fl-spin' as string]: `${f.spin}deg`,
            }}
          >
            {f.emoji}
          </span>
        ))}
      </div>
    </>
  )
}
