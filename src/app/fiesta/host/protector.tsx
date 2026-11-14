'use client'

// Protector de pantalla para proyectar en la fiesta (black & white con dorado). Alterna dos escenas
// con una transición: "Luces doradas" (partículas + gran 9) y "Art déco" (rayos, reflectores, insignia).
// Cualquier tecla o clic lo cierra y se vuelve a los juegos.
import { useEffect, useRef, useState } from 'react'
import { LOGO_SVG, LOGO_VIEWBOX } from '@/lib/logo-beauty'

const DURACION_ESCENA = 30000 // ms que dura cada escena
const TRANSICION = 2600

export default function Protector({ onSalir }: { onSalir: () => void }) {
  const [escena, setEscena] = useState(0)
  const [cambiando, setCambiando] = useState(false)

  // Alterna las escenas: primero la línea dorada cruza la pantalla y en el medio se funden
  useEffect(() => {
    const timers: number[] = []
    const ciclo = window.setInterval(() => {
      setCambiando(true)
      timers.push(window.setTimeout(() => setEscena(e => 1 - e), TRANSICION / 2))
      timers.push(window.setTimeout(() => setCambiando(false), TRANSICION))
    }, DURACION_ESCENA)
    return () => { window.clearInterval(ciclo); timers.forEach(t => window.clearTimeout(t)) }
  }, [])

  // Cualquier tecla o clic sale. Se escucha en captura y se frena, así la tecla no llega a los juegos
  // (por ejemplo, la barra espaciadora no saca una bolilla). Se espera un poco para no cerrarlo con el
  // mismo clic que lo abrió.
  const salirRef = useRef(onSalir)
  salirRef.current = onSalir
  useEffect(() => {
    const salir = (e: Event) => { e.preventDefault(); e.stopPropagation(); salirRef.current() }
    const t = window.setTimeout(() => {
      window.addEventListener('keydown', salir, true)
      window.addEventListener('pointerdown', salir, true)
    }, 600)
    return () => { window.clearTimeout(t); window.removeEventListener('keydown', salir, true); window.removeEventListener('pointerdown', salir, true) }
  }, [])

  return (
    <div className="fixed inset-0 z-[100] bg-black overflow-hidden" style={{ cursor: 'none' }}>
      <style>{CSS}</style>
      {/* Solo se dibuja la escena que se ve (y las dos durante la transición), para no gastar de más */}
      {(escena === 0 || cambiando) && <div className="absolute inset-0 transition-opacity duration-[1300ms]" style={{ opacity: escena === 0 ? 1 : 0 }}><EscenaLuces /></div>}
      {(escena === 1 || cambiando) && <div className="absolute inset-0 transition-opacity duration-[1300ms]" style={{ opacity: escena === 1 ? 1 : 0 }}><EscenaDeco /></div>}
      {cambiando && <div className="pr-transicion"><span /></div>}
    </div>
  )
}

