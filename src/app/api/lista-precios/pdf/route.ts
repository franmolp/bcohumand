import { getSession } from '@/lib/auth'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

// Plan B del visor: el PDF de la lista de precios pasando por este servidor (si el teléfono no lo pudo bajar directo)
export async function GET() {
  if (!(await getSession())) return new Response('No autorizado', { status: 401 })
  const base = (process.env.BCO_TURNOS_URL || 'https://bco-turnos.vercel.app').replace(/\/$/, '')
  const r = await fetch(`${base}/precios?pdf=1`, { cache: 'no-store', signal: AbortSignal.timeout(30000) }).catch(() => null)
  if (!r?.ok || !r.body) return new Response('No se pudo traer la lista de precios', { status: 502 })
  return new Response(r.body, { headers: { 'content-type': 'application/pdf', 'cache-control': 'private, max-age=300' } })
}
