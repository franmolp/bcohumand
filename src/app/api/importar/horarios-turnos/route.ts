import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { importarHorariosTurnos } from '@/lib/horarios-turnos'

// Trae los horarios base desde BCO Turnos (ver src/lib/horarios-turnos.ts). La llama BCO Turnos al guardar un horario
// (INTEGRACION_SECRET), un admin con "Refrescar ahora" o un proceso con CRON_SECRET. Acepta ?desde y ?hasta (AAAA-MM-DD).
async function correr(req: NextRequest) {
  const auth = req.headers.get('authorization')
  const secreto = process.env.INTEGRACION_SECRET
  const viaCron = (!!process.env.CRON_SECRET && auth === `Bearer ${process.env.CRON_SECRET}`) || (!!secreto && auth === `Bearer ${secreto}`)
  if (!viaCron) {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    if (session.rol !== 'admin' && session.rol !== 'Admin') return NextResponse.json({ error: 'Prohibido' }, { status: 403 })
  }
  const p = req.nextUrl.searchParams
  const r = await importarHorariosTurnos(p.get('desde'), p.get('hasta'))
  return NextResponse.json(r.body, { status: r.status })
}

export const POST = correr
export const GET = correr
export const maxDuration = 60
