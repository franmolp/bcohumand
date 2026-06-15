import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'

const GAS_URL    = process.env.GAS_DRIVE_URL ?? ''
const GAS_SECRET = process.env.GAS_SECRET ?? ''

export async function POST(request: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const isAdmin = session.rol === 'admin' || session.rol === 'Admin'
  if (!isAdmin) return NextResponse.json({ error: 'Sin permisos' }, { status: 403 })

  const { tipo } = await request.json() as { tipo: string }
  if (!tipo) return NextResponse.json({ error: 'tipo requerido' }, { status: 400 })

  try {
    const res = await fetch(GAS_URL, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ secret: GAS_SECRET, action: 'sync_drive', tipo, mesesAtras: 3 }),
      signal:  AbortSignal.timeout(55000),
    })
    const data = await res.json()
    return NextResponse.json(data)
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Error al conectar con Drive'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
