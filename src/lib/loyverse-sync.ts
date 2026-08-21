// Descarga y guarda tickets/pagos de Loyverse (ventas, forma de pago) — compartido
// entre el cron nocturno (/api/cron/loyverse) y el botón manual "Reimportar
// Loyverse" (/api/importar/loyverse-cierres), para que ambos hagan exactamente
// lo mismo y no quede desactualizada una tabla mientras se refresca la otra.
import { supabaseAdmin } from '@/lib/supabase-admin'

const TOKEN = process.env.LOYVERSE_TOKEN

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

async function fetchReceipts(from: string, to: string) {
  const rows: TicketRow[] = []
  const pagoRows: PagoRow[] = []

  const toDate = new Date(to)
  toDate.setDate(toDate.getDate() + 1)
  const toNext = toDate.toISOString().slice(0, 10)

  const baseUrl = `https://api.loyverse.com/v1.0/receipts?receipt_types=SALE&limit=250`
               + `&created_at_min=${from}T03:00:00.000Z`
               + `&created_at_max=${toNext}T02:59:59.999Z`

  let cursor: string | null = null

  while (true) {
    const url: string = cursor ? `${baseUrl}&cursor=${encodeURIComponent(cursor)}` : baseUrl
    const res: Response = await fetch(url, { headers: { Authorization: `Bearer ${TOKEN}` } })
    if (!res.ok) throw new Error(`Loyverse API ${res.status}: ${await res.text()}`)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data: any = await res.json()
    const receipts: any[] = data.receipts ?? []

    for (const r of receipts) {
      if (r.cancelled_at) continue
      const date = r.receipt_date ?? r.created_at
      const sign = r.receipt_type === 'REFUND' ? -1 : 1

      for (const p of (r.payments ?? []).filter((p: any) => p.type !== 'CASHROUNDING')) {
        pagoRows.push({
          receipt_number: r.receipt_number,
          receipt_date:   date,
          payment_name:   p.name ?? 'Desconocido',
          payment_money:  (p.money_amount ?? 0) * sign,
        })
      }

      const paymentType = [...new Set(
        (r.payments ?? [])
          .filter((p: any) => p.type !== 'CASHROUNDING')
          .map((p: any) => p.name as string)
      )].join(', ') || 'Desconocido'

      for (const item of (r.line_items ?? [])) {
        const modifiers  = item.line_modifiers ?? []
        const firstMod   = modifiers[0]
        const profesional = modifiers.map((m: any) => m.option).filter(Boolean).join(', ') || ''
        rows.push({
          id:             `${r.receipt_number}__${item.id}`,
          receipt_date:   date,
          item_name:      item.item_name ?? '',
          categoria:      firstMod?.name ?? '',
          profesional,
          total_money:    (item.total_money   ?? 0) * sign,
          total_discount: (item.total_discount ?? 0) * sign,
          payment_type:   paymentType,
          store_id:       r.store_id ?? '',
        })
      }
    }

    if (data.cursor && receipts.length === 250) {
      cursor = data.cursor
    } else {
      break
    }
  }

  // Agrupar pagos por (receipt_number, payment_name) — sumar si hay duplicados
  const pagoMap = new Map<string, PagoRow>()
  for (const p of pagoRows) {
    const key = `${p.receipt_number}||${p.payment_name}`
    if (pagoMap.has(key)) {
      pagoMap.get(key)!.payment_money += p.payment_money
    } else {
      pagoMap.set(key, { ...p })
    }
  }

  return { rows, pagoRows: [...pagoMap.values()] }
}

async function upsertPagosYTickets(rows: TicketRow[], pagoRows: PagoRow[], from: string, to: string) {
  const fromTs = `${from}T03:00:00.000Z`
  const toDate = new Date(to)
  toDate.setDate(toDate.getDate() + 1)
  const toTs = `${toDate.toISOString().slice(0, 10)}T02:59:59.999Z`

  const BATCH = 500
  let ok = 0, pagosOk = 0, errors = 0

  if (rows.length > 0) {
    await supabaseAdmin.from('loyverse_tickets').delete()
      .gte('receipt_date', fromTs).lte('receipt_date', toTs)
    for (let i = 0; i < rows.length; i += BATCH) {
      const { error } = await supabaseAdmin.from('loyverse_tickets')
        .upsert(rows.slice(i, i + BATCH), { onConflict: 'id', ignoreDuplicates: false })
      if (error) { console.error('tickets upsert:', error.message); errors++ }
      else ok += rows.slice(i, i + BATCH).length
    }
  }

  if (pagoRows.length > 0) {
    await supabaseAdmin.from('loyverse_pagos').delete()
      .gte('receipt_date', fromTs).lte('receipt_date', toTs)
    for (let i = 0; i < pagoRows.length; i += BATCH) {
      const { error } = await supabaseAdmin.from('loyverse_pagos')
        .upsert(pagoRows.slice(i, i + BATCH), { onConflict: 'receipt_number,payment_name', ignoreDuplicates: false })
      if (error) { console.error('pagos upsert:', error.message); errors++ }
      else pagosOk += pagoRows.slice(i, i + BATCH).length
    }
  }

  return { ok, pagosOk, errors }
}

export async function syncPagosYTickets(from: string, to: string): Promise<{ ok: number; pagosOk: number; errors: number }> {
  if (!TOKEN) throw new Error('Falta LOYVERSE_TOKEN')
  const { rows, pagoRows } = await fetchReceipts(from, to)
  if (!rows.length && !pagoRows.length) return { ok: 0, pagosOk: 0, errors: 0 }
  return upsertPagosYTickets(rows, pagoRows, from, to)
}
