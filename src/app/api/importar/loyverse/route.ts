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

interface PagoRow {
  receipt_number: string
  receipt_date: string
  payment_name: string
  payment_money: number
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

  const body = await req.json().catch(() => ({})) as {
    rows?: TicketRow[]
    pagoRows?: PagoRow[]
    from?: string
    to?: string
  }

  const rows     = body.rows     ?? []
  const pagoRows = body.pagoRows ?? []

  if (!rows.length && !pagoRows.length) {
    return NextResponse.json({ error: 'Sin datos' }, { status: 400 })
  }

  // Calcular rango UTC del período para borrado idempotente
  let fromTs = '', toTs = ''
  if (body.from && body.to) {
    fromTs = `${body.from}T03:00:00.000Z`
    const toDate = new Date(body.to)
    toDate.setDate(toDate.getDate() + 1)
    toTs = `${toDate.toISOString().slice(0, 10)}T02:59:59.999Z`
  }

  const BATCH = 500
  let ok = 0, pagosOk = 0, errors = 0

  // ── Tickets (line items) ─────────────────────────────────────────────────────
  if (rows.length > 0) {
    if (fromTs && toTs) {
      await supabaseAdmin
        .from('loyverse_tickets')
        .delete()
        .gte('receipt_date', fromTs)
        .lte('receipt_date', toTs)
    }
    for (let i = 0; i < rows.length; i += BATCH) {
      const { error } = await supabaseAdmin.from('loyverse_tickets').upsert(
        rows.slice(i, i + BATCH),
        { onConflict: 'id', ignoreDuplicates: false }
      )
      if (error) { console.error('loyverse tickets upsert error:', error.message); errors++ }
      else ok += rows.slice(i, i + BATCH).length
    }
  }

  // ── Pagos por medio de pago (ventas netas exactas) ───────────────────────────
  if (pagoRows.length > 0) {
    if (fromTs && toTs) {
      await supabaseAdmin
        .from('loyverse_pagos')
        .delete()
        .gte('receipt_date', fromTs)
        .lte('receipt_date', toTs)
    }
    for (let i = 0; i < pagoRows.length; i += BATCH) {
      const { error } = await supabaseAdmin.from('loyverse_pagos').upsert(
        pagoRows.slice(i, i + BATCH),
        { onConflict: 'receipt_number,payment_name', ignoreDuplicates: false }
      )
      if (error) { console.error('loyverse pagos upsert error:', error.message); errors++ }
      else pagosOk += pagoRows.slice(i, i + BATCH).length
    }
  }

  return NextResponse.json({ ok, pagosOk, errors })
}
