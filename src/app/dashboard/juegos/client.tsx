'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import type { SessionUser } from '@/types'
import { IconStar, IconTrophy, IconPlus, IconTrash } from '@/components/ui/Icons'

type Estado = 'correct' | 'present' | 'absent'
type FilaIntento = { palabra: string; resultado: Estado[] }
type RankingEntry = { nombre: string; intentos: number; tiempo_seg: number; resuelta: boolean }
type RankingMesEntry = { nombre: string; puntos: number; partidas: number; resueltas: number }
type RankingMesData = { ranking: RankingMesEntry[]; totalPalabras: number }
type PalabraAdmin = { id: string; palabra: string; fecha: string; pista?: string | null }

const COLORES: Record<Estado, string> = {
  correct: 'bg-green-500 border-green-500 text-white',
  present: 'bg-amber-400 border-amber-400 text-white',
  absent:  'bg-gray-500 border-gray-500 text-white',
}

const TECLADO = [
  ['Q','W','E','R','T','Y','U','I','O','P'],
  ['A','S','D','F','G','H','J','K','L','Ñ'],
  ['Z','X','C','V','B','N','M','⌫'],
]

function fmtTiempo(seg: number) {
  const m = Math.floor(seg / 60)
  const s = seg % 60
  return m > 0 ? `${m}m ${s}s` : `${s}s`
}

function calcEstadoTecla(letra: string, intentos: FilaIntento[]): Estado | null {
  let mejor: Estado | null = null
  for (const fila of intentos) {
    for (let i = 0; i < fila.palabra.length; i++) {
      if (fila.palabra[i] !== letra) continue
      const e = fila.resultado[i]
      if (e === 'correct') return 'correct'
      if (e === 'present' && mejor !== 'correct') mejor = 'present'
      if (e === 'absent' && !mejor) mejor = 'absent'
    }
  }
  return mejor
}

// ─── How to play ──────────────────────────────────────────────────────────────

function HowToPlay() {
  const [open, setOpen] = useState(false)
  return (
    <div className="bg-gray-50 rounded-2xl border border-[var(--border)] overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-4 py-3 cursor-pointer"
      >
        <span className="text-[13px] font-semibold text-[var(--text)]">¿Cómo se juega?</span>
        <span className="text-[18px] leading-none text-gray-400">{open ? '−' : '+'}</span>
      </button>
      {open && (
        <div className="px-4 pb-4 space-y-3 text-[13px] text-[var(--text-muted)]">
          <p>Adiviná la palabra del día escribiéndola en el teclado. Después de cada intento las letras cambian de color:</p>
          <div className="space-y-2">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 flex items-center justify-center rounded-lg bg-green-500 text-white font-bold text-[14px] shrink-0">A</div>
              <span><span className="font-semibold text-[var(--text)]">Verde</span> — la letra está en esa posición exacta.</span>
            </div>
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 flex items-center justify-center rounded-lg bg-amber-400 text-white font-bold text-[14px] shrink-0">B</div>
              <span><span className="font-semibold text-[var(--text)]">Amarillo</span> — la letra está en la palabra pero en otro lugar.</span>
            </div>
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 flex items-center justify-center rounded-lg bg-gray-500 text-white font-bold text-[14px] shrink-0">C</div>
              <span><span className="font-semibold text-[var(--text)]">Gris</span> — la letra no está en la palabra.</span>
            </div>
          </div>
          <p>No hay límite de intentos — ¡podés seguir hasta adivinarla!</p>
        </div>
      )}
    </div>
  )
}

// ─── Wordle game ──────────────────────────────────────────────────────────────

