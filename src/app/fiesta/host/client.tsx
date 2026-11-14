'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import QRCode from 'qrcode'
import type { RealtimeChannel } from '@supabase/supabase-js'
import {
  sbFiesta, canalEntrada, canalSalida, generarCarton, semillaCarton, validarCanto, puntosPor, mezclar, triviaDe, normalizarNombre,
  TIPOS, tipoLabel, COLORES, FORMAS,
  type FiestaConfig, type Pregunta, type TipoPregunta, type Modo, type FaseTrivia, type EstadoPublico, type MsgJugador, type FilaRanking, type Ganador, type Trivia,
  type FaseImpostor, type EstadoImpostor,
} from '@/lib/fiesta'
import { PLANTILLAS, type Plantilla } from '@/lib/fiesta-ejemplo'
import { CATEGORIAS_IMPOSTOR, MIS_PALABRAS, TODAS, elegirPalabra } from '@/lib/fiesta-impostor'
import { ImagenOculta } from '../compartido'

// Pregunta de imagen sin imagen o de música sin canción (no se puede jugar bien así)
const faltaMedia = (p: Pregunta) => ((p.tipo === 'imagen' || p.tipo === 'revelar') && !p.imagen) || (p.tipo === 'musica' && !p.audio)

// ─── Estado de la laptop (se guarda en el navegador por si se recarga la página) ───
interface HostState {
  modo: Modo
  partida: string
  rechazos: Record<string, string> // id → nombre que pidió y ya estaba tomado
  jugadores: Record<string, { nombre: string; visto: number }>
  bingo: EstadoPublico['bingo']
  trivia: {
    triviaId: string // qué trivia se está jugando (cada una con sus preguntas, puntos y podio)
    idx: number
    fase: FaseTrivia
    inicio: number
    respuestas: Record<string, Record<string, { op: number; ms: number }>>
    puntos: Record<string, number>
    previos: Record<string, number>
    cierre: number // si se tocó "Últimos 5 segundos": hora en que cierra (0 = al terminar el tiempo)
  }
  impostor: {
    ronda: number
    fase: FaseImpostor
    // Ajustes (se mantienen entre rondas)
    cantidad: number
    categoria: string
    pista: boolean
    propias: string
    // Ronda en curso
    palabra: string
    cat: string
    roles: Record<string, string> // id → palabra ('' = impostor)
    orden: string[]
    votos: Record<string, string> // quién votó → a quién
    usadas: string[]
  }
}
const impostorInicial = (): HostState['impostor'] => ({ ronda: 0, fase: 'config', cantidad: 1, categoria: TODAS, pista: true, propias: '', palabra: '', cat: '', roles: {}, orden: [], votos: {}, usadas: [] })
const bingoInicial = (ronda = 0): HostState['bingo'] => ({ ronda, salidos: [], fase: 'linea', ganadores: { linea: [], bingo: [] }, cantos: [] })
const triviaInicial = (triviaId = ''): HostState['trivia'] => ({ triviaId, idx: 0, fase: 'espera', inicio: 0, respuestas: {}, puntos: {}, previos: {}, cierre: 0 })
// Preguntas de la trivia que se está jugando
const pregsDe = (c: FiestaConfig | null, s: HostState) => triviaDe(c, s.trivia.triviaId)?.preguntas ?? []
// Hora en que cierra la pregunta: al terminar su tiempo, o antes si se tocó "Últimos 5 segundos"
const limiteDe = (t: HostState['trivia'], q: Pregunta) => Math.min(t.inicio + q.duracion * 1000, t.cierre || Infinity)
const nuevaPartida = () => Math.random().toString(36).slice(2, 10)
const estadoInicial = (): HostState => ({ modo: 'lobby', partida: nuevaPartida(), rechazos: {}, jugadores: {}, bingo: bingoInicial(), trivia: triviaInicial(), impostor: impostorInicial() })
const azar = () => crypto.getRandomValues(new Uint32Array(1))[0] / 4294967296
function barajar<T>(a: T[]) { const b = [...a]; for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(azar() * (i + 1)); [b[i], b[j]] = [b[j], b[i]] } return b }
// Máximo de impostores según cuántos juegan (siempre tiene que haber más gente que impostores)
const maxImpostores = (n: number) => Math.max(1, Math.floor((n - 1) / 2))

