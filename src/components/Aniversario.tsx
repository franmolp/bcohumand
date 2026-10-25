'use client'

import { useEffect, useState } from 'react'

// ─── Momento de aniversario: "9" dorado gigante al entrar al home ──────────────
// Aparece en el centro ~4s (sunburst de rayos, resplandor, onda y chispas), con
// "años de Beauty Co." + "¡Gracias por ser parte!" debajo, y se desvanece solo.
// No es un loop. Se muestra una vez por carga del home y SOLO durante la ventana
// de fechas (se apaga sola después, no hay que acordarse de sacar el componente).
// Fechas en horario de Argentina. Overlay fijo, no bloquea toques, debajo de
// modales/toasts. Respeta "reduce motion".
//
// Para repetir otra fecha: cambiar INICIO/FIN (y el número / los textos).
const INICIO = '2026-10-25'
const FIN    = '2026-11-01' // inclusive — la semana del aniversario (9 años el 30/10)

const VIDA_MS = 4100
// Chispas alrededor del número: [left%, top%, delay en s]
const SPARKS: [number, number, number][] = [
  [33, 28, 0.55], [67, 25, 0.95], [74, 55, 1.5], [26, 56, 1.15],
  [52, 18, 2.0], [80, 40, 2.5], [20, 38, 2.9],
]

