'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { sbFiesta, canalEntrada, canalSalida, generarCarton, semillaCarton, validarCanto, COLORES, FORMAS, type EstadoPublico, type EstadoImpostor, type MsgJugador } from '@/lib/fiesta'
import { ImagenOculta } from '../compartido'

// Pantalla completa (en Android oculta las barras del navegador; en iPhone no está disponible)
function pantallaCompleta() {
  try {
    const d = document.documentElement
    if (!document.fullscreenElement && d.requestFullscreen) d.requestFullscreen({ navigationUI: 'hide' }).catch(() => {})
  } catch { /* no disponible */ }
}

const nuevoId = () => (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2) + Date.now().toString(36))

export default function JugadorClient({ codigo }: { codigo: string }) {
  const KEY = `fiesta-jugador-${codigo}`
  const [yo, setYo] = useState<{ id: string; nombre: string } | null>(null)
  const [cargado, setCargado] = useState(false)
  const [nombre, setNombre] = useState('')
  const [cambiando, setCambiando] = useState(false) // pantalla del nombre sin perder la sesión
  const [errorNombre, setErrorNombre] = useState('')
  const [estado, setEstado] = useState<EstadoPublico | null>(null)
  const [limite, setLimite] = useState(0) // hora local en que cierra la pregunta
  const [ahora, setAhora] = useState(() => Date.now())
  const [conectado, setConectado] = useState(false)
  const [miResp, setMiResp] = useState<{ qid: string; lanz: number; op: number } | null>(null)
  // Marcas y cantos van atados a la partida + ronda del bingo (tag), así un bingo nuevo arranca limpio
  const [marcas, setMarcas] = useState<{ tag: string; nums: number[] }>({ tag: '', nums: [] })
  const [cantando, setCantando] = useState<{ tipo: 'linea' | 'bingo'; ts: number; tag: string } | null>(null)
  const [inicioQ, setInicioQ] = useState(0) // hora local en que arrancó la pregunta (para la imagen oculta)
  const [miVoto, setMiVoto] = useState<{ ronda: number; a: string } | null>(null)
  const [avisoSalir, setAvisoSalir] = useState(false)
  const [completa, setCompleta] = useState(true)
  const sb = useMemo(() => sbFiesta(), [])
  const entradaRef = useRef<RealtimeChannel | null>(null)
  const socketRef = useRef(false)

  useEffect(() => {
    try {
      const g = localStorage.getItem(KEY); if (g) setYo(JSON.parse(g))
      const m = localStorage.getItem(`${KEY}-marcas`); if (m) { const v = JSON.parse(m); if (v?.tag) setMarcas(v) }
      const r = localStorage.getItem(`${KEY}-resp`); if (r) setMiResp(JSON.parse(r))
    } catch { /* nada guardado */ }
    setCargado(true)
  }, [KEY])

  // Que no se salga del juego sin querer: el gesto/botón "atrás" no sale (avisa), recargar o cerrar pide
  // confirmación, la pantalla no se apaga y no se recarga al deslizar hacia abajo
  useEffect(() => {
    history.pushState({ fiesta: 1 }, '')
    const atras = () => { history.pushState({ fiesta: 1 }, ''); setAvisoSalir(true); window.setTimeout(() => setAvisoSalir(false), 3500) }
    const antesDeSalir = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = '' }
    window.addEventListener('popstate', atras)
    window.addEventListener('beforeunload', antesDeSalir)
    let lock: { release: () => Promise<void> } | null = null
    const despierta = async () => {
      if (document.visibilityState !== 'visible') return
      try { lock = await (navigator as Navigator & { wakeLock?: { request: (t: 'screen') => Promise<{ release: () => Promise<void> }> } }).wakeLock?.request('screen') ?? null } catch { /* no disponible */ }
    }
    despierta()
    document.addEventListener('visibilitychange', despierta)
    // Al primer toque se pasa a pantalla completa (el navegador solo lo permite después de un toque)
    const primerToque = () => { pantallaCompleta(); despierta() }
    window.addEventListener('pointerdown', primerToque, { once: true })
    const cambio = () => setCompleta(!!document.fullscreenElement || !document.fullscreenEnabled)
    cambio()
    document.addEventListener('fullscreenchange', cambio)
    const html = document.documentElement, prev = html.style.overscrollBehavior
    html.style.overscrollBehavior = 'none'; document.body.style.overscrollBehavior = 'none'
    return () => {
      window.removeEventListener('popstate', atras)
      window.removeEventListener('beforeunload', antesDeSalir)
      document.removeEventListener('visibilitychange', despierta)
      window.removeEventListener('pointerdown', primerToque)
      document.removeEventListener('fullscreenchange', cambio)
      lock?.release().catch(() => {})
      html.style.overscrollBehavior = prev; document.body.style.overscrollBehavior = ''
    }
  }, [])

  // Envío a la laptop: por REST (sin unirse al canal); si falla, uniéndose al canal
  async function enviar(msg: MsgJugador) {
    const ch = entradaRef.current
    if (!ch) return
    const m: MsgJugador = { ...msg, p: localStorage.getItem(`${KEY}-partida`) ?? undefined }
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
      const guardada = localStorage.getItem(`${KEY}-partida`)
      if (e.partida && guardada && guardada !== e.partida) {
        // En la laptop se tocó "Reiniciar todo": se borra todo lo de este celular y vuelve a pedir el nombre
        for (const k of [KEY, `${KEY}-marcas`, `${KEY}-resp`, `${KEY}-partida`]) localStorage.removeItem(k)
        setYo(null); setNombre(''); setCambiando(false); setErrorNombre(''); setEstado(null); setMiResp(null); setMarcas({ tag: '', nums: [] }); setCantando(null)
        return
      }
      if (e.partida && guardada !== e.partida) localStorage.setItem(`${KEY}-partida`, e.partida)
      // Ese nombre ya lo tiene otra persona: se vuelve a pedir (se compara también el nombre, para no
      // tomar un estado viejo que llegue justo después de elegir otro)
      if (e.rechazos?.some(r => r.id === yo.id && r.nombre === yo.nombre)) {
        setErrorNombre(`Ya hay alguien que se llama “${yo.nombre}”. Agregá tu apellido o una inicial.`)
        setNombre(yo.nombre)
        setCambiando(true)
      }
      setEstado(e)
      if (e.trivia.fase === 'pregunta') { setLimite(Date.now() + e.trivia.restanteMs); setInicioQ(Date.now() - (e.trivia.transcurridoMs ?? 0)) }
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
  }, [yo, codigo, sb, KEY])

  // Reloj local para la cuenta regresiva
  const enPregunta = estado?.modo === 'trivia' && estado.trivia.fase === 'pregunta'
  useEffect(() => {
    if (!enPregunta) return
    const t = window.setInterval(() => setAhora(Date.now()), 200)
    return () => window.clearInterval(t)
  }, [enPregunta])

  // Reintenta la respuesta hasta que la laptop la confirme
  const preg = estado?.trivia.pregunta
  const lanz = estado?.trivia.lanz ?? 0
  const confirmada = !!yo && !!estado?.trivia.respondieron.includes(yo.id)
  useEffect(() => {
    if (!yo || !enPregunta || !preg || !miResp || miResp.qid !== preg.id || miResp.lanz !== lanz || confirmada) return
    const t = window.setInterval(() => enviarRef.current({ t: 'resp', id: yo.id, qid: miResp.qid, op: miResp.op }), 1500)
    return () => window.clearInterval(t)
  }, [yo, enPregunta, preg, miResp, lanz, confirmada])

  // Reintenta el voto del impostor hasta que la laptop lo confirme
  const imp = estado?.impostor
  const votoConfirmado = !!yo && !!imp?.votaron.includes(yo.id)
  const faseImp = imp?.fase, rondaImp = imp?.ronda
  useEffect(() => {
    if (!yo || faseImp !== 'votacion' || !miVoto || miVoto.ronda !== rondaImp || votoConfirmado) return
    const t = window.setInterval(() => enviarRef.current({ t: 'voto', id: yo.id, ronda: miVoto.ronda, a: miVoto.a }), 1500)
    return () => window.clearInterval(t)
  }, [yo, faseImp, rondaImp, miVoto, votoConfirmado])
  function votar(a: string) {
    if (!yo || !imp) return
    setMiVoto({ ronda: imp.ronda, a })
    navigator.vibrate?.(30)
    enviar({ t: 'voto', id: yo.id, ronda: imp.ronda, a })
  }

  function entrar() {
    pantallaCompleta()
    const n = nombre.trim().slice(0, 24)
    if (!n) return
    // Mismo id siempre (también al cambiar el nombre): es la misma persona, no se duplica
    const j = { id: yo?.id ?? nuevoId(), nombre: n }
    setErrorNombre('')
    setCambiando(false)
    localStorage.setItem(KEY, JSON.stringify(j))
    setYo(j)
  }
  function responder(op: number) {
    if (!yo || !preg) return
    const r = { qid: preg.id, lanz, op }
    setMiResp(r)
    try { localStorage.setItem(`${KEY}-resp`, JSON.stringify(r)) } catch { /* nada */ }
    navigator.vibrate?.(30)
    enviar({ t: 'resp', id: yo.id, qid: preg.id, op })
  }
  function marcar(n: number, tag: string) {
    setMarcas(m => {
      const base = m.tag === tag ? m.nums : []
      const x = { tag, nums: base.includes(n) ? base.filter(v => v !== n) : [...base, n] }
      try { localStorage.setItem(`${KEY}-marcas`, JSON.stringify(x)) } catch { /* nada */ }
      return x
    })
  }
  function cantar(tipo: 'linea' | 'bingo', tag: string) {
    if (!yo) return
    setCantando({ tipo, ts: Date.now(), tag })
    navigator.vibrate?.([40, 40, 40])
    enviar({ t: 'canto', id: yo.id, tipo })
  }

  if (!cargado) return <Pantalla><p className="opacity-60">Cargando…</p></Pantalla>

  if (!yo || cambiando) return (
    <Pantalla>
      <style>{CSS}</style>
      <p className="text-lg opacity-80">Beauty Co. cumple</p>
      <h1 className="text-6xl font-black titulo-brillo">9 años</h1>
      <p className="mt-8 mb-3 text-lg font-bold text-white">¿Cómo te llamás?</p>
      <input value={nombre} onChange={e => setNombre(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') entrar() }} maxLength={24} autoFocus
        placeholder="Nombre y apellido o inicial" style={{ colorScheme: 'light' }} className="w-full max-w-xs text-center text-xl px-4 py-3.5 rounded-2xl bg-white text-gray-900 placeholder:text-gray-400 caret-[#ff4fa3] outline-none shadow-lg" />
      <button onClick={entrar} disabled={!nombre.trim()} className="mt-4 w-full max-w-xs py-4 rounded-2xl bg-[#ff4fa3] text-xl font-black disabled:opacity-40 active:scale-95 transition">{yo ? 'Listo' : 'Entrar'}</button>
      {errorNombre && <p className="mt-4 max-w-xs text-[15px] font-semibold text-amber-300 chip-pop">{errorNombre}</p>}
      {yo && !errorNombre && <button onClick={() => { setNombre(yo.nombre); setCambiando(false) }} className="mt-4 text-sm opacity-60 underline">Cancelar</button>}
    </Pantalla>
  )

  const cambiarNombre = <button onClick={() => { setNombre(yo.nombre); setErrorNombre(''); setCambiando(true) }} className="text-xs opacity-40 underline">Cambiar nombre</button>
  const pie = (
    <>
      {avisoSalir && <div className="fixed top-3 inset-x-3 z-50 rounded-2xl bg-white text-[#2a1650] px-4 py-3 text-sm font-semibold shadow-2xl chip-pop">Seguís en el juego. Si de verdad querés salir, cerrá la pestaña.</div>}
      <div className="fixed bottom-0 inset-x-0 flex items-center justify-between gap-3 px-4 py-2 text-xs">
        <span className="flex items-center gap-1.5 opacity-60 min-w-0 truncate"><span className={`w-2 h-2 rounded-full shrink-0 ${conectado ? 'bg-emerald-400' : 'bg-amber-400 animate-pulse'}`} />{yo.nombre}</span>
        {!completa && <button onClick={pantallaCompleta} className="px-2.5 py-1 rounded-full bg-white/15 font-semibold">Pantalla completa</button>}
        {cambiarNombre}
      </div>
    </>
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
    const b = estado.bingo
    const ronda = b.ronda ?? 0
    const tag = `${estado.partida}:${ronda}`
    const carton = generarCarton(semillaCarton(codigo, estado.partida, ronda, yo.id))
    const misMarcas = marcas.tag === tag ? marcas.nums : []
    const canto = cantando?.tag === tag ? cantando : null
    const ultimos = b.salidos.slice(-5).reverse()
    const miCanto = canto ? [...b.cantos].reverse().find(c => c.id === yo.id && c.tipo === canto.tipo && c.ts >= canto.ts - 60000) : undefined
    const gane = (['linea', 'bingo'] as const).filter(t => b.ganadores[t].some(g => g.id === yo.id))
    // Los botones para cantar solo aparecen si de verdad tiene línea/bingo con las bolillas que salieron.
    // La línea también se puede cantar si otra la ganó con esta misma bolilla (empate).
    const empateLinea = b.ganadores.linea[0]?.bola === b.salidos.length
    const puedeLinea = !gane.includes('linea') && (b.fase === 'linea' || (b.fase === 'bingo' && empateLinea)) && validarCanto(carton, b.salidos, 'linea')
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
                : <button key={c} onClick={() => marcar(n, tag)}
                  className={`aspect-[3/4] rounded-md flex items-center justify-center text-[clamp(14px,4.6vw,22px)] font-black transition active:scale-90 ${misMarcas.includes(n) ? 'bg-[#ff4fa3] text-white marcado' : 'bg-white text-[#2a1650] border border-gray-200'}`}>{n}</button>)}
            </div>
          ))}
        </div>
        <p className="text-center text-xs opacity-60 mt-2">Tocá los números para marcarlos</p>
        {gane.includes('bingo') ? (
          <div className="mt-5 text-center banner-entra"><p className="text-4xl font-black titulo-brillo">¡Ganaste el BINGO!</p><p className="opacity-80 mt-1">Acercate a buscar tu premio 🎁</p></div>
        ) : <>
          {/* Quien gana la línea sigue jugando por el bingo con el mismo cartón */}
          {gane.includes('linea') && (
            <div className="mt-4 text-center banner-entra"><p className="text-3xl font-black"><span className="titulo-brillo">¡Ganaste la LÍNEA!</span> 🎁</p><p className="opacity-80 text-sm mt-1">Seguís jugando: todavía podés ganar el BINGO</p></div>
          )}
          {(puedeBingo || puedeLinea) ? (
            <div className="mt-5 space-y-3">
              {puedeBingo
                ? <button onClick={() => cantar('bingo', tag)} disabled={canto?.tipo === 'bingo'} className="w-full py-6 rounded-2xl bg-[#ff4fa3] text-3xl font-black active:scale-95 transition boton-cantar">¡CANTAR BINGO!</button>
                : <button onClick={() => cantar('linea', tag)} disabled={canto?.tipo === 'linea'} className="w-full py-6 rounded-2xl bg-[#1368ce] text-3xl font-black active:scale-95 transition boton-cantar">¡CANTAR LÍNEA!</button>}
              <p className="text-center text-sm opacity-80">¡Rápido, antes que alguien más!</p>
            </div>
          ) : b.fase !== 'terminado' && (
            <p className="mt-5 text-center text-sm opacity-70">{b.fase === 'linea' ? 'Cuando completes una fila entera vas a poder cantar LÍNEA' : 'Cuando completes todo el cartón vas a poder cantar BINGO'}</p>
          )}
        </>}
        {canto && !gane.includes(canto.tipo) && (puedeBingo || puedeLinea || miCanto) && (
          <p className="mt-3 text-center font-semibold chip-pop">{!miCanto ? 'Cantando…' : miCanto.valido ? '¡Correcto!' : 'Uy, alguien cantó primero 😅'}</p>
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

  if (estado.modo === 'impostor' && imp) return <ImpostorJugador im={imp} yoId={yo.id} miVoto={miVoto?.ronda === imp.ronda ? miVoto.a : null} confirmado={votoConfirmado} onVotar={votar} pie={pie} />

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
    const yaRespondi = miResp?.qid === preg.id && miResp.lanz === t.lanz
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
        {/* La imagen también se ve en el celu (por si no hay proyector) */}
        {preg.imagen && (
          <div className="flex justify-center mb-3 shrink-0">
            {preg.tipo === 'revelar'
              ? <ImagenOculta id={preg.id} imagen={preg.imagen} duracion={preg.duracion} transcurrido={ahora - inicioQ} revelada={false} clase="max-h-[32dvh] max-w-full" />
              : /* eslint-disable-next-line @next/next/no-img-element */ <img src={preg.imagen} alt="" className="max-h-[32dvh] max-w-full rounded-2xl object-contain shadow-2xl" />}
          </div>
        )}
        {preg.tipo === 'musica' && <p className="text-center text-sm opacity-80 mb-3">🎵 Escuchá el tema que está sonando</p>}
        <div className={`flex-1 grid gap-3 min-h-[38dvh] ${ops.length > 2 ? 'grid-cols-2 grid-rows-2' : 'grid-cols-1'}`}>
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
      <h1 className="text-3xl font-black">{t.nombre || '¡Trivia!'}</h1>
      <p className="mt-2 opacity-80">{t.total ? `Preparate para la pregunta ${t.n} de ${t.total}` : 'Ya arrancamos'}</p>
      {posTxt}
      {pie}
    </Pantalla>
  )
}

