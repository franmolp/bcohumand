import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { esCambioHorario, evaluarCambio, leerSolicitud } from '@/lib/cambio-horario'

// ¿Se puede aprobar este cambio de horario/día? (hay espacio de trabajo libre en el horario nuevo)
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const { id } = await params
  const sol = await leerSolicitud(id)
  if (!sol || !esCambioHorario(sol.tipo)) return NextResponse.json({ aplica: false })
  return NextResponse.json({ aplica: true, ...(await evaluarCambio(sol)) })
}