function publicoImpostor(s: HostState): EstadoImpostor {
  const im = s.impostor
  const nom = (id: string) => s.jugadores[id]?.nombre ?? '?'
  let resultado: EstadoImpostor['resultado'] = null
  if (im.fase === 'resultado') {
    const n: Record<string, number> = {}
    for (const a of Object.values(im.votos)) n[a] = (n[a] ?? 0) + 1
    resultado = {
      palabra: im.palabra,
      impostores: Object.keys(im.roles).filter(id => im.roles[id] === '').map(id => ({ id, nombre: nom(id) })),
      votos: Object.entries(n).map(([id, c]) => ({ id, nombre: nom(id), n: c })).sort((a, b) => b.n - a.n || a.nombre.localeCompare(b.nombre)),
    }
  }
  return {
    ronda: im.ronda, fase: im.fase, categoria: im.cat, pista: im.pista, cantidad: Object.values(im.roles).filter(r => r === '').length || im.cantidad,
    roles: im.fase === 'config' ? {} : im.roles,
    orden: im.orden.map(id => ({ id, nombre: nom(id) })),
    votaron: Object.keys(im.votos),
    resultado,
  }
}

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

  const triviaActual = triviaDe(cfg, st.trivia.triviaId)
  const preguntas = triviaActual?.preguntas ?? []
  const codigo = cfg?.codigo ?? ''
  const urlJugar = typeof window !== 'undefined' && codigo ? `${window.location.origin}/fiesta/${codigo}` : ''

  // ── Config ──
  useEffect(() => {
    fetch('/api/fiesta').then(r => r.json()).then(d => {
      if (d.error) { setError(d.error); return }
      setCfg(d); cfgRef.current = d
      try {
        const g = localStorage.getItem(`fiesta-host-${d.codigo}`)
        if (g) {
          const guardado = JSON.parse(g)
          const s = { ...estadoInicial(), ...guardado } as HostState
          s.bingo.ronda ??= 0
          stRef.current = s; setSt(s); setVista(s.modo)
          if (!guardado.partida) localStorage.setItem(`fiesta-host-${d.codigo}`, JSON.stringify(s)) // fijar la partida
        }
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
    const pregs = pregsDe(cfgRef.current, s)
    const q = pregs[s.trivia.idx]
    const abierta = s.trivia.fase === 'pregunta'
    const resp = q ? s.trivia.respuestas[q.id] ?? {} : {}
    const mostrarPregunta = q && ['pregunta', 'revelada', 'ranking'].includes(s.trivia.fase)
    return {
      modo: s.modo,
      partida: s.partida,
      rechazos: Object.entries(s.rechazos ?? {}).map(([id, nombre]) => ({ id, nombre })),
      bingo: { ...s.bingo, cantos: s.bingo.cantos.slice(-8) },
      trivia: {
        fase: s.trivia.fase,
        nombre: triviaDe(cfgRef.current, s.trivia.triviaId)?.nombre ?? '',
        lanz: s.trivia.inicio,
        n: s.trivia.idx + 1,
        total: pregs.length,
        pregunta: mostrarPregunta ? { id: q.id, tipo: q.tipo, texto: q.texto, opciones: q.opciones, duracion: q.duracion, imagen: q.tipo === 'imagen' || q.tipo === 'revelar' ? q.imagen : undefined } : null,
        restanteMs: abierta && q ? Math.max(0, limiteDe(s.trivia, q) - Date.now()) : 0,
        transcurridoMs: abierta ? Date.now() - s.trivia.inicio : 0,
        correcta: q && !abierta && q.tipo !== 'votacion' ? q.correcta : null,
        respondieron: Object.keys(resp),
        ranking: rankingDe(s, q),
      },
      impostor: publicoImpostor(s),
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
    if (m.p && m.p !== s.partida) return // de antes de "Reiniciar todo"
    if (m.t === 'hola') {
      const nombre = String(m.nombre || '').trim().slice(0, 24) || 'Sin nombre'
      const prev = s.jugadores[m.id]
      if (prev && prev.nombre === nombre && Date.now() - prev.visto < 20000) {
        prev.visto = Date.now() // latido: no hace falta reenviar todo
        return
      }
      // No puede haber dos participantes con el mismo nombre: se rechaza y el celular lo vuelve a pedir.
      // (Si es un cambio de nombre, sigue participando con el nombre anterior.)
      const tomado = Object.entries(s.jugadores).some(([id, j]) => id !== m.id && normalizarNombre(j.nombre) === normalizarNombre(nombre))
      if (tomado) {
        if (prev) prev.visto = Date.now()
        if (s.rechazos?.[m.id] !== nombre) mutate(x => { (x.rechazos ??= {})[m.id] = nombre })
        else programarEnvio()
        return
      }
      // Mismo id = misma persona: si cambió el nombre se actualiza, no se duplica
      mutate(x => { x.jugadores[m.id] = { nombre, visto: Date.now() }; if (x.rechazos) delete x.rechazos[m.id] })
      return
    }
    if (!s.jugadores[m.id]) return
    s.jugadores[m.id].visto = Date.now()
    if (m.t === 'resp') {
      const q = pregsDe(cfgRef.current, s)[s.trivia.idx]
      if (!q || q.id !== m.qid || s.trivia.fase !== 'pregunta') { programarEnvio(); return }
      if (s.trivia.respuestas[q.id]?.[m.id]) { programarEnvio(); return } // ya estaba: solo reconfirmar
      const ms = Date.now() - s.trivia.inicio
      if (ms > q.duracion * 1000 + 1500) return
      mutate(x => { (x.trivia.respuestas[q.id] ??= {})[m.id] = { op: Number(m.op), ms } })
      return
    }
    if (m.t === 'canto') procesarCanto(m.id, m.tipo)
    if (m.t === 'voto') {
      const im = s.impostor
      const valido = im.fase === 'votacion' && m.ronda === im.ronda && m.id in im.roles && m.a in im.roles && m.a !== m.id
      if (!valido || im.votos[m.id]) { programarEnvio(); return } // ya estaba: solo reconfirmar
      mutate(x => { x.impostor.votos[m.id] = m.a })
      // Votaron todos los que juegan esta ronda: se cierra sola
      const ahoraIm = stRef.current.impostor
      if (Object.keys(ahoraIm.votos).length >= Object.keys(ahoraIm.roles).length) mutate(x => { x.impostor.fase = 'resultado' })
    }
  }

  function procesarCanto(id: string, tipo: 'linea' | 'bingo') {
    const s = stRef.current
    const j = s.jugadores[id]
    if (!j || s.bingo.ganadores[tipo].some(g => g.id === id)) return
    const valido = validarCanto(generarCarton(semillaCarton(codigoRef.current, s.partida, s.bingo.ronda ?? 0, id)), s.bingo.salidos, tipo)
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
      const preg = pregsDe(cfgRef.current, s)[s.trivia.idx]
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

  // Reloj general (quién está conectado), más lento que el de la pregunta
  useEffect(() => { const t = window.setInterval(() => setAhora(Date.now()), 5000); return () => window.clearInterval(t) }, [])

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
    if (!confirm('¿Empezar un bingo nuevo? Se borran las bolillas y los ganadores, y cada participante recibe un cartón nuevo.')) return
    mutate(x => { x.bingo = bingoInicial((x.bingo.ronda ?? 0) + 1) }) // ronda nueva = cartones nuevos
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
    const preg = pregsDe(cfgRef.current, stRef.current)[stRef.current.trivia.idx]
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
    const preg = pregsDe(cfgRef.current, stRef.current)[stRef.current.trivia.idx]
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
  // Cambiar de trivia: arranca de cero (puntos, ranking y podio propios)
  function elegirTrivia(id: string) {
    const t = stRef.current.trivia
    if (id === triviaDe(cfgRef.current, t.triviaId)?.id) return
    const enCurso = t.fase !== 'final' && (t.idx > 0 || t.fase !== 'espera' || Object.keys(t.puntos).length > 0)
    if (enCurso && !confirm('¿Pasar a otra trivia? La actual se corta y la nueva arranca con los puntos en cero.')) return
    audioRef.current?.pause()
    mutate(x => { x.trivia = triviaInicial(id) })
  }
  function reiniciarTrivia() {
    if (!confirm('¿Reiniciar la trivia? Se borran todos los puntos.')) return
    audioRef.current?.pause()
    mutate(x => { x.trivia = triviaInicial(x.trivia.triviaId) })
  }

  // ── Impostor ──
  function ajustarImpostor(fn: (im: HostState['impostor']) => void) { mutate(x => fn(x.impostor)) }
  function repartirRoles() {
    const s = stRef.current, n = Date.now()
    const ids = Object.entries(s.jugadores).filter(([, j]) => n - j.visto < ONLINE_MS * 2).map(([id]) => id)
    if (ids.length < 3) { alert('Hacen falta al menos 3 participantes conectados.'); return }
    const im = s.impostor
    const elegida = elegirPalabra(im.categoria, im.propias, im.usadas, azar)
    if (!elegida) { alert('Escribí al menos una palabra en “Mis palabras”.'); return }
    const cant = Math.min(im.cantidad, maxImpostores(ids.length))
    const impostores = new Set(barajar(ids).slice(0, cant))
    // Orden para hablar: al azar, pero arranca alguien que sabe la palabra
    let orden = barajar(ids)
    const primero = orden.findIndex(id => !impostores.has(id))
    orden = [...orden.slice(primero), ...orden.slice(0, primero)]
    mutate(x => {
      x.modo = 'impostor'
      Object.assign(x.impostor, {
        ronda: x.impostor.ronda + 1, fase: 'roles', palabra: elegida.p, cat: elegida.cat, orden, votos: {},
        roles: Object.fromEntries(ids.map(id => [id, impostores.has(id) ? '' : elegida.p])),
        usadas: [...x.impostor.usadas, elegida.p].slice(-200),
      })
    })
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
      <div className="relative md:fixed top-0 inset-x-0 z-40 flex flex-wrap items-center gap-2 px-3 md:px-4 py-2.5 md:opacity-40 md:hover:opacity-100 transition-opacity">
        <div className="flex gap-1 bg-black/30 rounded-full p-1 max-w-full overflow-x-auto">
          {([['lobby', 'Ingreso'], ['bingo', 'Bingo'], ['trivia', 'Trivia'], ['impostor', 'Impostor'], ['editor', 'Preguntas']] as [Vista, string][]).map(([k, l]) => (
            <button key={k} onClick={() => cambiarModo(k)} className={`px-2.5 md:px-3.5 py-1.5 rounded-full text-sm font-semibold cursor-pointer whitespace-nowrap ${vista === k ? 'bg-white text-[#2a1650]' : 'text-white/80 hover:bg-white/10'}`}>{l}</button>
          ))}
        </div>
        <span className="md:ml-2 text-sm flex items-center gap-1.5"><span className={`w-2 h-2 rounded-full ${conexion === 'ok' ? 'bg-emerald-400' : 'bg-amber-400 animate-pulse'}`} />{conexion === 'ok' ? 'En vivo' : 'Conectando…'}</span>
        <span className="text-sm opacity-80">· {Object.keys(st.jugadores).length} participantes</span>
        <div className="ml-auto flex gap-2 relative">
          <button onClick={() => document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen().catch(() => {})} className="hidden md:block px-3 py-1.5 rounded-full bg-black/30 text-sm cursor-pointer hover:bg-black/50">Pantalla completa</button>
          <button onClick={() => setMenu(v => !v)} className="px-3 py-1.5 rounded-full bg-black/30 text-sm cursor-pointer hover:bg-black/50">Ajustes</button>
          {menu && (
            <div className="absolute right-0 top-10 w-72 bg-white text-gray-800 rounded-2xl shadow-2xl p-3 space-y-2 text-sm">
              <p className="text-xs text-gray-500">Link para jugar: <b className="break-all">{urlJugar}</b></p>
              <button onClick={async () => { try { await guardarCfg({ activa: !cfg.activa }) } catch (e) { alert((e as Error).message) } }}
                className={`w-full py-2 rounded-xl font-semibold cursor-pointer ${cfg.activa ? 'bg-red-50 text-red-600' : 'bg-emerald-50 text-emerald-700'}`}>
                {cfg.activa ? 'Apagar la fiesta (cierra el link)' : 'Encender la fiesta'}
              </button>
              <button onClick={() => { if (confirm('¿Reiniciar TODO? Se borran participantes, bingo, trivia e impostor, y en los celulares se borra todo y vuelven a poner su nombre. Las preguntas cargadas no se borran.')) { audioRef.current?.pause(); mutate(x => { Object.assign(x, estadoInicial()) }); setBanner(null); setVista('lobby') } }}
                className="w-full py-2 rounded-xl bg-gray-100 font-semibold cursor-pointer">Reiniciar todo</button>
              <button onClick={async () => { if (confirm('¿Generar un link nuevo? El anterior deja de funcionar y hay que volver a escanear.')) { try { await guardarCfg({ nuevoCodigo: true }) } catch (e) { alert((e as Error).message) } } }}
                className="w-full py-2 rounded-xl bg-gray-100 font-semibold cursor-pointer">Generar link nuevo</button>
            </div>
          )}
        </div>
      </div>

      {!cfg.activa && <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-40 bg-red-500 text-white px-4 py-2 rounded-full text-sm font-semibold">La fiesta está apagada: el link no funciona</div>}

      <Escalar activo={vista !== 'editor'} clave={vista}>
      {vista === 'lobby' && <Lobby url={urlJugar} jugadores={st.jugadores} ahora={ahora} />}
      {vista === 'bingo' && <BingoHost st={st} girando={girando} onSacar={sacarBolilla} onDeshacer={deshacerBolilla} onReiniciar={reiniciarBingo} />}
      {vista === 'trivia' && (
        <TriviaHost st={st} trivias={cfg.trivias} triviaActual={triviaActual} onElegir={elegirTrivia} preguntas={preguntas} q={q} ahora={ahora} online={online} ranking={ranking}
          onLanzar={lanzarPregunta} onCerrar={cerrarPregunta} onUltimos5={ultimos5} onRanking={verRanking} onSiguiente={siguiente} onIr={irAPregunta} onReiniciar={reiniciarTrivia} />
      )}
      {vista === 'impostor' && <ImpostorHost st={st} ahora={ahora} onAjustar={ajustarImpostor} onRepartir={repartirRoles} />}
      </Escalar>
      {vista === 'editor' && <Editor trivias={cfg.trivias} onGuardar={async t => { await guardarCfg({ trivias: t }) }} />}

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
  return <div className="min-h-[100dvh] md:h-[100dvh] text-white overflow-x-hidden md:overflow-hidden select-none" style={{ background: 'radial-gradient(circle at 15% 0%, #6d28d9 0%, #3b1a6e 35%, #1a0d33 75%)', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}>{children}</div>
}

// En pantallas grandes (proyector) todo tiene que entrar sin scroll: si el contenido queda más alto que
// la pantalla, se achica entero hasta que entre. En el celular se deja scrollear normal.
function Escalar({ activo, clave, children }: { activo: boolean; clave: string; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  const [esc, setEsc] = useState(1)
  const escRef = useRef(1)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const medir = () => {
      let s = 1
      if (activo && window.innerWidth >= 768) s = Math.min(1, Math.max(0.4, window.innerHeight / Math.max(1, el.scrollHeight)))
      // el alto natural cambia con el ancho (que depende de la escala): se ignoran cambios mínimos para no oscilar
      if (Math.abs(s - escRef.current) > 0.015 || (s === 1 && escRef.current !== 1)) { escRef.current = s; setEsc(s) }
    }
    medir()
    const ro = new ResizeObserver(medir)
    ro.observe(el)
    window.addEventListener('resize', medir)
    return () => { ro.disconnect(); window.removeEventListener('resize', medir) }
  }, [activo, clave])
  return (
    <div ref={ref} style={esc < 1 ? { width: `${100 / esc}%`, transform: `scale(${esc})`, transformOrigin: 'top left' } : undefined}>
      {children}
    </div>
  )
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
    <div className="min-h-[calc(100dvh-100px)] md:min-h-[100dvh] flex flex-col md:flex-row items-center gap-6 md:gap-12 px-5 md:px-16 pt-4 md:pt-16 pb-10">
      <div className="shrink-0 text-center">
        <div className="bg-white rounded-[2rem] p-5 shadow-2xl qr-flota">{qr && /* eslint-disable-next-line @next/next/no-img-element */ <img src={qr} alt="QR" className="w-[min(42vh,420px,70vw)] h-[min(42vh,420px,70vw)]" />}</div>
        <p className="mt-5 text-lg opacity-80">Escaneá con la cámara del celu</p>
        <p className="text-sm opacity-50 break-all max-w-[420px] mx-auto mt-1">{url}</p>
      </div>
      <div className="flex-1 min-w-0 w-full text-center md:text-left">
        <p className="text-2xl font-semibold opacity-80">Beauty Co. cumple</p>
        <h1 className="text-[9vh] leading-none font-black tracking-tight titulo-brillo">9 años</h1>
        <p className="text-2xl md:text-3xl mt-6 font-bold">{lista.length} {lista.length === 1 ? 'participante' : 'participantes'} adentro</p>
        <div className="mt-5 flex flex-wrap justify-center md:justify-start gap-2.5 md:max-h-[45vh] overflow-hidden">
          {lista.map(([id, j]) => (
            <span key={id} className={`chip-pop px-3 md:px-4 py-1.5 md:py-2 rounded-full text-base md:text-lg font-semibold ${ahora - j.visto < ONLINE_MS * 2 ? 'bg-white/15' : 'bg-white/5 opacity-50'}`}>{j.nombre}</span>
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
    <div className="min-h-[calc(100dvh-100px)] md:min-h-[100dvh] flex flex-col md:flex-row gap-6 md:gap-10 px-4 md:px-12 pt-4 md:pt-16 pb-8">
      <div className="flex flex-col items-center justify-center w-full md:w-[38%] shrink-0">
        <p className="text-xl md:text-2xl font-bold tracking-wide uppercase opacity-80">{fin ? 'Bingo terminado' : b.fase === 'linea' ? 'Jugamos por LÍNEA' : 'Jugamos por BINGO'}</p>
        <div key={girando != null ? 'g' : ultimo} className={`mt-4 md:mt-6 w-[min(36vh,380px,55vw)] aspect-square rounded-full flex items-center justify-center bola ${girando != null ? '' : 'bola-pop'}`}>
          <span className="text-[min(16vh,170px,25vw)] font-black text-[#2a1650] leading-none">{girando ?? ultimo ?? '–'}</span>
        </div>
        <div className="mt-4 md:mt-6 flex gap-2 md:gap-3 h-12 md:h-16">
          {anteriores.map((n, i) => <span key={n} className="w-12 h-12 md:w-16 md:h-16 rounded-full bg-white/15 flex items-center justify-center text-xl md:text-2xl font-bold" style={{ opacity: 1 - i * 0.15 }}>{n}</span>)}
        </div>
        <button onClick={onSacar} disabled={girando != null || fin || b.salidos.length >= 90}
          className="mt-5 md:mt-8 px-10 py-4 md:py-5 rounded-full bg-[#ff4fa3] hover:bg-[#ff3594] disabled:opacity-40 text-2xl font-black shadow-xl cursor-pointer transition active:scale-95">
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
        <div className="grid grid-cols-10 gap-1 md:gap-1.5 mx-auto w-full md:max-w-[calc((100vh-260px)*10/9)]">
          {Array.from({ length: 90 }, (_, i) => i + 1).map(n => (
            <div key={n} className={`aspect-square rounded-lg md:rounded-xl flex items-center justify-center text-[3.4vw] md:text-[2.3vh] font-bold transition-all duration-500 ${n === ultimo ? 'bg-[#ff4fa3] text-white scale-110 shadow-lg celda-ultima' : salidos.has(n) ? 'bg-white text-[#2a1650]' : 'bg-white/[0.06] text-white/30'}`}>{n}</div>
          ))}
        </div>
        <div className="mt-4 md:mt-6 grid grid-cols-2 gap-3 md:gap-4">
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
    <div className={`rounded-2xl px-4 md:px-5 py-3 md:py-4 ${ganadores.length ? 'bg-gradient-to-r from-amber-400 to-pink-500' : 'bg-white/[0.06]'}`}>
      <p className="text-sm font-bold uppercase tracking-wider opacity-80">Premio {titulo}</p>
      <p className="text-lg md:text-2xl font-black mt-0.5">{ganadores.length ? ganadores.map(g => g.nombre).join(' y ') : '—'}</p>
    </div>
  )
}

function BannerGanador({ tipo, nombres, onCerrar }: { tipo: 'linea' | 'bingo'; nombres: string[]; onCerrar: () => void }) {
  return (
    <div onClick={onCerrar} className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 cursor-pointer">
      <Confeti />
      <div className="text-center banner-entra">
        <p className="text-[min(16vh,22vw)] font-black leading-none titulo-brillo">¡{tipo === 'linea' ? 'LÍNEA' : 'BINGO'}!</p>
        <p className="text-[6vh] font-bold mt-4">{nombres.join(' y ')}</p>
        <p className="mt-6 opacity-60">Tocá para seguir</p>
      </div>
    </div>
  )
}

// ─── Trivia ─────────────────────────────────────────────────────────────────────
function TriviaHost({ st, trivias, triviaActual, onElegir, preguntas, q, ahora, online, ranking, onLanzar, onCerrar, onUltimos5, onRanking, onSiguiente, onIr, onReiniciar }: {
  st: HostState; trivias: Trivia[]; triviaActual: Trivia | undefined; onElegir: (id: string) => void
  preguntas: Pregunta[]; q: Pregunta | undefined; ahora: number; online: number; ranking: FilaRanking[]
  onLanzar: () => void; onCerrar: () => void; onUltimos5: () => void; onRanking: () => void; onSiguiente: () => void; onIr: (i: number) => void; onReiniciar: () => void
}) {
  const t = st.trivia
  // Para elegir qué trivia jugar (solo si hay más de una)
  const selector = trivias.length > 1 && (
    <div className="flex flex-wrap justify-center gap-2">
      {trivias.map(tr => (
        <button key={tr.id} onClick={() => onElegir(tr.id)}
          className={`px-4 py-2 rounded-full text-base font-bold cursor-pointer transition ${tr.id === triviaActual?.id ? 'bg-white text-[#2a1650]' : 'bg-white/10 hover:bg-white/20'}`}>
          {tr.nombre} <span className="opacity-60 font-semibold">· {tr.preguntas.length}</span>
        </button>
      ))}
    </div>
  )
  if (!trivias.length) return <div className="min-h-[calc(100dvh-100px)] md:min-h-[100dvh] flex items-center justify-center text-center px-6 text-2xl opacity-70">Creá una trivia y sus preguntas en la pestaña “Preguntas”.</div>
  if (!preguntas.length) return (
    <div className="min-h-[calc(100dvh-100px)] md:min-h-[100dvh] flex flex-col items-center justify-center gap-6 text-center px-5 md:px-10">
      <p className="text-2xl opacity-70">“{triviaActual?.nombre}” todavía no tiene preguntas. Cargalas en la pestaña “Preguntas”.</p>
      {selector}
    </div>
  )
  if (t.fase === 'final') return <Podio ranking={ranking} nombre={triviaActual?.nombre ?? ''} otras={trivias.filter(x => x.id !== triviaActual?.id)} onElegir={onElegir} onReiniciar={onReiniciar} />
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
    <div className="min-h-[calc(100dvh-100px)] md:min-h-[100dvh] flex flex-col items-center justify-center px-5 md:px-10 py-6 text-center">
      {t.idx === 0 && selector && <div className="mb-10"><p className="text-sm opacity-60 mb-2 uppercase tracking-wider font-bold">¿Qué trivia jugamos?</p>{selector}</div>}
      <p className="text-3xl font-black opacity-90">{triviaActual?.nombre}</p>
      <p className="text-2xl opacity-70 font-semibold mt-1">Pregunta {t.idx + 1} de {preguntas.length}</p>
      <p className="mt-3 text-[7vh] font-black leading-tight titulo-brillo">{tipoLabel(q.tipo)}</p>
      {q.tipo === 'musica' && <p className="text-2xl mt-2 opacity-80">🎵 Subí el volumen</p>}
      {q.tipo === 'votacion' && <p className="text-2xl mt-2 opacity-80">No hay respuesta correcta: ¡votá lo que pensás!</p>}
      <button onClick={onLanzar} className="mt-8 md:mt-10 px-10 md:px-12 py-5 rounded-full bg-[#ff4fa3] hover:bg-[#ff3594] text-3xl font-black shadow-xl cursor-pointer active:scale-95 transition">Lanzar pregunta</button>
      <div className="mt-10 flex flex-wrap items-center justify-center gap-3 text-sm opacity-60">
        <span>Ir a:</span>
        <select value={t.idx} onChange={e => onIr(Number(e.target.value))} className="bg-black/30 rounded-lg px-2 py-1 max-w-[70vw]">
          {preguntas.map((p, i) => <option key={p.id} value={i}>{i + 1}. {p.texto.slice(0, 50)}</option>)}
        </select>
        <button onClick={onReiniciar} className="underline cursor-pointer">Reiniciar trivia</button>
        {t.idx > 0 && trivias.length > 1 && (
          <select value="" onChange={e => { if (e.target.value) onElegir(e.target.value) }} className="bg-black/30 rounded-lg px-2 py-1">
            <option value="">Cambiar de trivia…</option>
            {trivias.filter(x => x.id !== triviaActual?.id).map(x => <option key={x.id} value={x.id}>{x.nombre}</option>)}
          </select>
        )}
      </div>
    </div>
  )

  if (t.fase === 'ranking') return (
    <div className="min-h-[calc(100dvh-100px)] md:min-h-[100dvh] flex flex-col items-center px-4 md:px-10 pt-4 md:pt-20 pb-8">
      <p className="text-[5vh] font-black titulo-brillo">Ranking</p>
      <p className="opacity-60 -mt-1">{triviaActual?.nombre} · después de la pregunta {t.idx + 1} de {preguntas.length}</p>
      <div className="w-full max-w-4xl mt-6 mb-6"><RankingAnimado key={q.id} filas={ranking} /></div>
      <button onClick={onSiguiente} className="mt-auto px-10 py-4 rounded-full bg-[#ff4fa3] hover:bg-[#ff3594] text-2xl font-black cursor-pointer active:scale-95 transition">
        {t.idx + 1 < preguntas.length ? 'Siguiente pregunta' : 'Ver podio'}
      </button>
    </div>
  )

  return (
    <div className="min-h-[calc(100dvh-100px)] md:min-h-[100dvh] flex flex-col px-3 md:px-10 pt-3 md:pt-16 pb-6">
      <div className="flex items-center gap-2 md:gap-4">
        <span className="text-sm md:text-lg opacity-60 font-semibold">{t.idx + 1}/{preguntas.length}</span>
        <h2 className="flex-1 text-center text-[clamp(18px,min(4.6vh,6.2vw),64px)] font-black leading-tight">{q.texto}</h2>
        <div className="w-16 h-16 md:w-24 md:h-24 shrink-0 relative">
          <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90">
            <circle cx="50" cy="50" r="44" fill="none" stroke="rgba(255,255,255,.15)" strokeWidth="9" />
            <circle cx="50" cy="50" r="44" fill="none" stroke={restante <= 5 ? '#ff4fa3' : '#fff'} strokeWidth="9" strokeLinecap="round"
              strokeDasharray={276.5} strokeDashoffset={276.5 * (t.fase === 'pregunta' ? 1 - restanteMs / (q.duracion * 1000) : 1)} style={{ transition: 'stroke-dashoffset .15s linear' }} />
          </svg>
          <span className={`absolute inset-0 flex items-center justify-center text-xl md:text-3xl font-black ${restante <= 5 && !revelada ? 'latido' : ''}`}>{revelada ? '✓' : restante}</span>
        </div>
      </div>

      <div className="flex-1 flex flex-col md:flex-row items-center justify-center gap-4 md:gap-8 min-h-0 py-4 md:py-5">
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

      <div className="grid grid-cols-2 gap-2 md:gap-4">
        {opciones.map(({ o, i }) => {
          const ok = q.tipo !== 'votacion' && i === q.correcta
          const max = Math.max(1, ...conteo)
          return (
            <div key={i} className={`relative overflow-hidden rounded-2xl px-3 md:px-6 py-3 md:py-5 flex items-center gap-2 md:gap-4 text-[clamp(14px,3.2vh,40px)] font-bold transition-all duration-500 ${revelada && q.tipo !== 'votacion' && !ok ? 'opacity-30 scale-[0.98]' : ''} ${revelada && ok ? 'ring-8 ring-white/80 scale-[1.02]' : ''}`}
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

      <div className="mt-4 flex flex-wrap justify-center gap-3">
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
        <div key={i} className="flex flex-col items-center justify-end h-full w-[16vw] md:w-[9vw]">
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
    return <img src={q.imagen} alt="" className={`${TAM_IMG} rounded-2xl shadow-2xl object-contain`} />
  if (q.tipo === 'revelar' && q.imagen) return <ImagenOculta id={q.id} imagen={q.imagen} duracion={q.duracion} transcurrido={transcurrido} revelada={revelada} clase={TAM_IMG} />
  if (q.tipo === 'musica') return (
    <div className="flex flex-col items-center">
      {revelada && q.cancion?.artwork
        ? /* eslint-disable-next-line @next/next/no-img-element */ <img src={q.cancion.artwork} alt="" className="w-[min(30vh,60vw)] h-[min(30vh,60vw)] rounded-2xl shadow-2xl banner-entra" />
        : <div className="flex items-end gap-2 h-[24vh]">{Array.from({ length: 9 }, (_, i) => <span key={i} className="w-4 md:w-6 rounded-full bg-[#ff4fa3] eq" style={{ animationDelay: `${i * 0.11}s` }} />)}</div>}
      {revelada && q.cancion && <p className="mt-4 text-lg md:text-2xl font-bold text-center">{q.cancion.nombre} — {q.cancion.artista}</p>}
    </div>
  )
  return null
}

const TAM_IMG = 'max-h-[34vh] md:max-h-[42vh] max-w-[92vw] md:max-w-[60vw]'

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

function Podio({ ranking, nombre, otras, onElegir, onReiniciar }: { ranking: FilaRanking[]; nombre: string; otras: Trivia[]; onElegir: (id: string) => void; onReiniciar: () => void }) {
  const [a, b, c] = ranking
  const lugares = [{ f: b, n: 2, h: '34vh', d: '0.9s' }, { f: a, n: 1, h: '46vh', d: '1.8s' }, { f: c, n: 3, h: '24vh', d: '0s' }]
  return (
    <div className="min-h-[calc(100dvh-100px)] md:min-h-[100dvh] flex flex-col items-center pt-6 md:pt-16 px-2">
      <Confeti n={120} />
      <p className="text-[6vh] font-black titulo-brillo leading-tight">¡Felicitaciones!</p>
      <p className="text-xl opacity-70 -mt-1">{nombre}</p>
      <div className="flex-1 flex items-end gap-2 md:gap-6 pb-0 w-full max-w-5xl justify-center min-h-[60vh] md:min-h-0">
        {lugares.map(({ f, n, h, d }) => f && (
          <div key={n} className="flex-1 flex flex-col items-center">
            <p className="text-[clamp(14px,3.2vh,44px)] font-black text-center podio-nombre break-words max-w-full" style={{ animationDelay: `calc(${d} + .6s)` }}>{f.nombre}</p>
            <p className="text-sm md:text-xl opacity-80 podio-nombre" style={{ animationDelay: `calc(${d} + .6s)` }}>{f.pts.toLocaleString('es-AR')} pts</p>
            <div className="w-full rounded-t-3xl mt-3 flex items-start justify-center pt-5 text-[8vh] font-black podio-sube"
              style={{ height: h, animationDelay: d, background: n === 1 ? 'linear-gradient(#fbbf24,#d97706)' : n === 2 ? 'linear-gradient(#e5e7eb,#9ca3af)' : 'linear-gradient(#f59e0b,#92400e)', color: '#2a1650' }}>{n}</div>
          </div>
        ))}
      </div>
      <div className="fixed bottom-3 right-4 left-4 md:left-auto flex flex-wrap justify-end items-center gap-2 text-xs opacity-60 md:opacity-40 hover:opacity-100 transition-opacity">
        {otras.map(o => <button key={o.id} onClick={() => onElegir(o.id)} className="px-3 py-1.5 rounded-full bg-white/15 hover:bg-white/25 font-semibold cursor-pointer">Jugar “{o.nombre}”</button>)}
        <button onClick={onReiniciar} className="underline cursor-pointer">Reiniciar trivia</button>
      </div>
    </div>
  )
}

// ─── Impostor ───────────────────────────────────────────────────────────────────
function ImpostorHost({ st, ahora, onAjustar, onRepartir }: {
  st: HostState; ahora: number; onAjustar: (fn: (im: HostState['impostor']) => void) => void; onRepartir: () => void
}) {
  const im = st.impostor
  const pub = publicoImpostor(st)
  const conectados = Object.values(st.jugadores).filter(j => ahora - j.visto < ONLINE_MS * 2).length
  const max = maxImpostores(conectados)
  const enRonda = Object.keys(im.roles).length
  const plural = (n: number) => n === 1 ? '1 impostor' : `${n} impostores`
  const btn = 'px-8 py-4 rounded-full bg-[#ff4fa3] hover:bg-[#ff3594] text-xl md:text-2xl font-black shadow-xl cursor-pointer active:scale-95 transition'
  const btn2 = 'px-5 py-2.5 rounded-full bg-white/10 hover:bg-white/20 font-semibold cursor-pointer'
  const chip = (activo: boolean) => `px-4 py-2 rounded-full font-bold cursor-pointer transition ${activo ? 'bg-white text-[#2a1650]' : 'bg-white/10 hover:bg-white/20'}`

  if (im.fase === 'config') return (
    <div className="min-h-[calc(100dvh-100px)] md:min-h-[100dvh] flex flex-col items-center justify-center text-center px-4 md:px-10 pt-4 md:pt-16 pb-8">
      <h1 className="text-[clamp(36px,min(9vh,13vw),110px)] leading-none font-black titulo-brillo">El impostor</h1>
      <p className="mt-3 max-w-2xl text-lg md:text-xl opacity-80">Todos reciben la misma palabra en el celu, menos los impostores. Por turno, cada uno dice una palabra relacionada. ¿Quién no sabe de qué se habla?</p>
      <div className="mt-8 w-full max-w-3xl space-y-6">
        <div>
          <p className="text-sm font-bold uppercase tracking-wider opacity-60 mb-2">¿Cuántos impostores?</p>
          <div className="flex flex-wrap justify-center gap-2">
            {[1, 2, 3, 4, 5].map(n => (
              <button key={n} onClick={() => onAjustar(x => { x.cantidad = n })} disabled={n > max} className={`${chip(im.cantidad === n)} w-14 disabled:opacity-25 disabled:cursor-not-allowed`}>{n}</button>
            ))}
          </div>
          {im.cantidad > max && <p className="mt-2 text-sm text-amber-300">Con {conectados} participantes puede haber hasta {plural(max)}: se va a usar ese máximo.</p>}
        </div>
        <div>
          <p className="text-sm font-bold uppercase tracking-wider opacity-60 mb-2">Categoría</p>
          <div className="flex flex-wrap justify-center gap-2">
            {[TODAS, ...CATEGORIAS_IMPOSTOR.map(c => c.nombre), MIS_PALABRAS].map(c => (
              <button key={c} onClick={() => onAjustar(x => { x.categoria = c })} className={chip(im.categoria === c)}>{c}</button>
            ))}
          </div>
          {im.categoria === MIS_PALABRAS && (
            <textarea value={im.propias} onChange={e => { const v = e.target.value; onAjustar(x => { x.propias = v }) }} rows={3}
              placeholder="Una palabra por línea (o separadas por coma)" style={{ colorScheme: 'light' }}
              className="mt-3 w-full max-w-xl rounded-2xl px-4 py-3 bg-white text-gray-900 placeholder:text-gray-400 outline-none select-text" />
          )}
        </div>
        <label className="inline-flex items-center gap-3 cursor-pointer text-lg">
          <input type="checkbox" checked={im.pista} onChange={e => { const v = e.target.checked; onAjustar(x => { x.pista = v }) }} className="w-5 h-5 accent-[#ff4fa3]" />
          El impostor ve la categoría (más fácil para disimular)
        </label>
      </div>
      <button onClick={onRepartir} disabled={conectados < 3} className={`mt-8 ${btn} disabled:opacity-40`}>Repartir roles</button>
      <p className="mt-2 text-sm opacity-60">{conectados < 3 ? 'Hacen falta al menos 3 participantes conectados' : `Juegan los ${conectados} participantes conectados`}</p>
    </div>
  )

  const acciones = (
    <div className="mt-8 flex flex-wrap justify-center gap-3 text-sm">
      <button onClick={() => { if (confirm('¿Repartir roles de nuevo? Se arranca otra ronda con otra palabra.')) onRepartir() }} className={btn2}>Otra palabra</button>
      <button onClick={() => onAjustar(x => { x.fase = 'config' })} className={btn2}>Cambiar ajustes</button>
    </div>
  )

  if (im.fase === 'roles') return (
    <div className="min-h-[calc(100dvh-100px)] md:min-h-[100dvh] flex flex-col items-center justify-center text-center px-4 md:px-10 pt-4 md:pt-16 pb-8">
      <p className="text-[clamp(56px,10vh,120px)] latido-suave">🤫</p>
      <h1 className="text-[clamp(28px,6vh,72px)] font-black leading-tight">Miren su rol en el celu</h1>
      <p className="mt-2 text-lg md:text-2xl opacity-80">Hay <b>{plural(pub.cantidad)}</b> entre {enRonda} {im.pista && im.cat ? <>· Categoría: <b>{im.cat}</b></> : null}</p>
      <div className="mt-8 w-full max-w-4xl">
        <p className="text-sm font-bold uppercase tracking-wider opacity-60 mb-3">Orden para hablar · cada uno dice una palabra</p>
        <div className="flex flex-wrap justify-center gap-2">
          {pub.orden.map((j, i) => (
            <span key={j.id} className={`chip-pop px-4 py-2 rounded-full font-bold ${i === 0 ? 'bg-[#ff4fa3] text-lg md:text-xl' : 'bg-white/15'}`} style={{ animationDelay: `${i * 0.05}s` }}>{i + 1}. {j.nombre}</span>
          ))}
        </div>
      </div>
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <button onClick={() => onAjustar(x => { x.fase = 'votacion'; x.votos = {} })} className={btn}>¡A votar!</button>
        <button onClick={() => onAjustar(x => { x.fase = 'resultado' })} className={btn2}>Revelar sin votar</button>
      </div>
      {acciones}
    </div>
  )

  if (im.fase === 'votacion') {
    const votaron = new Set(Object.keys(im.votos))
    return (
      <div className="min-h-[calc(100dvh-100px)] md:min-h-[100dvh] flex flex-col items-center justify-center text-center px-4 md:px-10 pt-4 md:pt-16 pb-8">
        <h1 className="text-[clamp(32px,7vh,90px)] font-black titulo-brillo leading-tight">¿Quién es el impostor?</h1>
        <p className="mt-2 text-lg md:text-2xl opacity-80">Voten desde el celu</p>
        <p className="mt-6 text-[clamp(48px,11vh,130px)] font-black leading-none">{votaron.size}<span className="opacity-50 text-[0.5em]"> / {enRonda}</span></p>
        <p className="opacity-70">votaron</p>
        <div className="mt-6 flex flex-wrap justify-center gap-2 max-w-4xl">
          {pub.orden.map(j => <span key={j.id} className={`px-4 py-2 rounded-full font-semibold transition ${votaron.has(j.id) ? 'bg-emerald-500/80' : 'bg-white/10 opacity-60'}`}>{votaron.has(j.id) ? '✓ ' : ''}{j.nombre}</span>)}
        </div>
        <button onClick={() => onAjustar(x => { x.fase = 'resultado' })} className={`mt-8 ${btn}`}>Ver resultado</button>
      </div>
    )
  }

  return <ResultadoImpostor res={pub.resultado} conVotos={Object.keys(im.votos).length > 0} onOtra={onRepartir} onAjustes={() => onAjustar(x => { x.fase = 'config' })} />
}

// Primero se ven los votos y a los 2,5 s se revela quiénes eran los impostores
function ResultadoImpostor({ res, conVotos, onOtra, onAjustes }: { res: EstadoImpostor['resultado']; conVotos: boolean; onOtra: () => void; onAjustes: () => void }) {
  const [revelar, setRevelar] = useState(!conVotos)
  useEffect(() => { if (conVotos) { const t = window.setTimeout(() => setRevelar(true), 2500); return () => window.clearTimeout(t) } }, [conVotos])
  if (!res) return null
  const max = Math.max(1, ...res.votos.map(v => v.n))
  const top = res.votos.filter(v => v.n === max && v.n > 0)
  const atrapado = conVotos && top.length === 1 && res.impostores.some(i => i.id === top[0].id)
  return (
    <div className="min-h-[calc(100dvh-100px)] md:min-h-[100dvh] flex flex-col items-center justify-center text-center px-4 md:px-10 pt-4 md:pt-16 pb-8">
      {revelar && atrapado && <Confeti />}
      {conVotos && (
        <div className="w-full max-w-3xl space-y-2 mb-6">
          {res.votos.slice(0, 6).map(v => (
            <div key={v.id} className="flex items-center gap-3">
              <span className="w-32 md:w-48 text-right font-bold truncate text-lg md:text-2xl">{v.nombre}</span>
              <div className="flex-1 h-9 md:h-11 rounded-xl bg-white/10 overflow-hidden">
                <div className={`h-full rounded-xl barra-crece flex items-center justify-end pr-3 font-black ${revelar && res.impostores.some(i => i.id === v.id) ? 'bg-[#e21b3c]' : 'bg-white/40'}`} style={{ width: `${(v.n / max) * 100}%`, transition: 'background-color .6s' }}>{v.n}</div>
              </div>
            </div>
          ))}
        </div>
      )}
      {!revelar ? <p className="text-[clamp(28px,6vh,72px)] font-black latido">Y el impostor era…</p> : (
        <div className="banner-entra">
          {conVotos && <p className="text-[clamp(26px,5vh,64px)] font-black">{atrapado ? '¡Lo atraparon! 🎉' : top.length > 1 ? 'Empate… ¡ganan los impostores! 😈' : '¡Ganan los impostores! 😈'}</p>}
          <p className="mt-2 text-lg md:text-2xl opacity-80">{res.impostores.length === 1 ? 'El impostor era' : 'Los impostores eran'}</p>
          <p className="text-[clamp(36px,9vh,110px)] font-black leading-tight titulo-brillo">{res.impostores.map(i => i.nombre).join(' y ')}</p>
          <p className="mt-3 text-xl md:text-3xl">La palabra era <b className="px-3 py-1 rounded-xl bg-white text-[#2a1650]">{res.palabra}</b></p>
        </div>
      )}
      <div className="mt-10 flex flex-wrap justify-center gap-3">
        <button onClick={onOtra} className="px-8 py-4 rounded-full bg-[#ff4fa3] hover:bg-[#ff3594] text-xl md:text-2xl font-black shadow-xl cursor-pointer active:scale-95 transition">Otra ronda</button>
        <button onClick={onAjustes} className="px-5 py-2.5 rounded-full bg-white/10 hover:bg-white/20 font-semibold cursor-pointer">Cambiar ajustes</button>
      </div>
    </div>
  )
}

// ─── Editor de preguntas ────────────────────────────────────────────────────────
const nuevaPregunta = (tipo: TipoPregunta = 'texto'): Pregunta => ({
  id: Math.random().toString(36).slice(2, 10), tipo, texto: '', opciones: ['', '', '', ''], correcta: 0,
  duracion: TIPOS.find(t => t.tipo === tipo)!.duracion,
})

function Editor({ trivias, onGuardar }: { trivias: Trivia[]; onGuardar: (t: Trivia[]) => Promise<void> }) {
  const [selId, setSelId] = useState(trivias[0]?.id ?? '')
  const [editando, setEditando] = useState<Pregunta | null>(null)
  const [guardando, setGuardando] = useState(false)
  const sel = trivias.find(t => t.id === selId) ?? trivias[0]
  const preguntas = sel?.preguntas ?? []
  async function guardarTodo(lista: Trivia[]) {
    setGuardando(true)
    try { await onGuardar(lista) } catch (e) { alert((e as Error).message) } finally { setGuardando(false) }
  }
  const guardar = (pregs: Pregunta[]) => sel && guardarTodo(trivias.map(t => t.id === sel.id ? { ...t, preguntas: pregs } : t))
  function nuevaTrivia() {
    const t: Trivia = { id: Math.random().toString(36).slice(2, 10), nombre: `Trivia ${trivias.length + 1}`, preguntas: [] }
    guardarTodo([...trivias, t]); setSelId(t.id)
  }
  // Carga una trivia armada: busca cada imagen (Wikipedia) y cada canción (Apple Music) al momento
  const [cargando, setCargando] = useState('')
  async function cargarPlantilla(pl: Plantilla) {
    if (cargando) return
    const pregs: Pregunta[] = [], sinTema: string[] = []
    for (const [i, q] of pl.preguntas.entries()) {
      setCargando(`Preparando «${pl.nombre}»… ${i + 1}/${pl.preguntas.length}`)
      const { wiki, busqueda, artista, ...resto } = q
      const p: Pregunta = { ...resto, id: Math.random().toString(36).slice(2, 10) }
      if (wiki) {
        const r = await fetch(`/api/fiesta/imagen?titulo=${encodeURIComponent(wiki)}`).then(r => r.ok ? r.json() : null).catch(() => null) as { url?: string } | null
        if (r?.url) p.imagen = r.url
      }
      if (busqueda) {
        const lista = await fetch(`/api/fiesta/musica?q=${encodeURIComponent(busqueda)}`).then(r => r.ok ? r.json() : []).catch(() => []) as { nombre: string; artista: string; preview: string; artwork?: string }[]
        const t = (Array.isArray(lista) ? lista : []).find(x => !artista || normalizarNombre(x.artista).includes(normalizarNombre(artista)))
        if (t) { p.audio = t.preview; p.cancion = { nombre: t.nombre, artista: t.artista, artwork: t.artwork } }
        else { sinTema.push(busqueda); continue } // si el tema no está en Apple Music, la pregunta no se agrega
      }
      pregs.push(p)
    }
    const usados = new Set(trivias.map(t => t.nombre))
    let nombre = pl.nombre
    for (let k = 2; usados.has(nombre); k++) nombre = `${pl.nombre} ${k}`
    const t: Trivia = { id: Math.random().toString(36).slice(2, 10), nombre, preguntas: pregs }
    await guardarTodo([...trivias, t]); setSelId(t.id); setCargando('')
    const faltan = pregs.filter(faltaMedia).length, avisos: string[] = []
    if (sinTema.length) avisos.push(`No se encontr${sinTema.length > 1 ? 'aron' : 'ó'} en Apple Music y no se agreg${sinTema.length > 1 ? 'aron' : 'ó'}: ${sinTema.join(', ')}.`)
    if (faltan) avisos.push(`${faltan} pregunta${faltan > 1 ? 's quedaron' : ' quedó'} sin imagen (están marcadas): abrilas con “Editar” y cargalas a mano.`)
    if (avisos.length) alert(`Listo, se cargaron ${pregs.length} preguntas.\n\n${avisos.join('\n\n')}`)
  }
  function renombrar(nombre: string) {
    if (!sel || !nombre.trim() || nombre.trim() === sel.nombre) return
    guardarTodo(trivias.map(t => t.id === sel.id ? { ...t, nombre: nombre.trim() } : t))
  }
  function borrarTrivia() {
    if (!sel || !confirm(`¿Borrar la trivia “${sel.nombre}” con sus ${sel.preguntas.length} preguntas?`)) return
    const resto = trivias.filter(t => t.id !== sel.id)
    guardarTodo(resto); setSelId(resto[0]?.id ?? '')
  }
  function mover(i: number, d: number) {
    const l = [...preguntas]; const j = i + d
    if (j < 0 || j >= l.length) return
    ;[l[i], l[j]] = [l[j], l[i]]
    guardar(l)
  }
  return (
    <div className="pt-2 md:pt-20 pb-10 px-2 md:px-6 md:h-[100dvh] md:overflow-y-auto">
      <div className="max-w-3xl mx-auto bg-white text-gray-800 rounded-3xl p-4 md:p-6 shadow-2xl">
        <div className="flex items-center gap-3 mb-3">
          <h2 className="text-2xl font-black flex-1">Trivias</h2>
          {guardando && <span className="text-sm text-gray-400">Guardando…</span>}
        </div>
        {/* Una pestaña por trivia */}
        <div className="flex flex-wrap gap-2 mb-5">
          {trivias.map(t => (
            <button key={t.id} onClick={() => setSelId(t.id)}
              className={`px-3.5 py-1.5 rounded-full text-sm font-semibold cursor-pointer border ${t.id === sel?.id ? 'bg-violet-600 text-white border-violet-600' : 'border-gray-200 hover:bg-gray-50'}`}>
              {t.nombre} <span className="opacity-60">· {t.preguntas.length}</span>
            </button>
          ))}
          <button onClick={nuevaTrivia} className="px-3.5 py-1.5 rounded-full text-sm font-semibold cursor-pointer border border-dashed border-violet-400 text-violet-600 hover:bg-violet-50">+ Nueva trivia</button>
          {PLANTILLAS.map(pl => (
            <button key={pl.nombre} onClick={() => cargarPlantilla(pl)} disabled={!!cargando} title={pl.desc}
              className="px-3.5 py-1.5 rounded-full text-sm font-semibold cursor-pointer border border-dashed border-gray-300 text-gray-600 hover:bg-gray-50 disabled:opacity-50">+ {pl.nombre}</button>
          ))}
        </div>
        {cargando && <p className="mb-4 text-sm text-violet-700 bg-violet-50 rounded-xl px-3 py-2">{cargando}</p>}
        {!sel ? <p className="text-gray-500 py-8 text-center">Creá tu primera trivia con “+ Nueva trivia”.</p> : <>
          <div className="flex flex-wrap items-center gap-2 mb-4">
            <input key={sel.id} defaultValue={sel.nombre} onBlur={e => renombrar(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
              className="flex-1 min-w-[12rem] text-lg font-bold border border-gray-200 rounded-xl px-3 py-2 outline-none focus:border-violet-500" title="Nombre de la trivia" />
            <button onClick={() => setEditando(nuevaPregunta())} className="px-4 py-2 rounded-xl bg-[#6d28d9] text-white font-semibold cursor-pointer whitespace-nowrap">+ Pregunta</button>
            <button onClick={borrarTrivia} className="px-3 py-2 rounded-xl text-red-500 hover:bg-red-50 text-sm font-semibold cursor-pointer whitespace-nowrap">Borrar trivia</button>
          </div>
          {!preguntas.length && <p className="text-gray-500 py-8 text-center">Esta trivia todavía no tiene preguntas.</p>}
          <div className="space-y-2">
            {preguntas.map((p, i) => (
              <div key={p.id} className="flex flex-wrap md:flex-nowrap items-center gap-x-3 gap-y-1 border border-gray-200 rounded-2xl px-3 md:px-4 py-3">
                <span className="text-gray-400 font-bold w-6">{i + 1}</span>
                <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-violet-100 text-violet-700 shrink-0">{tipoLabel(p.tipo)}</span>
                <span className="flex-1 min-w-0 truncate">{p.texto || <i className="text-gray-400">(sin texto)</i>}
                  {p.cancion && <span className="text-gray-400"> · {p.cancion.artista} — {p.cancion.nombre}</span>}</span>
                {faltaMedia(p) && <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 shrink-0">{p.tipo === 'musica' ? 'Falta la canción' : 'Falta la imagen'}</span>}
                <button onClick={() => mover(i, -1)} className="px-2 text-gray-400 hover:text-gray-700 cursor-pointer">↑</button>
                <button onClick={() => mover(i, 1)} className="px-2 text-gray-400 hover:text-gray-700 cursor-pointer">↓</button>
                <button onClick={() => setEditando(p)} className="px-2 text-violet-600 font-semibold cursor-pointer">Editar</button>
                <button onClick={() => { if (confirm('¿Borrar esta pregunta?')) guardar(preguntas.filter(x => x.id !== p.id)) }} className="px-2 text-red-500 cursor-pointer">Borrar</button>
              </div>
            ))}
          </div>
        </>}
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
