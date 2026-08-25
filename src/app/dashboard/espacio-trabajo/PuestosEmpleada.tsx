'use client'

import { useState, useEffect, useCallback } from 'react'
import { Spinner, Confirm } from '@/components/ui'
import { IconLayoutGrid, IconCalendarCheck, IconX, IconClock } from '@/components/ui/Icons'
import { fmtFechaLarga } from '@/lib/fecha'
import { conArticulo } from '@/lib/gaps'
import MisHorarios from './MisHorarios'

interface Puesto {
  id: string
  fecha: string
  hora_inicio: string
  hora_fin: string
  horas: number
  turno: 'Mañana' | 'Tarde' | null
  tipo_recurso: 'mesa' | 'box'
  cantidad: number
  mi_solicitud: 'none' | 'pending'
  solicitud_id: string | null
  contiguo?: boolean
  contiguoTipo?: 'entrar_antes' | 'quedarse_mas' | 'ambos' | null
}

// Textos según de qué lado queda el hueco respecto del turno propio
const CONTIGUO_TEXTO: Record<'entrar_antes' | 'quedarse_mas' | 'ambos', { badge: string; sub: string }> = {
  entrar_antes: { badge: 'Entrá antes', sub: 'Pegado a tu turno — podés entrar antes' },
  quedarse_mas: { badge: 'Quedate más', sub: 'Pegado a tu turno — podés quedarte más' },
  ambos: { badge: 'Completá tu jornada', sub: 'Justo entre tus dos turnos del día' },
}

function todayStr() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' })
}

