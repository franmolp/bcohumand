/**
 * fresha-scraper.mjs
 *
 * Descarga los reportes de Fresha (turnos y citas) y los importa a la app.
 * Se ejecuta en GitHub Actions a diario; también se puede correr manualmente:
 *   node scripts/fresha-scraper.mjs
 *
 * Variables de entorno requeridas:
 *   APP_URL        — URL de producción (ej. https://bcohumand.vercel.app)
 *   CRON_SECRET    — Mismo valor que CRON_SECRET en Vercel
 *   FRESHA_SESSION — Sesión del browser en base64 (generada por fresha-setup.mjs)
 */

import { chromium } from 'playwright'
import fs from 'fs'

const APP_URL = process.env.APP_URL?.replace(/\/$/, '')
const CRON_SECRET = process.env.CRON_SECRET
const FRESHA_SESSION = process.env.FRESHA_SESSION

if (!APP_URL) throw new Error('Falta APP_URL')
if (!CRON_SECRET) throw new Error('Falta CRON_SECRET')
if (!FRESHA_SESSION) throw new Error('Falta FRESHA_SESSION')

// ─── Rango de fechas: lunes de la semana actual → último día del mes siguiente ──

function getDateRange() {
  const now = new Date()
  const dow = now.getDay() === 0 ? 7 : now.getDay()
  const monday = new Date(now)
  monday.setDate(now.getDate() - dow + 1)
  const lastDayNextMonth = new Date(now.getFullYear(), now.getMonth() + 2, 0)
  const fmt = d => d.toLocaleDateString('sv') // YYYY-MM-DD en zona horaria local
  return { from: fmt(monday), to: fmt(lastDayNextMonth) }
}

// ─── Parsers CSV (equivalentes a parseTurnosFresha / parseCitasFresha del cliente) ──

const MON_EN = {
  Jan: '01', Feb: '02', Mar: '03', Apr: '04', May: '05', Jun: '06',
  Jul: '07', Aug: '08', Sep: '09', Oct: '10', Nov: '11', Dec: '12',
}

function freshaDate(s) {
  const m = s.match(/(\d{1,2})\s+([A-Za-z]{3})\s+(\d{4})/)
  if (!m) return ''
  return `${m[3]}-${MON_EN[m[2]] ?? '01'}-${m[1].padStart(2, '0')}`
}

function freshaTime(s) {
  const m = s.match(/(\d{1,2}):(\d{2})\s*(am|pm)/i)
  if (!m) return ''
  let h = parseInt(m[1])
  if (m[3].toLowerCase() === 'pm' && h !== 12) h += 12
  if (m[3].toLowerCase() === 'am' && h === 12) h = 0
  return `${String(h).padStart(2, '0')}:${m[2]}`
}

function csvLine(line) {
  const out = []
  let cur = '', inQ = false
  for (const ch of line) {
    if (ch === '"') { inQ = !inQ; continue }
    if (ch === ',' && !inQ) { out.push(cur.trim()); cur = ''; continue }
    cur += ch
  }
  out.push(cur.trim())
  return out
}

function csvParse(text) {
  return text.replace(/\r\n/g, '\n').split('\n').filter(l => l.trim()).map(csvLine)
}

function parseTurnos(text) {
  const rows = csvParse(text)
  if (rows.length < 2) return []
  const hdr = rows[0].map(h => h.toLowerCase())
  const iN   = hdr.findIndex(h => h.includes('miembro'))
  const iF   = hdr.findIndex(h => h === 'fecha')
  const iI   = hdr.findIndex(h => h.includes('inicio'))
  const iFin = hdr.findIndex(h => h.includes('fin'))
  const iD   = hdr.findIndex(h => h.includes('duraci'))
  if (iN < 0 || iF < 0 || iI < 0 || iFin < 0) {
    console.error('[turnos] Columnas no encontradas. Headers:', rows[0])
    return []
  }
  const out = []
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i]
    const nombre = r[iN] ?? ''
    const fecha  = freshaDate(r[iF] ?? '')
    const inicio = freshaTime(r[iI] ?? '')
    const fin    = freshaTime(r[iFin] ?? '')
    const horas  = iD >= 0 ? parseFloat(r[iD] ?? '0') || 0 : 0
    if (!nombre || !fecha || !inicio || !fin) continue
    out.push({ nombre, fecha, inicio, fin, horas })
  }
  return out
}

function parseCitas(text) {
  const rows = csvParse(text)
  if (rows.length < 2) return []
  const hdr = rows[0].map(h => h.toLowerCase().trim())
  const iN  = hdr.findIndex(h => h.includes('miembro'))
  const iE  = hdr.findIndex(h => h === 'estado')
  const iF  = hdr.findIndex(h => h.includes('programada'))
  const iFr = hdr.findIndex(h => h.includes('franja'))
  if (iN < 0 || iF < 0 || iFr < 0) {
    console.error('[citas] Columnas no encontradas. Headers:', rows[0])
    return []
  }
  const map = new Map()
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i]
    if (iE >= 0 && r[iE]?.trim().toLowerCase() === 'cancelado') continue
    const nombre = r[iN]?.trim() ?? ''
    const fecha  = freshaDate(r[iF] ?? '')
    const franja = r[iFr]?.trim() ?? ''
    if (!nombre || !fecha || !franja.includes('-')) continue
    const [startRaw, endRaw] = franja.split('-')
    const s = (startRaw ?? '').substring(0, 5)
    const e = (endRaw ?? '').substring(0, 5)
    if (!s || !e) continue
    const key = `${nombre}|${fecha}`
    if (!map.has(key)) map.set(key, [])
    map.get(key).push({ s, e })
  }
  return Array.from(map.entries()).map(([key, tiempos]) => {
    const [nombre, fecha] = key.split('|')
    const starts = tiempos.map(t => t.s).sort()
    const ends   = tiempos.map(t => t.e).sort()
    return { nombre, fecha, primer_turno: starts[0], ultimo_turno: ends[ends.length - 1], cant_citas: tiempos.length }
  })
}

