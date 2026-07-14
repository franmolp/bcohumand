/**
 * loyverse-import.mjs
 *
 * Importa tickets de Loyverse a la app via API.
 * Variables de entorno requeridas:
 *   LOYVERSE_TOKEN  — token de API de Loyverse
 *   APP_URL         — URL de producción (ej. https://bcohumand.vercel.app)
 *   CRON_SECRET     — mismo valor que en Vercel
 *
 * Opcionales:
 *   FROM  — fecha inicio YYYY-MM-DD (default: hoy en AR)
 *   TO    — fecha fin    YYYY-MM-DD (default: hoy en AR)
 */

const TOKEN       = process.env.LOYVERSE_TOKEN
const APP_URL     = process.env.APP_URL?.replace(/\/$/, '')
const CRON_SECRET = process.env.CRON_SECRET

if (!TOKEN)       throw new Error('Falta LOYVERSE_TOKEN')
if (!APP_URL)     throw new Error('Falta APP_URL')
if (!CRON_SECRET) throw new Error('Falta CRON_SECRET')

function getDateRange() {
  if (process.env.FROM && process.env.TO) {
    return { from: process.env.FROM, to: process.env.TO }
  }
  // Por defecto importa AYER completo (el cron corre a las 03:00 ART,
  // cuando ya terminó el día anterior en Argentina).
  const d = new Date()
  d.setDate(d.getDate() - 1)
  const ayer = d.toLocaleDateString('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' })
  return { from: ayer, to: ayer }
}

async function fetchReceipts(from, to) {
  const rows     = []  // line items para atribución por profesional
  const pagoRows = []  // pagos por recibo × medio de pago

  const toDate = new Date(to)
  toDate.setDate(toDate.getDate() + 1)
  const toNext = toDate.toISOString().slice(0, 10)

  // Solo SALE — la API de Loyverse no filtra correctamente receipt_types=REFUND
  const baseUrl = `https://api.loyverse.com/v1.0/receipts?receipt_types=SALE&limit=250`
                + `&created_at_min=${from}T03:00:00.000Z`
                + `&created_at_max=${toNext}T02:59:59.999Z`

  let cursor = null
  let page   = 0

  while (true) {
    page++
    const url = cursor ? `${baseUrl}&cursor=${encodeURIComponent(cursor)}` : baseUrl
    const res = await fetch(url, { headers: { Authorization: `Bearer ${TOKEN}` } })
    if (!res.ok) throw new Error(`Loyverse API error ${res.status}: ${await res.text()}`)
    const data     = await res.json()
    const receipts = data.receipts ?? []
    console.log(`[loyverse] Página ${page}: ${receipts.length} recibos`)

    for (const r of receipts) {
      if (r.cancelled_at) continue
      const date = r.receipt_date ?? r.created_at
      // La API devuelve REFUND mezclados con SALE — los negamos para que resten correctamente
      const sign = r.receipt_type === 'REFUND' ? -1 : 1

      for (const p of (r.payments ?? []).filter(p => p.type !== 'CASHROUNDING')) {
        pagoRows.push({
          receipt_number: r.receipt_number,
          receipt_date:   date,
          payment_name:   p.name ?? 'Desconocido',
          payment_money:  (p.money_amount ?? 0) * sign,
        })
      }

      const paymentType = [...new Set(
        (r.payments ?? [])
          .filter(p => p.type !== 'CASHROUNDING')
          .map(p => p.name)
      )].join(', ') || 'Desconocido'

      for (const item of (r.line_items ?? [])) {
        const modifiers  = item.line_modifiers ?? []
        const firstMod   = modifiers[0]
        // Todos los empleados asignados al ítem, separados por coma.
        // Si hay 2 (ej. DIA DE SPA con 2 profesionales), el análisis
        // les atribuye el 50% del valor a cada una.
        const profesional = modifiers.map(m => m.option).filter(Boolean).join(', ') || ''
        rows.push({
          id:             `${r.receipt_number}__${item.id}`,
          receipt_date:   date,
          item_name:      item.item_name ?? '',
          categoria:      firstMod?.name    ?? '',
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

  // Agregar pagos por (receipt_number, payment_name) — un recibo puede tener
  // dos líneas de mismo método (ej. dos pagos QR) → sumar en lugar de duplicar PK
  const pagoMap = new Map()
  for (const p of pagoRows) {
    const key = `${p.receipt_number}||${p.payment_name}`
    if (pagoMap.has(key)) {
      pagoMap.get(key).payment_money += p.payment_money
    } else {
      pagoMap.set(key, { ...p })
    }
  }

  return { rows, pagoRows: [...pagoMap.values()] }
}

async function postToApp(rows, pagoRows, from, to) {
  const url = `${APP_URL}/api/importar/loyverse`
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${CRON_SECRET}`,
    },
    body: JSON.stringify({ rows, pagoRows, from, to }),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(`App API error ${res.status}: ${data.error ?? JSON.stringify(data)}`)
  return data
}

async function main() {
  const { from, to } = getDateRange()
  console.log(`\n═══ Importación Loyverse: ${from} → ${to} ═══\n`)

  const { rows, pagoRows } = await fetchReceipts(from, to)
  console.log(`\n[loyverse] Items: ${rows.length} | Pagos: ${pagoRows.length}`)

  if (!rows.length && !pagoRows.length) {
    console.log('[loyverse] Sin datos para el período.')
    return
  }

  const result = await postToApp(rows, pagoRows, from, to)
  console.log(`[loyverse] ✓ Items: ${result.ok} | Pagos: ${result.pagosOk} | Errores: ${result.errors ?? 0}`)
  console.log('\n✓ Importación completada correctamente.')
}

main().catch(e => { console.error('\n✗', e.message); process.exit(1) })
