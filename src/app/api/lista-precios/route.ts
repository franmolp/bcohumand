import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'

export const dynamic = 'force-dynamic'

// Lista de precios vigente: la misma que publica BCO Turnos en su web ({BCO_TURNOS_URL}/precios, que
// redirige al último PDF armado en Catálogo → Lista de precios). Devuelve la dirección del PDF.
export async function GET() {
  if (!(await getSession())) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const base = (process.env.BCO_TURNOS_URL || 'https://bco-turnos.vercel.app').replace(/\/$/, '')
  const r = await fetch(`${base}/precios`, { redirect: 'manual', cache: 'no-store', signal: AbortSignal.timeout(10000) }).catch(() => null)
  const url = r && r.status >= 300 && r.status < 400 ? r.headers.get('location') : null
  if (!url) return NextResponse.json({ error: r?.status === 404 ? 'La lista de precios todavía no está disponible.' : 'No se pudo abrir la lista de precios. Probá de nuevo en un rato.' }, { status: 502 })
  return NextResponse.json({ url: new URL(url, base).toString() })
}
