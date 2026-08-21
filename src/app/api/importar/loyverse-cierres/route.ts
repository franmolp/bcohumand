import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { syncPagosYTickets } from '@/lib/loyverse-sync'

const TOKEN = process.env.LOYVERSE_TOKEN

function toARDate(ts: string): string {
  const d = new Date(new Date(ts).getTime() - 3 * 60 * 60 * 1000)
  return d.toISOString().slice(0, 10)
}

function addDays(date: string, n: number): string {
  const d = new Date(date + 'T12:00:00Z')
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

export async function fetchAndStoreShifts(from: string, to: string): Promise<{ ok: number }> {
  if (!TOKEN) throw new Error('Falta LOYVERSE_TOKEN')

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const shifts: any[] = []
  const toNext = addDays(to, 1)
  const baseUrl = `https://api.loyverse.com/v1.0/shifts?limit=250`
    + `&created_at_min=${from}T03:00:00.000Z`
    + `&created_at_max=${toNext}T02:59:59.999Z`

  let cursor: string | null = null
  while (true) {
    const url: string = cursor ? `${baseUrl}&cursor=${encodeURIComponent(cursor)}` : baseUrl
    const res: Response = await fetch(url, { headers: { Authorization: `Bearer ${TOKEN}` } })
    if (!res.ok) throw new Error(`Loyverse shifts API ${res.status}: ${await res.text()}`)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data: any = await res.json()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const batch: any[] = data.shifts ?? []
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    shifts.push(...batch.filter((s: any) => s.closed_at))
    if (data.cursor && batch.length === 250) cursor = data.cursor
    else break
  }

  if (!shifts.length) return { ok: 0 }

  const records = shifts.map(s => ({
    id: s.id as string,
    fecha: toARDate(s.closed_at as string),
    opened_at: s.opened_at ?? null,
    closed_at: s.closed_at ?? null,
    store_id: s.store_id ?? null,
    starting_cash: s.starting_cash ?? 0,
    actual_cash: s.actual_cash ?? 0,
    expected_cash: s.expected_cash ?? 0,
    cash_payments: s.cash_payments ?? 0,
    paid_in: s.paid_in ?? 0,
    paid_out: s.paid_out ?? 0,
    gross_sales: s.gross_sales ?? 0,
    net_sales: s.net_sales ?? 0,
    refunds: s.refunds ?? 0,
    discounts: s.discounts ?? 0,
  }))

  // Movimientos individuales (pay-in/pay-out) de cada turno, para poder cruzarlos
  // uno a uno contra sobres y compras en vez de comparar solo el total del turno.
  const movimientos = shifts.flatMap(s => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mvs: any[] = s.cash_movements ?? []
    return mvs.map(mv => ({
      shift_id: s.id as string,
      fecha: toARDate(s.closed_at as string),
      tipo: mv.type as string,
      monto: mv.money_amount ?? 0,
      comentario: mv.comment ?? null,
      employee_id: mv.employee_id ?? null,
      movimiento_en: mv.created_at,
    }))
  })

  // Solo borrar (para evitar duplicados/turnos eliminados en Loyverse) las fechas
  // que efectivamente trajimos en esta respuesta — nunca todo el rango pedido a
  // ciegas, para no perder días ya importados si Loyverse devuelve un resultado
  // parcial (por ejemplo, por paginación o un filtro que devuelva menos de lo pedido).
  const fechasTraidas = [...new Set(records.map(r => r.fecha))]
  for (const fecha of fechasTraidas) {
    await supabaseAdmin.from('loyverse_cierres').delete().eq('fecha', fecha)
    await supabaseAdmin.from('loyverse_movimientos_caja').delete().eq('fecha', fecha)
  }

  const BATCH = 500
  for (let i = 0; i < records.length; i += BATCH) {
    await supabaseAdmin.from('loyverse_cierres')
      .upsert(records.slice(i, i + BATCH), { onConflict: 'id' })
  }
  for (let i = 0; i < movimientos.length; i += BATCH) {
    await supabaseAdmin.from('loyverse_movimientos_caja').insert(movimientos.slice(i, i + BATCH))
  }

  return { ok: records.length }
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

  const body = await req.json().catch(() => ({})) as { from?: string; to?: string }
  const hoy = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' })
  const from = body.from ?? hoy
  const to = body.to ?? hoy

  try {
    // El botón manual hace lo mismo que el cron nocturno: cierres/turnos Y
    // ventas/pagos (efectivo) — antes solo traía cierres y el efectivo del día
    // quedaba desactualizado hasta la sync automática de la noche.
    const [cierres, pagos] = await Promise.all([
      fetchAndStoreShifts(from, to),
      syncPagosYTickets(from, to),
    ])
    return NextResponse.json({ ok: cierres.ok, tickets: pagos.ok, pagos: pagos.pagosOk })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
