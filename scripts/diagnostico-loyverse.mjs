/**
 * diagnostico-loyverse.mjs
 *
 * Compara los datos de loyverse_tickets en Supabase contra el CSV exportado de Loyverse.
 * Ponele el CSV exportado en la misma carpeta como "receipts-junio.csv"
 *
 * Variables de entorno requeridas:
 *   NEXT_PUBLIC_SUPABASE_URL   — URL de tu proyecto Supabase
 *   SUPABASE_SERVICE_ROLE_KEY  — service role key
 *   FROM                       — fecha inicio YYYY-MM-DD
 *   TO                         — fecha fin    YYYY-MM-DD
 *   CSV_PATH                   — ruta al CSV exportado de Loyverse (default: ./receipts.csv)
 */

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'

const SUPA_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPA_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const FROM     = process.env.FROM
const TO       = process.env.TO
const CSV_PATH = process.env.CSV_PATH ?? './receipts.csv'

if (!SUPA_URL || !SUPA_KEY) throw new Error('Faltan NEXT_PUBLIC_SUPABASE_URL y/o SUPABASE_SERVICE_ROLE_KEY')
if (!FROM || !TO)           throw new Error('Faltan FROM y TO (YYYY-MM-DD)')

const supa = createClient(SUPA_URL, SUPA_KEY)

// ─── 1. Leer CSV de Loyverse ─────────────────────────────────────────────────
function parseCSV(path) {
  const lines = readFileSync(path, 'utf8').trim().split('\n').slice(1)
  const items = []
  for (const line of lines) {
    const cols = []
    let cur = '', inQ = false
    for (let i = 0; i < line.length; i++) {
      const c = line[i]
      if (c === '"') { inQ = !inQ }
      else if (c === ',' && !inQ) { cols.push(cur); cur = '' }
      else cur += c
    }
    cols.push(cur)
    const tipo = cols[2]?.trim()
    if (tipo !== 'Venta') continue
    items.push({
      recibo:      cols[1]?.trim(),
      articulo:    cols[5]?.trim(),
      profesional: cols[7]?.trim(),
      brutas:      parseFloat(cols[9]?.replace(',', '.') || '0'),
      descuentos:  parseFloat(cols[10]?.replace(',', '.') || '0'),
      netas:       parseFloat(cols[11]?.replace(',', '.') || '0'),
    })
  }
  return items
}

// ─── 2. Consultar Supabase ───────────────────────────────────────────────────
async function fetchDB() {
  const toDate = new Date(TO)
  toDate.setDate(toDate.getDate() + 1)
  const inicioUTC = `${FROM}T03:00:00.000Z`
  const finUTC    = `${toDate.toISOString().slice(0, 10)}T02:59:59.999Z`

  const rows = []
  let offset = 0
  while (true) {
    const { data, error } = await supa
      .from('loyverse_tickets')
      .select('id, receipt_date, item_name, profesional, total_money, total_discount')
      .gte('receipt_date', inicioUTC)
      .lte('receipt_date', finUTC)
      .range(offset, offset + 999)
    if (error) throw new Error(error.message)
    rows.push(...(data ?? []))
    if (!data || data.length < 1000) break
    offset += 1000
  }
  return rows
}