function WordleGame({ user, isAdmin }: { user: SessionUser; isAdmin: boolean }) {
  const [largo, setLargo] = useState(5)
  const [pista, setPista] = useState<string | null>(null)
  const [revelado, setRevelado] = useState(false)
  const [revelando, setRevelando] = useState(false)
  const [intentos, setIntentos] = useState<FilaIntento[]>([])
  const [inputActual, setInputActual] = useState('')
  const [gameOver, setGameOver] = useState(false)
  const [resuelta, setResuelta] = useState(false)
  const [palabraCorrecta, setPalabraCorrecta] = useState<string | null>(null)
  const [tieneHoy, setTieneHoy] = useState(true)
  const [cargando, setCargando] = useState(true)
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState('')
  const [shake, setShake] = useState(false)
  const [revealIdx, setRevealIdx] = useState<number | null>(null)

  const [rankingHoy, setRankingHoy] = useState<{ ranking: RankingEntry[]; jugando: number } | null>(null)
  const [rankingAyer, setRankingAyer] = useState<{ ranking: RankingEntry[]; palabra: string | null } | null>(null)
  const [rankingMes, setRankingMes] = useState<RankingMesData | null>(null)

  const startTimeRef = useRef<number | null>(null)

  const cargarRankings = useCallback(async (jugoHoy: boolean) => {
    const [hoy, ayer, mes] = await Promise.all([
      jugoHoy ? fetch('/api/juegos/ranking?tipo=hoy').then(r => r.json()) : Promise.resolve(null),
      fetch('/api/juegos/ranking?tipo=ayer').then(r => r.json()),
      fetch('/api/juegos/ranking?tipo=mes').then(r => r.json()),
    ])
    if (hoy) setRankingHoy(hoy)
    setRankingAyer(ayer)
    setRankingMes(mes)
  }, [])

  useEffect(() => {
    fetch('/api/juegos/hoy')
      .then(r => r.json())
      .then(data => {
        setTieneHoy(data.tieneHoy)
        setLargo(data.largo ?? 5)
        setPista(data.pista ?? null)
        setRevelado(data.revelado ?? false)
        setIntentos(data.intentos ?? [])
        if (!data.revelado) {
          cargarRankings(isAdmin)
        } else if (data.jugado) {
          setGameOver(true)
          setResuelta(data.resuelta)
          setPalabraCorrecta(data.palabraCorrecta)
          cargarRankings(true)
        } else {
          cargarRankings(isAdmin)
        }
      })
      .finally(() => setCargando(false))
  }, [cargarRankings])

  const enviarIntento = useCallback(async () => {
    if (enviando || inputActual.length !== largo) return
    setEnviando(true)
    setError('')

    const res = await fetch('/api/juegos/intento', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ palabra: inputActual }),
    })
    const data = await res.json()
    setEnviando(false)

    if (!res.ok) {
      setError(data.error ?? 'Error al enviar')
      setShake(true)
      setTimeout(() => setShake(false), 500)
      return
    }

    const nuevaFila: FilaIntento = { palabra: inputActual, resultado: data.resultado }
    const nuevosIntentos = [...intentos, nuevaFila]
    setRevealIdx(nuevosIntentos.length - 1)
    setTimeout(() => setRevealIdx(null), largo * 100 + 400)

    setIntentos(nuevosIntentos)
    setInputActual('')

    if (data.gameOver) {
      setTimeout(() => {
        setGameOver(true)
        setResuelta(data.resuelta)
        setPalabraCorrecta(data.palabraCorrecta)
        cargarRankings(true)
      }, largo * 100 + 500)
    }
  }, [enviando, inputActual, largo, intentos, cargarRankings])

  const presionarTecla = useCallback((tecla: string) => {
    if (gameOver) return
    if (tecla === '⌫' || tecla === 'Backspace') {
      setInputActual(p => p.slice(0, -1))
      setError('')
    } else if (tecla === '↵' || tecla === 'Enter') {
      enviarIntento()
    } else if (/^[A-ZÑ]$/i.test(tecla) && inputActual.length < largo) {
      if (!startTimeRef.current) startTimeRef.current = Date.now()
      setInputActual(p => (p + tecla.toUpperCase()).slice(0, largo))
      setError('')
    }
  }, [gameOver, inputActual, largo, enviarIntento])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return
      presionarTecla(e.key)
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [presionarTecla])

  if (cargando) return <div className="py-16 flex justify-center"><div className="w-6 h-6 border-2 border-[var(--primary)] border-t-transparent rounded-full animate-spin" /></div>

  if (!tieneHoy) return (
    <div className="text-center py-16">
      <div className="text-4xl mb-3">📅</div>
      <p className="text-[15px] font-semibold text-[var(--text)]">No hay palabra para hoy</p>
      {isAdmin && <p className="text-[13px] text-[var(--text-muted)] mt-1">Cargá una en la sección Palabras</p>}
    </div>
  )

  if (!revelado) return (
    <div className="space-y-5">
      <HowToPlay />
      <div className="flex flex-col items-center gap-6 py-8">
        <div className="flex gap-1.5">
          {Array.from({ length: largo }, (_, i) => (
            <div key={i} className="w-12 h-12 rounded-lg bg-gray-200 border-2 border-gray-200" />
          ))}
        </div>
        <div className="text-center space-y-1">
          <p className="text-[13px] text-[var(--text-muted)]">El cronómetro arranca cuando destapás la palabra</p>
        </div>
        <button
          onClick={async () => {
            setRevelando(true)
            const res = await fetch('/api/juegos/revelar', { method: 'POST' })
            const data = await res.json()
            if (data.pista) setPista(data.pista)
            setRevelado(true)
            setRevelando(false)
          }}
          disabled={revelando}
          className="w-full h-13 py-3.5 rounded-xl bg-[image:var(--gradient)] text-white text-[16px] font-bold shadow-sm active:scale-[0.98] transition-transform disabled:opacity-60 cursor-pointer"
        >
          {revelando ? '...' : 'Destapar palabra'}
        </button>
      </div>
      {isAdmin && <RankingHoy data={rankingHoy} />}
      <RankingAyer data={rankingAyer} />
      <RankingMes data={rankingMes} />
    </div>
  )

  const filasRender: { tipo: 'completada' | 'activa'; fila?: FilaIntento; indice: number }[] = [
    ...intentos.map((fila, i) => ({ tipo: 'completada' as const, fila, indice: i })),
    ...(!gameOver ? [{ tipo: 'activa' as const, fila: undefined, indice: intentos.length }] : []),
  ]

  return (
    <div className="space-y-5">
      {/* Instrucciones */}
      <HowToPlay />

      {/* Pista del día */}
      {pista && (
        <div className="flex items-start gap-2 bg-amber-50 border border-amber-100 rounded-2xl px-4 py-3">
          <span className="text-[16px] mt-0.5">💡</span>
          <p className="text-[13px] text-amber-800"><span className="font-semibold">Pista:</span> {pista}</p>
        </div>
      )}

      {/* Grilla */}
      <div className="flex flex-col items-center gap-1.5">
        {filasRender.map(({ tipo, fila, indice }) => (
          <div key={indice} className={`flex gap-1.5 ${shake && tipo === 'activa' ? 'animate-[shake_0.4s_ease]' : ''}`}>
            {Array.from({ length: largo }, (_, j) => {
              const letraCompletada = fila?.palabra[j] ?? ''
              const letraActiva = tipo === 'activa' ? (inputActual[j] ?? '') : ''
              const letra = tipo === 'completada' ? letraCompletada : letraActiva
              const estado = fila?.resultado[j]
              const isRevealing = revealIdx === indice
              const delay = isRevealing ? `${j * 100}ms` : '0ms'

              return (
                <div
                  key={j}
                  className={`w-12 h-12 flex items-center justify-center text-[20px] font-bold border-2 rounded-lg transition-all select-none
                    ${estado ? `${COLORES[estado]} ${isRevealing ? 'scale-105' : ''}` : letra ? 'border-gray-400 text-[var(--text)] bg-white' : 'border-gray-200 bg-white'}`}
                  style={{ transitionDelay: delay }}
                >
                  {letra}
                </div>
              )
            })}
          </div>
        ))}
      </div>

      {error && <p className="text-center text-[13px] text-red-500 font-medium">{error}</p>}

      {/* Resultado */}
      {gameOver && resuelta && (
        <div className="rounded-2xl p-4 text-center bg-green-50 border border-green-100">
          <p className="text-[18px] font-bold mb-0.5">🎉 ¡Lo lograste!</p>
          {palabraCorrecta && (
            <p className="text-[13px] text-gray-500">
              La palabra era <span className="font-bold text-[var(--text)]">{palabraCorrecta}</span>
            </p>
          )}
        </div>
      )}

      {/* Teclado — solo si no terminó */}
      {!gameOver && (
        <div className="flex flex-col items-center gap-1 w-full px-2">
          {TECLADO.map((fila, fi) => (
            <div key={fi} className="flex gap-1 justify-center w-full">
              {fila.map(tecla => {
                const esBorrar = tecla === '⌫'
                const estadoTecla = esBorrar ? null : calcEstadoTecla(tecla, intentos)
                return (
                  <button
                    key={tecla}
                    onPointerDown={e => { e.preventDefault(); presionarTecla(tecla) }}
                    style={{
                      width: esBorrar ? 'calc((100vw - 40px - 7 * 4px) / 5.5)' : 'calc((100vw - 40px - 9 * 4px) / 10)',
                      height: 'min(56px, 12vw)',
                      fontSize: 'min(13px, 3.5vw)',
                    }}
                    className={`rounded-lg font-bold cursor-pointer select-none transition-colors active:scale-95 shrink-0
                      ${esBorrar
                        ? 'bg-gray-300 text-gray-700'
                        : estadoTecla
                          ? COLORES[estadoTecla]
                          : 'bg-gray-200 text-gray-800'}`}
                  >
                    {tecla}
                  </button>
                )
              })}
            </div>
          ))}
          <button
            onPointerDown={e => { e.preventDefault(); presionarTecla('↵') }}
            className="w-full h-12 mt-1 rounded-xl bg-[image:var(--gradient)] text-white text-[15px] font-bold cursor-pointer select-none shadow-sm active:scale-[0.98] transition-transform"
          >
            ENVIAR
          </button>
        </div>
      )}

      {/* Rankings — visibles solo después de jugar */}
      {gameOver && (
        <div className="space-y-4 pb-4">
          <RankingHoy data={rankingHoy} />
          <RankingAyer data={rankingAyer} />
          <RankingMes data={rankingMes} />
        </div>
      )}

      {/* Rankings de ayer y mes siempre visibles; hoy también para admin */}
      {!gameOver && (
        <div className="space-y-4 pb-4">
          {isAdmin && <RankingHoy data={rankingHoy} />}
          <RankingAyer data={rankingAyer} />
          <RankingMes data={rankingMes} />
        </div>
      )}
    </div>
  )
}

