'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import QRCode from 'qrcode'
import type { RealtimeChannel } from '@supabase/supabase-js'
import {
  sbFiesta, canalEntrada, canalSalida, generarCarton, semillaCarton, validarCanto, puntosPor, mezclar,
  TIPOS, tipoLabel, COLORES, FORMAS,
  type FiestaConfig, type Pregunta, type TipoPregunta, type Modo, type FaseTrivia, type EstadoPublico, type MsgJugador, type FilaRanking, type Ganador,
} from '@/lib/fiesta'

// ─── Estado de la laptop (se guarda en el navegador por si se recarga la página) ───
interface HostState {
  modo: Modo
  jugadores: Record<string, { nombre: string; visto: number }>
  bingo: EstadoPublico['bingo']
  trivia: {
    idx: number
    fase: FaseTrivia
    inicio: number
    respuestas: Record<string, Record<string, { op: number; ms: number }>>
    puntos: Record<string, number>
    previos: Record<string, number>
    cierre: number // si se tocó "Últimos 5 segundos": hora en que cierra (0 = al terminar el tiempo)
  }
}
const bingoInicial = (): HostState['bingo'] => ({ salidos: [], fase: 'linea', ganadores: { linea: [], bingo: [] }, cantos: [] })
const triviaInicial = (): HostState['trivia'] => ({ idx: 0, fase: 'espera', inicio: 0, respuestas: {}, puntos: {}, previos: {}, cierre: 0 })
// Hora en que cierra la pregunta: al terminar su tiempo, o antes si se tocó "Últimos 5 segundos"
const limiteDe = (t: HostState['trivia'], q: Pregunta) => Math.min(t.inicio + q.duracion * 1000, t.cierre || Infinity)
const estadoInicial = (): HostState => ({ modo: 'lobby', jugadores: {}, bingo: bingoInicial(), trivia: triviaInicial() })

type Vista = Modo | 'editor'
const ONLINE_MS = 30000

function hablar(texto: string) {
  try { const u = new SpeechSynthesisUtterance(texto); u.lang = 'es-AR'; u.rate = 0.95; speechSynthesis.cancel(); speechSynthesis.speak(u) } catch { /* sin voz */ }
}

