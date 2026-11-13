'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { sbFiesta, canalEntrada, canalSalida, generarCarton, semillaCarton, validarCanto, COLORES, FORMAS, type EstadoPublico, type MsgJugador } from '@/lib/fiesta'

const nuevoId = () => (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2) + Date.now().toString(36))

export default function JugadorClient({ codigo }: { codigo: string }) {
  const KEY = `fiesta-jugador-${codigo}`
  const [yo, setYo] = useState<{ id: string; nombre: string } | null>(null)
  const [cargado, setCargado] = useState(false)
  const [nombre, setNombre] = useState('')
  const [estado, setEstado] = useState<EstadoPublico | null>(null)
  const [limite, setLimite] = useState(0) // hora local en que cierra la pregunta
  const [ahora, setAhora] = useState(() => Date.now())
  const [conectado, setConectado] = useState(false)
  const [miResp, setMiResp] = useState<{ qid: string; op: number } | null>(null)
  const [marcas, setMarcas] = useState<number[]>([])
  const [cantando, setCantando] = useState<{ tipo: 'linea' | 'bingo'; ts: number } | null>(null)
  const sb = useMemo(() => sbFiesta(), [])
  const entradaRef = useRef<RealtimeChannel | null>(null)
  const socketRef = useRef(false)

  useEffect(() => {
    try {
      const g = localStorage.getItem(KEY); if (g) setYo(JSON.parse(g))
      const m = localStorage.getItem(`${KEY}-marcas`); if (m) setMarcas(JSON.parse(m))
      const r = localStorage.getItem(`${KEY}-resp`); if (r) setMiResp(JSON.parse(r))
    } catch { /* nada guardado */ }
    setCargado(true)
  }, [KEY])

  // Envío a la laptop: por REST (sin unirse al canal); si falla, uniéndose al canal
  async function enviar(m: MsgJugador) {
    const ch = entradaRef.current
    if (!ch) return
    if (!socketRef.current) {
      try { await ch.httpSend('j', m); return } catch { socketRef.current = true }
    }
    if (socketRef.current) {
      if (ch.state !== 'joined') await new Promise<void>(res => { ch.subscribe(s => { if (s === 'SUBSCRIBED') res() }); window.setTimeout(res, 4000) })
      ch.send({ type: 'broadcast', event: 'j', payload: m }).catch(() => {})
    }
  }
  const enviarRef = useRef(enviar)
  enviarRef.current = enviar

  useEffect(() => {
    if (!yo) return
    entradaRef.current = sb.channel(canalEntrada(codigo), { config: { broadcast: { self: false } } })
    const salida = sb.channel(canalSalida(codigo), { config: { broadcast: { self: false } } })
    salida.on('broadcast', { event: 'estado' }, ({ payload }) => {
      const e = payload as EstadoPublico
      setEstado(e)
      if (e.trivia.fase === 'pregunta') setLimite(Date.now() + e.trivia.restanteMs)
    })
    salida.subscribe(s => {
      setConectado(s === 'SUBSCRIBED')
      if (s === 'SUBSCRIBED') enviarRef.current({ t: 'hola', id: yo.id, nombre: yo.nombre })
    })
    const latido = window.setInterval(() => enviarRef.current({ t: 'hola', id: yo.id, nombre: yo.nombre }), 8000)
    return () => {
      window.clearInterval(latido)
      sb.removeChannel(salida)
      if (entradaRef.current) sb.removeChannel(entradaRef.current)
      entradaRef.current = null
    }
  }, [yo, codigo, sb])

  // Reloj local para la cuenta regresiva
  const enPregunta = estado?.modo === 'trivia' && estado.trivia.fase === 'pregunta'
  useEffect(() => {
    if (!enPregunta) return
    const t = window.setInterval(() => setAhora(Date.now()), 200)
    return () => window.clearInterval(t)
  }, [enPregunta])

  // Reintenta la respuesta hasta que la laptop la confirme
  const preg = estado?.trivia.pregunta
  const confirmada = !!yo && !!estado?.trivia.respondieron.includes(yo.id)
  useEffect(() => {
    if (!yo || !enPregunta || !preg || !miResp || miResp.qid !== preg.id || confirmada) return
    const t = window.setInterval(() => enviarRef.current({ t: 'resp', id: yo.id, qid: miResp.qid, op: miResp.op }), 1500)
    return () => window.clearInterval(t)
  }, [yo, enPregunta, preg, miResp, confirmada])

  function entrar() {
    const n = nombre.trim().slice(0, 24)
    if (!n) return
    const j = { id: yo?.id ?? nuevoId(), nombre: n }
    localStorage.setItem(KEY, JSON.stringify(j))
    setYo(j)
  }
  function responder(op: number) {
    if (!yo || !preg) return
    const r = { qid: preg.id, op }
    setMiResp(r)
    try { localStorage.setItem(`${KEY}-resp`, JSON.stringify(r)) } catch { /* nada */ }
    navigator.vibrate?.(30)
    enviar({ t: 'resp', id: yo.id, qid: preg.id, op })
  }
  function marcar(n: number) {
    setMarcas(m => {
      const x = m.includes(n) ? m.filter(v => v !== n) : [...m, n]
      try { localStorage.setItem(`${KEY}-marcas`, JSON.stringify(x)) } catch { /* nada */ }
      return x
    })
  }
  function cantar(tipo: 'linea' | 'bingo') {
    if (!yo) return
    setCantando({ tipo, ts: Date.now() })
    navigator.vibrate?.([40, 40, 40])
    enviar({ t: 'canto', id: yo.id, tipo })
  }

  if (!cargado) return <Pantalla><p className="opacity-60">Cargando…</p></Pantalla>

  if (!yo) return (
    <Pantalla>
      <style>{CSS}</style>
      <p className="text-lg opacity-80">Beauty Co. cumple</p>
      <h1 className="text-6xl font-black titulo-brillo">9 años</h1>
      <p className="mt-8 mb-3 font-semibold">¿Cómo te llamás?</p>
      <input value={nombre} onChange={e => setNombre(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') entrar() }} maxLength={24} autoFocus
        placeholder="Tu nombre" className="w-full max-w-xs text-center text-xl px-4 py-3.5 rounded-2xl text-gray-900 outline-none" />
      <button onClick={entrar} disabled={!nombre.trim()} className="mt-4 w-full max-w-xs py-4 rounded-2xl bg-[#ff4fa3] text-xl font-black disabled:opacity-40 active:scale-95 transition">Entrar</button>
    </Pantalla>
  )

  const cambiarNombre = <button onClick={() => { setNombre(yo.nombre); setYo(null) }} className="text-xs opacity-40 underline">Cambiar nombre</button>
  const pie = (
    <div className="fixed bottom-0 inset-x-0 flex items-center justify-between px-4 py-2 text-xs">
      <span className="flex items-center gap-1.5 opacity-60"><span className={`w-2 h-2 rounded-full ${conectado ? 'bg-emerald-400' : 'bg-amber-400 animate-pulse'}`} />{yo.nombre}</span>
      {cambiarNombre}
    </div>
  )

  if (!estado || estado.modo === 'lobby') return (
    <Pantalla>
      <style>{CSS}</style>
      <p className="text-6xl mb-4 latido-suave">🎉</p>
      <h1 className="text-3xl font-black">¡Hola, {yo.nombre}!</h1>
      <p className="mt-3 text-lg opacity-80">{conectado ? 'Ya estás adentro. Mirá la pantalla, ya arrancamos.' : 'Conectando…'}</p>
      {pie}
    </Pantalla>
  )

  if (estado.modo === 'bingo') {
    const carton = generarCarton(semillaCarton(codigo, yo.id))
    const b = estado.bingo
    const ultimos = b.salidos.slice(-5).reverse()
    const miCanto = cantando ? [...b.cantos].reverse().find(c => c.id === yo.id && c.tipo === cantando.tipo && c.ts >= cantando.ts - 60000) : undefined
    const gane = (['linea', 'bingo'] as const).filter(t => b.ganadores[t].some(g => g.id === yo.id))
    // Los botones para cantar solo aparecen si de verdad tiene línea/bingo con las bolillas que salieron.
    // La línea también se puede cantar si otra la ganó con esta misma bolilla (empate).
    const empateLinea = b.ganadores.linea[0]?.bola === b.salidos.length
    const puedeLinea = (b.fase === 'linea' || (b.fase === 'bingo' && empateLinea)) && validarCanto(carton, b.salidos, 'linea')
    const puedeBingo = b.fase !== 'terminado' && validarCanto(carton, b.salidos, 'bingo')
    return (
      <div className="min-h-[100dvh] text-white px-3 pt-4 pb-12" style={FONDO}>
        <style>{CSS}</style>
        <p className="text-center text-sm font-bold uppercase tracking-wider opacity-80">{b.fase === 'terminado' ? 'Bingo terminado' : b.fase === 'linea' ? 'Jugamos por LÍNEA' : 'Jugamos por BINGO'}</p>
        <div className="flex justify-center items-center gap-2 mt-3 h-16">
          {ultimos.map((n, i) => (
            <span key={n} className={`rounded-full flex items-center justify-center font-black ${i === 0 ? 'w-16 h-16 text-3xl bola-celu text-[#2a1650] chip-pop' : 'w-10 h-10 text-base bg-white/15'}`}>{n}</span>
          ))}
          {!ultimos.length && <span className="opacity-60">Esperando la primera bolilla…</span>}
        </div>
        <div className="mt-4 bg-white rounded-2xl p-1.5 shadow-2xl">
          {carton.map((fila, f) => (
            <div key={f} className="grid grid-cols-9 gap-1 mb-1 last:mb-0">
              {fila.map((n, c) => n == null
                ? <div key={c} className="aspect-[3/4] rounded-md bg-[#efe7fb]" />
                : <button key={c} onClick={() => marcar(n)}
                  className={`aspect-[3/4] rounded-md flex items-center justify-center text-[clamp(14px,4.6vw,22px)] font-black transition active:scale-90 ${marcas.includes(n) ? 'bg-[#ff4fa3] text-white marcado' : 'bg-white text-[#2a1650] border border-gray-200'}`}>{n}</button>)}
            </div>
          ))}
        </div>
        <p className="text-center text-xs opacity-60 mt-2">Tocá los números para marcarlos</p>
        {gane.length > 0 ? (
          <div className="mt-5 text-center banner-entra"><p className="text-4xl font-black titulo-brillo">¡Ganaste {gane.map(t => t === 'linea' ? 'la LÍNEA' : 'el BINGO').join(' y ')}!</p><p className="opacity-80 mt-1">Acercate a buscar tu premio 🎁</p></div>
        ) : (puedeBingo || puedeLinea) ? (
          <div className="mt-5 space-y-3">
            {puedeBingo
              ? <button onClick={() => cantar('bingo')} disabled={cantando?.tipo === 'bingo'} className="w-full py-6 rounded-2xl bg-[#ff4fa3] text-3xl font-black active:scale-95 transition boton-cantar">¡CANTAR BINGO!</button>
              : <button onClick={() => cantar('linea')} disabled={cantando?.tipo === 'linea'} className="w-full py-6 rounded-2xl bg-[#1368ce] text-3xl font-black active:scale-95 transition boton-cantar">¡CANTAR LÍNEA!</button>}
            <p className="text-center text-sm opacity-80">¡Rápido, antes que otra!</p>
          </div>
        ) : b.fase !== 'terminado' && (
          <p className="mt-5 text-center text-sm opacity-70">{b.fase === 'linea' ? 'Cuando completes una fila entera vas a poder cantar LÍNEA' : 'Cuando completes todo el cartón vas a poder cantar BINGO'}</p>
        )}
        {cantando && !gane.length && (puedeBingo || puedeLinea || miCanto) && (
          <p className="mt-3 text-center font-semibold chip-pop">{!miCanto ? 'Cantando…' : miCanto.valido ? '¡Correcto!' : 'Uy, otra cantó primero 😅'}</p>
        )}
        {(b.ganadores.linea.length > 0 || b.ganadores.bingo.length > 0) && (
          <div className="mt-4 text-center text-sm opacity-80 space-y-0.5">
            {b.ganadores.linea.length > 0 && <p>Línea: <b>{b.ganadores.linea.map(g => g.nombre).join(' y ')}</b></p>}
            {b.ganadores.bingo.length > 0 && <p>Bingo: <b>{b.ganadores.bingo.map(g => g.nombre).join(' y ')}</b></p>}
          </div>
        )}
        {pie}
      </div>
    )
  }

  // ── Trivia ──
  const t = estado.trivia
  const ranking = t.ranking
  const pos = ranking.findIndex(r => r.id === yo.id)
  const mio = ranking[pos]
  const posTxt = pos >= 0 ? <p className="mt-6 text-lg opacity-90">Vas <b className="text-2xl">#{pos + 1}</b> de {ranking.length} · {(mio?.pts ?? 0).toLocaleString('es-AR')} pts</p> : null

  if (t.fase === 'final') return (
    <Pantalla>
      <style>{CSS}</style>
      <p className="text-6xl mb-3">{pos === 0 ? '🏆' : pos === 1 ? '🥈' : pos === 2 ? '🥉' : '👏'}</p>
      <h1 className="text-4xl font-black titulo-brillo">{pos >= 0 && pos < 3 ? '¡Estás en el podio!' : '¡Gracias por jugar!'}</h1>
      {posTxt}
      {pie}
    </Pantalla>
  )

  if (t.fase === 'pregunta' && preg) {
    const yaRespondi = miResp?.qid === preg.id
    const restante = Math.max(0, limite - ahora)
    if (yaRespondi) return (
      <Pantalla>
        <style>{CSS}</style>
        <div className="w-28 h-28 rounded-3xl flex items-center justify-center text-6xl chip-pop" style={{ background: COLORES[miResp!.op] }}>{FORMAS[miResp!.op]}</div>
        <h1 className="mt-6 text-3xl font-black">{confirmada ? '¡Respuesta enviada!' : 'Enviando…'}</h1>
        <p className="mt-2 opacity-70">Esperá a que termine el tiempo 👀</p>
        {pie}
      </Pantalla>
    )
    const ops = preg.opciones.map((o, i) => ({ o, i })).filter(x => x.o.trim())
    return (
      <div className="min-h-[100dvh] flex flex-col text-white px-3 pt-3 pb-10" style={FONDO}>
        <style>{CSS}</style>
        <div className="h-2 rounded-full bg-white/15 overflow-hidden"><div className="h-full bg-white rounded-full" style={{ width: `${(restante / (preg.duracion * 1000)) * 100}%`, transition: 'width .2s linear' }} /></div>
        <p className="text-center text-xs opacity-60 mt-2">Pregunta {t.n} de {t.total} · {Math.ceil(restante / 1000)} s</p>
        <p className="text-center text-xl font-bold mt-2 mb-3 leading-snug">{preg.texto}</p>
        <div className={`flex-1 grid gap-3 ${ops.length > 2 ? 'grid-cols-2 grid-rows-2' : 'grid-cols-1'}`}>
          {ops.map(({ o, i }) => (
            <button key={i} onClick={() => responder(i)} disabled={restante <= 0}
              className="rounded-2xl flex flex-col items-center justify-center gap-2 p-3 text-center font-bold active:scale-95 transition shadow-lg" style={{ background: COLORES[i] }}>
              <span className="text-4xl">{FORMAS[i]}</span>
              <span className="text-[clamp(14px,4.4vw,20px)] leading-tight">{o}</span>
            </button>
          ))}
        </div>
        {pie}
      </div>
    )
  }

  if ((t.fase === 'revelada' || t.fase === 'ranking') && preg) {
    const respondi = t.respondieron.includes(yo.id)
    if (preg.tipo === 'votacion') return (
      <Pantalla><style>{CSS}</style><p className="text-6xl mb-3">🗳️</p><h1 className="text-3xl font-black">{respondi ? '¡Gracias por votar!' : 'No llegaste a votar'}</h1><p className="mt-2 opacity-70">Mirá los resultados en la pantalla</p>{posTxt}{pie}</Pantalla>
    )
    const bien = !!mio?.acerto
    return (
      <div className={`min-h-[100dvh] flex flex-col items-center justify-center text-center text-white px-6`} style={{ background: !respondi ? '#3b1a6e' : bien ? 'linear-gradient(160deg,#16a34a,#065f46)' : 'linear-gradient(160deg,#e21b3c,#7f1d1d)' }}>
        <style>{CSS}</style>
        <p className="text-7xl chip-pop">{!respondi ? '⏰' : bien ? '✔' : '✖'}</p>
        <h1 className="mt-4 text-4xl font-black">{!respondi ? 'No llegaste a responder' : bien ? '¡Correcto!' : 'Incorrecto'}</h1>
        {bien && <p className="mt-2 text-3xl font-black chip-pop">+{mio!.delta.toLocaleString('es-AR')}</p>}
        {!bien && t.correcta != null && <p className="mt-3 opacity-90">Era: <b>{preg.opciones[t.correcta]}</b></p>}
        {posTxt}
        {pie}
      </div>
    )
  }

  return (
    <Pantalla>
      <style>{CSS}</style>
      <p className="text-6xl mb-4 latido-suave">🧠</p>
      <h1 className="text-3xl font-black">¡Trivia!</h1>
      <p className="mt-2 opacity-80">{t.total ? `Preparate para la pregunta ${t.n} de ${t.total}` : 'Ya arrancamos'}</p>
      {posTxt}
      {pie}
    </Pantalla>
  )
}

const FONDO = { background: 'radial-gradient(circle at 20% 0%, #6d28d9 0%, #3b1a6e 40%, #1a0d33 85%)' }
function Pantalla({ children }: { children: React.ReactNode }) {
  return <div className="min-h-[100dvh] flex flex-col items-center justify-center text-center text-white px-6 pb-10" style={FONDO}>{children}</div>
}

const CSS = `
@keyframes chipPop { 0% { transform: scale(.4); opacity: 0 } 70% { transform: scale(1.1); opacity: 1 } 100% { transform: scale(1) } }
@keyframes brillo { 0%,100% { background-position: 0% 50% } 50% { background-position: 100% 50% } }
@keyframes latidoSuave { 0%,100% { transform: scale(1) } 50% { transform: scale(1.12) } }
@keyframes entra { 0% { transform: scale(.3); opacity: 0 } 70% { transform: scale(1.06); opacity: 1 } 100% { transform: scale(1) } }
@keyframes marca { 0% { transform: scale(.7) } 60% { transform: scale(1.15) } 100% { transform: scale(1) } }
.chip-pop { animation: chipPop .5s cubic-bezier(.2,.9,.3,1.3) both }
.titulo-brillo { background: linear-gradient(90deg, #ff4fa3, #fbbf24, #a78bfa, #ff4fa3); background-size: 300% 100%; -webkit-background-clip: text; background-clip: text; color: transparent; animation: brillo 4s ease infinite }
.latido-suave { animation: latidoSuave 1.6s ease-in-out infinite }
.banner-entra { animation: entra .7s cubic-bezier(.2,.9,.3,1.3) both }
.marcado { animation: marca .3s ease-out }
@keyframes llama { 0%,100% { transform: scale(1); box-shadow: 0 0 0 0 rgba(255,255,255,.5) } 50% { transform: scale(1.04); box-shadow: 0 0 0 14px rgba(255,255,255,0) } }
.boton-cantar { animation: llama 1s ease-in-out infinite }
.bola-celu { background: radial-gradient(circle at 35% 30%, #fff 0%, #ffe4f1 45%, #ff9ccc 100%) }
`
