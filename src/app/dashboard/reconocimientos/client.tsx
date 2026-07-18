'use client'

import { useState, useEffect, useCallback } from 'react'
import type { SessionUser } from '@/types'

type Pilar = 'salvavidas' | 'buena_vibra' | 'iniciativa'

interface RecMural {
  id: string
  receptor: { nombre: string; foto_perfil: string | null }
  emisor: { nombre: string; foto_perfil: string | null } | null
  anonimo: boolean
  categoria_pilar: Pilar
  mensaje: string
  mes_ciclo: string
  fecha_creacion: string
}

interface RecRecibido {
  id: string
  emisor: { nombre: string; foto_perfil: string | null } | null
  anonimo: boolean
  categoria_pilar: Pilar
  mensaje: string
  mes_ciclo: string
  fecha_creacion: string
}

interface RecEnviado {
  id: string
  receptor: { nombre: string; foto_perfil: string | null }
  categoria_pilar: Pilar
  mensaje: string
  anonimo: boolean
  estado: 'pendiente' | 'aprobado' | 'oculto'
  mes_ciclo: string
  fecha_creacion: string
}

interface Disponible {
  id: string
  nombre: string
  foto_perfil: string | null
  bloqueado: boolean
}

interface RecAdmin {
  id: string
  emisor: { nombre: string; foto_perfil: string | null }
  receptor: { nombre: string; foto_perfil: string | null }
  categoria_pilar: Pilar
  mensaje: string
  anonimo: boolean
  fecha_creacion: string
  mes_ciclo: string
}

interface RankingItem {
  id: string
  nombre: string
  foto_perfil: string | null
  total: number
  salvavidas: number
  buena_vibra: number
  iniciativa: number
}

const PILARES: { key: Pilar; label: string; emoji: string; color: string; bg: string }[] = [
  { key: 'salvavidas',  label: 'Salvavidas',  emoji: '🛟', color: 'text-blue-600',   bg: 'bg-blue-50 border-blue-200' },
  { key: 'buena_vibra', label: 'Buena vibra', emoji: '☀️', color: 'text-amber-600',  bg: 'bg-amber-50 border-amber-200' },
  { key: 'iniciativa',  label: 'Iniciativa',  emoji: '⚡', color: 'text-violet-600', bg: 'bg-violet-50 border-violet-200' },
]

function pilarInfo(key: Pilar) {
  return PILARES.find(p => p.key === key) ?? PILARES[0]
}

function Avatar({ nombre, foto, size = 36 }: { nombre: string; foto: string | null; size?: number }) {
  const initials = nombre.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()
  if (foto) return <img src={foto} alt={nombre} className="rounded-full object-cover flex-shrink-0" style={{ width: size, height: size }} />
  return (
    <div className="rounded-full bg-[image:var(--gradient)] flex items-center justify-center flex-shrink-0 text-white font-bold" style={{ width: size, height: size, fontSize: Math.round(size * 0.37) }}>
      {initials}
    </div>
  )
}

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime()
  const d = Math.floor(diff / 86400000)
  if (d === 0) return 'hoy'
  if (d === 1) return 'ayer'
  if (d < 7)  return `hace ${d} días`
  return new Date(iso).toLocaleDateString('es-AR', { day: 'numeric', month: 'short' })
}

function PilarBadge({ pilar }: { pilar: Pilar }) {
  const p = pilarInfo(pilar)
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold border ${p.bg} ${p.color}`}>
      {p.emoji} {p.label}
    </span>
  )
}

function EstadoBadge({ estado }: { estado: string }) {
  const map: Record<string, string> = {
    pendiente: 'bg-yellow-50 text-yellow-700 border-yellow-200',
    aprobado:  'bg-green-50 text-green-700 border-green-200',
    oculto:    'bg-gray-100 text-gray-500 border-gray-200',
  }
  const label: Record<string, string> = { pendiente: 'Pendiente', aprobado: 'Aprobado', oculto: 'Ocultado' }
  return (
    <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border ${map[estado] ?? ''}`}>
      {label[estado] ?? estado}
    </span>
  )
}