export default function HostClient() {
  const [cfg, setCfg] = useState<FiestaConfig | null>(null)
  const cfgRef = useRef<FiestaConfig | null>(null)
  const [error, setError] = useState('')
  const [st, setSt] = useState<HostState>(estadoInicial)
  const stRef = useRef<HostState>(st)
  const [vista, setVista] = useState<Vista>('lobby')
  const [conexion, setConexion] = useState('conectando')
  const [ahora, setAhora] = useState(() => Date.now())
  const [banner, setBanner] = useState<{ tipo: 'linea' | 'bingo'; nombres: string[] } | null>(null)
  const [menu, setMenu] = useState(false)
  const salidaRef = useRef<RealtimeChannel | null>(null)
  const sonidoRef = useRef<AudioContext | null>(null)
  const segRef = useRef(0)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const envioRef = useRef<{ timer: number | null; ultimo: number }>({ timer: null, ultimo: 0 })
  const sb = useMemo(() => sbFiesta(), [])

  const preguntas = cfg?.preguntas ?? []
  const codigo = cfg?.codigo ?? ''
  const urlJugar = typeof window !== 'undefined' && codigo ? `${window.location.origin}/fiesta/${codigo}` : ''

  // ── Config ──
  useEffect(() => {
    fetch('/api/fiesta').then(r => r.json()).then(d => {
      if (d.error) { setError(d.error); return }
      setCfg(d); cfgRef.current = d
      try {
        const g = localStorage.getItem(`fiesta-host-${d.codigo}`)
        if (g) { const s = { ...estadoInicial(), ...JSON.parse(g) } as HostState; stRef.current = s; setSt(s); setVista(s.modo) }
      } catch { /* estado nuevo */ }
    }).catch(() => setError('No se pudo cargar la configuración'))
  }, [])

  async function guardarCfg(cambios: Partial<FiestaConfig> & { nuevoCodigo?: boolean }) {
    const r = await fetch('/api/fiesta', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cambios) })
    const d = await r.json()
    if (!r.ok) throw new Error(d.error || 'No se pudo guardar')
    setCfg(d); cfgRef.current = d
    return d as FiestaConfig
  }

  // ── Estado público + envío (con freno: máx. ~1,5 por segundo, más uno cada 3 s) ──
  const publico = useCallback((s: HostState): EstadoPublico => {
    const pregs = cfgRef.current?.preguntas ?? []
    const q = pregs[s.trivia.idx]
    const abierta = s.trivia.fase === 'pregunta'
    const resp = q ? s.trivia.respuestas[q.id] ?? {} : {}
    const mostrarPregunta = q && ['pregunta', 'revelada', 'ranking'].includes(s.trivia.fase)
    return {
      modo: s.modo,
      bingo: { ...s.bingo, cantos: s.bingo.cantos.slice(-8) },
      trivia: {
        fase: s.trivia.fase,
        n: s.trivia.idx + 1,
        total: pregs.length,
        pregunta: mostrarPregunta ? { id: q.id, tipo: q.tipo, texto: q.texto, opciones: q.opciones, duracion: q.duracion } : null,
        restanteMs: abierta && q ? Math.max(0, limiteDe(s.trivia, q) - Date.now()) : 0,
        correcta: q && !abierta && q.tipo !== 'votacion' ? q.correcta : null,
        respondieron: Object.keys(resp),
        ranking: rankingDe(s, q),
      },
    }
  }, [])

  const enviarYa = useCallback(() => {
    const ch = salidaRef.current
    envioRef.current.ultimo = Date.now()
    if (ch) ch.send({ type: 'broadcast', event: 'estado', payload: publico(stRef.current) }).catch(() => {})
  }, [publico])

  const programarEnvio = useCallback(() => {
    const e = envioRef.current
    if (e.timer) return
    const espera = Math.max(0, 650 - (Date.now() - e.ultimo))
    e.timer = window.setTimeout(() => { e.timer = null; enviarYa() }, espera)
  }, [enviarYa])

  const mutate = useCallback((fn: (s: HostState) => void) => {
    const next = structuredClone(stRef.current)
    fn(next)
    stRef.current = next
    setSt(next)
    const c = cfgRef.current
    if (c) try { localStorage.setItem(`fiesta-host-${c.codigo}`, JSON.stringify(next)) } catch { /* lleno */ }
    programarEnvio()
  }, [programarEnvio])

  // ── Mensajes de los celulares ──
  const recibir = useRef<(m: MsgJugador) => void>(() => {})
  recibir.current = (m: MsgJugador) => {
    const s = stRef.current
    if (m.t === 'hola') {
      const nombre = String(m.nombre || '').trim().slice(0, 24) || 'Sin nombre'
      const prev = s.jugadores[m.id]
      if (prev && prev.nombre === nombre && Date.now() - prev.visto < 20000) {
        prev.visto = Date.now() // latido: no hace falta reenviar todo
        return
      }
      mutate(x => { x.jugadores[m.id] = { nombre, visto: Date.now() } })
      return
    }
    if (!s.jugadores[m.id]) return
    s.jugadores[m.id].visto = Date.now()
    if (m.t === 'resp') {
      const q = cfgRef.current?.preguntas[s.trivia.idx]
      if (!q || q.id !== m.qid || s.trivia.fase !== 'pregunta') { programarEnvio(); return }
      if (s.trivia.respuestas[q.id]?.[m.id]) { programarEnvio(); return } // ya estaba: solo reconfirmar
      const ms = Date.now() - s.trivia.inicio
      if (ms > q.duracion * 1000 + 1500) return
      mutate(x => { (x.trivia.respuestas[q.id] ??= {})[m.id] = { op: Number(m.op), ms } })
      return
    }
    if (m.t === 'canto') procesarCanto(m.id, m.tipo)
  }

  function procesarCanto(id: string, tipo: 'linea' | 'bingo') {
    const s = stRef.current
    const j = s.jugadores[id]
    if (!j || s.bingo.ganadores[tipo].some(g => g.id === id)) return
    const valido = validarCanto(generarCarton(semillaCarton(codigoRef.current, id)), s.bingo.salidos, tipo)
    const bola = s.bingo.salidos.length
    const b = s.bingo
    const primera = b.ganadores[tipo][0]
    // Se acepta si la fase sigue abierta, o si es un empate en la misma bolilla que el primer ganador
    const acepta = valido && (tipo === 'linea' ? (b.fase === 'linea' || primera?.bola === bola) : (b.fase !== 'terminado' || primera?.bola === bola))
    mutate(x => {
      x.bingo.cantos.push({ id, nombre: j.nombre, tipo, valido: acepta, ts: Date.now() })
      if (x.bingo.cantos.length > 40) x.bingo.cantos.splice(0, x.bingo.cantos.length - 40)
      if (acepta) {
        x.bingo.ganadores[tipo].push({ id, nombre: j.nombre, bola })
        if (tipo === 'linea' && x.bingo.fase === 'linea') x.bingo.fase = 'bingo'
        if (tipo === 'bingo') x.bingo.fase = 'terminado'
      }
    })
    if (acepta) {
      const nombres = [...stRef.current.bingo.ganadores[tipo].map(g => g.nombre)]
      setBanner({ tipo, nombres })
      hablar(`¡${tipo === 'linea' ? 'Línea' : 'Bingo'}! ${nombres.join(' y ')}`)
    }
  }
  const codigoRef = useRef('')
  codigoRef.current = codigo

  // ── Canales ──
  useEffect(() => {
    if (!codigo) return
    const entrada = sb.channel(canalEntrada(codigo), { config: { broadcast: { self: false } } })
    entrada.on('broadcast', { event: 'j' }, ({ payload }) => recibir.current(payload as MsgJugador))
    entrada.subscribe(s => setConexion(s === 'SUBSCRIBED' ? 'ok' : s.toLowerCase()))
    const salida = sb.channel(canalSalida(codigo), { config: { broadcast: { self: false } } })
    salida.subscribe(s => { if (s === 'SUBSCRIBED') enviarYa() })
    salidaRef.current = salida
    const vivo = window.setInterval(enviarYa, 3000)
    return () => { window.clearInterval(vivo); sb.removeChannel(entrada); sb.removeChannel(salida); salidaRef.current = null }
  }, [codigo, sb, enviarYa])

  // ── Reloj de la pregunta ──
  const q = preguntas[st.trivia.idx]
  useEffect(() => {
    if (st.trivia.fase !== 'pregunta') return
    const t = window.setInterval(() => {
      const n = Date.now()
      setAhora(n)
      const s = stRef.current
      const preg = cfgRef.current?.preguntas[s.trivia.idx]
      if (!preg || s.trivia.fase !== 'pregunta') return
      const resp = Object.keys(s.trivia.respuestas[preg.id] ?? {}).length
      const online = Object.values(s.jugadores).filter(j => n - j.visto < ONLINE_MS).length
      const limite = limiteDe(s.trivia, preg)
      // Tic-tac cada segundo (en música, solo los últimos 5 para no tapar el tema); más fuerte al final
      const seg = Math.ceil((limite - n) / 1000)
      if (seg > 0 && seg !== segRef.current) {
        segRef.current = seg
        if (preg.tipo !== 'musica' || seg <= 5) pitido(seg % 2 ? 1050 : 780, 0.05, seg <= 5 ? 0.35 : 0.12)
      }
      if (n >= limite || (online > 0 && resp >= online)) cerrarPregunta()
    }, 150)
    return () => window.clearInterval(t)
  }, [st.trivia.fase]) // eslint-disable-line react-hooks/exhaustive-deps

  function cambiarModo(m: Vista) {
    setVista(m)
    if (m !== 'editor') mutate(x => { x.modo = m })
  }

  // ── Bingo ──
  const [girando, setGirando] = useState<number | null>(null)
  function sacarBolilla() {
    const s = stRef.current
    if (girando != null || s.bingo.fase === 'terminado') return
    const quedan = Array.from({ length: 90 }, (_, i) => i + 1).filter(n => !s.bingo.salidos.includes(n))
    if (!quedan.length) return
    const elegida = quedan[crypto.getRandomValues(new Uint32Array(1))[0] % quedan.length]
    let k = 0
    const t = window.setInterval(() => {
      k++
      setGirando(quedan[Math.floor(Math.random() * quedan.length)])
      if (k >= 18) {
        window.clearInterval(t)
        setGirando(null)
        mutate(x => { x.bingo.salidos.push(elegida) })
        hablar(`${elegida}`)
      }
    }, 70)
  }
  function deshacerBolilla() {
    if (!confirm('¿Sacar la última bolilla de la lista?')) return
    mutate(x => { x.bingo.salidos.pop() })
  }
  function reiniciarBingo() {
    if (!confirm('¿Empezar un bingo nuevo? Se borran las bolillas y los ganadores.')) return
    mutate(x => { x.bingo = bingoInicial() })
    setBanner(null)
  }
  // Barra espaciadora = sacar bolilla
  useEffect(() => {
    if (vista !== 'bingo') return
    const h = (e: KeyboardEvent) => { if (e.code === 'Space' && !(e.target instanceof HTMLInputElement)) { e.preventDefault(); sacarBolilla() } }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  })

  // ── Trivia ──
  // Sonidos generados por el navegador (sin archivos). El AudioContext se crea al tocar "Lanzar".
  function pitido(freq: number, dur: number, vol: number, tipo: OscillatorType = 'square') {
    const ctx = sonidoRef.current
    if (!ctx) return
    const o = ctx.createOscillator(), g = ctx.createGain(), t0 = ctx.currentTime
    o.type = tipo; o.frequency.value = freq
    g.gain.setValueAtTime(vol, t0); g.gain.exponentialRampToValueAtTime(0.001, t0 + dur)
    o.connect(g).connect(ctx.destination); o.start(t0); o.stop(t0 + dur + 0.02)
  }
  function lanzarPregunta() {
    try { sonidoRef.current ??= new AudioContext(); sonidoRef.current.resume() } catch { /* sin sonido */ }
    segRef.current = 0
    const preg = preguntas[stRef.current.trivia.idx]
    if (!preg) return
    mutate(x => {
      x.modo = 'trivia'
      x.trivia.fase = 'pregunta'
      x.trivia.inicio = Date.now()
      x.trivia.respuestas[preg.id] = {}
      x.trivia.previos = { ...x.trivia.puntos }
      x.trivia.cierre = 0
    })
    setAhora(Date.now())
    const a = audioRef.current
    if (a) {
      a.pause()
      if (preg.tipo === 'musica' && preg.audio) { a.src = preg.audio; a.currentTime = 0; a.play().catch(() => {}) }
    }
  }
  function cerrarPregunta() {
    const preg = cfgRef.current?.preguntas[stRef.current.trivia.idx]
    if (!preg || stRef.current.trivia.fase !== 'pregunta') return
    pitido(196, 0.6, 0.3, 'sawtooth') // bocina de fin de tiempo
    mutate(x => {
      if (x.trivia.fase !== 'pregunta') return
      x.trivia.fase = 'revelada'
      if (preg.tipo === 'votacion') return
      for (const [pid, r] of Object.entries(x.trivia.respuestas[preg.id] ?? {})) {
        if (r.op === preg.correcta) x.trivia.puntos[pid] = (x.trivia.puntos[pid] ?? 0) + puntosPor(r.ms, preg.duracion * 1000)
      }
    })
  }
  // Les deja 5 segundos más para responder y la pregunta se cierra sola
  function ultimos5() {
    const preg = cfgRef.current?.preguntas[stRef.current.trivia.idx]
    if (!preg) return
    mutate(x => { if (x.trivia.fase === 'pregunta' && limiteDe(x.trivia, preg) - Date.now() > 5000) x.trivia.cierre = Date.now() + 5000 })
  }
  function verRanking() { mutate(x => { x.trivia.fase = 'ranking' }) }
  function siguiente() {
    audioRef.current?.pause()
    mutate(x => {
      if (x.trivia.idx + 1 < preguntas.length) { x.trivia.idx++; x.trivia.fase = 'espera' }
      else x.trivia.fase = 'final'
    })
  }
  function irAPregunta(i: number) { audioRef.current?.pause(); mutate(x => { x.trivia.idx = i; x.trivia.fase = 'espera' }) }
  function reiniciarTrivia() {
    if (!confirm('¿Reiniciar la trivia? Se borran todos los puntos.')) return
    audioRef.current?.pause()
    mutate(x => { x.trivia = triviaInicial() })
  }

  if (error) return <Fondo><div className="h-screen flex items-center justify-center text-xl">{error}</div></Fondo>
  if (!cfg) return <Fondo><div className="h-screen flex items-center justify-center text-xl opacity-70">Cargando…</div></Fondo>

  const online = Object.values(st.jugadores).filter(j => ahora - j.visto < ONLINE_MS * 2).length
  const ranking = rankingDe(st, q)

  return (
    <Fondo>
      <style>{CSS}</style>
      <audio ref={audioRef} preload="auto" />

      {/* Barra superior */}
      <div className="fixed top-0 inset-x-0 z-40 flex items-center gap-2 px-4 py-2.5 opacity-40 hover:opacity-100 transition-opacity">
        <div className="flex gap-1 bg-black/30 rounded-full p-1">
          {([['lobby', 'Ingreso'], ['bingo', 'Bingo'], ['trivia', 'Trivia'], ['editor', 'Preguntas']] as [Vista, string][]).map(([k, l]) => (
            <button key={k} onClick={() => cambiarModo(k)} className={`px-3.5 py-1.5 rounded-full text-sm font-semibold cursor-pointer ${vista === k ? 'bg-white text-[#2a1650]' : 'text-white/80 hover:bg-white/10'}`}>{l}</button>
          ))}
        </div>
        <span className="ml-2 text-sm flex items-center gap-1.5"><span className={`w-2 h-2 rounded-full ${conexion === 'ok' ? 'bg-emerald-400' : 'bg-amber-400 animate-pulse'}`} />{conexion === 'ok' ? 'En vivo' : 'Conectando…'}</span>
        <span className="text-sm opacity-80">· {Object.keys(st.jugadores).length} jugadores</span>
        <div className="ml-auto flex gap-2 relative">
          <button onClick={() => document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen()} className="px-3 py-1.5 rounded-full bg-black/30 text-sm cursor-pointer hover:bg-black/50">Pantalla completa</button>
          <button onClick={() => setMenu(v => !v)} className="px-3 py-1.5 rounded-full bg-black/30 text-sm cursor-pointer hover:bg-black/50">Ajustes</button>
          {menu && (
            <div className="absolute right-0 top-10 w-72 bg-white text-gray-800 rounded-2xl shadow-2xl p-3 space-y-2 text-sm">
              <p className="text-xs text-gray-500">Link para jugar: <b className="break-all">{urlJugar}</b></p>
              <button onClick={async () => { try { await guardarCfg({ activa: !cfg.activa }) } catch (e) { alert((e as Error).message) } }}
                className={`w-full py-2 rounded-xl font-semibold cursor-pointer ${cfg.activa ? 'bg-red-50 text-red-600' : 'bg-emerald-50 text-emerald-700'}`}>
                {cfg.activa ? 'Apagar la fiesta (cierra el link)' : 'Encender la fiesta'}
              </button>
              <button onClick={() => { if (confirm('Borrar jugadores, bingo y trivia de esta pantalla?')) { mutate(x => { Object.assign(x, estadoInicial()) }); setBanner(null); setVista('lobby') } }}
                className="w-full py-2 rounded-xl bg-gray-100 font-semibold cursor-pointer">Reiniciar todo</button>
              <button onClick={async () => { if (confirm('¿Generar un link nuevo? El anterior deja de funcionar y hay que volver a escanear.')) { try { await guardarCfg({ nuevoCodigo: true }) } catch (e) { alert((e as Error).message) } } }}
                className="w-full py-2 rounded-xl bg-gray-100 font-semibold cursor-pointer">Generar link nuevo</button>
            </div>
          )}
        </div>
      </div>

      {!cfg.activa && <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-40 bg-red-500 text-white px-4 py-2 rounded-full text-sm font-semibold">La fiesta está apagada: el link no funciona</div>}

      {vista === 'lobby' && <Lobby url={urlJugar} jugadores={st.jugadores} ahora={ahora} />}
      {vista === 'bingo' && <BingoHost st={st} girando={girando} onSacar={sacarBolilla} onDeshacer={deshacerBolilla} onReiniciar={reiniciarBingo} />}
      {vista === 'trivia' && (
        <TriviaHost st={st} preguntas={preguntas} q={q} ahora={ahora} online={online} ranking={ranking}
          onLanzar={lanzarPregunta} onCerrar={cerrarPregunta} onUltimos5={ultimos5} onRanking={verRanking} onSiguiente={siguiente} onIr={irAPregunta} onReiniciar={reiniciarTrivia} />
      )}
      {vista === 'editor' && <Editor preguntas={preguntas} onGuardar={async p => { await guardarCfg({ preguntas: p }) }} />}

      {banner && <BannerGanador {...banner} onCerrar={() => setBanner(null)} />}
    </Fondo>
  )
}