// ─── 3. Comparar ────────────────────────────────────────────────────────────
async function main() {
  console.log(`\n═══ Diagnóstico Loyverse: ${FROM} → ${TO} ═══\n`)

  const csvItems = parseCSV(CSV_PATH)
  console.log(`CSV: ${csvItems.length} items en ${new Set(csvItems.map(i => i.recibo)).size} recibos`)

  const csvBrutas     = csvItems.reduce((s, i) => s + i.brutas, 0)
  const csvDescuentos = csvItems.reduce((s, i) => s + i.descuentos, 0)
  const csvNetas      = csvItems.reduce((s, i) => s + i.netas, 0)

  console.log(`CSV ventas brutas:  $${csvBrutas.toLocaleString('es-AR')}`)
  console.log(`CSV descuentos:     $${csvDescuentos.toLocaleString('es-AR')}`)
  console.log(`CSV ventas netas:   $${csvNetas.toLocaleString('es-AR')}`)

  console.log('\nConsultando Supabase...')
  const dbRows = await fetchDB()
  console.log(`DB:  ${dbRows.length} items`)

  const dbTotalMoney    = dbRows.reduce((s, r) => s + (r.total_money    || 0), 0)
  const dbTotalDiscount = dbRows.reduce((s, r) => s + (r.total_discount || 0), 0)
  const dbNetas         = dbRows.reduce((s, r) => s + ((r.total_money || 0) - (r.total_discount || 0)), 0)

  console.log(`\nDB sum(total_money):           $${Math.round(dbTotalMoney).toLocaleString('es-AR')}`)
  console.log(`DB sum(total_discount):         $${Math.round(dbTotalDiscount).toLocaleString('es-AR')}`)
  console.log(`DB sum(total_money-total_disc): $${Math.round(dbNetas).toLocaleString('es-AR')}`)

  console.log('\n─── Diferencias ───')
  console.log(`Items: CSV=${csvItems.length} vs DB=${dbRows.length} → diff=${dbRows.length - csvItems.length}`)
  console.log(`Netas CSV: $${Math.round(csvNetas).toLocaleString('es-AR')} vs DB total_money: $${Math.round(dbTotalMoney).toLocaleString('es-AR')} → diff=$${Math.round(dbTotalMoney - csvNetas).toLocaleString('es-AR')}`)

  // ─── Recibos en DB que no están en el CSV ──────────────────────────────
  const csvRecibos = new Set(csvItems.map(i => i.recibo))
  const dbPorRecibo = new Map()
  for (const r of dbRows) {
    const rec = r.id.split('__')[0]
    if (!dbPorRecibo.has(rec)) dbPorRecibo.set(rec, { money: 0, disc: 0, items: 0 })
    const d = dbPorRecibo.get(rec)
    d.money += r.total_money || 0
    d.disc  += r.total_discount || 0
    d.items++
  }

  const soloEnDB = [...dbPorRecibo.entries()].filter(([rec]) => !csvRecibos.has(rec))
  if (soloEnDB.length > 0) {
    const totalExtra = soloEnDB.reduce((s, [, d]) => s + d.money, 0)
    console.log(`\nRecibos en DB pero NO en CSV: ${soloEnDB.length} → total_money $${Math.round(totalExtra).toLocaleString('es-AR')}`)
    soloEnDB.slice(0, 10).forEach(([rec, d]) =>
      console.log(`  ${rec}: money=$${d.money.toFixed(2)} disc=$${d.disc.toFixed(2)} items=${d.items}`)
    )
  } else {
    console.log('\nNo hay recibos extra en DB (todos están en el CSV)')
  }

  // ─── Recibos en CSV que no están en DB ────────────────────────────────
  const dbRecibos = new Set([...dbPorRecibo.keys()])
  const soloEnCSV = [...csvRecibos].filter(r => !dbRecibos.has(r))
  if (soloEnCSV.length > 0) {
    const totalFaltante = csvItems.filter(i => soloEnCSV.includes(i.recibo)).reduce((s, i) => s + i.netas, 0)
    console.log(`\nRecibos en CSV pero NO en DB: ${soloEnCSV.length} → netas $${Math.round(totalFaltante).toLocaleString('es-AR')}`)
    soloEnCSV.slice(0, 10).forEach(r => console.log(`  ${r}`))
  } else {
    console.log('No faltan recibos en DB (todos los del CSV están)')
  }

  // ─── Diferencia por recibo compartido ─────────────────────────────────
  let diffTotal = 0, diffCount = 0
  const csvPorRecibo = new Map()
  for (const i of csvItems) {
    if (!csvPorRecibo.has(i.recibo)) csvPorRecibo.set(i.recibo, { netas: 0, brutas: 0 })
    const d = csvPorRecibo.get(i.recibo)
    d.netas  += i.netas
    d.brutas += i.brutas
  }
  const grandes = []
  for (const [rec, csv] of csvPorRecibo) {
    const db = dbPorRecibo.get(rec)
    if (!db) continue
    const diff = db.money - csv.netas
    diffTotal += diff
    if (Math.abs(diff) > 100) {
      diffCount++
      grandes.push({ rec, csvNetas: csv.netas, dbMoney: db.money, diff })
    }
  }
  console.log(`\nRecibos comunes con diff > $100: ${diffCount}`)
  console.log(`Suma de diffs en recibos comunes: $${Math.round(diffTotal).toLocaleString('es-AR')}`)
  if (grandes.length > 0) {
    console.log('Top diferencias:')
    grandes.sort((a,b) => Math.abs(b.diff) - Math.abs(a.diff)).slice(0, 10).forEach(g =>
      console.log(`  ${g.rec}: CSV_neta=$${g.csvNetas.toFixed(2)} DB_money=$${g.dbMoney.toFixed(2)} diff=$${g.diff.toFixed(2)}`)
    )
  }
}

main().catch(e => { console.error('\n✗', e.message); process.exit(1) })
