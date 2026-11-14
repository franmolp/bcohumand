// Fiesta de aniversario: Bingo + Trivia en vivo. La laptop del proyector (/fiesta/host) es la
// "autoridad": guarda el estado, cuenta puntos y valida los cantos. Los celulares (/fiesta/<código>)
// se comunican con ella por Supabase Realtime (broadcast), sin tablas: solo un canal por código.
// Este archivo es compartido (cliente) — no importar nada de servidor acá.
import { createClient } from '@supabase/supabase-js'

export const sbFiesta = () => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!)
// Dos canales: los celulares mandan a "entrada" por REST (sin unirse, así no reciben lo que mandan
// los demás) y escuchan "salida", donde solo la laptop publica el estado.
export const canalEntrada = (codigo: string) => `fiesta-bco-${codigo}-in`
export const canalSalida = (codigo: string) => `fiesta-bco-${codigo}-out`

// ─── Trivia ──────────────────────────────────────────────────────────────────
export type TipoPregunta = 'texto' | 'imagen' | 'revelar' | 'musica' | 'votacion'
export interface Pregunta {
  id: string
  tipo: TipoPregunta
  texto: string
  opciones: string[] // 4
  correcta: number // índice 0-3 (en votación no se usa)
  imagen?: string
  audio?: string
  cancion?: { nombre: string; artista: string; artwork?: string }
  duracion: number // segundos
}
// Se pueden armar varias trivias (cada una con su nombre y sus preguntas) y elegir cuál jugar
export interface Trivia { id: string; nombre: string; preguntas: Pregunta[] }
export interface FiestaConfig { codigo: string; activa: boolean; trivias: Trivia[] }
// La trivia elegida para jugar (o la primera, si no hay ninguna elegida o se borró)
export const triviaDe = (c: FiestaConfig | null | undefined, id: string | undefined) => c?.trivias.find(t => t.id === id) ?? c?.trivias[0]

export const TIPOS: { tipo: TipoPregunta; label: string; desc: string; duracion: number }[] = [
  { tipo: 'texto', label: 'Pregunta', desc: 'Pregunta con 4 opciones', duracion: 20 },
  { tipo: 'imagen', label: 'Imagen', desc: 'Imagen + 4 opciones', duracion: 20 },
  { tipo: 'revelar', label: 'Imagen oculta', desc: 'La imagen se va descubriendo de a poco', duracion: 30 },
  { tipo: 'musica', label: 'Música', desc: 'Suena un fragmento de 30 s', duracion: 30 },
  { tipo: 'votacion', label: 'Votación', desc: '¿Quién es más probable que…? Sin respuesta correcta, no suma puntos', duracion: 20 },
]
export const tipoLabel = (t: TipoPregunta) => TIPOS.find(x => x.tipo === t)?.label ?? t

export const COLORES = ['#e21b3c', '#1368ce', '#d89e00', '#26890c']
export const FORMAS = ['▲', '◆', '●', '■']

// Puntaje estilo Kahoot: 1000 si contesta al instante, baja hasta 500 al final del tiempo
export function puntosPor(ms: number, duracionMs: number) {
  return Math.round(1000 * (1 - Math.min(Math.max(ms, 0), duracionMs) / duracionMs / 2))
}

// ─── Bingo (90 bolillas, cartón argentino 3×9 con 15 números, 5 por fila) ───────────
function semillaDe(s: string) {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) }
  return h >>> 0
}
function mulberry32(a: number) {
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// Mezcla determinística (misma semilla → mismo orden)
export function mezclar<T>(arr: T[], semilla: string): T[] {
  const rnd = mulberry32(semillaDe(semilla)), a = [...arr]
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]] }
  return a
}

export type Carton = (number | null)[][] // 3 filas × 9 columnas

