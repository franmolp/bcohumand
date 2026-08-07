import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase-admin'

function toARDate(ts: string): string {
  const d = new Date(new Date(ts).getTime() - 3 * 60 * 60 * 1000)
  return d.toISOString().slice(0, 10)
}

function horaAR(ts: string): string {
  const d = new Date(new Date(ts).getTime() - 3 * 60 * 60 * 1000)
  return d.toISOString().slice(11, 16)
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

type Evento = {
  tipo: 'apertura' | 'cierre' | 'retiro' | 'sobre' | 'ajuste'
  hora: string
  ts: string
  monto: number
  ventas?: number
  contado?: number
  discrepancia?: number | null
  detalle?: string | null
  id?: string
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

  // La cadena de saldo corriente arranca en fecha_inicio (necesita un punto de partida).
  // Pero el efectivo/retiros del mes son estadísticas independientes: deben cubrir
  // TODO el mes visualizado, aunque sea anterior a fecha_inicio.
  const trackFrom = config.fecha_inicio
  const calcEnd = today
  const queryFrom = mesStart < trackFrom ? mesStart : trackFrom
  const hayTracking = trackFrom <= calcEnd

  const [cierresRes, retirosRes, ajustesRes, pagosRes] = await Promise.all([
    supabaseAdmin
      .from('loyverse_cierres')
      .select('id, fecha, opened_at, closed_at, starting_cash, cash_payments, actual_cash, expected_cash')
      .gte('fecha', queryFrom)
      .lte('fecha', calcEnd)
      .order('fecha')
      .order('opened_at'),

    supabaseAdmin
      .from('retiros_caja')
      .select('id, fecha, monto, descripcion, tipo, created_at')
      .gte('fecha', queryFrom)
      .lte('fecha', calcEnd)
      .order('fecha')
      .order('created_at'),

    supabaseAdmin
      .from('caja_ajustes')
      .select('id, fecha, saldo_nuevo, motivo, created_at')
      .gte('fecha', queryFrom)
      .lte('fecha', calcEnd)
      .order('fecha')
      .order('created_at', { ascending: false }),

    supabaseAdmin
      .from('loyverse_pagos')
      .select('receipt_date, payment_money')
      .gte('receipt_date', `${queryFrom}T03:00:00.000Z`)
      .lte('receipt_date', `${addDays(calcEnd, 1)}T02:59:59.999Z`)
      .ilike('payment_name', `%${config.payment_name_efectivo}%`),
  ])

  // Turnos (shifts de Loyverse) agrupados por fecha, ordenados por apertura
  type Turno = {
    opened_at: string; closed_at: string | null
    starting_cash: number; cash_payments: number
    actual_cash: number; expected_cash: number
  }
  const turnosByFecha = new Map<string, Turno[]>()
  for (const c of (cierresRes.data ?? [])) {
    const f = c.fecha as string
    if (!turnosByFecha.has(f)) turnosByFecha.set(f, [])
    turnosByFecha.get(f)!.push({
      opened_at: c.opened_at,
      closed_at: c.closed_at,
      starting_cash: Number(c.starting_cash ?? 0),
      cash_payments: Number(c.cash_payments ?? 0),
      actual_cash: Number(c.actual_cash ?? 0),
      expected_cash: Number(c.expected_cash ?? 0),
    })
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
  const ajustesByFecha = new Map<string, { saldo_nuevo: number; motivo: string | null; created_at: string }>()
  for (const a of (ajustesRes.data ?? [])) {
    const f = a.fecha as string
    if (!ajustesByFecha.has(f)) {
      ajustesByFecha.set(f, { saldo_nuevo: Number(a.saldo_nuevo), motivo: a.motivo, created_at: a.created_at })
    }
  }

  // Fallback efectivo from loyverse_pagos, indexed by AR date (días sin turno registrado)
  const pagosByFecha = new Map<string, number>()
  for (const p of (pagosRes.data ?? [])) {
    const f = toARDate(p.receipt_date as string)
    pagosByFecha.set(f, (pagosByFecha.get(f) ?? 0) + Number(p.payment_money ?? 0))
  }

  let saldo = Number(config.saldo_inicial)
  let primerEvento = true // no se chequea discrepancia contra el saldo_inicial en la primera apertura
  const allDays = enumerateDays(queryFrom, calcEnd)
  let efectivo_mes = 0
  let retiros_mes = 0
  let caja_fuerte = 0
  let saldo_actual: number | null = hayTracking ? saldo : null

  type DiaData = {
    fecha: string
    efectivo_vendido: number
    retiros: number
    sobres: number
    saldo: number | null
    starting_cash: number | null
    discrepancia: number | null
    tiene_cierre_loyverse: boolean
    tiene_seguimiento: boolean
    tiene_discrepancia: boolean
    ajuste: { saldo_nuevo: number; motivo: string | null } | null
    retiros_list: RetiroItem[]
    eventos: Evento[]
  }

  const diasDelMes: DiaData[] = []

  for (const day of allDays) {
    const turnosDia = turnosByFecha.get(day) ?? []
    const retirosDia = retirosByFecha.get(day) ?? { total: 0, sobres: 0, items: [] }
    const ajuste = ajustesByFecha.get(day) ?? null
    const tracked = day >= trackFrom

    // Efectivo del día = ventas en efectivo (informativo, no confundir con lo que queda físico en caja)
    const efectivo = turnosDia.length > 0
      ? turnosDia.reduce((s, t) => s + t.cash_payments, 0)
      : (pagosByFecha.get(day) ?? 0)

    const starting_cash = turnosDia.length > 0 ? turnosDia[0].starting_cash : null

    let saldoDia: number | null = null
    let discrepanciaDia: number | null = null
    let tieneDiscrepancia = false
    const eventos: Evento[] = []

    if (tracked) {
      if (turnosDia.length > 0) {
        // Con datos de Loyverse: la caja avanza turno a turno.
        // Cada apertura se compara contra el saldo que dejó el evento anterior
        // (cierre del turno previo, o retiro/sobre/ajuste posterior).
        // Al cerrar, el saldo pasa a ser lo esperado en caja según Loyverse
        // (starting_cash + ventas + entradas − salidas), que ya incluye
        // cualquier "paid_out" que el local haya cargado durante el turno.
        for (const t of turnosDia) {
          let disc: number | null = null
          if (!primerEvento) {
            disc = t.starting_cash - saldo
            if (Math.abs(disc) >= 1) tieneDiscrepancia = true
          }
          if (discrepanciaDia === null) discrepanciaDia = disc
          eventos.push({ tipo: 'apertura', hora: horaAR(t.opened_at), ts: t.opened_at, monto: t.starting_cash, discrepancia: disc })
          primerEvento = false

          const cierreMonto = t.expected_cash
          saldo = cierreMonto
          if (t.closed_at) {
            const evtCierre: Evento = { tipo: 'cierre', hora: horaAR(t.closed_at), ts: t.closed_at, monto: cierreMonto, ventas: t.cash_payments }
            if (t.actual_cash && Math.abs(t.actual_cash - t.expected_cash) >= 1) evtCierre.contado = t.actual_cash
            eventos.push(evtCierre)
          }
        }
      } else {
        // Sin turno de Loyverse ese día: fallback simple con ventas estimadas
        saldo = saldo + efectivo
      }

      // Retiros y sobres del día, siempre después de procesar los turnos
      for (const r of retirosDia.items) {
        if (r.tipo !== 'sobre') saldo -= r.monto
        eventos.push({
          tipo: r.tipo === 'sobre' ? 'sobre' : 'retiro',
          hora: horaAR(r.created_at), ts: r.created_at, monto: r.monto, detalle: r.descripcion, id: r.id,
        })
      }

      if (ajuste) {
        saldo = ajuste.saldo_nuevo
        eventos.push({ tipo: 'ajuste', hora: horaAR(ajuste.created_at), ts: ajuste.created_at, monto: ajuste.saldo_nuevo, detalle: ajuste.motivo })
      }

      eventos.sort((a, b) => a.ts.localeCompare(b.ts))

      saldoDia = saldo
      saldo_actual = saldo

      // caja_fuerte = sobres acumulados desde que arrancó el seguimiento
      caja_fuerte += retirosDia.sobres
    }

    // El efectivo/retiros del mes se muestran para TODO el mes, tenga o no seguimiento de saldo
    const inMes = day >= mesStart && day <= mesEnd
    if (inMes) {
      efectivo_mes += efectivo
      retiros_mes += retirosDia.total - retirosDia.sobres

      diasDelMes.push({
        fecha: day,
        efectivo_vendido: efectivo,
        retiros: retirosDia.total - retirosDia.sobres,
        sobres: retirosDia.sobres,
        saldo: saldoDia,
        starting_cash,
        discrepancia: discrepanciaDia,
        tiene_cierre_loyverse: turnosDia.length > 0,
        tiene_seguimiento: tracked,
        tiene_discrepancia: tieneDiscrepancia,
        ajuste: ajuste ? { saldo_nuevo: ajuste.saldo_nuevo, motivo: ajuste.motivo } : null,
        retiros_list: retirosDia.items,
        eventos,
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