export default function Aniversario() {
  const [activo, setActivo] = useState(false)

  useEffect(() => {
    // No molestar a quien pidió menos animaciones
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    if (reduce) return
    const hoy = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' })
    if (hoy < INICIO || hoy > FIN) return

    // Fraunces solo para el glifo "9" (subset de 1 carácter, liviano)
    const link = document.createElement('link')
    link.rel = 'stylesheet'
    link.href = 'https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,600&text=9&display=swap'
    document.head.appendChild(link)

    setActivo(true)
    const t = setTimeout(() => setActivo(false), VIDA_MS)
    return () => clearTimeout(t)
  }, [])

  if (!activo) return null

  return (
    <>
      <style>{`
        @keyframes an9veil { 0%{opacity:0} 9%{opacity:1} 88%{opacity:1} 100%{opacity:0} }
        @keyframes an9in {
          0%{transform:scale(.3) translateY(6px); opacity:0}
          11%{transform:scale(1.12) translateY(0); opacity:1}
          19%{transform:scale(1)}
          86%{transform:scale(1); opacity:1}
          100%{transform:scale(1); opacity:0}
        }
        @keyframes an9shimmer { 0%{background-position:120% 0} 100%{background-position:-60% 0} }
        @keyframes an9rays {
          0%{opacity:0; transform:scale(.6) rotate(-10deg)}
          13%{opacity:.9} 85%{opacity:.5}
          100%{opacity:0; transform:scale(1.18) rotate(46deg)}
        }
        @keyframes an9glow {
          0%{opacity:0; transform:scale(.4)}
          15%{opacity:.95; transform:scale(1)}
          55%{opacity:.6; transform:scale(1.05)}
          85%{opacity:.5}
          100%{opacity:0; transform:scale(1.12)}
        }
        @keyframes an9ring {
          0%{opacity:0; transform:scale(.3)}
          12%{opacity:.9}
          34%{opacity:0; transform:scale(2.9)}
          100%{opacity:0; transform:scale(2.9)}
        }
        @keyframes an9spark {
          0%{opacity:0; transform:scale(0) rotate(0)}
          45%{opacity:1; transform:scale(1.1) rotate(22deg)}
          100%{opacity:0; transform:scale(.35) rotate(40deg)}
        }
        @keyframes an9cap {
          0%{opacity:0; transform:translateY(8px)}
          16%{opacity:1; transform:none}
          88%{opacity:1}
          100%{opacity:0}
        }
      `}</style>

      <div aria-hidden="true" style={{ position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 40, overflow: 'hidden' }}>
        {/* velo oscuro con desenfoque para que el centro resalte */}
        <div style={{
          position: 'absolute', inset: 0,
          background: 'radial-gradient(130% 90% at 50% 42%, rgba(20,10,40,.14), rgba(20,10,40,.52))',
          backdropFilter: 'blur(2px)', WebkitBackdropFilter: 'blur(2px)',
          opacity: 0, animation: 'an9veil 4000ms ease forwards',
        }} />

        <div style={{
          position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: '0 18px',
        }}>
          {/* contenedor que ancla rayos/resplandor/onda al CENTRO del número */}
          <div style={{ position: 'relative', display: 'inline-flex', marginBottom: 10 }}>
            {/* sunburst de rayos */}
            <div style={{
              position: 'absolute', inset: 0, margin: 'auto', width: 470, height: 470, borderRadius: '50%',
              background: 'repeating-conic-gradient(from 0deg, rgba(242,201,76,.34) 0deg 5deg, transparent 5deg 18deg)',
              WebkitMaskImage: 'radial-gradient(circle, transparent 17%, #000 40%, transparent 75%)',
              maskImage: 'radial-gradient(circle, transparent 17%, #000 40%, transparent 75%)',
              opacity: 0, filter: 'blur(.3px)', animation: 'an9rays 4000ms ease forwards',
            }} />
            {/* resplandor */}
            <div style={{
              position: 'absolute', inset: 0, margin: 'auto', width: 300, height: 300, borderRadius: '50%',
              background: 'radial-gradient(circle, rgba(242,201,76,.55), rgba(242,201,76,0) 62%)',
              filter: 'blur(6px)', opacity: 0, animation: 'an9glow 4000ms ease forwards',
            }} />
            {/* onda */}
            <div style={{
              position: 'absolute', inset: 0, margin: 'auto', width: 140, height: 140, borderRadius: '50%',
              border: '2px solid rgba(247,223,140,.85)', opacity: 0,
              animation: 'an9ring 4000ms cubic-bezier(.1,.7,.3,1) forwards',
            }} />
            {/* el 9 */}
            <div style={{
              position: 'relative', fontFamily: '"Fraunces", Georgia, "Times New Roman", serif',
              fontWeight: 600, lineHeight: 1, fontSize: 'min(150px, 42vw)', padding: '0 .14em .1em',
              background: 'linear-gradient(110deg,#d9a521 0%,#f2c94c 24%,#fff6d8 40%,#f2c94c 56%,#d9a521 78%)',
              backgroundSize: '260% 100%', backgroundPosition: '120% 0',
              WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent',
              filter: 'drop-shadow(0 8px 22px rgba(217,165,33,.5))',
              transform: 'scale(.3)', opacity: 0,
              animation: 'an9in 4000ms cubic-bezier(.2,1.2,.3,1) forwards, an9shimmer 2.2s ease-in-out .45s 2',
            }}>9</div>
          </div>

          {/* chispas */}
          {SPARKS.map(([l, t, d], i) => (
            <div key={i} style={{
              position: 'absolute', left: `${l}%`, top: `${t}%`, width: 18, height: 18, background: '#fff7df',
              clipPath: 'polygon(50% 0,58% 42%,100% 50%,58% 58%,50% 100%,42% 58%,0 50%,42% 42%)',
              filter: 'drop-shadow(0 0 5px rgba(242,201,76,.95))',
              opacity: 0, animation: `an9spark 1200ms ease ${d}s forwards`,
            }} />
          ))}

          {/* texto con la tipografía de la app */}
          <div style={{
            marginTop: 16, opacity: 0, animation: 'an9cap 4000ms ease .25s forwards',
            fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
          }}>
            <div style={{ fontSize: 18, fontWeight: 700, color: '#fff', letterSpacing: '.01em' }}>años de Beauty Co.</div>
            <div style={{ fontSize: 12.5, color: 'rgba(255,255,255,.88)', letterSpacing: '.02em', marginTop: 2 }}>¡Gracias por ser parte!</div>
          </div>
        </div>
      </div>
    </>
  )
}