// ─── Descarga de reporte desde Fresha ────────────────────────────────────────

async function descargarReporte(page, url, label) {
  console.log(`\n[${label}] → ${url}`)
  await page.goto(url, { waitUntil: 'networkidle', timeout: 45000 })

  // Si Fresha redirigió al login, la sesión expiró
  const currentUrl = page.url()
  if (currentUrl.includes('/users/sign-in') || currentUrl.includes('/users/verification')) {
    throw new Error(
      'Sesión de Fresha expirada. Corré `npm run fresha:setup` en tu máquina local ' +
      'para generar una nueva FRESHA_SESSION y actualizá el secret en GitHub.'
    )
  }

  // Esperar que la tabla de datos aparezca
  await page.waitForSelector('table, [class*="Table"], [class*="table"]', { timeout: 20000 })
    .catch(() => console.warn(`[${label}] Tabla no detectada con selector estándar, continuando...`))

  // Pausa adicional para que el SPA termine de cargar los datos
  await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {})
  await page.waitForTimeout(2000)

  // Abrir menú "Opciones" y luego hacer click en "CSV"
  const opcionesBtn = page.locator('button:has-text("Opciones"), button:has-text("Options")').first()
  if (await opcionesBtn.count() === 0) {
    await page.screenshot({ path: `/tmp/fresha-${label}-debug.png` })
    throw new Error(
      `[${label}] No se encontró el botón "Opciones".\n` +
      `Screenshot guardado en /tmp/fresha-${label}-debug.png`
    )
  }
  await opcionesBtn.click()
  await page.waitForTimeout(800)

  const csvItem = page.locator('[role="menuitem"]:has-text("CSV"), li:has-text("CSV"), button:has-text("CSV"), a:has-text("CSV")').first()
  if (await csvItem.count() === 0) {
    await page.screenshot({ path: `/tmp/fresha-${label}-debug.png` })
    throw new Error(
      `[${label}] No se encontró la opción CSV en el menú.\n` +
      `Screenshot guardado en /tmp/fresha-${label}-debug.png`
    )
  }

  const [download] = await Promise.all([
    page.waitForEvent('download', { timeout: 25000 }),
    csvItem.click(),
  ])

  const filePath = await download.path()
  const content = fs.readFileSync(filePath, 'utf8')
  const lineas = content.trim().split('\n').length
  console.log(`[${label}] ✓ Descarga OK (${lineas} líneas)`)
  return content
}

// ─── POST a la API de la app ──────────────────────────────────────────────────

async function postAPI(endpoint, rows, label) {
  const url = `${APP_URL}${endpoint}`
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${CRON_SECRET}`,
    },
    body: JSON.stringify({ rows }),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(`[${label}] API error ${res.status}: ${data.error ?? JSON.stringify(data)}`)
  const noEnc = data.noEncontrados?.length ? ` | No encontrados: ${data.noEncontrados.join(', ')}` : ''
  console.log(`[${label}] ✓ Importados: ${data.ok}/${data.total}${noEnc}`)
  return data
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const { from, to } = getDateRange()
  console.log(`\n═══ Importación Fresha: ${from} → ${to} ═══`)

  // Cargar sesión guardada
  const SESSION_PATH = '/tmp/fresha-session.json'
  const sessionJson = Buffer.from(FRESHA_SESSION, 'base64').toString('utf8')
  fs.writeFileSync(SESSION_PATH, sessionJson)

  const browser = await chromium.launch({ headless: true })
  const ctx = await browser.newContext({ storageState: SESSION_PATH })
  const page = await ctx.newPage()

  try {
    // 1. Horas base (turnos del equipo)
    const turnosCsv = await descargarReporte(
      page,
      `https://partners.fresha.com/reports/table/scheduled-shifts?shortcut=custom&dateFrom=${from}&dateTo=${to}`,
      'turnos'
    )
    const turnosRows = parseTurnos(turnosCsv)
    console.log(`[turnos] Parseados: ${turnosRows.length} registros`)
    if (turnosRows.length > 0) {
      await postAPI('/api/importar/turnos-fresha', turnosRows, 'turnos')
    } else {
      console.warn('[turnos] Sin registros — ¿el CSV tiene el formato esperado?')
    }

    // 2. Citas (agenda de appointments)
    const citasCsv = await descargarReporte(
      page,
      `https://partners.fresha.com/reports/table/appointment-list?shortcut=custom&dateFrom=${from}&dateTo=${to}`,
      'citas'
    )
    const citasRows = parseCitas(citasCsv)
    console.log(`[citas] Parseados: ${citasRows.length} registros`)
    if (citasRows.length > 0) {
      await postAPI('/api/importar/citas-fresha', citasRows, 'citas')
    } else {
      console.warn('[citas] Sin registros — ¿el CSV tiene el formato esperado?')
    }

    console.log('\n✓ Importación completada correctamente.\n')
  } finally {
    await browser.close()
  }
}

main().catch(err => {
  console.error('\n✗', err.message)
  process.exit(1)
})
