import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { getPuestosDisponibles } from '@/lib/puestos'

export async function GET() {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const result = await getPuestosDisponibles(session.id, session.equipo)
  if ('error' in result) return NextResponse.json({ error: result.error }, { status: result.status })

  return NextResponse.json(result)
}
