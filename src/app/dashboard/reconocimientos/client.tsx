'use client'

import { useState, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import type { SessionUser } from '@/types'
import {
  IconTrophy, IconCheck, IconX, IconEyeOff, IconChevronLeft, IconChevronRight, IconEdit,
} from '@/components/ui/Icons'

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

interface RecAdminAll {
  id: string
  emisor: { nombre: string; foto_perfil: string | null }
  receptor: { nombre: string; foto_perfil: string | null }
  categoria_pilar: Pilar
  mensaje: string
  anonimo: boolean
  estado: 'pendiente' | 'aprobado' | 'oculto'
  fecha_creacion: string
  mes_ciclo: string
}

interface GrupoEmpleado {
  receptor: { nombre: string; foto_perfil: string | null }
  total: number
  pilares: Record<Pilar, RecMural[]>
}

const PILARES: { key: Pilar; label: string; emoji: string; color: string; bg: string; dot: string }[] = [
  { key: 'salvavidas',  label: 'Salvavidas',  emoji: '🛟', color: 'text-blue-600',   bg: 'bg-blue-50 border-blue-200',    dot: 'bg-blue-400' },
  { key: 'buena_vibra', label: 'Buena vibra', emoji: '☀️', color: 'text-amber-600',  bg: 'bg-amber-50 border-amber-200',  dot: 'bg-amber-400' },
  { key: 'iniciativa',  label: 'Iniciativa',  emoji: '⚡', color: 'text-violet-600', bg: 'bg-violet-50 border-violet-200', dot: 'bg-violet-400' },
]

function pilarInfo(key: Pilar) { return PILARES.find(p => p.key === key) ?? PILARES[0] }

const PRIMER_MES = '2026-07'

const TEXTOS_RECO = [
  '¿Alguien del equipo te salvó el día, te contagió buena onda o tomó la iniciativa? Reconocela con un mensaje y hacela sentir valorada.',
  'Reconocer a alguien del equipo tarda 2 minutos y puede cambiarle el día. ¿A quién querés destacar este mes?',
  'Cada persona del equipo hace algo que vale la pena decirle. Contale a alguien lo que hace bien y por qué importa.',
]

function getMesCiclo(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' }).slice(0, 7)
}

function formatMes(mes: string): string {
  const [y, m] = mes.split('-')
  const nombres = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']
  return `${nombres[parseInt(m) - 1]} ${y}`
}

function mesOffset(mes: string, delta: number): string {
  const [y, m] = mes.split('-').map(Number)
  const d = new Date(y, m - 1 + delta, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function NavMes({ mes, onChange }: { mes: string; onChange: (m: string) => void }) {
  const mesActual = getMesCiclo()
  return (
    <div className="flex items-center gap-2 mb-4">
      <button
        onClick={() => onChange(mesOffset(mes, -1))}
        disabled={mes <= PRIMER_MES}
        className="p-1.5 rounded-lg border border-gray-200 text-gray-400 disabled:opacity-30 cursor-pointer hover:bg-gray-50 transition-colors"
      >
        <IconChevronLeft size={16} />
      </button>
      <span className="flex-1 text-center text-[13px] font-semibold text-[var(--text)]">{formatMes(mes)}</span>
      <button
        onClick={() => onChange(mesOffset(mes, 1))}
        disabled={mes >= mesActual}
        className="p-1.5 rounded-lg border border-gray-200 text-gray-400 disabled:opacity-30 cursor-pointer hover:bg-gray-50 transition-colors"
      >
        <IconChevronRight size={16} />
      </button>
    </div>
  )
}

function Spinner() {
  return (
    <div className="flex justify-center py-12">
      <div className="w-5 h-5 border-2 border-gray-200 border-t-[var(--primary)] rounded-full animate-spin" />
    </div>
  )
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

function PilarBadge({ pilar }: { pilar: Pilar }) {
  const p = pilarInfo(pilar)
  return (
    <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full border ${p.bg} ${p.color}`}>
      {p.emoji} {p.label}
    </span>
  )
}

function EstadoBadge({ estado }: { estado: string }) {
  const map: Record<string, string> = {
    pendiente: 'bg-amber-50 text-amber-600 border-amber-200',
    aprobado:  'bg-green-50 text-green-700 border-green-200',
    oculto:    'bg-gray-100 text-gray-400 border-gray-200',
  }
  const label: Record<string, string> = { pendiente: 'Pendiente', aprobado: 'Aprobado', oculto: 'Ocultado' }
  return <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${map[estado] ?? ''}`}>{label[estado] ?? estado}</span>
}

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime()
  const d = Math.floor(diff / 86400000)
  if (d === 0) return 'hoy'
  if (d === 1) return 'ayer'
  if (d < 7) return `hace ${d} días`
  return new Date(iso).toLocaleDateString('es-AR', { day: 'numeric', month: 'short' })
}

function fmtFecha(iso: string) {
  return new Date(iso).toLocaleString('es-AR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false })
}

// ─── Popup de detalle de pilar ─────────────────────────────────────────────
function PilarPopup({
  empleado, pilar, recs, onClose,
}: {
  empleado: string
  pilar: Pilar
  recs: RecMural[]
  onClose: () => void
}) {
  const p = pilarInfo(pilar)
  return createPortal(
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-white rounded-2xl w-full max-w-sm shadow-2xl max-h-[80dvh] flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center gap-3 px-5 py-3 border-b border-gray-100">
          <span className="text-xl">{p.emoji}</span>
          <div className="flex-1">
            <p className="text-[14px] font-semibold text-[var(--text)]">{empleado}</p>
            <p className={`text-[11px] font-semibold ${p.color}`}>{p.label} · {recs.length} reconocimiento{recs.length !== 1 ? 's' : ''}</p>
          </div>
          <button onClick={onClose} className="p-1.5 text-gray-400 hover:bg-gray-100 rounded-full cursor-pointer">
            <IconX size={16} />
          </button>
        </div>

        {/* Lista */}
        <div className="overflow-y-auto flex-1 p-4 space-y-3">
          {recs.map(r => (
            <div key={r.id} className="bg-gray-50 rounded-xl p-3">
              <p className="text-[13px] text-[var(--text)] leading-relaxed mb-2">{r.mensaje}</p>
              <div className="flex items-center justify-between">
                <p className="text-[11px] text-gray-400">
                  de {r.emisor && !r.anonimo ? r.emisor.nombre : 'Anónimo'}
                </p>
                <p className="text-[10px] text-gray-400">{fmtFecha(r.fecha_creacion)}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>,
    document.body
  )
}

// ─── Tab: Mural ───────────────────────────────────────────────────────────────
function TabMural() {
  const [recs, setRecs] = useState<RecMural[]>([])
  const [loading, setLoading] = useState(true)
  const [mes, setMes] = useState(getMesCiclo())
  const [popup, setPopup] = useState<{ empleado: string; pilar: Pilar; recs: RecMural[] } | null>(null)

  useEffect(() => {
    setLoading(true)
    fetch(`/api/reconocimientos?mes=${mes}`)
      .then(r => r.json())
      .then(d => { if (Array.isArray(d)) setRecs(d) })
      .finally(() => setLoading(false))
  }, [mes])

  // Agrupar por receptor y ordenar por total desc
  const grupos: GrupoEmpleado[] = []
  const mapaGrupos: Record<string, GrupoEmpleado> = {}
  for (const r of recs) {
    const key = r.receptor.nombre
    if (!mapaGrupos[key]) {
      mapaGrupos[key] = { receptor: r.receptor, total: 0, pilares: { salvavidas: [], buena_vibra: [], iniciativa: [] } }
      grupos.push(mapaGrupos[key])
    }
    mapaGrupos[key].pilares[r.categoria_pilar].push(r)
    mapaGrupos[key].total++
  }
  grupos.sort((a, b) => b.total - a.total)

  return (
    <div>
      <NavMes mes={mes} onChange={m => { setMes(m); setRecs([]) }} />

      {loading && <Spinner />}

      {!loading && !grupos.length && (
        <div className="text-center py-16">
          <IconTrophy size={40} className="text-gray-200 mx-auto mb-3" />
          <p className="text-[14px] text-gray-400">No hay reconocimientos en {formatMes(mes)}</p>
        </div>
      )}

      {!loading && grupos.length > 0 && (
        <div className="grid grid-cols-2 gap-3">
          {grupos.map(g => (
            <div key={g.receptor.nombre} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 flex flex-col items-center text-center">
              {/* Avatar grande */}
              <Avatar nombre={g.receptor.nombre} foto={g.receptor.foto_perfil} size={56} />
              <p className="text-[12px] font-semibold text-[var(--text)] mt-2 mb-3 leading-tight line-clamp-2">
                {g.receptor.nombre}
              </p>

              {/* Pilares con count */}
              <div className="flex flex-col gap-1.5 w-full">
                {PILARES.map(p => {
                  const count = g.pilares[p.key].length
                  if (!count) return null
                  return (
                    <button
                      key={p.key}
                      onClick={() => setPopup({ empleado: g.receptor.nombre, pilar: p.key, recs: g.pilares[p.key] })}
                      className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border w-full cursor-pointer transition-colors hover:opacity-80 ${p.bg}`}
                    >
                      <span className="text-sm leading-none">{p.emoji}</span>
                      <span className={`text-[12px] font-bold ${p.color}`}>{count}</span>
                      <span className={`text-[10px] ${p.color} flex-1 text-left`}>{p.label}</span>
                    </button>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {popup && (
        <PilarPopup
          empleado={popup.empleado}
          pilar={popup.pilar}
          recs={popup.recs}
          onClose={() => setPopup(null)}
        />
      )}
    </div>
  )
}

// ─── Tab: Mis medallas ────────────────────────────────────────────────────────
function TabMisMedallas() {
  const [recibidos, setRecibidos] = useState<RecRecibido[]>([])
  const [enviados, setEnviados] = useState<RecEnviado[]>([])
  const [loading, setLoading] = useState(true)
  const [subtab, setSubtab] = useState<'recibidos' | 'enviados'>('recibidos')
  const [mes, setMes] = useState(getMesCiclo())

  const cargar = useCallback((m: string) => {
    setLoading(true)
    Promise.all([
      fetch(`/api/reconocimientos/mis-recibidos?mes=${m}`).then(r => r.json()),
      fetch(`/api/reconocimientos/mis-enviados?mes=${m}`).then(r => r.json()),
    ]).then(([rec, env]) => {
      if (Array.isArray(rec)) setRecibidos(rec)
      if (Array.isArray(env)) setEnviados(env)
    }).finally(() => setLoading(false))
  }, [])

  useEffect(() => { cargar(mes) }, [mes, cargar])

  return (
    <div>
      <NavMes mes={mes} onChange={m => { setMes(m); setRecibidos([]); setEnviados([]) }} />

      {/* Resumen por pilar */}
      <div className="grid grid-cols-3 gap-2 mb-4">
        {PILARES.map(p => {
          const count = recibidos.filter(r => r.categoria_pilar === p.key).length
          return (
            <div key={p.key} className={`rounded-xl border p-3 text-center ${p.bg}`}>
              <p className="text-xl mb-0.5">{p.emoji}</p>
              <p className={`text-xl font-bold leading-none ${p.color}`}>{count}</p>
              <p className={`text-[10px] font-semibold mt-0.5 ${p.color}`}>{p.label}</p>
            </div>
          )
        })}
      </div>

      {/* Subtabs */}
      <div className="flex gap-1 p-1 bg-gray-100 rounded-xl mb-4">
        {([['recibidos', `Recibidos (${recibidos.length})`], ['enviados', `Enviados (${enviados.length})`]] as const).map(([key, label]) => (
          <button key={key} onClick={() => setSubtab(key)}
            className={`flex-1 py-2 text-[13px] font-medium rounded-[10px] cursor-pointer transition-all ${subtab === key ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'}`}>
            {label}
          </button>
        ))}
      </div>

      {loading && <Spinner />}

      {!loading && subtab === 'recibidos' && (
        <div className="space-y-3">
          {!recibidos.length && (
            <div className="text-center py-12">
              <IconTrophy size={36} className="text-gray-200 mx-auto mb-2" />
              <p className="text-[13px] text-gray-400">Sin reconocimientos en {formatMes(mes)}</p>
            </div>
          )}
          {recibidos.map(r => (
            <div key={r.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  {r.emisor && !r.anonimo
                    ? <Avatar nombre={r.emisor.nombre} foto={r.emisor.foto_perfil} size={28} />
                    : <div className="w-7 h-7 rounded-full bg-gray-100 flex items-center justify-center flex-shrink-0"><IconEyeOff size={13} className="text-gray-400" /></div>
                  }
                  <p className="text-[12px] text-gray-500">
                    {r.anonimo ? 'Anónimo' : (r.emisor?.nombre ?? 'Compañero')} · {timeAgo(r.fecha_creacion)}
                  </p>
                </div>
                <PilarBadge pilar={r.categoria_pilar} />
              </div>
              <p className="text-[13px] text-[var(--text-sub)] leading-relaxed">{r.mensaje}</p>
            </div>
          ))}
        </div>
      )}

      {!loading && subtab === 'enviados' && (
        <div className="space-y-3">
          {!enviados.length && (
            <p className="text-center text-[13px] text-gray-400 py-12">Sin reconocimientos enviados en {formatMes(mes)}</p>
          )}
          {enviados.map(r => (
            <div key={r.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2.5">
                  <Avatar nombre={r.receptor.nombre} foto={r.receptor.foto_perfil} size={28} />
                  <div>
                    <p className="text-[12px] font-semibold text-[var(--text)]">{r.receptor.nombre}</p>
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

// ─── Tab: Reconocer ───────────────────────────────────────────────────────────
function TabReconocer({ onEnviado }: { onEnviado: () => void }) {
  const [textoReco] = useState(() => TEXTOS_RECO[Math.floor(Math.random() * TEXTOS_RECO.length)])
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

  const filtrados = disponibles.filter(u => !u.bloqueado && u.nombre.toLowerCase().includes(busqueda.toLowerCase()))
  const bloqueadosCount = disponibles.filter(u => u.bloqueado).length

  async function enviar() {
    if (!receptor || !pilar || mensaje.trim().length < 50) return
    setEnviando(true); setError('')
    try {
      const res = await fetch('/api/reconocimientos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id_receptor: receptor.id, categoria_pilar: pilar, mensaje: mensaje.trim(), anonimo }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error ?? 'Error al enviar'); return }
      setExito(true)
      setReceptor(null); setPilar(''); setMensaje(''); setAnonimo(false)
      cargar(); onEnviado()
    } finally { setEnviando(false) }
  }

  if (loading) return <Spinner />

  if (exito) return (
    <div className="text-center py-14">
      <div className="w-14 h-14 rounded-2xl bg-green-50 border border-green-100 flex items-center justify-center mx-auto mb-3">
        <IconCheck size={28} className="text-green-600" />
      </div>
      <p className="text-[15px] font-semibold text-[var(--text)] mb-1">Reconocimiento enviado</p>
      <p className="text-[13px] text-gray-400 mb-5">Quedó pendiente de aprobación por un admin.</p>
      <button onClick={() => setExito(false)} className="px-5 py-2 bg-[image:var(--gradient)] text-white rounded-xl text-[13px] font-semibold cursor-pointer">
        Dar otro
      </button>
    </div>
  )

  return (
    <div className="space-y-5">
      {/* Info */}
      <div className="bg-yellow-50 border border-yellow-100 rounded-2xl p-4 flex items-start gap-3">
        <IconTrophy size={16} className="text-yellow-600 flex-shrink-0 mt-0.5" />
        <p className="text-[12px] text-yellow-800 leading-relaxed">{textoReco}</p>
      </div>

      {/* Cuota */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
        <div className="flex items-center justify-between mb-2">
          <p className="text-[12px] text-gray-500">Reconocimientos este mes</p>
          <span className="text-[13px] font-bold text-[var(--primary)]">{cuotaRestante} disponible{cuotaRestante !== 1 ? 's' : ''}</span>
        </div>
        <div className="flex gap-1.5">
          {[0, 1, 2].map(i => (
            <div key={i} className={`h-1.5 flex-1 rounded-full ${i < cuotaUsada ? 'bg-[var(--primary)]' : 'bg-gray-100'}`} />
          ))}
        </div>
      </div>

      {cuotaRestante === 0 && (
        <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-700 text-[13px]">
          Usaste los 3 reconocimientos del mes. ¡Volvé el mes que viene!
        </div>
      )}

      {/* Paso 1 */}
      <div>
        <label className="text-[11px] text-gray-400 font-semibold uppercase tracking-wide mb-2 block">1. ¿A quién reconocés?</label>
        {receptor ? (
          <div className="flex items-center gap-2.5 p-3 rounded-xl border border-[var(--primary)] bg-[var(--primary-light)]">
            <Avatar nombre={receptor.nombre} foto={receptor.foto_perfil} size={34} />
            <p className="text-[13px] font-semibold text-[var(--primary)] flex-1">{receptor.nombre}</p>
            <button onClick={() => setReceptor(null)} className="p-1 text-gray-400 hover:text-gray-600 cursor-pointer"><IconX size={15} /></button>
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm">
            <div className="p-3 border-b border-gray-100">
              <input type="text" placeholder="Buscar compañero…" value={busqueda} onChange={e => setBusqueda(e.target.value)}
                className="w-full text-[13px] outline-none placeholder:text-gray-300" />
            </div>
            <div className="max-h-44 overflow-y-auto divide-y divide-gray-50">
              {filtrados.map(u => (
                <button key={u.id} onClick={() => { setReceptor(u); setBusqueda('') }}
                  className="flex items-center gap-2.5 px-3 py-2.5 hover:bg-gray-50 transition-colors cursor-pointer w-full text-left">
                  <Avatar nombre={u.nombre} foto={u.foto_perfil} size={30} />
                  <span className="text-[13px] font-medium text-[var(--text)]">{u.nombre}</span>
                </button>
              ))}
              {!filtrados.length && <p className="text-[12px] text-gray-400 text-center py-4">{busqueda ? 'Sin resultados' : 'Sin compañeros disponibles'}</p>}
            </div>
            {bloqueadosCount > 0 && (
              <p className="text-[11px] text-gray-400 px-3 py-2 border-t border-gray-50">
                {bloqueadosCount} {bloqueadosCount === 1 ? 'compañero bloqueado' : 'compañeros bloqueados'} (ya los reconociste este mes o el anterior)
              </p>
            )}
          </div>
        )}
      </div>

      {/* Paso 2 */}
      <div>
        <label className="text-[11px] text-gray-400 font-semibold uppercase tracking-wide mb-2 block">2. ¿En qué pilar?</label>
        <div className="space-y-2">
          {PILARES.map(p => (
            <button key={p.key} onClick={() => setPilar(pilar === p.key ? '' : p.key)}
              className={`flex items-center gap-3 p-3 rounded-xl border w-full text-left cursor-pointer transition-colors ${pilar === p.key ? `${p.bg} border-current` : 'bg-white border-gray-100 shadow-sm'}`}>
              <span className="text-xl flex-shrink-0">{p.emoji}</span>
              <div className="flex-1">
                <p className={`text-[13px] font-semibold ${pilar === p.key ? p.color : 'text-[var(--text)]'}`}>{p.label}</p>
                <p className="text-[11px] text-gray-400">
                  {p.key === 'salvavidas' && 'Ayudó en un momento crítico o resolvió algo urgente'}
                  {p.key === 'buena_vibra' && 'Contagia energía positiva y hace mejor al equipo'}
                  {p.key === 'iniciativa' && 'Propuso o hizo algo nuevo sin que nadie se lo pidiera'}
                </p>
              </div>
              {pilar === p.key && <IconCheck size={16} className={p.color} />}
            </button>
          ))}
        </div>
      </div>

      {/* Paso 3 */}
      <div>
        <label className="text-[11px] text-gray-400 font-semibold uppercase tracking-wide mb-2 block">
          3. Tu mensaje <span className="font-normal normal-case">(mínimo 50 caracteres)</span>
        </label>
        <textarea value={mensaje} onChange={e => setMensaje(e.target.value)} rows={4}
          placeholder="Contá concretamente qué hizo esta persona y cómo impactó en vos o el equipo…"
          className="w-full px-3 py-2.5 rounded-xl border border-gray-200 bg-white text-[13px] resize-none outline-none focus:border-[var(--primary)] transition-colors" />
        <p className={`text-[11px] mt-1 ${mensaje.length >= 50 ? 'text-green-600' : 'text-gray-400'}`}>{mensaje.length} / 50 mínimo</p>
      </div>

      {/* Paso 4 */}
      <label className="flex items-center gap-3 cursor-pointer select-none bg-white rounded-xl border border-gray-100 shadow-sm p-3">
        <div onClick={() => setAnonimo(v => !v)}
          className={`w-10 h-5 rounded-full transition-colors relative flex-shrink-0 cursor-pointer ${anonimo ? 'bg-[var(--primary)]' : 'bg-gray-200'}`}>
          <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${anonimo ? 'translate-x-5' : 'translate-x-0.5'}`} />
        </div>
        <div>
          <p className="text-[13px] font-medium text-[var(--text)]">Enviar de forma anónima</p>
          {anonimo && <p className="text-[11px] text-gray-400">Solo los admins sabrán que fuiste vos.</p>}
        </div>
      </label>

      {error && <p className="text-[13px] text-red-600 bg-red-50 border border-red-100 rounded-xl px-3 py-2">{error}</p>}

      <button onClick={enviar} disabled={!receptor || !pilar || mensaje.trim().length < 50 || cuotaRestante === 0 || enviando}
        className="w-full py-3 bg-[image:var(--gradient)] text-white font-semibold rounded-xl text-[14px] disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed">
        {enviando ? 'Enviando…' : 'Enviar reconocimiento'}
      </button>
    </div>
  )
}

// ─── Tab: Moderar (solo admin) ────────────────────────────────────────────────
function TabModerar({ onModerado }: { onModerado: () => void }) {
  const [data, setData] = useState<{ pendientes: RecAdmin[]; ranking: RankingItem[]; todos: RecAdminAll[] } | null>(null)
  const [loading, setLoading] = useState(true)
  const [moderando, setModerando] = useState<string | null>(null)
  const [subtab, setSubtab] = useState<'pendientes' | 'todos' | 'ranking'>('pendientes')
  const [mes, setMes] = useState(getMesCiclo())
  const [enviandoNoti, setEnviandoNoti] = useState(false)
  const [notiEnviada, setNotiEnviada] = useState<number | null>(null)
  const [editTarget, setEditTarget] = useState<RecAdminAll | null>(null)
  const [editPilar, setEditPilar] = useState<Pilar>('salvavidas')
  const [editMensaje, setEditMensaje] = useState('')
  const [guardando, setGuardando] = useState(false)

  async function enviarRecordatorio() {
    setEnviandoNoti(true)
    try {
      const res = await fetch('/api/reconocimientos/enviar-recordatorio', { method: 'POST' })
      const d = await res.json()
      if (res.ok) setNotiEnviada(d.enviadas)
    } finally {
      setEnviandoNoti(false)
    }
  }

  const cargar = useCallback((m: string) => {
    setLoading(true)
    fetch(`/api/reconocimientos/admin?mes=${m}`)
      .then(r => r.json())
      .then(d => { if (d.pendientes) setData(d) })
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { cargar(mes) }, [mes, cargar])

  async function moderar(id: string, accion: 'aprobado' | 'oculto') {
    setModerando(id)
    await fetch(`/api/reconocimientos/${id}/moderar`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accion }),
    })
    setModerando(null)
    onModerado()
    cargar(mes)
  }

  function abrirEdicion(r: RecAdminAll) {
    setEditTarget(r)
    setEditPilar(r.categoria_pilar)
    setEditMensaje(r.mensaje)
  }

  async function guardarEdicion() {
    if (!editTarget) return
    setGuardando(true)
    const res = await fetch(`/api/reconocimientos/${editTarget.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ categoria_pilar: editPilar, mensaje: editMensaje }),
    })
    setGuardando(false)
    if (res.ok) {
      setEditTarget(null)
      cargar(mes)
    }
  }

  const pendientesCount = data?.pendientes.length ?? 0

  return (
    <div>
      {/* Recordatorio */}
      <div className="bg-white border border-gray-100 rounded-2xl shadow-sm p-4 mb-4 flex items-center gap-3">
        <div className="w-9 h-9 rounded-xl bg-yellow-50 border border-yellow-100 flex items-center justify-center flex-shrink-0">
          <IconTrophy size={16} className="text-yellow-600" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[13px] font-semibold text-[var(--text)]">Recordatorio del mes</p>
          <p className="text-[11px] text-gray-400 leading-snug">
            {notiEnviada !== null ? `✓ Notificación enviada a ${notiEnviada} personas` : 'Invitá a todo el equipo a reconocer a alguien'}
          </p>
        </div>
        <button
          onClick={enviarRecordatorio}
          disabled={enviandoNoti || notiEnviada !== null}
          className="px-3 py-1.5 rounded-xl text-[12px] font-semibold cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          style={notiEnviada !== null ? { background: '#f0fdf4', color: '#16a34a' } : { background: 'linear-gradient(135deg, #eab308, #ca8a04)', color: '#fff' }}
        >
          {enviandoNoti ? 'Enviando…' : notiEnviada !== null ? 'Enviada' : 'Enviar'}
        </button>
      </div>

      <div className="flex gap-1 p-1 bg-gray-100 rounded-xl mb-4">
        {([['pendientes', `Pendientes (${pendientesCount})`], ['todos', 'Todos'], ['ranking', 'Ranking']] as const).map(([key, label]) => (
          <button key={key} onClick={() => setSubtab(key)}
            className={`flex-1 py-2 text-[13px] font-medium rounded-[10px] cursor-pointer transition-all ${subtab === key ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'}`}>
            {label}
          </button>
        ))}
      </div>

      {(subtab === 'todos' || subtab === 'ranking') && <NavMes mes={mes} onChange={m => { setMes(m); setData(null) }} />}

      {loading && <Spinner />}

      {!loading && subtab === 'pendientes' && (
        <div className="space-y-3">
          {!pendientesCount && (
            <div className="text-center py-14">
              <div className="w-12 h-12 rounded-2xl bg-green-50 border border-green-100 flex items-center justify-center mx-auto mb-3">
                <IconCheck size={24} className="text-green-500" />
              </div>
              <p className="text-[13px] text-gray-400">No hay reconocimientos pendientes</p>
            </div>
          )}
          {data?.pendientes.map(r => (
            <div key={r.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="p-4">
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-[12px] font-semibold text-[var(--text)]">{r.emisor.nombre}</span>
                      <span className="text-[11px] text-gray-300">→</span>
                      <span className="text-[12px] font-semibold text-[var(--text)]">{r.receptor.nombre}</span>
                      {r.anonimo && <span className="text-[10px] bg-gray-100 text-gray-400 border border-gray-200 px-1.5 py-0.5 rounded-full">Anónimo</span>}
                    </div>
                    <p className="text-[10px] text-gray-400 mt-0.5">{timeAgo(r.fecha_creacion)} · {r.mes_ciclo}</p>
                  </div>
                  <PilarBadge pilar={r.categoria_pilar} />
                </div>
                <p className="text-[13px] text-[var(--text-sub)] leading-relaxed mb-3">{r.mensaje}</p>
                <div className="flex gap-2 border-t border-gray-100 pt-3">
                  <button onClick={() => moderar(r.id, 'oculto')} disabled={moderando === r.id}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2 border border-gray-200 text-gray-500 rounded-xl text-[13px] font-medium cursor-pointer disabled:opacity-50 hover:bg-gray-50 transition-colors">
                    <IconX size={14} /> Ocultar
                  </button>
                  <button onClick={() => moderar(r.id, 'aprobado')} disabled={moderando === r.id}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2 bg-green-600 text-white rounded-xl text-[13px] font-semibold cursor-pointer disabled:opacity-50 hover:bg-green-700 transition-colors">
                    <IconCheck size={14} /> Aprobar
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {!loading && subtab === 'todos' && (
        <div className="space-y-3">
          {!data?.todos?.length && (
            <p className="text-center text-[13px] text-gray-400 py-12">No hay reconocimientos en {formatMes(mes)}</p>
          )}
          {data?.todos?.map(r => (
            <div key={r.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
              <div className="flex items-start justify-between gap-2 mb-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-[12px] font-semibold text-[var(--text)]">{r.emisor.nombre}</span>
                    <span className="text-[11px] text-gray-300">→</span>
                    <span className="text-[12px] font-semibold text-[var(--text)]">{r.receptor.nombre}</span>
                    {r.anonimo && <span className="text-[10px] bg-gray-100 text-gray-400 border border-gray-200 px-1.5 py-0.5 rounded-full">Anónimo</span>}
                  </div>
                  <p className="text-[10px] text-gray-400 mt-0.5">{timeAgo(r.fecha_creacion)}</p>
                </div>
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  <PilarBadge pilar={r.categoria_pilar} />
                  <EstadoBadge estado={r.estado} />
                  <button onClick={() => abrirEdicion(r)}
                    className="p-1.5 rounded-lg border border-gray-200 text-gray-400 hover:text-gray-700 hover:bg-gray-50 transition-colors cursor-pointer">
                    <IconEdit size={14} />
                  </button>
                </div>
              </div>
              <p className="text-[13px] text-[var(--text-sub)] leading-relaxed">{r.mensaje}</p>
            </div>
          ))}
        </div>
      )}

      {!loading && subtab === 'ranking' && (
        <div className="space-y-2">
          {!data?.ranking.length && (
            <p className="text-center text-[13px] text-gray-400 py-12">No hay reconocimientos aprobados en {formatMes(mes)}</p>
          )}
          {data?.ranking.map((item, i) => (
            <div key={item.id} className="flex items-center gap-3 bg-white border border-gray-100 rounded-xl px-4 py-3 shadow-sm">
              <span className="text-[14px] font-bold text-gray-300 w-5 text-center">{i + 1}</span>
              <Avatar nombre={item.nombre} foto={item.foto_perfil} size={34} />
              <div className="flex-1 min-w-0">
                <p className="text-[13px] font-semibold truncate">{item.nombre}</p>
                <div className="flex gap-2 mt-0.5">
                  {item.salvavidas  > 0 && <span className="text-[10px] text-blue-500">🛟 {item.salvavidas}</span>}
                  {item.buena_vibra > 0 && <span className="text-[10px] text-amber-500">☀️ {item.buena_vibra}</span>}
                  {item.iniciativa  > 0 && <span className="text-[10px] text-violet-500">⚡ {item.iniciativa}</span>}
                </div>
              </div>
              <span className="text-[17px] font-bold text-[var(--primary)]">{item.total}</span>
            </div>
          ))}
        </div>
      )}

      {/* Modal edición */}
      {editTarget && createPortal(
        <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center bg-black/50 p-4" onClick={() => setEditTarget(null)}>
          <div className="bg-white rounded-2xl w-full max-w-md p-5 space-y-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <p className="text-[15px] font-bold text-[var(--text)]">Editar reconocimiento</p>
              <button onClick={() => setEditTarget(null)} className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 cursor-pointer transition-colors">
                <IconX size={18} />
              </button>
            </div>
            <p className="text-[12px] text-gray-400">
              <span className="font-semibold text-[var(--text)]">{editTarget.emisor.nombre}</span> → <span className="font-semibold text-[var(--text)]">{editTarget.receptor.nombre}</span>
            </p>
            <div>
              <p className="text-[12px] font-medium text-gray-500 mb-2">Pilar</p>
              <div className="flex gap-2">
                {PILARES.map(p => (
                  <button key={p.key} onClick={() => setEditPilar(p.key)}
                    className={`flex-1 py-2 rounded-xl text-[12px] font-semibold border cursor-pointer transition-all ${editPilar === p.key ? `${p.bg} ${p.color} border-current` : 'border-gray-200 text-gray-400 hover:bg-gray-50'}`}>
                    {p.emoji} {p.label}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <p className="text-[12px] font-medium text-gray-500 mb-2">Mensaje</p>
              <textarea
                value={editMensaje}
                onChange={e => setEditMensaje(e.target.value)}
                rows={4}
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-[13px] text-[var(--text)] resize-none focus:outline-none focus:border-[var(--primary)]"
              />
              <p className="text-[11px] text-gray-400 mt-1">{editMensaje.length} caracteres</p>
            </div>
            <div className="flex gap-2 pt-1 border-t border-gray-100">
              <button onClick={() => { moderar(editTarget.id, 'oculto'); setEditTarget(null) }} disabled={guardando}
                className="flex items-center justify-center gap-1.5 px-3 py-2.5 border border-gray-200 text-gray-500 rounded-xl text-[13px] font-medium cursor-pointer disabled:opacity-40 hover:bg-gray-50 transition-colors">
                <IconEyeOff size={14} /> Ocultar
              </button>
              <button onClick={() => { moderar(editTarget.id, 'aprobado'); setEditTarget(null) }} disabled={guardando}
                className="flex items-center justify-center gap-1.5 px-3 py-2.5 bg-green-600 text-white rounded-xl text-[13px] font-semibold cursor-pointer disabled:opacity-40 hover:bg-green-700 transition-colors">
                <IconCheck size={14} /> Aprobar
              </button>
              <button onClick={guardarEdicion} disabled={guardando || editMensaje.trim().length < 10}
                className="flex-1 py-2.5 bg-[image:var(--gradient)] text-white rounded-xl text-[13px] font-semibold cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
                {guardando ? 'Guardando…' : 'Guardar'}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  )
}

// ─── Main ─────────────────────────────────────────────────────────────────────
export default function ReconocimientosClient({ session }: { session: SessionUser }) {
  const isAdmin = session.rol === 'admin' || session.rol === 'Admin'

  type Tab = 'mural' | 'medallas' | 'reconocer' | 'moderar'
  const [tab, setTab] = useState<Tab>('mural')
  const [muralKey, setMuralKey] = useState(0)
  const [pendingCount, setPendingCount] = useState(0)

  useEffect(() => {
    if (!isAdmin) return
    fetch(`/api/reconocimientos/admin?mes=${getMesCiclo()}`)
      .then(r => r.json())
      .then(d => { if (Array.isArray(d?.pendientes)) setPendingCount(d.pendientes.length) })
      .catch(() => {})
  }, [isAdmin])

  const tabs: { key: Tab; label: string }[] = [
    { key: 'mural',     label: 'Mural' },
    { key: 'reconocer', label: 'Reconocer' },
    { key: 'medallas',  label: 'Mis medallas' },
    ...(isAdmin ? [{ key: 'moderar' as Tab, label: 'Moderar' }] : []),
  ]

  return (
    <div className="py-4 fade-in">
      <div className="flex items-center gap-3 mb-5">
        <div className="w-9 h-9 rounded-xl bg-[image:var(--gradient)] flex items-center justify-center flex-shrink-0 shadow-sm">
          <IconTrophy size={18} className="text-white" />
        </div>
        <div>
          <h1 className="text-[17px] font-bold text-[var(--text)]">Reconocimientos</h1>
          <p className="text-xs text-[var(--text-sub)]">Reconocé el trabajo de tus compañeros</p>
        </div>
      </div>

      <div className="flex gap-1 p-1 bg-gray-100 rounded-xl mb-5">
        {tabs.map(t => {
          const isReco = t.key === 'reconocer'
          return (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={`relative flex-1 py-2 text-[13px] rounded-[10px] cursor-pointer transition-all ${
                isReco
                  ? 'font-semibold text-white'
                  : tab === t.key
                  ? 'bg-white text-gray-900 shadow-sm font-medium'
                  : 'text-gray-500 font-medium'
              }`}
              style={isReco ? {
                background: 'linear-gradient(135deg, #eab308, #ca8a04)',
                boxShadow: '0 4px 10px rgba(202,138,4,0.45)',
              } : undefined}>
              {t.label}
              {t.key === 'moderar' && pendingCount > 0 && (
                <span className="absolute -top-1 -right-1 min-w-[16px] h-4 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center px-1 leading-none">
                  {pendingCount}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {tab === 'mural'     && <TabMural key={muralKey} />}
      {tab === 'medallas'  && <TabMisMedallas />}
      {tab === 'reconocer' && <TabReconocer onEnviado={() => { setMuralKey(k => k + 1); setTab('mural') }} />}
      {tab === 'moderar'   && isAdmin && <TabModerar onModerado={() => setPendingCount(c => Math.max(0, c - 1))} />}
    </div>
  )
}