// ─── Ranking hoy ──────────────────────────────────────────────────────────────

function RankingHoy({ data }: { data: { ranking: RankingEntry[]; jugando: number } | null }) {
  if (!data) return null
  return (
    <div className="bg-white rounded-2xl border border-[var(--border)] overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-2">
        <IconTrophy size={15} className="text-[var(--primary)]" />
        <span className="text-[14px] font-semibold">Ranking de hoy</span>
        {data.jugando > 0 && (
          <span className="ml-auto text-[11px] text-gray-400">{data.jugando} jugando…</span>
        )}
      </div>
      {data.ranking.length === 0 ? (
        <p className="text-center text-[13px] text-gray-400 py-6">Nadie más terminó todavía</p>
      ) : (
        <div className="divide-y divide-gray-50">
          {data.ranking.map((e, i) => (
            <div key={i} className="flex items-center gap-3 px-4 py-2.5">
              <span className={`w-6 h-6 flex items-center justify-center rounded-full text-[11px] font-bold shrink-0
                ${i === 0 ? 'bg-amber-400 text-white' : i === 1 ? 'bg-gray-300 text-gray-700' : i === 2 ? 'bg-orange-300 text-white' : 'bg-gray-100 text-gray-500'}`}>
                {i + 1}
              </span>
              <span className="flex-1 text-[13px] font-medium text-[var(--text)] truncate">{e.nombre}</span>
              {e.resuelta && (
                <>
                  <span className="text-[12px] text-gray-500">{e.intentos} int.</span>
                  <span className="text-[11px] text-gray-400 w-12 text-right">{fmtTiempo(e.tiempo_seg)}</span>
                </>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Ranking ayer ─────────────────────────────────────────────────────────────

function RankingAyer({ data }: { data: { ranking: RankingEntry[]; palabra: string | null } | null }) {
  if (!data) return null
  return (
    <div className="bg-white rounded-2xl border border-[var(--border)] overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-2 flex-wrap">
        <span className="text-[14px] font-semibold">Ayer</span>
        {data.palabra && (
          <span className="ml-auto text-[12px] font-bold tracking-widest text-[var(--primary)] bg-[var(--primary-light)] px-2 py-0.5 rounded-lg">
            {data.palabra}
          </span>
        )}
      </div>
      {data.ranking.length === 0 ? (
        <p className="text-center text-[13px] text-gray-400 py-6">Sin partidas ayer</p>
      ) : (
        <div className="divide-y divide-gray-50">
          {data.ranking.map((e, i) => (
            <div key={i} className="flex items-center gap-3 px-4 py-2.5">
              <span className={`w-6 h-6 flex items-center justify-center rounded-full text-[11px] font-bold shrink-0
                ${i === 0 ? 'bg-amber-400 text-white' : i === 1 ? 'bg-gray-300 text-gray-700' : i === 2 ? 'bg-orange-300 text-white' : 'bg-gray-100 text-gray-500'}`}>
                {i + 1}
              </span>
              <span className="flex-1 text-[13px] font-medium text-[var(--text)] truncate">{e.nombre}</span>
              {e.resuelta && (
                <>
                  <span className="text-[12px] text-gray-500">{e.intentos} int.</span>
                  <span className="text-[11px] text-gray-400 w-12 text-right">{fmtTiempo(e.tiempo_seg)}</span>
                </>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Ranking mes ──────────────────────────────────────────────────────────────

function RankingMes({ data }: { data: RankingMesData | null }) {
  if (!data) return null
  const _d = new Date()
  const _m = _d.toLocaleString('es', { month: 'long' })
  const mes = `${_m.charAt(0).toUpperCase() + _m.slice(1)} ${_d.getFullYear()}`
  return (
    <div className="bg-white rounded-2xl border border-[var(--border)] overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-2">
        <IconStar size={15} className="text-amber-400" />
        <span className="text-[14px] font-semibold">Ranking {mes}</span>
      </div>
      {data.ranking.length === 0 ? (
        <p className="text-center text-[13px] text-gray-400 py-6">Sin partidas este mes</p>
      ) : (
        <div className="divide-y divide-gray-50">
          {data.ranking.map((e, i) => (
            <div key={i} className="flex items-center gap-3 px-4 py-2.5">
              <span className={`w-6 h-6 flex items-center justify-center rounded-full text-[11px] font-bold shrink-0
                ${i === 0 ? 'bg-amber-400 text-white' : i === 1 ? 'bg-gray-300 text-gray-700' : i === 2 ? 'bg-orange-300 text-white' : 'bg-gray-100 text-gray-500'}`}>
                {i + 1}
              </span>
              <span className="flex-1 text-[13px] font-medium text-[var(--text)] truncate">{e.nombre}</span>
              <div className="flex items-center gap-2 text-right">
                <span className="text-[13px] font-bold text-[var(--primary)]">{e.puntos} pts</span>
                <span className="text-[11px] text-gray-400">{e.partidas}/{data.totalPalabras}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Admin palabras ───────────────────────────────────────────────────────────

function AdminPalabras() {
  const [palabras, setPalabras] = useState<PalabraAdmin[]>([])
  const [cargando, setCargando] = useState(true)
  const [nueva, setNueva] = useState('')
  const [fecha, setFecha] = useState('')
  const [pistaAdmin, setPistaAdmin] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')
  const [editando, setEditando] = useState<PalabraAdmin | null>(null)

  const hoy = new Date().toLocaleDateString('en-CA')

  const cargar = useCallback(() => {
    setCargando(true)
    fetch('/api/juegos/palabras')
      .then(r => r.json())
      .then(d => setPalabras(Array.isArray(d) ? d : []))
      .finally(() => setCargando(false))
  }, [])

  useEffect(() => { cargar() }, [cargar])

  const agregar = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!nueva || !fecha) return
    setGuardando(true)
    setError('')
    const res = await fetch('/api/juegos/palabras', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ palabra: nueva.toUpperCase().trim(), fecha, pista: pistaAdmin.trim() || null }),
    })
    const data = await res.json()
    setGuardando(false)
    if (!res.ok) { setError(data.error); return }
    setNueva(''); setFecha(''); setPistaAdmin('')
    cargar()
  }

  const eliminar = async (id: string) => {
    await fetch(`/api/juegos/palabras/${id}`, { method: 'DELETE' })
    cargar()
  }

  return (
    <div className="space-y-4">
      <form onSubmit={agregar} className="bg-white rounded-2xl border border-[var(--border)] p-4 space-y-3">
        <p className="text-[13px] font-semibold">Agregar palabra</p>
        <div className="space-y-2">
          <input
            value={nueva}
            onChange={e => setNueva(e.target.value.toUpperCase())}
            placeholder="PALABRA"
            maxLength={15}
            className="w-full border border-gray-200 rounded-xl px-3 py-2 text-[14px] font-bold tracking-widest uppercase outline-none focus:border-[var(--primary)]"
          />
          <input
            type="date"
            value={fecha}
            min={hoy}
            onChange={e => setFecha(e.target.value)}
            className="w-full border border-gray-200 rounded-xl px-3 py-2 text-[13px] outline-none focus:border-[var(--primary)]"
          />
          <textarea
            value={pistaAdmin}
            onChange={e => setPistaAdmin(e.target.value)}
            placeholder="Pista para las jugadoras (opcional)..."
            rows={2}
            className="w-full border border-gray-200 rounded-xl px-3 py-2 text-[13px] outline-none focus:border-[var(--primary)] resize-none"
          />
        </div>
        {error && <p className="text-[12px] text-red-500">{error}</p>}
        <button
          type="submit"
          disabled={guardando || !nueva || !fecha}
          className="flex items-center gap-1.5 px-4 py-2 bg-[image:var(--gradient)] text-white text-[13px] font-semibold rounded-xl disabled:opacity-50 cursor-pointer"
        >
          <IconPlus size={14} /> Agregar
        </button>
      </form>

      <div className="bg-white rounded-2xl border border-[var(--border)] overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100">
          <span className="text-[13px] font-semibold">Palabras programadas</span>
        </div>
        {cargando ? (
          <div className="py-8 flex justify-center"><div className="w-5 h-5 border-2 border-[var(--primary)] border-t-transparent rounded-full animate-spin" /></div>
        ) : palabras.length === 0 ? (
          <p className="text-center text-[13px] text-gray-400 py-6">Sin palabras cargadas</p>
        ) : (
          <PalabrasList palabras={palabras} hoy={hoy} onEditar={setEditando} onEliminar={eliminar} />
        )}
      </div>

      {editando && (
        <EditarModal
          palabra={editando}
          hoy={hoy}
          onClose={() => setEditando(null)}
          onSaved={() => { setEditando(null); cargar() }}
        />
      )}
    </div>
  )
}

// ─── Lista palabras ───────────────────────────────────────────────────────────

function PalabrasList({ palabras, hoy, onEditar, onEliminar }: {
  palabras: PalabraAdmin[]
  hoy: string
  onEditar: (p: PalabraAdmin) => void
  onEliminar: (id: string) => void
}) {
  const [verMasFuturas, setVerMasFuturas] = useState(false)
  const LIMITE_FUTURAS = 10

  const pasadas = palabras.filter(p => p.fecha < hoy)
  const deHoy = palabras.filter(p => p.fecha === hoy)
  const futuras = palabras.filter(p => p.fecha > hoy)

  const pasadasVisible = pasadas.slice(-3)
  const futurasVisible = verMasFuturas ? futuras : futuras.slice(0, LIMITE_FUTURAS)
  const hayMasFuturas = !verMasFuturas && futuras.length > LIMITE_FUTURAS

  const renderFila = (p: PalabraAdmin) => {
    const esPasada = p.fecha < hoy
    const esHoy = p.fecha === hoy
    const editable = !esPasada && !esHoy
    return (
      <div
        key={p.id}
        onClick={() => editable && onEditar(p)}
        className={`flex items-center gap-3 px-4 py-2.5 ${editable ? 'cursor-pointer active:bg-gray-50' : ''}`}
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <span className={`text-[13px] font-bold tracking-wider ${esPasada ? 'text-gray-300' : esHoy ? 'text-[var(--primary)]' : 'text-[var(--text)]'}`}>
              {p.palabra}
            </span>
            <span className="text-[11px] text-gray-400">
              {esHoy ? '· hoy' : esPasada ? '· jugada' : `· ${new Date(p.fecha + 'T00:00:00').toLocaleDateString('es', { day: 'numeric', month: 'short' })}`}
            </span>
          </div>
          {p.pista && <p className="text-[11px] text-gray-400 truncate mt-0.5">{p.pista}</p>}
        </div>
        {editable && (
          <button
            onClick={ev => { ev.stopPropagation(); onEliminar(p.id) }}
            className="p-1.5 text-gray-300 hover:text-red-400 cursor-pointer transition-colors shrink-0"
          >
            <IconTrash size={14} />
          </button>
        )}
      </div>
    )
  }

  return (
    <div className="divide-y divide-gray-50">
      {pasadas.length > 3 && (
        <div className="px-4 py-2 text-[11px] text-gray-300 text-center">
          · · · {pasadas.length - 3} jugadas anteriores · · ·
        </div>
      )}
      {pasadasVisible.map(renderFila)}
      {deHoy.map(renderFila)}
      {futurasVisible.map(renderFila)}
      {hayMasFuturas && (
        <button
          onClick={() => setVerMasFuturas(true)}
          className="w-full py-3 text-[13px] text-[var(--primary)] font-medium cursor-pointer"
        >
          Ver {futuras.length - LIMITE_FUTURAS} más →
        </button>
      )}
    </div>
  )
}

// ─── Modal editar ─────────────────────────────────────────────────────────────

function EditarModal({ palabra, hoy, onClose, onSaved }: {
  palabra: PalabraAdmin
  hoy: string
  onClose: () => void
  onSaved: () => void
}) {
  const [palabraVal, setPalabraVal] = useState(palabra.palabra)
  const [fechaVal, setFechaVal] = useState(palabra.fecha)
  const [pistaVal, setPistaVal] = useState(palabra.pista ?? '')
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')

  const guardar = async (e: React.FormEvent) => {
    e.preventDefault()
    setGuardando(true)
    setError('')
    const res = await fetch(`/api/juegos/palabras/${palabra.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ palabra: palabraVal.toUpperCase().trim(), fecha: fechaVal, pista: pistaVal.trim() || null }),
    })
    const data = await res.json()
    setGuardando(false)
    if (!res.ok) { setError(data.error); return }
    onSaved()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4 bg-black/40" onClick={onClose}>
      <div
        className="w-full max-w-sm bg-white rounded-2xl p-5 space-y-4 shadow-xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <p className="text-[15px] font-bold text-[var(--text)]">Editar palabra</p>
          <button onClick={onClose} className="text-gray-400 p-1 cursor-pointer">✕</button>
        </div>
        <form onSubmit={guardar} className="space-y-3">
          <input
            value={palabraVal}
            onChange={e => setPalabraVal(e.target.value.toUpperCase())}
            placeholder="PALABRA"
            maxLength={15}
            className="w-full border border-gray-200 rounded-xl px-3 py-2 text-[14px] font-bold tracking-widest uppercase outline-none focus:border-[var(--primary)]"
          />
          <input
            type="date"
            value={fechaVal}
            min={hoy}
            onChange={e => setFechaVal(e.target.value)}
            className="w-full border border-gray-200 rounded-xl px-3 py-2 text-[13px] outline-none focus:border-[var(--primary)]"
          />
          <textarea
            value={pistaVal}
            onChange={e => setPistaVal(e.target.value)}
            placeholder="Pista (opcional)..."
            rows={2}
            className="w-full border border-gray-200 rounded-xl px-3 py-2 text-[13px] outline-none focus:border-[var(--primary)] resize-none"
          />
          {error && <p className="text-[12px] text-red-500">{error}</p>}
          <button
            type="submit"
            disabled={guardando || !palabraVal || !fechaVal}
            className="w-full py-3 bg-[image:var(--gradient)] text-white text-[14px] font-semibold rounded-xl disabled:opacity-50 cursor-pointer"
          >
            {guardando ? 'Guardando...' : 'Guardar cambios'}
          </button>
        </form>
      </div>
    </div>
  )
}

// ─── Main client ──────────────────────────────────────────────────────────────

export default function JuegosClient({ user }: { user: SessionUser }) {
  const isAdmin = user.rol === 'admin' || user.rol === 'Admin'
  const TABS = isAdmin
    ? [{ key: 'wordle', label: 'Wordle' }, { key: 'palabras', label: 'Palabras' }]
    : [{ key: 'wordle', label: 'Wordle' }]
  const [tab, setTab] = useState<'wordle' | 'palabras'>('wordle')

  return (
    <div className="py-4 fade-in">
      {/* Header */}
      <div className="flex items-center gap-3 mb-4">
        <div className="w-9 h-9 rounded-xl bg-[image:var(--gradient)] flex items-center justify-center flex-shrink-0 shadow-sm">
          <IconStar size={18} className="text-white" />
        </div>
        <h1 className="text-[17px] font-bold text-[var(--text)]">Juegos</h1>
      </div>

      {/* Tabs */}
      {isAdmin && (
        <div className="flex gap-1 p-1 bg-gray-100 rounded-xl mb-4">
          {TABS.map(t => (
            <button
              key={t.key}
              onClick={() => setTab(t.key as typeof tab)}
              className={`flex-1 py-2 text-[13px] font-medium rounded-[10px] cursor-pointer transition-all
                ${tab === t.key ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'}`}
            >
              {t.label}
            </button>
          ))}
        </div>
      )}

      {tab === 'wordle' && <WordleGame user={user} isAdmin={isAdmin} />}
      {tab === 'palabras' && isAdmin && <AdminPalabras />}
    </div>
  )
}
