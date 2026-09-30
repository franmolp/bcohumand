'use client'

import { useEffect, useState } from 'react'

// ─── Efecto de primavera: ráfaga corta de flores al entrar al home ────────────
// Igual que el Confetti: caen unas cuantas flores, se juntan abajo y a los ~5s
// desaparece todo (no es un loop, no queda cayendo). Se muestra una vez por
// carga del home. Se activa SOLO durante la ventana de fechas de abajo y después
// se apaga solo (no hay que acordarse de sacar el componente). Fechas en horario
// de Argentina. Overlay fijo, sin bloquear clics, debajo de modales/toasts.
// Respeta "reduce motion".
//
// Para repetir el efecto otra temporada: cambiar INICIO/FIN (o los emojis).
const INICIO = '2026-09-29'
const FIN    = '2026-10-06' // inclusive — una semanita

// "Alegre y colorido": hibisco, girasol, tulipán, flor de cerezo.
const FLORES = ['🌺', '🌻', '🌷', '🌸']
const COUNT = 18       // un par nomás, sutil
const VIDA_MS = 5900   // cuánto vive el efecto antes de desaparecer

interface Flor {
  id: number
  x: number        // posición horizontal inicial (%)
  emoji: string
  size: number     // px
  delay: number    // ms
  duration: number // ms (caída + asentarse)
  sway: number     // deriva horizontal (px)
  spin: number     // rotación total (deg)
  land: number     // dónde queda apoyada abajo (vh)
  op: number       // opacidad máxima
}

function makeFlor(id: number): Flor {
  return {
    id,
    x: Math.random() * 100,
    emoji: FLORES[Math.floor(Math.random() * FLORES.length)],
    size: 16 + Math.random() * 12,        // 16–28px
    delay: Math.random() * 800,           // arranque escalonado 0–0.8s
    duration: 3900 + Math.random() * 1100, // 3.9–5.0s, un cachito más lento
    sway: (Math.random() - 0.5) * 120,    // deriva suave a izq/der
    spin: Math.random() * 360 - 180,
    land: 62 + Math.random() * 18,        // se juntan por encima del nav de abajo (62–80vh)
    op: 0.55 + Math.random() * 0.25,      // 0.55–0.8, sutil
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
    if (hoy < INICIO || hoy > FIN) return
    setActivo(true)
    const t = setTimeout(() => setActivo(false), VIDA_MS)
    return () => clearTimeout(t)
  }, [])

  if (!activo) return null

  return (
    <>
      <style>{`
        @keyframes florcaer {
          0%   { transform: translateY(-12vh) translateX(0) rotate(0deg); opacity: 0; }
          8%   { opacity: var(--fl-op); }
          /* cae y se asienta abajo */
          60%  { transform: translateY(var(--fl-land)) translateX(var(--fl-sway)) rotate(var(--fl-spin)); opacity: var(--fl-op); }
          /* descansa un instante juntas abajo */
          80%  { transform: translateY(var(--fl-land)) translateX(var(--fl-sway)) rotate(var(--fl-spin)); opacity: var(--fl-op); }
          /* y desaparece */
          100% { transform: translateY(var(--fl-land)) translateX(var(--fl-sway)) rotate(var(--fl-spin)); opacity: 0; }
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
              animation: `florcaer ${f.duration}ms ${f.delay}ms ease-in forwards`,
              ['--fl-op' as string]: `${f.op}`,
              ['--fl-sway' as string]: `${f.sway}px`,
              ['--fl-spin' as string]: `${f.spin}deg`,
              ['--fl-land' as string]: `${f.land}vh`,
            }}
          >
            {f.emoji}
          </span>
        ))}
      </div>
    </>
  )
}
