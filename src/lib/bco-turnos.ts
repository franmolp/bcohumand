import { after } from 'next/server'

// Avisa a BCO Turnos que algo cambió (empleados, solicitudes, puestos u horarios) para que vuelva a leer los datos.
// Se manda después de responder, así no demora a quien usa Humand. Sin INTEGRACION_SECRET no hace nada.
export function avisarTurnos() {
  const secreto = process.env.INTEGRACION_SECRET
  if (!secreto) return
  const url = (process.env.BCO_TURNOS_URL || 'https://bco-turnos.vercel.app').replace(/\/$/, '')
  after(async () => {
    await fetch(`${url}/api/integraciones/humand`, { method: 'POST', headers: { Authorization: `Bearer ${secreto}` }, signal: AbortSignal.timeout(25000) }).catch(() => {})
  })
}
