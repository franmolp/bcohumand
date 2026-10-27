'use client'

import { useState } from 'react'
import { IconCheck, IconX } from '@/components/ui/Icons'

export interface InvFijada {
  id: number
  imagen_url: string | null
  contenido: string
  rsvp_limite: string | null
  cerrado?: boolean
  mi_rsvp: { asiste: boolean; restriccion: string | null } | null
}

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
function fmtFecha(d: string) {
  const [, m, day] = d.slice(0, 10).split('-').map(Number)
  return `${day} de ${MESES[(m || 1) - 1]}`
}
function hoyAR() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' })
}

// Invitación fijada arriba del Inicio (solo empleadas): la tarjeta con los botones
// de confirmar/no asistir y el campo de dieta. Tras responder se colapsa a su estado,
// con "Modificar" para cambiarlo (mientras no esté vencida).
export default function InvitacionFijada({ invitacion }: { invitacion: InvFijada }) {
  const [mi, setMi] = useState(invitacion.mi_rsvp)
  const [editando, setEditando] = useState(!invitacion.mi_rsvp)
  const [restriccion, setRestriccion] = useState(invitacion.mi_rsvp?.restriccion ?? '')
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState('')
  const [ampliada, setAmpliada] = useState(false)

  const vencida = !!invitacion.cerrado || (!!invitacion.rsvp_limite && hoyAR() > invitacion.rsvp_limite.slice(0, 10))

  async function enviar(asiste: boolean) {
    setEnviando(true); setError('')
    const res = await fetch(`/api/muro/${invitacion.id}/rsvp`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ asiste, restriccion: asiste ? restriccion : '' }),
    })
    setEnviando(false)
    if (!res.ok) { const d = await res.json().catch(() => ({})); setError(d.error || 'No se pudo guardar'); return }
    setMi({ asiste, restriccion: asiste ? (restriccion.trim() || null) : null })
    setEditando(false)
  }

  return (
    <div className="rounded-2xl border-2 border-pink-200 bg-white shadow-sm overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-2.5 bg-pink-50 border-b border-pink-100">
        <span className="text-[13px]">🎉</span>
        <span className="text-[12px] font-bold uppercase tracking-wide text-pink-600">Invitación</span>
        {invitacion.rsvp_limite && !vencida && (
          <span className="ml-auto text-[11px] font-semibold text-pink-500">Confirmá antes del {fmtFecha(invitacion.rsvp_limite)}</span>
        )}
      </div>

      {invitacion.imagen_url && (
        <button onClick={() => setAmpliada(true)} className="block w-full cursor-zoom-in">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={invitacion.imagen_url} alt="Invitación" className="w-full max-h-[60vh] object-contain bg-gray-50" />
        </button>
      )}

      {invitacion.contenido?.trim() && (
        <p className="px-4 pt-3 text-[13px] text-[var(--text)] leading-relaxed whitespace-pre-wrap">{invitacion.contenido}</p>
      )}

      <div className="px-4 py-4 space-y-2.5">
        {editando && !vencida ? (
          <>
            <p className="text-[13px] font-semibold text-[var(--text)]">¿Vas a venir?</p>
            <input value={restriccion} onChange={e => setRestriccion(e.target.value)} maxLength={500}
              placeholder="Dieta o restricción especial (opcional): vegetariana, sin TACC, alergias…"
              className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-[13px] outline-none focus:border-[var(--primary)]" />
            {error && <p className="text-[12px] text-red-500">{error}</p>}
            <div className="flex gap-2">
              <button onClick={() => enviar(true)} disabled={enviando}
                className="flex-1 py-2.5 rounded-xl bg-emerald-500 text-white text-[13px] font-semibold disabled:opacity-50 hover:opacity-90 cursor-pointer flex items-center justify-center gap-1.5">
                <IconCheck size={15} /> Confirmar asistencia
              </button>
              <button onClick={() => enviar(false)} disabled={enviando}
                className="flex-1 py-2.5 rounded-xl bg-gray-100 text-gray-600 text-[13px] font-semibold disabled:opacity-50 hover:bg-gray-200 cursor-pointer">
                No puedo asistir
              </button>
            </div>
            {mi && (
              <button onClick={() => setEditando(false)} className="text-[11px] text-gray-400 hover:text-gray-600 cursor-pointer">Cancelar</button>
            )}
          </>
        ) : mi ? (
          <div className={`rounded-xl p-3 ${mi.asiste ? 'bg-emerald-50' : 'bg-gray-50'}`}>
            <div className="flex items-center justify-between gap-2">
              <p className={`text-[13px] font-semibold flex items-center gap-1.5 ${mi.asiste ? 'text-emerald-700' : 'text-gray-500'}`}>
                {mi.asiste ? <><IconCheck size={15} /> Confirmaste tu asistencia</> : 'Avisaste que no podés venir'}
              </p>
              {!vencida && (
                <button onClick={() => { setRestriccion(mi.restriccion ?? ''); setEditando(true) }}
                  className="text-[11px] text-[var(--primary)] font-medium cursor-pointer hover:opacity-70 shrink-0">Modificar</button>
              )}
            </div>
            {mi.asiste && mi.restriccion && (
              <p className="text-[12px] text-gray-500 mt-1">Tu restricción: <span className="text-[var(--text)]">{mi.restriccion}</span></p>
            )}
          </div>
        ) : (
          <p className="text-[12px] text-gray-400">
            {invitacion.rsvp_limite ? `Las confirmaciones cerraron el ${fmtFecha(invitacion.rsvp_limite)}.` : 'Las confirmaciones están cerradas.'}
          </p>
        )}
      </div>

      {/* Imagen ampliada */}
      {ampliada && invitacion.imagen_url && (
        <div onClick={() => setAmpliada(false)}
          className="fixed inset-0 z-[60] bg-black/80 flex items-center justify-center p-4 cursor-zoom-out">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={invitacion.imagen_url} alt="Invitación" className="max-w-full max-h-full object-contain rounded-xl" />
          <button className="absolute top-4 right-4 text-white/90 bg-white/15 rounded-full p-2" aria-label="Cerrar"><IconX size={20} /></button>
        </div>
      )}
    </div>
  )
}