// ─── Escena 1: luces doradas que suben + 9 gigante que se dibuja ─────────────────
function EscenaLuces() {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const c = ref.current, x = c?.getContext('2d')
    if (!c || !x) return
    const dpr = Math.min(1.5, window.devicePixelRatio || 1)
    let W = 0, H = 0, raf = 0
    const tam = () => { W = c.width = innerWidth * dpr; H = c.height = innerHeight * dpr }
    tam(); window.addEventListener('resize', tam)
    type P = { x: number; y: number; r: number; v: number; o: number; d: boolean; a: number }
    const nueva = (y?: number): P => ({ x: Math.random() * W, y: y ?? H + 40, r: (Math.random() ** 2 * 14 + 1.5) * dpr, v: (0.15 + Math.random() * 0.5) * dpr, o: Math.random() * 7, d: Math.random() < 0.75, a: 0.15 + Math.random() * 0.55 })
    const ps = Array.from({ length: 120 }, () => nueva(Math.random() * H))
    // Cada luz es una imagen pre-dibujada (dorada o blanca) que se copia: mucho más liviano que
    // calcular un degradé por luz en cada cuadro
    const sprite = (col: string) => {
      const o = document.createElement('canvas'); o.width = o.height = 64
      const g = o.getContext('2d')!, gr = g.createRadialGradient(32, 32, 0, 32, 32, 32)
      gr.addColorStop(0, `rgba(${col},1)`); gr.addColorStop(1, `rgba(${col},0)`)
      g.fillStyle = gr; g.fillRect(0, 0, 64, 64); return o
    }
    const oro = sprite('232,190,95'), blanca = sprite('255,255,255')
    const loop = (t: number) => {
      raf = requestAnimationFrame(loop)
      x.clearRect(0, 0, W, H)
      for (const p of ps) {
        p.y -= p.v; p.x += Math.sin(t / 3000 + p.o) * 0.25 * dpr
        if (p.y < -40) Object.assign(p, nueva())
        const tw = 0.55 + 0.45 * Math.sin(t / 700 + p.o * 3)
        x.globalAlpha = p.a * tw
        x.drawImage(p.d ? oro : blanca, p.x - p.r, p.y - p.r, p.r * 2, p.r * 2)
      }
      x.globalAlpha = 1
    }
    raf = requestAnimationFrame(loop)
    return () => { cancelAnimationFrame(raf); window.removeEventListener('resize', tam) }
  }, [])
  return (
    <div className="absolute inset-0 grid place-items-center">
      <canvas ref={ref} className="absolute inset-0 w-full h-full" />
      <div className="relative w-[min(62vw,110vh)] grid place-items-center">
        <div className="absolute inset-0 grid place-items-center pointer-events-none">
          <svg viewBox="0 -60 600 820" className="h-[92vh] overflow-visible opacity-60">
            <defs><linearGradient id="pr-go" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#8a6623" /><stop offset=".35" stopColor="#fff1b8" /><stop offset=".6" stopColor="#d4af37" /><stop offset="1" stopColor="#8a6623" /></linearGradient></defs>
            <text x="300" y="700" textAnchor="middle" className="pr-gran9">9</text>
          </svg>
        </div>
        <div className="absolute inset-[-20%] pointer-events-none" style={{ background: 'radial-gradient(ellipse at center, rgba(0,0,0,.85) 30%, transparent 65%)' }} />
        <svg viewBox={LOGO_VIEWBOX} className="relative w-full block">
          <defs>
            <linearGradient id="pr-g1" x1="0" x2="1"><stop offset="0" stopColor="#fff" stopOpacity="0" /><stop offset=".5" stopColor="#f5d77a" /><stop offset="1" stopColor="#fff" stopOpacity="0" /></linearGradient>
            <clipPath id="pr-c1" dangerouslySetInnerHTML={{ __html: LOGO_SVG }} />
          </defs>
          <g fill="#fff" dangerouslySetInnerHTML={{ __html: LOGO_SVG }} />
          <g clipPath="url(#pr-c1)"><rect className="pr-barre" x="355" y="600" width="200" height="200" fill="url(#pr-g1)" /></g>
        </svg>
        <div className="relative mt-[4vh] flex items-center gap-[1.4vw] pr-pulso">
          <i className="block w-[9vw] h-px" style={{ background: 'linear-gradient(90deg,transparent,#d4af37)' }} />
          <span className="pr-oro pr-bodoni italic text-[8.5vh] tracking-[.12em]">9 años</span>
          <i className="block w-[9vw] h-px" style={{ background: 'linear-gradient(270deg,transparent,#d4af37)' }} />
        </div>
      </div>
    </div>
  )
}

// ─── Escena 2: art déco (rayos en abanico, esquinas que se dibujan, reflectores) ──
const RAYOS = Array.from({ length: 23 }, (_, i) => {
  const r = (-90 + (i - 11) * 7.5) * Math.PI / 180
  return { x2: Math.round(800 + Math.cos(r) * 1400), y2: Math.round(900 + Math.sin(r) * 1400) }
})
const ESQUINA = 'M40 260 V40 H260 M70 200 V70 H200 M100 140 V100 H140 M40 40 L100 100'
const CHISPAS = Array.from({ length: 34 }, (_, i) => ({ l: (i * 37.7) % 100, t: (i * 61.3) % 100, d: (i * 0.37) % 3.2, dur: 2.4 + ((i * 0.53) % 2.6) }))

function EscenaDeco() {
  return (
    <div className="absolute inset-0 grid place-items-center">
      <svg viewBox="0 0 1600 900" preserveAspectRatio="xMidYMid slice" className="absolute inset-0 w-full h-full">
        <g className="pr-rayos">{RAYOS.map((r, i) => <line key={i} x1="800" y1="900" x2={r.x2} y2={r.y2} />)}</g>
        <g className="pr-marco">
          <path d={ESQUINA} />
          <path d={ESQUINA} transform="translate(1600 0) scale(-1 1)" />
          <path d={ESQUINA} transform="translate(0 900) scale(1 -1)" />
          <path d={ESQUINA} transform="translate(1600 900) scale(-1 -1)" />
        </g>
      </svg>
      <div className="pr-reflector pr-r1" /><div className="pr-reflector pr-r2" />
      {CHISPAS.map((c, i) => <span key={i} className="pr-chispa" style={{ left: `${c.l}vw`, top: `${c.t}vh`, animationDelay: `${c.d}s`, animationDuration: `${c.dur}s` }} />)}
      <div className="relative w-[min(58vw,104vh)] text-center">
        <svg viewBox={LOGO_VIEWBOX} className="w-full block"><g fill="#fff" dangerouslySetInnerHTML={{ __html: LOGO_SVG }} /></svg>
        <div className="pr-insignia pr-bodoni mt-[4.5vh] inline-flex items-center gap-[2vw] text-[8vh]">
          <b /><span className="pr-oro">9 AÑOS</span><b />
        </div>
      </div>
    </div>
  )
}