// ─── Impostor (celular) ─────────────────────────────────────────────────────────
function ImpostorJugador({ im, yoId, miVoto, confirmado, onVotar, pie }: {
  im: EstadoImpostor; yoId: string; miVoto: string | null; confirmado: boolean; onVotar: (a: string) => void; pie: React.ReactNode
}) {
  const rol = im.roles[yoId] // undefined = no juega esta ronda
  const soyImpostor = rol === ''
  const lugar = im.orden.findIndex(j => j.id === yoId)

  if (im.fase === 'config' || (rol === undefined && im.fase !== 'resultado')) return (
    <Pantalla>
      <style>{CSS}</style>
      <p className="text-6xl mb-4 latido-suave">🕵️</p>
      <h1 className="text-4xl font-black titulo-brillo">El impostor</h1>
      <p className="mt-3 text-lg opacity-80">{im.fase === 'config' ? 'Esperá a que repartan los roles' : 'Esta ronda ya arrancó: entrás en la próxima'}</p>
      {pie}
    </Pantalla>
  )

  if (im.fase === 'roles') return (
    <Pantalla>
      <style>{CSS}</style>
      <CartaRol soyImpostor={soyImpostor} palabra={rol ?? ''} categoria={!soyImpostor || im.pista ? im.categoria : ''} cantidad={im.cantidad} />
      {lugar >= 0 && <p className="mt-6 text-lg">{lugar === 0 ? <b>¡Empezás vos!</b> : <>Hablás en el lugar <b className="text-2xl">{lugar + 1}</b> · empieza {im.orden[0]?.nombre}</>}</p>}
      <p className="mt-1 text-sm opacity-60">Cuando te toque, decí una palabra relacionada{soyImpostor ? ' (¡que no te descubran!)' : ' sin regalarla'}</p>
      {pie}
    </Pantalla>
  )

  if (im.fase === 'votacion') {
    if (miVoto) {
      const a = im.orden.find(j => j.id === miVoto)
      return (
        <Pantalla>
          <style>{CSS}</style>
          <p className="text-6xl mb-3 chip-pop">🗳️</p>
          <h1 className="text-3xl font-black">{confirmado ? 'Voto enviado' : 'Enviando…'}</h1>
          <p className="mt-2 text-lg opacity-80">Votaste a <b>{a?.nombre}</b></p>
          <p className="mt-1 opacity-60">Esperá el resultado 👀</p>
          {pie}
        </Pantalla>
      )
    }
    return (
      <div className="min-h-[100dvh] text-white px-4 pt-6 pb-14" style={FONDO}>
        <style>{CSS}</style>
        <h1 className="text-center text-3xl font-black titulo-brillo">¿Quién es el impostor?</h1>
        <p className="text-center opacity-70 mt-1 mb-5">Tocá a quien quieras votar</p>
        <div className="grid grid-cols-2 gap-2.5">
          {im.orden.filter(j => j.id !== yoId).map(j => (
            <button key={j.id} onClick={() => onVotar(j.id)} className="rounded-2xl bg-white/15 active:bg-[#ff4fa3] active:scale-95 transition px-3 py-4 text-lg font-bold break-words">{j.nombre}</button>
          ))}
        </div>
        {pie}
      </div>
    )
  }

  // Resultado
  const res = im.resultado
  if (!res) return <Pantalla><style>{CSS}</style><p className="opacity-70">Mirá la pantalla…</p>{pie}</Pantalla>
  const max = Math.max(0, ...res.votos.map(v => v.n))
  const top = res.votos.filter(v => v.n === max && v.n > 0)
  const huboVotos = res.votos.length > 0
  const atrapado = huboVotos && top.length === 1 && res.impostores.some(i => i.id === top[0].id)
  const yoAtrapado = huboVotos && top.length === 1 && top[0].id === yoId
  const titulo = rol === undefined ? 'Resultado'
    : soyImpostor ? (yoAtrapado ? '¡Te descubrieron!' : huboVotos ? '¡Zafaste! 😈' : 'Eras el impostor')
    : !huboVotos ? 'Resultado' : atrapado ? '¡Lo encontraron! 🎉' : '¡Ganaron los impostores!'
  return (
    <Pantalla>
      <style>{CSS}</style>
      <h1 className="text-4xl font-black titulo-brillo">{titulo}</h1>
      <p className="mt-5 opacity-80">{res.impostores.length === 1 ? 'El impostor era' : 'Los impostores eran'}</p>
      <p className="text-3xl font-black">{res.impostores.map(i => i.nombre).join(' y ')}</p>
      <p className="mt-4 opacity-80">La palabra era</p>
      <p className="text-3xl font-black px-4 py-1 rounded-xl bg-white text-[#2a1650] mt-1">{res.palabra}</p>
      {huboVotos && (
        <div className="mt-6 w-full max-w-xs space-y-1 text-left">
          {res.votos.slice(0, 5).map(v => <p key={v.id} className="flex justify-between gap-3"><span className="truncate">{v.nombre}</span><b>{v.n} {v.n === 1 ? 'voto' : 'votos'}</b></p>)}
        </div>
      )}
      {pie}
    </Pantalla>
  )
}