// ─── Tab: Mural ───────────────────────────────────────────────────────────────
function TabMural() {
  const [recs, setRecs] = useState<RecMural[]>([])
  const [loading, setLoading] = useState(true)
  const [filtro, setFiltro] = useState<Pilar | ''>('')

  useEffect(() => {
    fetch('/api/reconocimientos')
      .then(r => r.json())
      .then(d => { if (Array.isArray(d)) setRecs(d) })
      .finally(() => setLoading(false))
  }, [])

  const filtrados = filtro ? recs.filter(r => r.categoria_pilar === filtro) : recs

  if (loading) return <div className="py-12 text-center text-gray-400 text-sm">Cargando…</div>

  return (
    <div>
      <div className="flex gap-2 mb-4 flex-wrap">
        <button onClick={() => setFiltro('')} className={`px-3 py-1.5 rounded-full text-[12px] font-semibold border transition-colors cursor-pointer ${filtro === '' ? 'bg-[var(--primary)] text-white border-transparent' : 'border-gray-200 text-gray-500 hover:border-gray-300'}`}>
          Todos
        </button>
        {PILARES.map(p => (
          <button key={p.key} onClick={() => setFiltro(filtro === p.key ? '' : p.key)}
            className={`px-3 py-1.5 rounded-full text-[12px] font-semibold border transition-colors cursor-pointer ${filtro === p.key ? `${p.bg} ${p.color} border-current` : 'border-gray-200 text-gray-500 hover:border-gray-300'}`}>
            {p.emoji} {p.label}
          </button>
        ))}
      </div>

      {!filtrados.length && (
        <div className="py-12 text-center text-gray-400">
          <p className="text-3xl mb-2">🏆</p>
          <p className="text-sm">No hay reconocimientos este mes todavía</p>
        </div>
      )}

      <div className="flex flex-col gap-3">
        {filtrados.map(rec => (
          <div key={rec.id} className="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm">
            <div className="flex items-start justify-between gap-2 mb-3">
              <div className="flex items-center gap-2.5">
                <Avatar nombre={rec.receptor.nombre} foto={rec.receptor.foto_perfil} size={38} />
                <div>
                  <p className="text-[13px] font-semibold text-[var(--text)]">{rec.receptor.nombre}</p>
                  <p className="text-[11px] text-gray-400">
                    {rec.emisor ? `de ${rec.anonimo ? 'Anónimo' : rec.emisor.nombre}` : 'de Anónimo'}
                    {' · '}{timeAgo(rec.fecha_creacion)}
                  </p>
                </div>
              </div>
              <PilarBadge pilar={rec.categoria_pilar} />
            </div>
            <p className="text-[13px] text-[var(--text-sub)] leading-relaxed">{rec.mensaje}</p>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Tab: Mis Medallitas ──────────────────────────────────────────────────────
function TabMisMedallitas() {
  const [recibidos, setRecibidos] = useState<RecRecibido[]>([])
  const [enviados, setEnviados] = useState<RecEnviado[]>([])
  const [loading, setLoading] = useState(true)
  const [subtab, setSubtab] = useState<'recibidos' | 'enviados'>('recibidos')

  useEffect(() => {
    Promise.all([
      fetch('/api/reconocimientos/mis-recibidos').then(r => r.json()),
      fetch('/api/reconocimientos/mis-enviados').then(r => r.json()),
    ]).then(([rec, env]) => {
      if (Array.isArray(rec)) setRecibidos(rec)
      if (Array.isArray(env)) setEnviados(env)
    }).finally(() => setLoading(false))
  }, [])

  if (loading) return <div className="py-12 text-center text-gray-400 text-sm">Cargando…</div>

  const conteo = PILARES.map(p => ({ ...p, count: recibidos.filter(r => r.categoria_pilar === p.key).length }))

  return (
    <div>
      {/* Contador por pilar */}
      <div className="grid grid-cols-3 gap-3 mb-5">
        {conteo.map(p => (
          <div key={p.key} className={`rounded-xl border p-3 text-center ${p.bg}`}>
            <p className="text-2xl mb-0.5">{p.emoji}</p>
            <p className={`text-xl font-bold ${p.color}`}>{p.count}</p>
            <p className={`text-[10px] font-semibold ${p.color}`}>{p.label}</p>
          </div>
        ))}
      </div>

      {/* Subtabs */}
      <div className="flex gap-1 bg-gray-100 rounded-xl p-1 mb-4">
        {(['recibidos', 'enviados'] as const).map(t => (
          <button key={t} onClick={() => setSubtab(t)}
            className={`flex-1 py-1.5 rounded-lg text-[12px] font-semibold transition-colors cursor-pointer capitalize ${subtab === t ? 'bg-white text-[var(--primary)] shadow-sm' : 'text-gray-400'}`}>
            {t === 'recibidos' ? `Recibidos (${recibidos.length})` : `Enviados (${enviados.length})`}
          </button>
        ))}
      </div>

      {subtab === 'recibidos' && (
        <div className="flex flex-col gap-3">
          {!recibidos.length && <p className="text-center text-gray-400 text-sm py-8">Todavía no recibiste reconocimientos</p>}
          {recibidos.map(r => (
            <div key={r.id} className="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  {r.emisor && !r.anonimo
                    ? <Avatar nombre={r.emisor.nombre} foto={r.emisor.foto_perfil} size={30} />
                    : <div className="w-7 h-7 rounded-full bg-gray-200 flex items-center justify-center text-gray-400 text-sm">?</div>}
                  <p className="text-[12px] text-gray-500">
                    {r.anonimo ? 'Anónimo' : (r.emisor?.nombre ?? 'Compañero')}
                    {' · '}{timeAgo(r.fecha_creacion)}
                  </p>
                </div>
                <PilarBadge pilar={r.categoria_pilar} />
              </div>
              <p className="text-[13px] text-[var(--text-sub)] leading-relaxed">{r.mensaje}</p>
            </div>
          ))}
        </div>
      )}

      {subtab === 'enviados' && (
        <div className="flex flex-col gap-3">
          {!enviados.length && <p className="text-center text-gray-400 text-sm py-8">No enviaste reconocimientos este mes</p>}
          {enviados.map(r => (
            <div key={r.id} className="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2.5">
                  <Avatar nombre={r.receptor.nombre} foto={r.receptor.foto_perfil} size={30} />
                  <div>
                    <p className="text-[12px] font-semibold">{r.receptor.nombre}</p>
                    <p className="text-[10px] text-gray-400">{timeAgo(r.fecha_creacion)}{r.anonimo ? ' · Anónimo' : ''}</p>
                  </div>
                </div>
                <div className="flex items-center gap-1.5">
                  <PilarBadge pilar={r.categoria_pilar} />
                  <EstadoBadge estado={r.estado} />
                </div>
              </div>
              <p className="text-[13px] text-[var(--text-sub)] leading-relaxed">{r.mensaje}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Tab: Dar Reconocimiento ──────────────────────────────────────────────────
function TabDar({ onEnviado }: { onEnviado: () => void }) {
  const [disponibles, setDisponibles] = useState<Disponible[]>([])
  const [cuotaRestante, setCuotaRestante] = useState(3)
  const [cuotaUsada, setCuotaUsada] = useState(0)
  const [loading, setLoading] = useState(true)
  const [busqueda, setBusqueda] = useState('')
  const [receptor, setReceptor] = useState<Disponible | null>(null)
  const [pilar, setPilar] = useState<Pilar | ''>('')
  const [mensaje, setMensaje] = useState('')
  const [anonimo, setAnonimo] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState('')
  const [exito, setExito] = useState(false)

  const cargar = useCallback(() => {
    setLoading(true)
    fetch('/api/reconocimientos/disponibles')
      .then(r => r.json())
      .then(d => {
        if (d.disponibles) setDisponibles(d.disponibles)
        if (typeof d.cuotaRestante === 'number') setCuotaRestante(d.cuotaRestante)
        if (typeof d.cuotaUsada === 'number') setCuotaUsada(d.cuotaUsada)
      })
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { cargar() }, [cargar])

  const filtrados = disponibles.filter(u =>
    !u.bloqueado && u.nombre.toLowerCase().includes(busqueda.toLowerCase())
  )

  async function enviar() {
    if (!receptor || !pilar || mensaje.trim().length < 50) return
    setEnviando(true)
    setError('')
    try {
      const res = await fetch('/api/reconocimientos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id_receptor: receptor.id, categoria_pilar: pilar, mensaje: mensaje.trim(), anonimo }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error ?? 'Error al enviar'); return }
      setExito(true)
      setReceptor(null)
      setPilar('')
      setMensaje('')
      setAnonimo(false)
      cargar()
      onEnviado()
    } finally {
      setEnviando(false)
    }
  }

  if (loading) return <div className="py-12 text-center text-gray-400 text-sm">Cargando…</div>

  if (exito) return (
    <div className="py-12 text-center">
      <p className="text-4xl mb-3">🎉</p>
      <p className="text-[15px] font-semibold text-[var(--text)] mb-1">¡Reconocimiento enviado!</p>
      <p className="text-[13px] text-gray-400 mb-5">Está pendiente de aprobación por un admin.</p>
      <button onClick={() => setExito(false)} className="px-5 py-2 bg-[image:var(--gradient)] text-white rounded-xl text-[13px] font-semibold cursor-pointer">
        Dar otro
      </button>
    </div>
  )

  return (
    <div>
      {/* Cuota */}
      <div className="flex items-center gap-2 mb-4 p-3 rounded-xl bg-gray-50 border border-gray-100">
        <div className="flex-1">
          <p className="text-[12px] text-gray-500">Reconocimientos disponibles este mes</p>
          <div className="flex gap-1 mt-1">
            {[0, 1, 2].map(i => (
              <div key={i} className={`h-2 w-8 rounded-full ${i < cuotaUsada ? 'bg-[var(--primary)]' : 'bg-gray-200'}`} />
            ))}
          </div>
        </div>
        <span className="text-[13px] font-bold text-[var(--primary)]">{cuotaRestante} restante{cuotaRestante !== 1 ? 's' : ''}</span>
      </div>

      {cuotaRestante === 0 && (
        <div className="p-3 mb-4 rounded-xl bg-amber-50 border border-amber-200 text-amber-700 text-[13px]">
          Usaste todos tus reconocimientos de este mes. ¡Volvé el mes que viene!
        </div>
      )}

      {/* Paso 1: Elegir persona */}
      <div className="mb-4">
        <p className="text-[12px] font-semibold text-gray-500 mb-2 uppercase tracking-wide">1. ¿A quién reconocés?</p>
        {receptor ? (
          <div className="flex items-center gap-2.5 p-3 rounded-xl border border-[var(--primary)] bg-[var(--primary-light)]">
            <Avatar nombre={receptor.nombre} foto={receptor.foto_perfil} size={34} />
            <p className="text-[13px] font-semibold text-[var(--primary)] flex-1">{receptor.nombre}</p>
            <button onClick={() => setReceptor(null)} className="text-[11px] text-gray-400 underline cursor-pointer">Cambiar</button>
          </div>
        ) : (
          <>
            <input
              type="text"
              placeholder="Buscar compañero…"
              value={busqueda}
              onChange={e => setBusqueda(e.target.value)}
              className="w-full px-3 py-2 rounded-xl border border-gray-200 text-[13px] mb-2 focus:outline-none focus:border-[var(--primary)]"
            />
            <div className="max-h-44 overflow-y-auto flex flex-col gap-1">
              {filtrados.map(u => (
                <button key={u.id} onClick={() => { setReceptor(u); setBusqueda('') }}
                  className="flex items-center gap-2.5 p-2.5 rounded-xl hover:bg-gray-50 transition-colors cursor-pointer text-left w-full">
                  <Avatar nombre={u.nombre} foto={u.foto_perfil} size={32} />
                  <span className="text-[13px] font-medium">{u.nombre}</span>
                </button>
              ))}
              {!filtrados.length && busqueda && (
                <p className="text-[12px] text-gray-400 text-center py-3">Sin resultados</p>
              )}
            </div>
            {disponibles.filter(u => u.bloqueado).length > 0 && (
              <p className="text-[11px] text-gray-400 mt-1.5">
                {disponibles.filter(u => u.bloqueado).length} compañeros bloqueados (ya los reconociste este mes o el anterior)
              </p>
            )}
          </>
        )}
      </div>

      {/* Paso 2: Pilar */}
      <div className="mb-4">
        <p className="text-[12px] font-semibold text-gray-500 mb-2 uppercase tracking-wide">2. ¿En qué pilar?</p>
        <div className="flex flex-col gap-2">
          {PILARES.map(p => (
            <button key={p.key} onClick={() => setPilar(pilar === p.key ? '' : p.key)}
              className={`flex items-center gap-3 p-3 rounded-xl border text-left cursor-pointer transition-colors ${pilar === p.key ? `${p.bg} border-current ${p.color}` : 'border-gray-100 hover:border-gray-200'}`}>
              <span className="text-xl">{p.emoji}</span>
              <div>
                <p className={`text-[13px] font-semibold ${pilar === p.key ? p.color : 'text-[var(--text)]'}`}>{p.label}</p>
                <p className="text-[11px] text-gray-400">
                  {p.key === 'salvavidas' && 'Ayudó en un momento crítico o resolvió un problema urgente'}
                  {p.key === 'buena_vibra' && 'Contagia energía positiva y hace que el equipo sea mejor'}
                  {p.key === 'iniciativa' && 'Propuso o implementó algo nuevo sin que nadie se lo pidiera'}
                </p>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Paso 3: Mensaje */}
      <div className="mb-4">
        <p className="text-[12px] font-semibold text-gray-500 mb-2 uppercase tracking-wide">3. Tu mensaje <span className="font-normal normal-case text-gray-400">(mín. 50 caracteres)</span></p>
        <textarea
          value={mensaje}
          onChange={e => setMensaje(e.target.value)}
          rows={4}
          placeholder="Contá concretamente qué hizo esta persona y cómo impactó en vos o el equipo…"
          className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-[13px] resize-none focus:outline-none focus:border-[var(--primary)]"
        />
        <p className={`text-[11px] mt-0.5 ${mensaje.length >= 50 ? 'text-green-600' : 'text-gray-400'}`}>
          {mensaje.length}/50 mínimo
        </p>
      </div>

      {/* Paso 4: Anónimo */}
      <div className="mb-5">
        <label className="flex items-center gap-2.5 cursor-pointer select-none">
          <div onClick={() => setAnonimo(v => !v)}
            className={`w-10 h-5 rounded-full transition-colors relative flex-shrink-0 cursor-pointer ${anonimo ? 'bg-[var(--primary)]' : 'bg-gray-200'}`}>
            <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${anonimo ? 'translate-x-5' : 'translate-x-0.5'}`} />
          </div>
          <span className="text-[13px] text-gray-600">Enviar de forma anónima</span>
        </label>
        {anonimo && <p className="text-[11px] text-gray-400 mt-1 ml-12">Solo los administradores sabrán quién lo envió.</p>}
      </div>

      {error && <p className="mb-3 text-[13px] text-red-600 bg-red-50 border border-red-200 rounded-xl px-3 py-2">{error}</p>}

      <button
        onClick={enviar}
        disabled={!receptor || !pilar || mensaje.trim().length < 50 || cuotaRestante === 0 || enviando}
        className="w-full py-3 bg-[image:var(--gradient)] text-white font-semibold rounded-xl text-[14px] disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed transition-opacity"
      >
        {enviando ? 'Enviando…' : 'Enviar reconocimiento'}
      </button>
    </div>
  )
}

// ─── Tab: Moderación (solo admin) ─────────────────────────────────────────────
function TabModeracion() {
  const [data, setData] = useState<{ pendientes: RecAdmin[]; ranking: RankingItem[] } | null>(null)
  const [loading, setLoading] = useState(true)
  const [moderando, setModerando] = useState<string | null>(null)
  const [subtab, setSubtab] = useState<'pendientes' | 'ranking'>('pendientes')

  const cargar = useCallback(() => {
    setLoading(true)
    fetch('/api/reconocimientos/admin')
      .then(r => r.json())
      .then(d => { if (d.pendientes) setData(d) })
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { cargar() }, [cargar])

  async function moderar(id: string, accion: 'aprobado' | 'oculto') {
    setModerando(id)
    await fetch(`/api/reconocimientos/${id}/moderar`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accion }),
    })
    setModerando(null)
    cargar()
  }

  if (loading) return <div className="py-12 text-center text-gray-400 text-sm">Cargando…</div>

  return (
    <div>
      <div className="flex gap-1 bg-gray-100 rounded-xl p-1 mb-4">
        {(['pendientes', 'ranking'] as const).map(t => (
          <button key={t} onClick={() => setSubtab(t)}
            className={`flex-1 py-1.5 rounded-lg text-[12px] font-semibold transition-colors cursor-pointer capitalize ${subtab === t ? 'bg-white text-[var(--primary)] shadow-sm' : 'text-gray-400'}`}>
            {t === 'pendientes' ? `Pendientes (${data?.pendientes.length ?? 0})` : 'Ranking del mes'}
          </button>
        ))}
      </div>

      {subtab === 'pendientes' && (
        <div className="flex flex-col gap-3">
          {!data?.pendientes.length && (
            <div className="py-10 text-center text-gray-400">
              <p className="text-2xl mb-1">✅</p>
              <p className="text-[13px]">No hay reconocimientos pendientes</p>
            </div>
          )}
          {data?.pendientes.map(r => (
            <div key={r.id} className="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm">
              <div className="flex items-start justify-between mb-2">
                <div>
                  <div className="flex items-center gap-1.5 mb-0.5">
                    <span className="text-[12px] font-semibold text-[var(--text)]">{r.emisor.nombre}</span>
                    <span className="text-[11px] text-gray-400">→</span>
                    <span className="text-[12px] font-semibold text-[var(--text)]">{r.receptor.nombre}</span>
                    {r.anonimo && <span className="text-[10px] bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded-full">Anónimo</span>}
                  </div>
                  <p className="text-[10px] text-gray-400">{timeAgo(r.fecha_creacion)} · Ciclo {r.mes_ciclo}</p>
                </div>
                <PilarBadge pilar={r.categoria_pilar} />
              </div>
              <p className="text-[13px] text-[var(--text-sub)] leading-relaxed mb-3">{r.mensaje}</p>
              <div className="flex gap-2">
                <button
                  onClick={() => moderar(r.id, 'aprobado')}
                  disabled={moderando === r.id}
                  className="flex-1 py-2 bg-green-600 text-white text-[12px] font-semibold rounded-xl cursor-pointer disabled:opacity-50 hover:bg-green-700 transition-colors"
                >
                  {moderando === r.id ? '…' : '✓ Aprobar'}
                </button>
                <button
                  onClick={() => moderar(r.id, 'oculto')}
                  disabled={moderando === r.id}
                  className="flex-1 py-2 bg-gray-100 text-gray-600 text-[12px] font-semibold rounded-xl cursor-pointer disabled:opacity-50 hover:bg-gray-200 transition-colors"
                >
                  {moderando === r.id ? '…' : '✗ Ocultar'}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {subtab === 'ranking' && (
        <div className="flex flex-col gap-2">
          {!data?.ranking.length && (
            <p className="text-center text-gray-400 text-sm py-8">No hay reconocimientos aprobados este mes</p>
          )}
          {data?.ranking.map((item, i) => (
            <div key={item.id} className="flex items-center gap-3 bg-white border border-gray-100 rounded-xl px-4 py-3 shadow-sm">
              <span className="text-[15px] font-bold text-gray-400 w-5 text-center">
                {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : i + 1}
              </span>
              <Avatar nombre={item.nombre} foto={item.foto_perfil} size={34} />
              <div className="flex-1 min-w-0">
                <p className="text-[13px] font-semibold truncate">{item.nombre}</p>
                <div className="flex gap-2 mt-0.5">
                  {item.salvavidas > 0  && <span className="text-[10px] text-blue-600">🛟 {item.salvavidas}</span>}
                  {item.buena_vibra > 0 && <span className="text-[10px] text-amber-600">☀️ {item.buena_vibra}</span>}
                  {item.iniciativa > 0  && <span className="text-[10px] text-violet-600">⚡ {item.iniciativa}</span>}
                </div>
              </div>
              <span className="text-[15px] font-bold text-[var(--primary)]">{item.total}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function ReconocimientosClient({ session }: { session: SessionUser }) {
  const isAdmin = session.rol === 'admin' || session.rol === 'Admin'

  type Tab = 'mural' | 'medallitas' | 'dar' | 'moderacion'
  const [tab, setTab] = useState<Tab>('mural')
  const [muralKey, setMuralKey] = useState(0)

  const tabs: { key: Tab; label: string }[] = [
    { key: 'mural',       label: '🏆 Mural' },
    { key: 'medallitas',  label: '🎖️ Mis medallitas' },
    { key: 'dar',         label: '✨ Dar reconocimiento' },
    ...(isAdmin ? [{ key: 'moderacion' as Tab, label: '🛡️ Moderación' }] : []),
  ]

  return (
    <div className="max-w-xl mx-auto px-4 py-6">
      <div className="mb-5">
        <h1 className="text-[20px] font-bold text-[var(--text)]">Reconocimientos</h1>
        <p className="text-[13px] text-gray-400 mt-0.5">Reconocé el trabajo de tus compañeros</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 overflow-x-auto pb-1 mb-5 scrollbar-hide">
        {tabs.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`flex-shrink-0 px-3.5 py-1.5 rounded-full text-[12px] font-semibold transition-colors cursor-pointer whitespace-nowrap ${tab === t.key ? 'bg-[var(--primary)] text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'mural'      && <TabMural key={muralKey} />}
      {tab === 'medallitas' && <TabMisMedallitas />}
      {tab === 'dar'        && <TabDar onEnviado={() => setMuralKey(k => k + 1)} />}
      {tab === 'moderacion' && isAdmin && <TabModeracion />}
    </div>
  )
}
