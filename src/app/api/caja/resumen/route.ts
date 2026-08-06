import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase-admin'

function toARDate(ts: string): string {
  const d = new Date(new Date(ts).getTime() - 3 * 60 * 60 * 1000)
  return d.toISOString().slice(0, 10)
}

function addDays(date: string, n: number): string {
  const d = new Date(date + 'T12:00:00Z')
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

function enumerateDays(from: string, to: string): string[] {
  const days: string[] = []
  let cur = from
  while (cur <= to) { days.push(cur); cur = addDays(cur, 1) }
  return days
}

interface CajaConfig {
  saldo_inicial: number
  fecha_inicio: string
  payment_name_efectivo: string
}

export async function GET(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  if (session.rol !== 'admin' && session.rol !== 'Admin') return NextResponse.json({ error: 'Prohibido' }, { status: 403 })

  const { searchParams } = new URL(req.url)
  const mes = searchParams.get('mes') // 'YYYY-MM', undefined = current month

  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' })
  const currentMes = today.substring(0, 7)
  const targetMes = mes ?? currentMes

  // Load config
  const { data: confData } = await supabaseAdmin
    .from('configuracion')
    .select('valor')
    .eq('clave', 'caja_config')
    .single()

  const config = confData?.valor as CajaConfig | null
  if (!config) {
    return NextResponse.json({
      configurado: false,
      dias: [],
      kpis: { efectivo_mes: 0, retiros_mes: 0, saldo_actual: 0, caja_fuerte: 0 },
    })
  }

  const [y, m] = targetMes.split('-').map(Number)
  const mesStart = `${targetMes}-01`
  const mesEnd = new Date(y, m, 0).toLocaleDateString('en-CA')

  // Always calculate from fecha_inicio to today for accurate running saldo
  const calcFrom = config.fecha_inicio
  const calcEnd = today

  // If fecha_inicio is after today, nothing to show
  if (calcFrom > calcEnd) {
    return NextResponse.json({
      configurado: true,
      config,
      dias: [],
      kpis: { efectivo_mes: 0, retiros_mes: 0, saldo_actual: config.saldo_inicial, caja_fuerte: 0 },
    })
  }

  const [cierresRes, retirosRes, ajustesRes, pagosRes] = await Promise.all([
    supabaseAdmin
      .from('loyverse_cierres')
      .select('id, fecha, starting_cash, cash_payments, opened_at')
      .gte('fecha', calcFrom)
      .lte('fecha', calcEnd)
      .order('fecha')
      .order('opened_at'),

    supabaseAdmin
      .from('retiros_caja')
      .select('id, fecha, monto, descripcion, tipo, created_at')
      .gte('fecha', calcFrom)
      .lte('fecha', calcEnd)
      .order('fecha')
      .order('created_at'),

    supabaseAdmin
      .from('caja_ajustes')
      .select('id, fecha, saldo_nuevo, motivo, created_at')
      .gte('fecha', calcFrom)
      .lte('fecha', calcEnd)
      .order('fecha')
      .order('created_at', { ascending: false }),

    supabaseAdmin
      .from('loyverse_pagos')
      .select('receipt_date, payment_money')
      .gte('receipt_date', `${calcFrom}T03:00:00.000Z`)
      .lte('receipt_date', `${addDays(calcEnd, 1)}T02:59:59.999Z`)
      .ilike('payment_name', `%${config.payment_name_efectivo}%`),
  ])

  // Index cierres by fecha: aggregate multiple shifts per day, first shift's starting_cash
  const cierresByFecha = new Map<string, { starting_cash: number; cash_payments: number }>()
  for (const c of (cierresRes.data ?? [])) {
    const f = c.fecha as string
    if (!cierresByFecha.has(f)) {
      cierresByFecha.set(f, { starting_cash: Number(c.starting_cash ?? 0), cash_payments: 0 })
    }
    cierresByFecha.get(f)!.cash_payments += Number(c.cash_payments ?? 0)
  }

  // Index retiros by fecha — tipo 'retiro' (personal) | 'sobre' (va a caja fuerte)
  type RetiroItem = { id: string; monto: number; descripcion: string | null; tipo: string; created_at: string }
  const retirosByFecha = new Map<string, { total: number; sobres: number; items: RetiroItem[] }>()
  for (const r of (retirosRes.data ?? [])) {
    const f = r.fecha as string
    if (!retirosByFecha.has(f)) retirosByFecha.set(f, { total: 0, sobres: 0, items: [] })
    const entry = retirosByFecha.get(f)!
    entry.total += Number(r.monto)
    if ((r.tipo ?? 'retiro') === 'sobre') entry.sobres += Number(r.monto)
    entry.items.push({ id: r.id, monto: Number(r.monto), descripcion: r.descripcion, tipo: r.tipo ?? 'retiro', created_at: r.created_at })
  }

  // Index ajustes by fecha, most recent per day (query is ordered DESC by created_at)
  const ajustesByFecha = new Map<string, { saldo_nuevo: number; motivo: string | null }>()
  for (const a of (ajustesRes.data ?? [])) {
    const f = a.fecha as string
    if (!ajustesByFecha.has(f)) {
      ajustesByFecha.set(f, { saldo_nuevo: Number(a.saldo_nuevo), motivo: a.motivo })
    }
  }

  // Fallback efectivo from loyverse_pagos, indexed by AR date
  const pagosByFecha = new Map<string, number>()
  for (const p of (pagosRes.data ?? [])) {
    const f = toARDate(p.receipt_date as string)
    pagosByFecha.set(f, (pagosByFecha.get(f) ?? 0) + Number(p.payment_money ?? 0))
  }

  // Run calculation from fecha_inicio to today
  let saldo = Number(config.saldo_inicial)
  const allDays = enumerateDays(calcFrom, calcEnd)
  let efectivo_mes = 0
  let retiros_mes = 0
  let caja_fuerte = 0
  let saldo_actual = saldo

  type DiaData = {
    fecha: string
    efectivo_vendido: number
    retiros: number
    sobres: number
    saldo: number
    starting_cash: number | null
    discrepancia: number | null
    tiene_cierre_loyverse: boolean
    ajuste: { saldo_nuevo: number; motivo: string | null } | null
    retiros_list: RetiroItem[]
  }

  const diasDelMes: DiaData[] = []

  for (const day of allDays) {
    const cierre = cierresByFecha.get(day) ?? null
    const retirosDia = retirosByFecha.get(day) ?? { total: 0, sobres: 0, items: [] }
    const ajuste = ajustesByFecha.get(day) ?? null

    let efectivo: number
    let starting_cash: number | null = null
    let discrepancia: number | null = null

    if (cierre) {
      efectivo = cierre.cash_payments
      starting_cash = cierre.starting_cash
      if (day > config.fecha_inicio) {
        discrepancia = cierre.starting_cash - saldo
      }
    } else {
      efectivo = pagosByFecha.get(day) ?? 0
    }

    if (ajuste) {
      saldo = ajuste.saldo_nuevo
    } else {
      // Ambos tipos (retiro personal y sobre) reducen el saldo de caja física
      saldo = saldo + efectivo - retirosDia.total
    }

    saldo_actual = saldo

    // caja_fuerte = sobres acumulados (dinero que fue al sobre/bóveda del salón)
    caja_fuerte += retirosDia.sobres

    // Only add to result if this day falls in the requested month
    const inMes = day >= mesStart && day <= mesEnd
    if (inMes) {
      efectivo_mes += efectivo
      retiros_mes += retirosDia.total - retirosDia.sobres  // solo retiros personales en el KPI

      diasDelMes.push({
        fecha: day,
        efectivo_vendido: efectivo,
        retiros: retirosDia.total - retirosDia.sobres,
        sobres: retirosDia.sobres,
        saldo,
        starting_cash,
        discrepancia,
        tiene_cierre_loyverse: !!cierre,
        ajuste: ajuste ?? null,
        retiros_list: retirosDia.items,
      })
    }
  }

  return NextResponse.json({
    configurado: true,
    config,
    dias: diasDelMes.reverse(), // most recent first
    kpis: { efectivo_mes, retiros_mes, saldo_actual, caja_fuerte },
  })
}