function rankingDe(s: HostState, q: Pregunta | undefined): FilaRanking[] {
  const resp = q ? s.trivia.respuestas[q.id] ?? {} : {}
  const cerrada = ['revelada', 'ranking'].includes(s.trivia.fase)
  return Object.entries(s.jugadores).map(([id, j]) => {
    const pts = s.trivia.puntos[id] ?? 0
    return {
      id, nombre: j.nombre, pts, delta: pts - (s.trivia.previos[id] ?? 0),
      acerto: cerrada && q && q.tipo !== 'votacion' ? (resp[id]?.op === q.correcta) : null,
    }
  }).sort((a, b) => b.pts - a.pts || a.nombre.localeCompare(b.nombre))
}

// ─── Piezas visuales ────────────────────────────────────────────────────────────
function Fondo({ children }: { children: React.ReactNode }) {
  return <div className="min-h-screen text-white overflow-hidden select-none" style={{ background: 'radial-gradient(circle at 15% 0%, #6d28d9 0%, #3b1a6e 35%, #1a0d33 75%)', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}>{children}</div>
}

function Confeti({ n = 90 }: { n?: number }) {
  const piezas = useMemo(() => Array.from({ length: n }, (_, i) => ({
    left: Math.random() * 100, delay: Math.random() * 2.5, dur: 2.8 + Math.random() * 2.5, color: ['#ff4fa3', '#fbbf24', '#34d399', '#60a5fa', '#a78bfa', '#fff'][i % 6], rot: Math.random() * 360, w: 8 + Math.random() * 8,
  })), [n])
  return <div className="pointer-events-none fixed inset-0 z-50 overflow-hidden">{piezas.map((p, i) => (
    <span key={i} className="confeti" style={{ left: `${p.left}%`, animationDelay: `${p.delay}s`, animationDuration: `${p.dur}s`, background: p.color, width: p.w, height: p.w * 0.45, transform: `rotate(${p.rot}deg)` }} />
  ))}</div>
}

function Lobby({ url, jugadores, ahora }: { url: string; jugadores: HostState['jugadores']; ahora: number }) {
  const [qr, setQr] = useState('')
  useEffect(() => { if (url) QRCode.toDataURL(url, { width: 700, margin: 1, color: { dark: '#1a0d33', light: '#ffffff' } }).then(setQr) }, [url])
  const lista = Object.entries(jugadores).sort((a, b) => a[1].visto - b[1].visto)
  return (
    <div className="min-h-screen flex items-center gap-12 px-16 pt-16 pb-10">
      <div className="shrink-0 text-center">
        <div className="bg-white rounded-[2rem] p-5 shadow-2xl qr-flota">{qr && /* eslint-disable-next-line @next/next/no-img-element */ <img src={qr} alt="QR" className="w-[min(42vh,420px)] h-[min(42vh,420px)]" />}</div>
        <p className="mt-5 text-lg opacity-80">Escaneá con la cámara del celu</p>
        <p className="text-sm opacity-50 break-all max-w-[420px] mx-auto mt-1">{url}</p>
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-2xl font-semibold opacity-80">Beauty Co. cumple</p>
        <h1 className="text-[9vh] leading-none font-black tracking-tight titulo-brillo">9 años</h1>
        <p className="text-3xl mt-6 font-bold">{lista.length} {lista.length === 1 ? 'jugadora' : 'jugadoras'} adentro</p>
        <div className="mt-5 flex flex-wrap gap-2.5 max-h-[45vh] overflow-hidden">
          {lista.map(([id, j]) => (
            <span key={id} className={`chip-pop px-4 py-2 rounded-full text-lg font-semibold ${ahora - j.visto < ONLINE_MS * 2 ? 'bg-white/15' : 'bg-white/5 opacity-50'}`}>{j.nombre}</span>
          ))}
        </div>
      </div>
    </div>
  )
}

function BingoHost({ st, girando, onSacar, onDeshacer, onReiniciar }: { st: HostState; girando: number | null; onSacar: () => void; onDeshacer: () => void; onReiniciar: () => void }) {
  const b = st.bingo
  const ultimo = b.salidos.at(-1)
  const anteriores = b.salidos.slice(-6, -1).reverse()
  const salidos = new Set(b.salidos)
  const fin = b.fase === 'terminado'
  return (
    <div className="min-h-screen flex gap-10 px-12 pt-16 pb-8">
      <div className="flex flex-col items-center justify-center w-[38%] shrink-0">
        <p className="text-2xl font-bold tracking-wide uppercase opacity-80">{fin ? 'Bingo terminado' : b.fase === 'linea' ? 'Jugamos por LÍNEA' : 'Jugamos por BINGO'}</p>
        <div key={girando != null ? 'g' : ultimo} className={`mt-6 w-[min(38vh,380px)] aspect-square rounded-full flex items-center justify-center bola ${girando != null ? '' : 'bola-pop'}`}>
          <span className="text-[min(17vh,170px)] font-black text-[#2a1650] leading-none">{girando ?? ultimo ?? '–'}</span>
        </div>
        <div className="mt-6 flex gap-3 h-16">
          {anteriores.map((n, i) => <span key={n} className="w-16 h-16 rounded-full bg-white/15 flex items-center justify-center text-2xl font-bold" style={{ opacity: 1 - i * 0.15 }}>{n}</span>)}
        </div>
        <button onClick={onSacar} disabled={girando != null || fin || b.salidos.length >= 90}
          className="mt-8 px-10 py-5 rounded-full bg-[#ff4fa3] hover:bg-[#ff3594] disabled:opacity-40 text-2xl font-black shadow-xl cursor-pointer transition active:scale-95">
          {girando != null ? 'Girando…' : 'Sacar bolilla'}
        </button>
        <p className="mt-2 text-sm opacity-50">o barra espaciadora · {b.salidos.length}/90 salieron</p>
        <div className="mt-4 flex gap-3 text-sm">
          <button onClick={onDeshacer} disabled={!b.salidos.length} className="opacity-60 hover:opacity-100 underline cursor-pointer disabled:opacity-20">Deshacer última</button>
          <button onClick={onReiniciar} className="opacity-60 hover:opacity-100 underline cursor-pointer">Bingo nuevo</button>
        </div>
      </div>
      <div className="flex-1 flex flex-col justify-center min-w-0">
        {/* Ancho limitado por el alto de la pantalla, así entran la grilla y los premios en cualquier proyector */}
        <div className="grid grid-cols-10 gap-1.5 mx-auto w-full" style={{ maxWidth: 'calc((100vh - 260px) * 10 / 9)' }}>
          {Array.from({ length: 90 }, (_, i) => i + 1).map(n => (
            <div key={n} className={`aspect-square rounded-xl flex items-center justify-center text-[2.3vh] font-bold transition-all duration-500 ${n === ultimo ? 'bg-[#ff4fa3] text-white scale-110 shadow-lg celda-ultima' : salidos.has(n) ? 'bg-white text-[#2a1650]' : 'bg-white/[0.06] text-white/30'}`}>{n}</div>
          ))}
        </div>
        <div className="mt-6 grid grid-cols-2 gap-4">
          <PremioBox titulo="Línea" ganadores={b.ganadores.linea} />
          <PremioBox titulo="Bingo" ganadores={b.ganadores.bingo} />
        </div>
        {b.cantos.filter(c => !c.valido).slice(-1).map(c => (
          <p key={c.ts} className="mt-3 text-center text-lg opacity-80 chip-pop">{c.nombre} cantó {c.tipo === 'linea' ? 'línea' : 'bingo'}… ¡pero llegó tarde! 😅</p>
        ))}
      </div>
    </div>
  )
}

function PremioBox({ titulo, ganadores }: { titulo: string; ganadores: Ganador[] }) {
  return (
    <div className={`rounded-2xl px-5 py-4 ${ganadores.length ? 'bg-gradient-to-r from-amber-400 to-pink-500' : 'bg-white/[0.06]'}`}>
      <p className="text-sm font-bold uppercase tracking-wider opacity-80">Premio {titulo}</p>
      <p className="text-2xl font-black mt-0.5">{ganadores.length ? ganadores.map(g => g.nombre).join(' y ') : '—'}</p>
    </div>
  )
}

function BannerGanador({ tipo, nombres, onCerrar }: { tipo: 'linea' | 'bingo'; nombres: string[]; onCerrar: () => void }) {
  return (
    <div onClick={onCerrar} className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 cursor-pointer">
      <Confeti />
      <div className="text-center banner-entra">
        <p className="text-[16vh] font-black leading-none titulo-brillo">¡{tipo === 'linea' ? 'LÍNEA' : 'BINGO'}!</p>
        <p className="text-[6vh] font-bold mt-4">{nombres.join(' y ')}</p>
        <p className="mt-6 opacity-60">Tocá para seguir</p>
      </div>
    </div>
  )
}

// ─── Trivia ─────────────────────────────────────────────────────────────────────
function TriviaHost({ st, preguntas, q, ahora, online, ranking, onLanzar, onCerrar, onUltimos5, onRanking, onSiguiente, onIr, onReiniciar }: {
  st: HostState; preguntas: Pregunta[]; q: Pregunta | undefined; ahora: number; online: number; ranking: FilaRanking[]
  onLanzar: () => void; onCerrar: () => void; onUltimos5: () => void; onRanking: () => void; onSiguiente: () => void; onIr: (i: number) => void; onReiniciar: () => void
}) {
  const t = st.trivia
  if (!preguntas.length) return <div className="min-h-screen flex items-center justify-center text-2xl opacity-70">Cargá las preguntas en la pestaña “Preguntas”.</div>
  if (t.fase === 'final') return <Podio ranking={ranking} onReiniciar={onReiniciar} />
  if (!q) return null
  const resp = t.respuestas[q.id] ?? {}
  const nResp = Object.keys(resp).length
  const transcurrido = t.fase === 'pregunta' ? ahora - t.inicio : q.duracion * 1000
  const restanteMs = t.fase === 'pregunta' ? Math.max(0, limiteDe(t, q) - ahora) : 0
  const restante = Math.ceil(restanteMs / 1000)
  const conteo = q.opciones.map((_, i) => Object.values(resp).filter(r => r.op === i).length)
  const opciones = q.opciones.map((o, i) => ({ o, i })).filter(x => x.o.trim())
  const revelada = t.fase === 'revelada' || t.fase === 'ranking'

  if (t.fase === 'espera') return (
    <div className="min-h-screen flex flex-col items-center justify-center px-10 text-center">
      <p className="text-2xl opacity-70 font-semibold">Pregunta {t.idx + 1} de {preguntas.length}</p>
      <p className="mt-3 text-[7vh] font-black leading-tight titulo-brillo">{tipoLabel(q.tipo)}</p>
      {q.tipo === 'musica' && <p className="text-2xl mt-2 opacity-80">🎵 Subí el volumen</p>}
      {q.tipo === 'votacion' && <p className="text-2xl mt-2 opacity-80">No hay respuesta correcta: ¡votá lo que pensás!</p>}
      <button onClick={onLanzar} className="mt-10 px-12 py-5 rounded-full bg-[#ff4fa3] hover:bg-[#ff3594] text-3xl font-black shadow-xl cursor-pointer active:scale-95 transition">Lanzar pregunta</button>
      <div className="mt-10 flex items-center gap-3 text-sm opacity-60">
        <span>Ir a:</span>
        <select value={t.idx} onChange={e => onIr(Number(e.target.value))} className="bg-black/30 rounded-lg px-2 py-1">
          {preguntas.map((p, i) => <option key={p.id} value={i}>{i + 1}. {p.texto.slice(0, 50)}</option>)}
        </select>
        <button onClick={onReiniciar} className="underline cursor-pointer">Reiniciar trivia</button>
      </div>
    </div>
  )

  if (t.fase === 'ranking') return (
    <div className="min-h-screen flex flex-col items-center px-10 pt-20 pb-8">
      <p className="text-[5vh] font-black titulo-brillo">Ranking</p>
      <p className="opacity-60 -mt-1">después de la pregunta {t.idx + 1} de {preguntas.length}</p>
      <div className="w-full max-w-4xl mt-6"><RankingAnimado key={q.id} filas={ranking} /></div>
      <button onClick={onSiguiente} className="mt-auto px-10 py-4 rounded-full bg-[#ff4fa3] hover:bg-[#ff3594] text-2xl font-black cursor-pointer active:scale-95 transition">
        {t.idx + 1 < preguntas.length ? 'Siguiente pregunta' : 'Ver podio'}
      </button>
    </div>
  )

  return (
    <div className="min-h-screen flex flex-col px-10 pt-16 pb-6">
      <div className="flex items-center gap-4">
        <span className="text-lg opacity-60 font-semibold">{t.idx + 1}/{preguntas.length}</span>
        <h2 className="flex-1 text-center text-[4.6vh] font-black leading-tight">{q.texto}</h2>
        <div className="w-24 h-24 shrink-0 relative">
          <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90">
            <circle cx="50" cy="50" r="44" fill="none" stroke="rgba(255,255,255,.15)" strokeWidth="9" />
            <circle cx="50" cy="50" r="44" fill="none" stroke={restante <= 5 ? '#ff4fa3' : '#fff'} strokeWidth="9" strokeLinecap="round"
              strokeDasharray={276.5} strokeDashoffset={276.5 * (t.fase === 'pregunta' ? 1 - restanteMs / (q.duracion * 1000) : 1)} style={{ transition: 'stroke-dashoffset .15s linear' }} />
          </svg>
          <span className={`absolute inset-0 flex items-center justify-center text-3xl font-black ${restante <= 5 && !revelada ? 'latido' : ''}`}>{revelada ? '✓' : restante}</span>
        </div>
      </div>

      <div className="flex-1 flex items-center justify-center gap-8 min-h-0 py-5">
        {revelada && (q.tipo === 'texto' || q.tipo === 'votacion')
          ? <BarrasResultado q={q} conteo={conteo} />
          : <Media q={q} transcurrido={transcurrido} revelada={revelada} />}
        {!revelada && (
          <div className="text-center shrink-0">
            <p className="text-[9vh] font-black leading-none">{nResp}</p>
            <p className="text-lg opacity-70">de {online} respondieron</p>
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-4">
        {opciones.map(({ o, i }) => {
          const ok = q.tipo !== 'votacion' && i === q.correcta
          const max = Math.max(1, ...conteo)
          return (
            <div key={i} className={`relative overflow-hidden rounded-2xl px-6 py-5 flex items-center gap-4 text-[3.2vh] font-bold transition-all duration-500 ${revelada && q.tipo !== 'votacion' && !ok ? 'opacity-30 scale-[0.98]' : ''} ${revelada && ok ? 'ring-8 ring-white/80 scale-[1.02]' : ''}`}
              style={{ background: COLORES[i] }}>
              {revelada && <span className="absolute inset-y-0 left-0 bg-black/20 barra-crece" style={{ width: `${(conteo[i] / max) * 100}%` }} />}
              <span className="relative text-[3.6vh]">{FORMAS[i]}</span>
              <span className="relative flex-1">{o}</span>
              {revelada && <span className="relative text-[3.6vh] font-black">{conteo[i]}</span>}
              {revelada && ok && <span className="relative text-[3.6vh]">✔</span>}
            </div>
          )
        })}
      </div>

      <div className="mt-4 flex justify-center gap-3">
        {t.fase === 'pregunta' && <>
          {restanteMs > 5500 && <button onClick={onUltimos5} className="px-6 py-2.5 rounded-full bg-white/20 hover:bg-white/30 font-bold cursor-pointer">Últimos 5 segundos</button>}
          <button onClick={onCerrar} className="px-5 py-2.5 rounded-full bg-white/10 hover:bg-white/20 text-sm font-semibold cursor-pointer opacity-70">Cerrar ya</button>
        </>}
        {t.fase === 'revelada' && (q.tipo === 'votacion'
          ? <button onClick={onSiguiente} className="px-10 py-4 rounded-full bg-[#ff4fa3] hover:bg-[#ff3594] text-2xl font-black cursor-pointer">{t.idx + 1 < preguntas.length ? 'Siguiente pregunta' : 'Ver podio'}</button>
          : <button onClick={onRanking} className="px-10 py-4 rounded-full bg-[#ff4fa3] hover:bg-[#ff3594] text-2xl font-black cursor-pointer">Ver ranking</button>)}
      </div>
    </div>
  )
}

// Gráfico de barras de cuántos eligieron cada opción (al revelar)
function BarrasResultado({ q, conteo }: { q: Pregunta; conteo: number[] }) {
  const max = Math.max(1, ...conteo)
  return (
    <div className="flex items-end gap-[3vw] h-[34vh]">
      {q.opciones.map((o, i) => o.trim() ? (
        <div key={i} className="flex flex-col items-center justify-end h-full w-[9vw]">
          <span className="text-[4.2vh] font-black mb-1 chip-pop" style={{ animationDelay: `${0.5 + i * 0.12}s` }}>{conteo[i]}</span>
          <div className="w-full rounded-t-2xl podio-sube flex items-start justify-center pt-2 text-[3vh]"
            style={{ height: `${(conteo[i] / max) * 26 + 1.5}vh`, background: COLORES[i], animationDelay: `${i * 0.12}s` }}>{FORMAS[i]}</div>
          <span className="h-[4vh] text-[3.4vh] mt-1">{q.tipo !== 'votacion' && i === q.correcta ? '✔' : ''}</span>
        </div>
      ) : null)}
    </div>
  )
}

function Media({ q, transcurrido, revelada }: { q: Pregunta; transcurrido: number; revelada: boolean }) {
  if (q.tipo === 'imagen' && q.imagen) /* eslint-disable-next-line @next/next/no-img-element */
    return <img src={q.imagen} alt="" className="max-h-[42vh] max-w-[60vw] rounded-2xl shadow-2xl object-contain" />
  if (q.tipo === 'revelar' && q.imagen) return <ImagenOculta q={q} transcurrido={transcurrido} revelada={revelada} />
  if (q.tipo === 'musica') return (
    <div className="flex flex-col items-center">
      {revelada && q.cancion?.artwork
        ? /* eslint-disable-next-line @next/next/no-img-element */ <img src={q.cancion.artwork} alt="" className="w-[30vh] h-[30vh] rounded-2xl shadow-2xl banner-entra" />
        : <div className="flex items-end gap-2 h-[24vh]">{Array.from({ length: 9 }, (_, i) => <span key={i} className="w-6 rounded-full bg-[#ff4fa3] eq" style={{ animationDelay: `${i * 0.11}s` }} />)}</div>}
      {revelada && q.cancion && <p className="mt-4 text-2xl font-bold">{q.cancion.nombre} — {q.cancion.artista}</p>}
    </div>
  )
  return null
}

const COLS = 8, FILAS = 5
function ImagenOculta({ q, transcurrido, revelada }: { q: Pregunta; transcurrido: number; revelada: boolean }) {
  const orden = useMemo(() => mezclar(Array.from({ length: COLS * FILAS }, (_, i) => i), q.id), [q.id])
  // Se destapa hasta el 85% de los cuadros a lo largo del 90% del tiempo; al revelar, todo
  const prog = Math.min(1, transcurrido / (q.duracion * 1000 * 0.9))
  const destapados = revelada ? orden.length : Math.floor(prog * orden.length * 0.85)
  const visibles = new Set(orden.slice(0, destapados))
  return (
    <div className="relative max-h-[42vh] rounded-2xl overflow-hidden shadow-2xl">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={q.imagen} alt="" className="max-h-[42vh] max-w-[60vw] object-contain block" />
      <div className="absolute inset-0 grid" style={{ gridTemplateColumns: `repeat(${COLS}, 1fr)`, gridTemplateRows: `repeat(${FILAS}, 1fr)` }}>
        {Array.from({ length: COLS * FILAS }, (_, i) => (
          <div key={i} className="transition-all duration-700 border border-black/10" style={{ background: '#3b1a6e', opacity: visibles.has(i) ? 0 : 1, transform: visibles.has(i) ? 'scale(0.6) rotate(8deg)' : 'none' }} />
        ))}
      </div>
    </div>
  )
}

function Num({ desde, hasta, activo }: { desde: number; hasta: number; activo: boolean }) {
  const [v, setV] = useState(desde)
  useEffect(() => {
    if (!activo) { setV(desde); return }
    let raf = 0
    const t0 = performance.now()
    const tick = (t: number) => {
      const p = Math.min(1, (t - t0) / 1100)
      setV(Math.round(desde + (hasta - desde) * (1 - Math.pow(1 - p, 3))))
      if (p < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [desde, hasta, activo])
  return <>{v.toLocaleString('es-AR')}</>
}

// Las filas arrancan en el orden de antes de la pregunta y a los 0,8 s se reacomodan al nuevo
// orden (deslizándose), mientras los puntos suben contando.
const FILA = 66, TOP = 8
function RankingAnimado({ filas }: { filas: FilaRanking[] }) {
  const [paso, setPaso] = useState(0)
  useEffect(() => { const t = window.setTimeout(() => setPaso(1), 800); return () => window.clearTimeout(t) }, [])
  const previo = [...filas].sort((a, b) => (b.pts - b.delta) - (a.pts - a.delta) || a.nombre.localeCompare(b.nombre))
  const posAntes = new Map(previo.map((f, i) => [f.id, i]))
  const posAhora = new Map(filas.map((f, i) => [f.id, i]))
  const pos = paso ? posAhora : posAntes
  const visibles = filas.filter(f => posAntes.get(f.id)! < TOP || posAhora.get(f.id)! < TOP)
  const medalla = ['#fbbf24', '#e5e7eb', '#d97706']
  return (
    <div className="relative overflow-hidden" style={{ height: Math.min(TOP, filas.length) * FILA }}>
      {visibles.map(f => {
        const p = pos.get(f.id)!
        return (
          <div key={f.id} className="absolute inset-x-0 flex items-center gap-4 px-5 rounded-2xl bg-white/10" style={{ height: FILA - 10, transform: `translateY(${p * FILA}px)`, transition: 'transform 1s cubic-bezier(.2,.8,.2,1)' }}>
            <span className="w-10 h-10 rounded-full flex items-center justify-center font-black text-lg text-[#2a1650]" style={{ background: p < 3 ? medalla[p] : 'rgba(255,255,255,.7)' }}>{p + 1}</span>
            <span className="flex-1 text-2xl font-bold truncate">{f.nombre}</span>
            {paso === 1 && f.delta > 0 && <span className="chip-pop text-xl font-black text-emerald-300">+{f.delta}</span>}
            <span className="w-32 text-right text-2xl font-black tabular-nums"><Num desde={f.pts - f.delta} hasta={f.pts} activo={paso === 1} /></span>
          </div>
        )
      })}
    </div>
  )
}

function Podio({ ranking, onReiniciar }: { ranking: FilaRanking[]; onReiniciar: () => void }) {
  const [a, b, c] = ranking
  const lugares = [{ f: b, n: 2, h: '42vh', d: '0.9s' }, { f: a, n: 1, h: '56vh', d: '1.8s' }, { f: c, n: 3, h: '30vh', d: '0s' }]
  return (
    <div className="min-h-screen flex flex-col items-center pt-16">
      <Confeti n={120} />
      <p className="text-[6vh] font-black titulo-brillo">¡Felicitaciones!</p>
      <div className="flex-1 flex items-end gap-6 pb-0 w-full max-w-5xl justify-center">
        {lugares.map(({ f, n, h, d }) => f && (
          <div key={n} className="flex-1 flex flex-col items-center">
            <p className="text-[3.2vh] font-black text-center podio-nombre" style={{ animationDelay: `calc(${d} + .6s)` }}>{f.nombre}</p>
            <p className="text-xl opacity-80 podio-nombre" style={{ animationDelay: `calc(${d} + .6s)` }}>{f.pts.toLocaleString('es-AR')} pts</p>
            <div className="w-full rounded-t-3xl mt-3 flex items-start justify-center pt-5 text-[8vh] font-black podio-sube"
              style={{ height: h, animationDelay: d, background: n === 1 ? 'linear-gradient(#fbbf24,#d97706)' : n === 2 ? 'linear-gradient(#e5e7eb,#9ca3af)' : 'linear-gradient(#f59e0b,#92400e)', color: '#2a1650' }}>{n}</div>
          </div>
        ))}
      </div>
      <button onClick={onReiniciar} className="fixed bottom-3 right-4 text-xs opacity-30 hover:opacity-80 underline cursor-pointer">Reiniciar trivia</button>
    </div>
  )
}

// ─── Editor de preguntas ────────────────────────────────────────────────────────
const nuevaPregunta = (tipo: TipoPregunta = 'texto'): Pregunta => ({
  id: Math.random().toString(36).slice(2, 10), tipo, texto: '', opciones: ['', '', '', ''], correcta: 0,
  duracion: TIPOS.find(t => t.tipo === tipo)!.duracion,
})

function Editor({ preguntas, onGuardar }: { preguntas: Pregunta[]; onGuardar: (p: Pregunta[]) => Promise<void> }) {
  const [editando, setEditando] = useState<Pregunta | null>(null)
  const [guardando, setGuardando] = useState(false)
  async function guardar(lista: Pregunta[]) {
    setGuardando(true)
    try { await onGuardar(lista) } catch (e) { alert((e as Error).message) } finally { setGuardando(false) }
  }
  function mover(i: number, d: number) {
    const l = [...preguntas]; const j = i + d
    if (j < 0 || j >= l.length) return
    ;[l[i], l[j]] = [l[j], l[i]]
    guardar(l)
  }
  return (
    <div className="min-h-screen pt-20 pb-10 px-6 overflow-y-auto" style={{ maxHeight: '100vh' }}>
      <div className="max-w-3xl mx-auto bg-white text-gray-800 rounded-3xl p-6 shadow-2xl">
        <div className="flex items-center gap-3 mb-4">
          <h2 className="text-2xl font-black flex-1">Preguntas de la trivia</h2>
          {guardando && <span className="text-sm text-gray-400">Guardando…</span>}
          <button onClick={() => setEditando(nuevaPregunta())} className="px-4 py-2 rounded-xl bg-[#6d28d9] text-white font-semibold cursor-pointer">+ Nueva</button>
        </div>
        {!preguntas.length && <p className="text-gray-500 py-8 text-center">Todavía no hay preguntas.</p>}
        <div className="space-y-2">
          {preguntas.map((p, i) => (
            <div key={p.id} className="flex items-center gap-3 border border-gray-200 rounded-2xl px-4 py-3">
              <span className="text-gray-400 font-bold w-6">{i + 1}</span>
              <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-violet-100 text-violet-700 shrink-0">{tipoLabel(p.tipo)}</span>
              <span className="flex-1 min-w-0 truncate">{p.texto || <i className="text-gray-400">(sin texto)</i>}</span>
              <button onClick={() => mover(i, -1)} className="px-2 text-gray-400 hover:text-gray-700 cursor-pointer">↑</button>
              <button onClick={() => mover(i, 1)} className="px-2 text-gray-400 hover:text-gray-700 cursor-pointer">↓</button>
              <button onClick={() => setEditando(p)} className="px-2 text-violet-600 font-semibold cursor-pointer">Editar</button>
              <button onClick={() => { if (confirm('¿Borrar esta pregunta?')) guardar(preguntas.filter(x => x.id !== p.id)) }} className="px-2 text-red-500 cursor-pointer">Borrar</button>
            </div>
          ))}
        </div>
      </div>
      {editando && (
        <FormPregunta inicial={editando} onCancelar={() => setEditando(null)}
          onOk={p => { const existe = preguntas.some(x => x.id === p.id); guardar(existe ? preguntas.map(x => x.id === p.id ? p : x) : [...preguntas, p]); setEditando(null) }} />
      )}
    </div>
  )
}

function FormPregunta({ inicial, onOk, onCancelar }: { inicial: Pregunta; onOk: (p: Pregunta) => void; onCancelar: () => void }) {
  const [p, setP] = useState<Pregunta>(inicial)
  const [subiendo, setSubiendo] = useState(false)
  const [busca, setBusca] = useState('')
  const [temas, setTemas] = useState<{ nombre: string; artista: string; preview: string; artwork?: string }[] | null>(null)
  const prev = useRef<HTMLAudioElement | null>(null)
  const set = (c: Partial<Pregunta>) => setP(x => ({ ...x, ...c }))
  const conImagen = p.tipo === 'imagen' || p.tipo === 'revelar'

  async function subir(f: File) {
    setSubiendo(true)
    try {
      const fd = new FormData(); fd.append('file', f)
      const r = await fetch('/api/muro/upload', { method: 'POST', body: fd })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || 'No se pudo subir')
      set({ imagen: d.url })
    } catch (e) { alert((e as Error).message) } finally { setSubiendo(false) }
  }
  async function buscar() {
    setTemas(null)
    const r = await fetch(`/api/fiesta/musica?q=${encodeURIComponent(busca)}`)
    const d = await r.json()
    if (!r.ok) { alert(d.error); setTemas([]); return }
    setTemas(d)
  }
  function mezclarOpciones() {
    const orden = mezclar([0, 1, 2, 3], Math.random().toString())
    setP(x => ({ ...x, opciones: orden.map(i => x.opciones[i]), correcta: orden.indexOf(x.correcta) }))
  }
  function ok() {
    if (!p.texto.trim()) return alert('Escribí la pregunta')
    if (p.opciones.filter(o => o.trim()).length < 2) return alert('Poné al menos 2 opciones')
    if (p.tipo !== 'votacion' && !p.opciones[p.correcta]?.trim()) return alert('Marcá cuál es la opción correcta')
    if (conImagen && !p.imagen) return alert('Falta la imagen')
    if (p.tipo === 'musica' && !p.audio) return alert('Elegí una canción')
    prev.current?.pause()
    onOk({ ...p, texto: p.texto.trim(), opciones: p.opciones.map(o => o.trim()) })
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={onCancelar}>
      <div onClick={e => e.stopPropagation()} className="bg-white text-gray-800 rounded-3xl p-6 w-full max-w-2xl max-h-[92vh] overflow-y-auto space-y-4">
        <h3 className="text-xl font-black">Pregunta</h3>
        <div className="grid grid-cols-5 gap-1.5">
          {TIPOS.map(t => (
            <button key={t.tipo} title={t.desc} onClick={() => set({ tipo: t.tipo, duracion: t.duracion })}
              className={`px-2 py-2 rounded-xl text-xs font-semibold cursor-pointer border ${p.tipo === t.tipo ? 'bg-violet-600 text-white border-violet-600' : 'border-gray-200 hover:bg-gray-50'}`}>{t.label}</button>
          ))}
        </div>
        <p className="text-xs text-gray-500 -mt-2">{TIPOS.find(t => t.tipo === p.tipo)?.desc}</p>
        <textarea value={p.texto} onChange={e => set({ texto: e.target.value })} rows={2} placeholder={p.tipo === 'votacion' ? '¿Quién es más probable que llegue tarde a la fiesta?' : p.tipo === 'musica' ? '¿Qué canción es?' : 'Escribí la pregunta'}
          className="w-full border border-gray-200 rounded-xl px-3 py-2.5 outline-none focus:border-violet-500" />

        {conImagen && (
          <div className="space-y-2">
            {p.imagen && /* eslint-disable-next-line @next/next/no-img-element */ <img src={p.imagen} alt="" className="max-h-48 rounded-xl" />}
            <div className="flex gap-2 items-center">
              <label className="px-3 py-2 rounded-xl bg-gray-100 text-sm font-semibold cursor-pointer">{subiendo ? 'Subiendo…' : p.imagen ? 'Cambiar imagen' : 'Subir imagen'}
                <input type="file" accept="image/*" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) subir(f) }} />
              </label>
              <input value={p.imagen ?? ''} onChange={e => set({ imagen: e.target.value })} placeholder="…o pegá el link de una imagen" className="flex-1 border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none" />
            </div>
          </div>
        )}

        {p.tipo === 'musica' && (
          <div className="space-y-2">
            {p.cancion && <p className="text-sm bg-violet-50 rounded-xl px-3 py-2">Elegida: <b>{p.cancion.nombre}</b> — {p.cancion.artista}</p>}
            <div className="flex gap-2">
              <input value={busca} onChange={e => setBusca(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') buscar() }} placeholder="Buscá tema o artista en Apple Music"
                className="flex-1 border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none" />
              <button onClick={buscar} className="px-4 rounded-xl bg-gray-100 font-semibold text-sm cursor-pointer">Buscar</button>
            </div>
            {temas && (
              <div className="max-h-56 overflow-y-auto space-y-1">
                {!temas.length && <p className="text-sm text-gray-400">Sin resultados</p>}
                {temas.map(t => (
                  <div key={t.preview} className="flex items-center gap-2 text-sm border border-gray-100 rounded-xl p-1.5">
                    {t.artwork && /* eslint-disable-next-line @next/next/no-img-element */ <img src={t.artwork} alt="" className="w-10 h-10 rounded-lg" />}
                    <span className="flex-1 min-w-0 truncate"><b>{t.nombre}</b> — {t.artista}</span>
                    <button onClick={() => { const a = prev.current; if (!a) return; if (a.src === t.preview && !a.paused) a.pause(); else { a.src = t.preview; a.play().catch(() => {}) } }} className="px-2 py-1 rounded-lg bg-gray-100 cursor-pointer">▶︎</button>
                    <button onClick={() => {
                      prev.current?.pause()
                      setP(x => ({ ...x, audio: t.preview, cancion: { nombre: t.nombre, artista: t.artista, artwork: t.artwork },
                        opciones: x.opciones.every(o => !o.trim()) ? [`${t.nombre} — ${t.artista}`, '', '', ''] : x.opciones, correcta: x.opciones.every(o => !o.trim()) ? 0 : x.correcta }))
                    }} className="px-2 py-1 rounded-lg bg-violet-600 text-white cursor-pointer">Usar</button>
                  </div>
                ))}
              </div>
            )}
            <audio ref={prev} />
          </div>
        )}

        <div className="space-y-2">
          <div className="flex items-center"><p className="text-sm font-semibold flex-1">Opciones {p.tipo !== 'votacion' && <span className="text-gray-400 font-normal">(tocá el círculo de la correcta)</span>}</p>
            <button onClick={mezclarOpciones} className="text-xs text-violet-600 font-semibold cursor-pointer">Mezclar orden</button></div>
          {p.opciones.map((o, i) => (
            <div key={i} className="flex items-center gap-2">
              <span className="w-8 h-8 rounded-lg flex items-center justify-center text-white text-sm shrink-0" style={{ background: COLORES[i] }}>{FORMAS[i]}</span>
              <input value={o} onChange={e => set({ opciones: p.opciones.map((x, k) => k === i ? e.target.value : x) })} placeholder={i < 2 ? `Opción ${i + 1}` : `Opción ${i + 1} (opcional)`}
                className="flex-1 border border-gray-200 rounded-xl px-3 py-2 outline-none focus:border-violet-500" />
              {p.tipo !== 'votacion' && (
                <button onClick={() => set({ correcta: i })} className={`w-8 h-8 rounded-full border-2 cursor-pointer shrink-0 ${p.correcta === i ? 'bg-emerald-500 border-emerald-500 text-white' : 'border-gray-300'}`}>{p.correcta === i ? '✓' : ''}</button>
              )}
            </div>
          ))}
        </div>

        <label className="flex items-center gap-2 text-sm">Tiempo para responder
          <input type="number" min={5} max={120} value={p.duracion} onChange={e => set({ duracion: Math.max(5, Math.min(120, Number(e.target.value) || 20)) })} className="w-20 border border-gray-200 rounded-lg px-2 py-1" /> segundos
        </label>

        <div className="flex gap-2 justify-end pt-2">
          <button onClick={() => { prev.current?.pause(); onCancelar() }} className="px-4 py-2 rounded-xl bg-gray-100 font-semibold cursor-pointer">Cancelar</button>
          <button onClick={ok} className="px-5 py-2 rounded-xl bg-violet-600 text-white font-semibold cursor-pointer">Guardar</button>
        </div>
      </div>
    </div>
  )
}

const CSS = `
@keyframes pop { 0% { transform: scale(0) rotate(-40deg) } 60% { transform: scale(1.15) rotate(8deg) } 100% { transform: scale(1) rotate(0) } }
@keyframes chipPop { 0% { transform: scale(.4); opacity: 0 } 70% { transform: scale(1.08); opacity: 1 } 100% { transform: scale(1) } }
@keyframes caer { 0% { transform: translateY(-10vh) rotate(0) } 100% { transform: translateY(110vh) rotate(720deg) } }
@keyframes brillo { 0%,100% { background-position: 0% 50% } 50% { background-position: 100% 50% } }
@keyframes flota { 0%,100% { transform: translateY(0) } 50% { transform: translateY(-8px) } }
@keyframes latido { 0%,100% { transform: scale(1) } 50% { transform: scale(1.25) } }
@keyframes eq { 0%,100% { height: 15% } 50% { height: 100% } }
@keyframes entra { 0% { transform: scale(.3); opacity: 0 } 70% { transform: scale(1.06); opacity: 1 } 100% { transform: scale(1) } }
@keyframes crece { from { width: 0 } }
@keyframes sube { from { transform: scaleY(0) } to { transform: scaleY(1) } }
@keyframes aparece { from { opacity: 0; transform: translateY(20px) } to { opacity: 1; transform: none } }
@keyframes ultima { 0%,100% { box-shadow: 0 0 0 0 rgba(255,79,163,.7) } 50% { box-shadow: 0 0 0 10px rgba(255,79,163,0) } }
.bola { background: radial-gradient(circle at 35% 30%, #fff 0%, #ffe4f1 45%, #ff9ccc 100%); box-shadow: 0 30px 80px rgba(255,79,163,.45), inset -14px -18px 40px rgba(0,0,0,.12) }
.bola-pop { animation: pop .7s cubic-bezier(.2,.9,.3,1.3) }
.chip-pop { animation: chipPop .5s cubic-bezier(.2,.9,.3,1.3) both }
.confeti { position: absolute; top: -5vh; border-radius: 2px; animation-name: caer; animation-timing-function: linear; animation-iteration-count: infinite }
.titulo-brillo { background: linear-gradient(90deg, #ff4fa3, #fbbf24, #a78bfa, #ff4fa3); background-size: 300% 100%; -webkit-background-clip: text; background-clip: text; color: transparent; animation: brillo 4s ease infinite }
.qr-flota { animation: flota 4s ease-in-out infinite }
.latido { animation: latido .6s ease-in-out infinite }
.eq { height: 20%; animation: eq .9s ease-in-out infinite }
.banner-entra { animation: entra .7s cubic-bezier(.2,.9,.3,1.3) both }
.barra-crece { animation: crece 1s ease-out both }
.podio-sube { transform-origin: bottom; animation: sube 1s cubic-bezier(.2,.9,.3,1.1) both }
.podio-nombre { animation: aparece .6s ease-out both }
.celda-ultima { animation: ultima 1.2s ease-out infinite }
`
