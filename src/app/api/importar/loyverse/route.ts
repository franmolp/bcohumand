import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase-admin'

interface TicketRow {
  id: string
  receipt_date: string
  item_name: string
  categoria: string
  profesional: string
  total_money: number
  total_discount: number
  payment_type: string
  store_id: string
}

export async function POST(req: NextRequest) {
  const auth = req.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET
  const viaCron = cronSecret && auth === `Bearer ${cronSecret}`
  if (!viaCron) {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    if (session.rol !== 'admin' && session.rol !== 'Admin') return NextResponse.json({ error: 'Prohibido' }, { status: 403 })
  }

  const body = await req.json().catch(() => ({})) as { rows?: TicketRow[]; from?: string; to?: string }
  const rows = body.rows
  if (!Array.isArray(rows) || !rows.length) return NextResponse.json({ error: 'Sin datos' }, { status: 400 })

  // Borrar el rango antes de reinsertar (idempotente)
  if (body.from && body.to) {
    const fromTs = `${body.from}T03:00:00.000Z`
    const toDate = new Date(body.to)
    toDate.setDate(toDate.getDate() + 1)
    const toTs = `${toDate.toISOString().slice(0, 10)}T02:59:59.999Z`
    await supabaseAdmin
      .from('loyverse_tickets')
      .delete()
      .gte('receipt_date', fromTs)
      .lte('receipt_date', toTs)
  }

  const BATCH = 500
  let ok = 0, errors = 0
  for (let i = 0; i < rows.length; i += BATCH) {
    const { error } = await supabaseAdmin.from('loyverse_tickets').upsert(
      rows.slice(i, i + BATCH),
      { onConflict: 'id', ignoreDuplicates: false }
    )
    if (error) { console.error('loyverse upsert error:', error.message); errors++ }
    else ok += rows.slice(i, i + BATCH).length
  }

  return NextResponse.json({ ok, errors })
}