function addDaysStr(fecha: string, n: number): string {
  const d = new Date(fecha + 'T12:00:00Z')
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

const TURNO_STYLE = {
  Mañana: { bg: 'bg-sky-50', text: 'text-sky-600', border: 'border-sky-100' },
  Tarde: { bg: 'bg-violet-50', text: 'text-violet-600', border: 'border-violet-100' },
  ninguno: { bg: 'bg-gray-100', text: 'text-gray-500', border: 'border-gray-200' },
} as const

function tituloPuesto(p: Puesto): string {
  const tipoLabel = p.tipo_recurso === 'box' ? 'Box' : 'Mesa'
  const tipoPlural = p.tipo_recurso === 'box' ? 'boxes' : 'mesas'
  return p.cantidad > 1 ? `${p.cantidad} ${tipoPlural} disponibles` : `${tipoLabel} disponible`
}

type Renderable = { kind: 'divider'; label: string } | { kind: 'item'; puesto: Puesto }

// Separador visual entre "esta semana" y "la próxima" (lunes a sábado) para que la lista larga
// no se lea como un bloque continuo de fechas.
function conDivisoresDeSemana(puestos: Puesto[], hoy: string): Renderable[] {
  const dow = new Date(hoy + 'T12:00:00Z').getUTCDay() // 0=Dom..6=Sáb
  const sabadoActual = addDaysStr(hoy, dow === 0 ? -1 : 6 - dow)

  const out: Renderable[] = []
  let semanaAnterior: string | null = null
  for (const p of puestos) {
    const semana = p.fecha <= sabadoActual ? 'Esta semana' : 'La semana que viene'
    if (semana !== semanaAnterior) {
      out.push({ kind: 'divider', label: semana })
      semanaAnterior = semana
    }
    out.push({ kind: 'item', puesto: p })
  }
  return out
}

export default function PuestosEmpleadaView({ soloHorarios = false }: { soloHorarios?: boolean }) {
  const [tab, setTab] = useState<'pedir' | 'horarios'>(soloHorarios ? 'horarios' : 'pedir')
  const [puestos, setPuestos] = useState<Puesto[] | null>(null)
  const [recurso, setRecurso] = useState<'mesa' | 'box'>('mesa')
  const [hoy, setHoy] = useState(todayStr())
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [enviando, setEnviando] = useState<string | null>(null)
  const [toast, setToast] = useState('')
  const [confirmSolicitar, setConfirmSolicitar] = useState<Puesto | null>(null)
  const [confirmCancelar, setConfirmCancelar] = useState<Puesto | null>(null)

  const cargar = useCallback(() => {
    setLoading(true); setError('')
    fetch('/api/puestos-disponibles')
      .then(r => r.json())
      .then(d => { if (d.error) setError(d.error); else { setPuestos(d.puestos); setRecurso(d.tipo_recurso); setHoy(d.hoy) } })
      .catch(() => setError('No se pudo cargar'))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { if (!soloHorarios) cargar() }, [cargar, soloHorarios])

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(''), 3000)
    return () => clearTimeout(t)
  }, [toast])

  async function solicitar(id: string) {
    setEnviando(id)
    try {
      const res = await fetch('/api/puestos-disponibles/solicitar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      })
      const d = await res.json()
      if (!res.ok) { setToast(d.error ?? 'No se pudo solicitar'); return }
      setToast('Solicitud enviada — te avisamos cuando se apruebe')
      cargar()
    } finally { setEnviando(null); setConfirmSolicitar(null) }
  }

  async function cancelar(id: string, solicitudId: string) {
    setEnviando(id)
    try {
      await fetch(`/api/puestos-disponibles/${solicitudId}`, { method: 'DELETE' })
      setToast('Solicitud cancelada')
      cargar()
    } finally { setEnviando(null); setConfirmCancelar(null) }
  }

  const proximos = puestos?.filter(p => p.fecha >= hoy) ?? []
  const lista = conDivisoresDeSemana(proximos, hoy)

  return (
    <div className="py-4 space-y-4">
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-xl bg-[image:var(--gradient)] flex items-center justify-center flex-shrink-0 shadow-sm">
          <IconLayoutGrid size={17} className="text-white" />
        </div>
        <div>
          <h1 className="text-[17px] font-bold text-[var(--text)] leading-tight">Espacio de trabajo</h1>
          <p className="text-[12px] text-[var(--text-muted)]">
            {tab === 'pedir' ? `Pedí cubrir ${conArticulo(recurso)} libre esta semana o la próxima, y sumá horas de trabajo` : 'Tus turnos de esta semana y la próxima'}
          </p>
        </div>
      </div>

      {!soloHorarios && (
        <div className="flex gap-1 p-1 bg-gray-100 rounded-xl">
          <button onClick={() => setTab('pedir')}
            className={`flex-1 py-2 text-[13px] font-medium rounded-[10px] cursor-pointer transition-all ${tab === 'pedir' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'}`}>
            Pedir horarios
          </button>
          <button onClick={() => setTab('horarios')}
            className={`flex-1 py-2 text-[13px] font-medium rounded-[10px] cursor-pointer transition-all ${tab === 'horarios' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'}`}>
            Mis horarios
          </button>
        </div>
      )}

      {tab === 'horarios' && <MisHorarios />}

      {tab === 'pedir' && (loading ? (
        <div className="py-16"><Spinner /></div>
      ) : error ? (
        <div className="py-10 text-center text-sm text-red-500">{error}</div>
      ) : proximos.length === 0 ? (
        <div className="bg-white rounded-2xl border border-[var(--border)] py-14 text-center px-6">
          <IconCalendarCheck size={32} className="mx-auto mb-3 text-gray-200" />
          <p className="text-sm text-[var(--text-muted)]">No hay puestos libres por ahora</p>
          <p className="text-xs text-[var(--text-muted)] mt-1">Te avisamos apenas se libere alguno</p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {lista.map((item, i) => {
            if (item.kind === 'divider') {
              return (
                <div key={`div-${item.label}`} className={`flex items-center gap-2 ${i === 0 ? '' : 'pt-2'}`}>
                  <span className="text-[11px] font-bold uppercase tracking-wide text-[var(--text-muted)]">{item.label}</span>
                  <div className="flex-1 h-px bg-[var(--border)]" />
                </div>
              )
            }

            const p = item.puesto
            const solicitando = enviando === p.id
            const titulo = tituloPuesto(p)
            const estilo = TURNO_STYLE[p.turno ?? 'ninguno']

            return (
              <div key={p.id} className="bg-white rounded-2xl border border-[var(--border)] p-4 flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className={`w-9 h-9 rounded-xl ${estilo.bg} flex items-center justify-center flex-shrink-0`}>
                    <IconClock size={16} className={estilo.text} />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <p className="text-[13px] font-semibold text-[var(--text)]">{titulo}</p>
                      {p.turno && (
                        <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${estilo.bg} ${estilo.text} border ${estilo.border}`}>
                          Turno {p.turno}
                        </span>
                      )}
                      {p.contiguo && p.contiguoTipo && (
                        <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-emerald-50 text-emerald-600 border border-emerald-100">
                          {CONTIGUO_TEXTO[p.contiguoTipo].badge}
                        </span>
                      )}
                    </div>
                    <p className="text-[13px] text-[var(--text)] mt-1">{fmtFechaLarga(p.fecha)}</p>
                    <p className={`text-[12px] flex items-center gap-1 mt-0.5 ${estilo.text}`}>
                      <IconClock size={11} />
                      {p.hora_inicio} – {p.hora_fin} · {p.horas}hs disponibles
                    </p>
                    {p.contiguo && p.contiguoTipo && (
                      <p className="text-[11px] text-emerald-600 mt-0.5">{CONTIGUO_TEXTO[p.contiguoTipo].sub}</p>
                    )}
                  </div>
                </div>
                {p.mi_solicitud === 'pending' ? (
                  <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
                    <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-amber-50 text-amber-600 border border-amber-100">
                      Pendiente
                    </span>
                    <button
                      onClick={() => setConfirmCancelar(p)}
                      disabled={solicitando}
                      className="flex items-center gap-1 text-[11px] text-red-400 hover:text-red-600 cursor-pointer disabled:opacity-40">
                      <IconX size={11} /> Cancelar
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setConfirmSolicitar(p)}
                    disabled={solicitando}
                    className="flex-shrink-0 px-4 py-2 bg-[image:var(--gradient)] text-white rounded-xl text-[13px] font-semibold cursor-pointer disabled:opacity-50">
                    {solicitando ? '...' : 'Solicitar'}
                  </button>
                )}
              </div>
            )
          })}
        </div>
      ))}

      {toast && (
        <div className="fixed bottom-20 left-1/2 -translate-x-1/2 bg-gray-900 text-white text-[13px] px-4 py-2.5 rounded-xl shadow-lg z-50">
          {toast}
        </div>
      )}

      <Confirm
        open={!!confirmSolicitar}
        title="¿Solicitás cubrir este puesto?"
        message={confirmSolicitar
          ? `Vas a solicitar ${conArticulo(confirmSolicitar.tipo_recurso)} el ${fmtFechaLarga(confirmSolicitar.fecha)}, de ${confirmSolicitar.hora_inicio} a ${confirmSolicitar.hora_fin}. Un admin todavía tiene que aprobarlo.`
          : ''}
        confirmLabel="Solicitar"
        loading={!!confirmSolicitar && enviando === confirmSolicitar.id}
        onConfirm={() => confirmSolicitar && solicitar(confirmSolicitar.id)}
        onClose={() => setConfirmSolicitar(null)}
      />
      <Confirm
        open={!!confirmCancelar}
        title="¿Cancelás tu solicitud?"
        message={confirmCancelar
          ? `Vas a cancelar tu solicitud del ${fmtFechaLarga(confirmCancelar.fecha)}, de ${confirmCancelar.hora_inicio} a ${confirmCancelar.hora_fin}. El puesto quedará libre otra vez.`
          : ''}
        confirmLabel="Sí, cancelar"
        danger
        loading={!!confirmCancelar && enviando === confirmCancelar.id}
        onConfirm={() => confirmCancelar?.solicitud_id && cancelar(confirmCancelar.id, confirmCancelar.solicitud_id)}
        onClose={() => setConfirmCancelar(null)}
      />
    </div>
  )
}
