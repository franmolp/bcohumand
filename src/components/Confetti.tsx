'use client'

import { useEffect, useState } from 'react'

const COLORS = ['#74ACDF', '#FFFFFF', '#4A90D9', '#B8D9F2', '#FFFFFF', '#74ACDF']
const COUNT = 72

interface Piece {
  id: number
  x: number
  color: string
  w: number
  h: number
  delay: number
  duration: number
  rot: number
  wobble: number
  circle: boolean
}

function makePiece(id: number): Piece {
  return {
    id,
    x: Math.random() * 100,
    color: COLORS[Math.floor(Math.random() * COLORS.length)],
    w: 5 + Math.random() * 7,
    h: 3 + Math.random() * 5,
    delay: Math.random() * 2200,
    duration: 2600 + Math.random() * 1600,
    rot: Math.random() * 720 - 360,
    wobble: (Math.random() - 0.5) * 60,
    circle: Math.random() < 0.35,
  }
}

export default function Confetti() {
  const [pieces] = useState<Piece[]>(() =>
    Array.from({ length: COUNT }, (_, i) => makePiece(i))
  )
  const [visible, setVisible] = useState(true)

  useEffect(() => {
    const t = setTimeout(() => setVisible(false), 5500)
    return () => clearTimeout(t)
  }, [])

  if (!visible) return null

  return (
    <>
      <style>{`
        @keyframes cffall {
          0%   { transform: translateY(-16px) translateX(0px) rotate(0deg); opacity: 1; }
          85%  { opacity: 0.85; }
          100% { transform: translateY(105vh) translateX(var(--cf-wob)) rotate(var(--cf-rot)); opacity: 0; }
        }
      `}</style>
      <div
        aria-hidden="true"
        style={{
          position: 'fixed',
          inset: 0,
          pointerEvents: 'none',
          zIndex: 9999,
          overflow: 'hidden',
        }}
      >
        {pieces.map(p => (
          <span
            key={p.id}
            style={{
              position: 'absolute',
              top: 0,
              left: `${p.x}%`,
              width: p.circle ? `${p.w * 0.75}px` : `${p.w}px`,
              height: p.circle ? `${p.w * 0.75}px` : `${p.h}px`,
              backgroundColor: p.color,
              borderRadius: p.circle ? '50%' : '1px',
              opacity: 0,
              animation: `cffall ${p.duration}ms ${p.delay}ms ease-in forwards`,
              ['--cf-rot' as string]: `${p.rot}deg`,
              ['--cf-wob' as string]: `${p.wobble}px`,
            }}
          />
        ))}
      </div>
    </>
  )
}
