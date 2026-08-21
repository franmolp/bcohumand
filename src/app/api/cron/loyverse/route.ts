import { NextRequest, NextResponse } from 'next/server'
import { crearNotificaciones, getAdminIds } from '@/lib/notificaciones'
import { fetchAndStoreShifts } from '@/app/api/importar/loyverse-cierres/route'
import { syncPagosYTickets } from '@/lib/loyverse-sync'

const SECRET = process.env.CRON_SECRET

export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization')
  if (!SECRET || auth !== `Bearer ${SECRET}`) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  if (!process.env.LOYVERSE_TOKEN) {
    return NextResponse.json({ error: 'Falta LOYVERSE_TOKEN en variables de entorno' }, { status: 500 })
  }

  const { searchParams } = new URL(req.url)
  const hoy = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' })

  // Por defecto reimporta los últimos 7 días para cubrir cualquier falla anterior
  const defaultFrom = (() => {
    const d = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Argentina/Buenos_Aires' }))
    d.setDate(d.getDate() - 6)
    return d.toLocaleDateString('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' })
  })()
  const from = searchParams.get('from') || defaultFrom
  const to   = searchParams.get('to')   || hoy

  try {
    const result = await syncPagosYTickets(from, to)
    if (!result.ok && !result.pagosOk) {
      return NextResponse.json({ message: 'Sin datos para el período', from, to })
    }

    // Importar cierres de caja (shifts) del mismo período
    await fetchAndStoreShifts(from, to).catch(e => console.error('[cron/loyverse] shifts:', e.message))

    const adminIds = await getAdminIds()
    if (adminIds.length) {
      const errTxt = result.errors ? ` · ${result.errors} errores` : ''
      await crearNotificaciones(adminIds, {
        titulo: 'Loyverse: importación completada',
        mensaje: `${result.ok} tickets · ${result.pagosOk} pagos. Período: ${from} → ${to}.${errTxt}`,
        tipo: 'aviso',
      }).catch(() => {})
    }

    return NextResponse.json({ ...result, from, to })
  } catch (e: any) {
    console.error('[cron/loyverse]', e.message)
    // Notificar al admin que falló
    const adminIds = await getAdminIds().catch(() => [] as string[])
    if (adminIds.length) {
      await crearNotificaciones(adminIds, {
        titulo: 'Loyverse: error en importación',
        mensaje: `Falló la importación del período ${from} → ${to}. Error: ${e.message}`,
        tipo: 'aviso',
      }).catch(() => {})
    }
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