// Determinístico: el mismo jugador siempre tiene el mismo cartón, y la laptop lo puede
// regenerar para validar el canto sin que el celular le mande nada.
export function generarCarton(semilla: string): Carton {
  const rnd = mulberry32(semillaDe(semilla))
  for (let intento = 0; intento < 50; intento++) {
    const cuantos = Array(9).fill(1)
    let extra = 6
    while (extra > 0) { const c = Math.floor(rnd() * 9); if (cuantos[c] < 3) { cuantos[c]++; extra-- } }
    const numeros = cuantos.map((n, c) => {
      const lo = c === 0 ? 1 : c * 10, hi = c === 8 ? 90 : c * 10 + 9
      const pool = Array.from({ length: hi - lo + 1 }, (_, i) => lo + i)
      for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]] }
      return pool.slice(0, n).sort((a, b) => a - b)
    })
    const grilla: Carton = [Array(9).fill(null), Array(9).fill(null), Array(9).fill(null)]
    const resta = [5, 5, 5]
    // Columnas con más números primero, cada una a las filas con más lugar libre
    const orden = Array.from({ length: 9 }, (_, i) => i).map(i => ({ i, r: rnd() })).sort((a, b) => cuantos[b.i] - cuantos[a.i] || a.r - b.r).map(x => x.i)
    let ok = true
    for (const c of orden) {
      const filas = [0, 1, 2].map(f => ({ f, r: rnd() })).sort((a, b) => resta[b.f] - resta[a.f] || a.r - b.r).slice(0, cuantos[c]).map(x => x.f).sort((a, b) => a - b)
      if (filas.some(f => resta[f] <= 0)) { ok = false; break }
      filas.forEach((f, k) => { grilla[f][c] = numeros[c][k]; resta[f]-- })
    }
    if (ok && resta.every(r => r === 0)) return grilla
  }
  throw new Error('No se pudo generar el cartón')
}
// Cambia con cada "Reiniciar todo" (partida) y cada "Bingo nuevo" (ronda): así cada bingo trae cartones nuevos
export const semillaCarton = (codigo: string, partida: string, ronda: number, jugadorId: string) => `${codigo}:${partida}:${ronda}:${jugadorId}`

export function validarCanto(carton: Carton, salidos: Iterable<number>, tipo: 'linea' | 'bingo') {
  const s = new Set(salidos)
  const filas = carton.map(f => f.filter((n): n is number => n != null))
  return tipo === 'linea' ? filas.some(f => f.every(n => s.has(n))) : filas.every(f => f.every(n => s.has(n)))
}

// ─── Protocolo ───────────────────────────────────────────────────────────────
export type Modo = 'lobby' | 'bingo' | 'trivia'
export type FaseTrivia = 'espera' | 'pregunta' | 'revelada' | 'ranking' | 'final'
export interface Ganador { id: string; nombre: string; bola: number }
export interface Canto { id: string; nombre: string; tipo: 'linea' | 'bingo'; valido: boolean; ts: number }
export interface FilaRanking { id: string; nombre: string; pts: number; delta: number; acerto: boolean | null }

// Lo que la laptop le manda a todos (sin respuestas correctas mientras la pregunta está abierta)
export interface EstadoPublico {
  modo: Modo
  partida: string // cambia con "Reiniciar todo": los celulares borran todo lo suyo y vuelven a pedir el nombre
  rechazos: { id: string; nombre: string }[] // quisieron entrar (o cambiarse) a un nombre que ya tiene otra persona
  bingo: { ronda: number; salidos: number[]; fase: 'linea' | 'bingo' | 'terminado'; ganadores: { linea: Ganador[]; bingo: Ganador[] }; cantos: Canto[] }
  trivia: {
    fase: FaseTrivia
    nombre: string // nombre de la trivia que se está jugando
    lanz: number // identifica cada vez que se lanza una pregunta (para no arrastrar respuestas viejas)
    n: number
    total: number
    pregunta: { id: string; tipo: TipoPregunta; texto: string; opciones: string[]; duracion: number } | null
    restanteMs: number
    correcta: number | null
    respondieron: string[]
    ranking: FilaRanking[]
  }
}
// Mensajes de los celulares. `p` = partida que conoce el celular: la laptop descarta los de una
// partida vieja (un mensaje que salió justo antes de "Reiniciar todo" no vuelve a anotar a nadie).
// Mismo nombre = igual sin importar mayúsculas, acentos ni espacios de más ("Ana" = "aná ")
export const normalizarNombre = (n: string) => n.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim()

export type MsgJugador = (
  | { t: 'hola'; id: string; nombre: string }
  | { t: 'resp'; id: string; qid: string; op: number }
  | { t: 'canto'; id: string; tipo: 'linea' | 'bingo' }
) & { p?: string }
