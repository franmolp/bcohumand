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
 *   FROM  — fecha inicio YYYY-MM-DD (default: inicio del mes actual)
 *   TO    — fecha fin    YYYY-MM-DD (default: ayer)
 */

const TOKEN      = process.env.LOYVERSE_TOKEN
const APP_URL    = process.env.APP_URL?.replace(/\/$/, '')
const CRON_SECRET = process.env.CRON_SECRET

if (!TOKEN)       throw new Error('Falta LOYVERSE_TOKEN')
if (!APP_URL)     throw new Error('Falta APP_URL')
if (!CRON_SECRET) throw new Error('Falta CRON_SECRET')

function getDateRange() {
  if (process.env.FROM && process.env.TO) {
    return { from: process.env.FROM, to: process.env.TO }
  }
  const tz   = 'America/Argentina/Buenos_Aires'
  const hoy  = new Date().toLocaleDateString('en-CA', { timeZone: tz })
  const [y, m] = hoy.split('-').map(Number)
  const from = `${y}-${String(m).padStart(2, '0')}-01`
  const ayer = new Date()
  ayer.setDate(ayer.getDate() - 1)
  const to = ayer.toLocaleDateString('en-CA', { timeZone: tz })
  return { from, to }
}

async function fetchReceipts(from, to) {
  const rows = []
  // Loyverse usa UTC: ajustamos a medianoche AR (+3h → T03:00:00Z y T26:59:59Z)
  let url = `https://api.loyverse.com/v1.0/receipts?receipt_types=SALE&limit=250`
           + `&created_at_min=${from}T03:00:00.000Z`
           + `&created_at_max=${to}T02:59:59.999Z`
           // Corrección: el día TO en AR termina a las 03:00 UTC del día siguiente
  url = `https://api.loyverse.com/v1.0/receipts?receipt_types=SALE&limit=250`
       + `&created_at_min=${from}T03:00:00.000Z`

  // Calculamos el fin del día TO en UTC (TO + 1 día a las 02:59:59Z)
  const toDate = new Date(to)
  toDate.setDate(toDate.getDate() + 1)
  const toNext = toDate.toISOString().slice(0, 10)
  url = `https://api.loyverse.com/v1.0/receipts?receipt_types=SALE&limit=250`
       + `&created_at_min=${from}T03:00:00.000Z`
       + `&created_at_max=${toNext}T02:59:59.999Z`

  let cursor = null
  let page = 0

  while (true) {
    page++
    const pageUrl = cursor ? `${url}&cursor=${encodeURIComponent(cursor)}` : url
    const res = await fetch(pageUrl, {
      headers: { Authorization: `Bearer ${TOKEN}` }
    })
    if (!res.ok) throw new Error(`Loyverse API error ${res.status}: ${await res.text()}`)
    const data = await res.json()
    const receipts = data.receipts ?? []
    console.log(`[loyverse] Página ${page}: ${receipts.length} tickets`)

    for (const r of receipts) {
      if (r.cancelled_at) continue
      const date = r.receipt_date ?? r.created_at
      const paymentType = [...new Set(
        (r.payments ?? [])
          .filter(p => p.type !== 'CASHROUNDING')
          .map(p => p.name)
      )].join(', ') || 'Desconocido'

      for (const item of (r.line_items ?? [])) {
        const modifier = (item.line_modifiers ?? [])[0]
        const categoria  = modifier?.name    ?? ''
        const profesional = modifier?.option ?? ''

        rows.push({
          id:             `${r.receipt_number}__${item.id}`,
          receipt_date:   date,
          item_name:      item.item_name ?? '',
          categoria,
          profesional,
          total_money:    item.total_money ?? 0,
          total_discount: item.total_discount ?? 0,
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

  return rows
}

async function postToApp(rows, from, to) {
  const url = `${APP_URL}/api/importar/loyverse`
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${CRON_SECRET}`,
    },
    body: JSON.stringify({ rows, from, to }),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(`App API error ${res.status}: ${data.error ?? JSON.stringify(data)}`)
  return data
}

async function main() {
  const { from, to } = getDateRange()
  console.log(`\n═══ Importación Loyverse: ${from} → ${to} ═══\n`)

  const rows = await fetchReceipts(from, to)
  console.log(`\n[loyverse] Total líneas a importar: ${rows.length}`)

  if (!rows.length) {
    console.log('[loyverse] Sin datos para el período.')
    return
  }

  const result = await postToApp(rows, from, to)
  console.log(`[loyverse] ✓ Importados: ${result.ok} | Errores: ${result.errors ?? 0}`)
  console.log('\n✓ Importación completada correctamente.')
}

main().catch(e => { console.error('\n✗', e.message); process.exit(1) })