// El rol se ve solo mientras se mantiene apretado, así nadie lo espía de costado
function CartaRol({ soyImpostor, palabra, categoria, cantidad }: { soyImpostor: boolean; palabra: string; categoria: string; cantidad: number }) {
  const [ver, setVer] = useState(false)
  const [visto, setVisto] = useState(false)
  const mostrar = () => { setVer(true); setVisto(true); navigator.vibrate?.(20) }
  return (
    <div className="w-full max-w-xs">
      <button
        onPointerDown={mostrar} onPointerUp={() => setVer(false)} onPointerLeave={() => setVer(false)} onPointerCancel={() => setVer(false)}
        onContextMenu={e => e.preventDefault()}
        className={`w-full aspect-[3/4] rounded-3xl shadow-2xl flex flex-col items-center justify-center p-5 transition-colors ${ver ? (soyImpostor ? 'bg-[#e21b3c]' : 'bg-white text-[#2a1650]') : 'bg-white/10 border-2 border-dashed border-white/30'}`}
        style={{ touchAction: 'none', WebkitTouchCallout: 'none' }}>
        {!ver ? <>
          <span className="text-6xl">👆</span>
          <span className="mt-4 text-xl font-black">Mantené apretado para ver tu rol</span>
          <span className="mt-2 text-sm opacity-70">Que nadie vea tu pantalla</span>
        </> : soyImpostor ? <>
          <span className="text-6xl">🕵️</span>
          <span className="mt-3 text-4xl font-black">Sos el IMPOSTOR</span>
          {categoria && <span className="mt-3 text-lg">Categoría: <b>{categoria}</b></span>}
          <span className="mt-3 text-sm opacity-90">No sabés la palabra: escuchá y disimulá{cantidad > 1 ? `. Hay ${cantidad} impostores` : ''}</span>
        </> : <>
          {categoria && <span className="text-sm font-bold uppercase tracking-wider opacity-60">{categoria}</span>}
          <span className="mt-2 text-[clamp(28px,10vw,44px)] font-black leading-tight break-words">{palabra}</span>
          <span className="mt-4 text-sm opacity-70">Hay {cantidad === 1 ? '1 impostor' : `${cantidad} impostores`} que no la saben</span>
        </>}
      </button>
      {visto && !ver && <p className="mt-3 text-sm opacity-60">Podés volver a mirarlo cuando quieras</p>}
    </div>
  )
}

const FONDO = { background: 'radial-gradient(circle at 20% 0%, #6d28d9 0%, #3b1a6e 40%, #1a0d33 85%)' }
function Pantalla({ children }: { children: React.ReactNode }) {
  return <div className="min-h-[100dvh] flex flex-col items-center justify-center text-center text-white px-6 pb-10" style={FONDO}>{children}</div>
}

const CSS = `
html, body { overscroll-behavior: none; -webkit-tap-highlight-color: transparent; }
button { touch-action: manipulation; -webkit-user-select: none; user-select: none; -webkit-touch-callout: none; }
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
