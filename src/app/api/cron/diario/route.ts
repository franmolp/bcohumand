import { NextRequest, NextResponse } from 'next/server'
import { ejecutarCumpleanos } from '../cumpleanos/route'
import { ejecutarAsistenciaIncompleta } from '../asistencia-incompleta/route'
import { ejecutarCertificados } from '../certificados/route'
import { ejecutarPedidosRecordatorio } from '../pedidos-recordatorio/route'
import { ejecutarGoogleReviewsRefresh } from '@/app/api/google-reviews/refresh/route'
import { notificar as ejecutarMonotributoNotificar } from '@/app/api/monotributo/notificar/route'

// Vercel (según el plan) limita la cantidad de cron jobs por proyecto — este
// endpoint agrupa en un solo horario (9am) varias tareas diarias/mensuales de
// notificaciones que antes eran crons separados. Cada una que solo debe
// dispararse ciertos días (monotributo, certificados) mantiene su propio
// chequeo de fecha interno, así que correr esto todos los días no cambia
// cuándo efectivamente se manda cada aviso.
export async function GET(request: NextRequest) {
  const secret = request.nextUrl.searchParams.get('secret')
  const authHeader = request.headers.get('authorization')
  const bearerSecret = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null
  if (secret !== process.env.CRON_SECRET && bearerSecret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  const hoy = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' })
  const esDia28 = Number(hoy.slice(8, 10)) === 28

  const resultados: Record<string, unknown> = {}

  async function correr(nombre: string, fn: () => Promise<unknown>) {
    try {
      resultados[nombre] = await fn()
    } catch (e) {
      resultados[nombre] = { error: e instanceof Error ? e.message : String(e) }
    }
  }

  await correr('cumpleanos', ejecutarCumpleanos)
  await correr('asistenciaIncompleta', ejecutarAsistenciaIncompleta)
  await correr('googleReviews', ejecutarGoogleReviewsRefresh)
  await correr('pedidosRecordatorio', ejecutarPedidosRecordatorio)
  await correr('monotributo', async () => {
    const res = await ejecutarMonotributoNotificar(request, true)
    return res.json().catch(() => null)
  })
  if (esDia28) await correr('certificados', ejecutarCertificados)

  return NextResponse.json({ ok: true, resultados })
}