const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Bodoni+Moda:ital,opsz,wght@0,6..96,400;1,6..96,400&display=swap');
.pr-bodoni{font-family:'Bodoni Moda',Didot,'Bodoni 72',Georgia,serif;font-variant-numeric:lining-nums}
.pr-oro{background:linear-gradient(100deg,#8a6623 0%,#d4af37 18%,#fff1b8 32%,#c9a03f 46%,#8a6623 60%,#e6c76a 78%,#fff1b8 88%,#b8902e 100%);background-size:250% 100%;-webkit-background-clip:text;background-clip:text;color:transparent;animation:prBrillo 6s linear infinite}
@keyframes prBrillo{to{background-position:-250% 0}}
.pr-gran9{font-family:'Bodoni Moda',Didot,Georgia,serif;font-size:1000px;fill:transparent;stroke:url(#pr-go);stroke-width:2;stroke-dasharray:5200;stroke-dashoffset:5200;animation:prDibuja 20s ease-in-out infinite}
@keyframes prDibuja{0%{stroke-dashoffset:5200}35%{stroke-dashoffset:0;fill:transparent}55%{fill:rgba(212,175,55,.06)}80%{stroke-dashoffset:0;opacity:1}95%,100%{stroke-dashoffset:0;opacity:0}}
.pr-barre{animation:prBarre 9s ease-in-out infinite}
@keyframes prBarre{0%,55%{transform:translateX(-400px)}80%,100%{transform:translateX(1000px)}}
.pr-pulso{animation:prPulso 5s ease-in-out infinite}
@keyframes prPulso{0%,100%{opacity:.85}50%{opacity:1}}
.pr-rayos line{stroke:#d4af37;stroke-width:1.2;opacity:.16}
.pr-rayos{will-change:transform;transform-origin:800px 900px;animation:prAbanico 24s ease-in-out infinite}
@keyframes prAbanico{0%,100%{transform:rotate(-3deg)}50%{transform:rotate(3deg)}}
.pr-marco path{fill:none;stroke:#d4af37;stroke-width:2;stroke-dasharray:800;stroke-dashoffset:800;animation:prTraza 14s ease-in-out infinite}
@keyframes prTraza{0%{stroke-dashoffset:800}25%,80%{stroke-dashoffset:0;opacity:1}95%,100%{stroke-dashoffset:0;opacity:0}}
.pr-reflector{position:absolute;bottom:-10vh;width:38vw;height:150vh;background:radial-gradient(ellipse 50% 100% at 50% 100%,rgba(255,250,235,.12),rgba(255,250,235,.05) 55%,rgba(255,250,235,0) 80%);clip-path:polygon(47% 100%,53% 100%,82% 0,18% 0);-webkit-mask-image:linear-gradient(90deg,transparent 18%,#000 50%,transparent 82%);mask-image:linear-gradient(90deg,transparent 18%,#000 50%,transparent 82%);transform-origin:50% 100%;will-change:transform}
.pr-r1{left:-6vw;animation:prBarreA 11s ease-in-out infinite}
.pr-r2{right:-6vw;animation:prBarreB 13s ease-in-out infinite}
@keyframes prBarreA{0%,100%{transform:rotate(28deg)}50%{transform:rotate(-8deg)}}
@keyframes prBarreB{0%,100%{transform:rotate(-28deg)}50%{transform:rotate(10deg)}}
.pr-insignia{letter-spacing:.3em;padding:.22em .4em .22em .7em;border-top:1px solid #d4af37;border-bottom:1px solid #d4af37;animation:prInsignia 14s ease-in-out infinite}
.pr-insignia b{width:.32em;height:.32em;background:#d4af37;transform:rotate(45deg);display:block}
@keyframes prInsignia{0%,100%{opacity:.75;transform:scale(.98)}50%{opacity:1;transform:none}}
.pr-chispa{position:absolute;width:12px;height:12px;margin:-6px;border-radius:50%;background:radial-gradient(circle,#fff 0 18%,rgba(255,236,170,.75) 30%,rgba(255,236,170,0) 70%);will-change:transform,opacity;opacity:0;animation:prChispa 3.2s ease-in-out infinite}
@keyframes prChispa{0%,100%{opacity:0;transform:scale(.3)}50%{opacity:1;transform:scale(1.6)}}
/* Transición: una línea dorada cruza el centro, se abre en un destello y se apaga */
.pr-transicion{position:absolute;inset:0;display:grid;place-items:center;pointer-events:none;z-index:5}
.pr-transicion span{display:block;height:2px;width:0;background:linear-gradient(90deg,transparent,#fff1b8 20%,#d4af37 50%,#fff1b8 80%,transparent);box-shadow:0 0 30px 6px rgba(212,175,55,.55);animation:prLinea ${TRANSICION}ms ease-in-out forwards}
@keyframes prLinea{0%{width:0;opacity:0}40%{width:100vw;opacity:1;height:2px;filter:none}50%{height:14vh;opacity:.35;filter:blur(40px)}62%{height:2px;opacity:.9;filter:none}100%{width:100vw;opacity:0}}
`
