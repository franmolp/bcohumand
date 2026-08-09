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

function normalizarTexto(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()
}

// El monto solo no alcanza para dar por explicada una salida — dos cosas distintas
// pueden costar lo mismo el mismo día. Si el comentario de Loyverse y la descripción
// del sobre/compra tienen texto, exigimos que se relacionen (una contenga a la otra,
// o compartan alguna palabra de 4+ letras). Si a alguno de los dos lados le falta
// texto para comparar, no se descarta el match por eso — el monto sigue siendo la
// única señal disponible en ese caso.
function textosRelacionados(a: string, b: string): boolean {
  const na = normalizarTexto(a)
  const nb = normalizarTexto(b)
  if (!na || !nb) return true
  if (na.includes(nb) || nb.includes(na)) return true
  const wordsA = na.split(/\s+/).filter(w => w.length >= 4)
  const wordsB = new Set(nb.split(/\s+/).filter(w => w.length >= 4))
  return wordsA.some(w => wordsB.has(w))
}

interface CajaConfig {
  saldo_inicial: number
  fecha_inicio: string
  payment_name_efectivo: string
}

type Evento = {
  tipo: 'apertura' | 'cierre' | 'retiro' | 'sobre' | 'ajuste' | 'compra' | 'pago_in' | 'pago_out'
  hora: string
  ts: string
  monto: number
  ventas?: number
  contado?: number
  discrepancia?: number | null
  detalle?: string | null
  id?: string
  explicado?: boolean
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
      kpis: { efectivo_mes: 0, retiros_mes: 0, sobres_mes: 0, saldo_actual: 0, caja_fuerte: 0 },
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

  const [cierresRes, retirosRes, ajustesRes, pagosRes, comprasRes, sobresTotalRes, movimientosRes] = await Promise.all([
    supabaseAdmin
      .from('loyverse_cierres')
      .select('id, fecha, opened_at, closed_at, starting_cash, cash_payments, actual_cash, expected_cash, paid_out')
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

    // Compras pagadas en efectivo: el otro motivo válido de salida de caja además del sobre
    supabaseAdmin
      .from('compras')
      .select('id, fecha, monto, detalle, proveedor_nombre, created_at')
      .gte('fecha', queryFrom)
      .lte('fecha', calcEnd)
      .eq('estado_pago', 'efectivo')
      .order('fecha')
      .order('created_at'),

    // Total histórico de sobres (caja fuerte) — independiente del mes visualizado
    // y de fecha_inicio: un sobre cargado para cualquier fecha cuenta siempre.
    supabaseAdmin
      .from('retiros_caja')
      .select('monto')
      .eq('tipo', 'sobre'),

    // Movimientos individuales de caja (pay-in/pay-out) de Loyverse, para cruzar
    // cada salida uno a uno contra sobres y compras en vez de comparar el total del turno
    supabaseAdmin
      .from('loyverse_movimientos_caja')
      .select('fecha, tipo, monto, comentario, movimiento_en')
      .gte('fecha', queryFrom)
      .lte('fecha', calcEnd)
      .order('movimiento_en'),
  ])

  // Turnos (shifts de Loyverse) agrupados por fecha, ordenados por apertura
  type Turno = {
    opened_at: string; closed_at: string | null
    starting_cash: number; cash_payments: number
    actual_cash: number; expected_cash: number; paid_out: number
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
      paid_out: Number(c.paid_out ?? 0),
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

  // Compras pagadas en efectivo, indexadas por fecha
  type CompraItem = { id: number; monto: number; detalle: string | null; proveedor: string | null; created_at: string }
  const comprasByFecha = new Map<string, { total: number; items: CompraItem[] }>()
  for (const c of (comprasRes.data ?? [])) {
    const f = c.fecha as string
    if (!comprasByFecha.has(f)) comprasByFecha.set(f, { total: 0, items: [] })
    const entry = comprasByFecha.get(f)!
    entry.total += Number(c.monto ?? 0)
    entry.items.push({ id: c.id, monto: Number(c.monto ?? 0), detalle: c.detalle, proveedor: c.proveedor_nombre, created_at: c.created_at })
  }

  // Movimientos de caja de Loyverse (pay-in/pay-out), indexados por fecha
  type MovimientoCaja = { tipo: string; monto: number; comentario: string | null; movimiento_en: string }
  const movimientosByFecha = new Map<string, MovimientoCaja[]>()
  for (const mv of (movimientosRes.data ?? [])) {
    const f = mv.fecha as string
    if (!movimientosByFecha.has(f)) movimientosByFecha.set(f, [])
    movimientosByFecha.get(f)!.push({
      tipo: mv.tipo as string,
      monto: Number(mv.monto ?? 0),
      comentario: mv.comentario,
      movimiento_en: mv.movimiento_en as string,
    })
  }

  let saldo = Number(config.saldo_inicial)
  let primerEvento = true // no se chequea discrepancia contra el saldo_inicial en la primera apertura
  const allDays = enumerateDays(queryFrom, calcEnd)
  let efectivo_mes = 0
  let retiros_mes = 0
  let sobres_mes = 0
  const caja_fuerte = (sobresTotalRes.data ?? []).reduce((s, r) => s + Number(r.monto ?? 0), 0)
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
    alerta_salida: { loyverse: number; sobres: number; compras: number } | null
    salidas_sin_explicar: number
  }

  const diasDelMes: DiaData[] = []

  for (const day of allDays) {
    const turnosDia = turnosByFecha.get(day) ?? []
    const retirosDia = retirosByFecha.get(day) ?? { total: 0, sobres: 0, items: [] }
    const comprasDia = comprasByFecha.get(day) ?? { total: 0, items: [] }
    const ajuste = ajustesByFecha.get(day) ?? null
    const tracked = day >= trackFrom

    // Efectivo del día = ventas en efectivo (informativo, no confundir con lo que queda físico en caja)
    const efectivo = turnosDia.length > 0
      ? turnosDia.reduce((s, t) => s + t.cash_payments, 0)
      : (pagosByFecha.get(day) ?? 0)

    const starting_cash = turnosDia.length > 0 ? turnosDia[0].starting_cash : null
    const movimientosDia = movimientosByFecha.get(day) ?? []

    // Toda salida de caja (paid_out en Loyverse) es, en teoría, un sobre o una
    // compra pagada en efectivo — no debería haber nada más.
    let alerta_salida: { loyverse: number; sobres: number; compras: number } | null = null
    let salidas_sin_explicar = 0
    // Candidatos que "explican" una salida de caja: sobres + compras en efectivo del día.
    // Se van marcando usados a medida que un pago_out los matchea, para no reusar el
    // mismo sobre/compra como excusa de dos salidas distintas.
    const candidatosSalida: { monto: number; usado: boolean; texto: string }[] = [
      ...retirosDia.items.filter(r => r.tipo === 'sobre').map(r => ({ monto: r.monto, usado: false, texto: r.descripcion ?? '' })),
      ...comprasDia.items.map(c => ({ monto: c.monto, usado: false, texto: `${c.proveedor ?? ''} ${c.detalle ?? ''}`.trim() })),
    ]
    const movimientosConEstado = movimientosDia.map(mv => {
      if (mv.tipo !== 'PAY_OUT') return { ...mv, explicado: undefined as boolean | undefined }
      const match = candidatosSalida.find(c =>
        !c.usado && Math.abs(c.monto - mv.monto) < 1 && textosRelacionados(mv.comentario ?? '', c.texto)
      )
      if (match) match.usado = true
      else salidas_sin_explicar++
      return { ...mv, explicado: !!match }
    })
    if (movimientosDia.length === 0 && turnosDia.length > 0) {
      // Fallback para turnos importados antes de tener el detalle de movimientos:
      // comparar el total del turno contra sobres + compras del día.
      const paidOutLoyverse = turnosDia.reduce((s, t) => s + t.paid_out, 0)
      const explicado = retirosDia.sobres + comprasDia.total
      if (paidOutLoyverse >= 1 && Math.abs(paidOutLoyverse - explicado) >= 1) {
        alerta_salida = { loyverse: paidOutLoyverse, sobres: retirosDia.sobres, compras: comprasDia.total }
      }
    }

    let saldoDia: number | null = null
    let discrepanciaDia: number | null = null
    let tieneDiscrepancia = false
    const eventos: Evento[] = []

    // El log de turnos/retiros/sobres/compras se arma SIEMPRE que haya datos,
    // aunque el día sea anterior a fecha_inicio (sin seguimiento de saldo).
    // La cadena de saldo (que sí necesita un punto de partida) solo avanza
    // a partir de fecha_inicio.
    if (turnosDia.length > 0) {
      // Con datos de Loyverse: la caja avanza turno a turno.
      // Cada apertura se compara contra el saldo que dejó el evento anterior
      // (cierre del turno previo, o retiro/sobre/ajuste posterior).
      // Lo que importa comparar es lo que REALMENTE quedó en caja (el conteo
      // físico del local, "actual_cash"), no lo esperado en teoría según
      // Loyverse ("expected_cash" = starting_cash + ventas + entradas −
      // salidas). Si el turno no tiene conteo físico cargado, se usa lo
      // esperado como mejor aproximación disponible.
      for (const t of turnosDia) {
        let disc: number | null = null
        if (tracked) {
          if (!primerEvento) {
            disc = t.starting_cash - saldo
            if (Math.abs(disc) >= 1) tieneDiscrepancia = true
          }
          if (discrepanciaDia === null) discrepanciaDia = disc
          primerEvento = false
        }
        eventos.push({ tipo: 'apertura', hora: horaAR(t.opened_at), ts: t.opened_at, monto: t.starting_cash, discrepancia: disc })

        const cierreMonto = t.expected_cash
        const cierreReal = t.actual_cash ? t.actual_cash : cierreMonto
        if (tracked) saldo = cierreReal
        if (t.closed_at) {
          const evtCierre: Evento = { tipo: 'cierre', hora: horaAR(t.closed_at), ts: t.closed_at, monto: cierreMonto, ventas: t.cash_payments }
          if (t.actual_cash && Math.abs(t.actual_cash - t.expected_cash) >= 1) evtCierre.contado = t.actual_cash
          eventos.push(evtCierre)
        }
      }
    } else if (tracked) {
      // Sin turno de Loyverse ese día: fallback simple con ventas estimadas
      saldo = saldo + efectivo
    }

    // Retiros y sobres del día, siempre después de procesar los turnos
    for (const r of retirosDia.items) {
      if (tracked && r.tipo !== 'sobre') saldo -= r.monto
      eventos.push({
        tipo: r.tipo === 'sobre' ? 'sobre' : 'retiro',
        hora: horaAR(r.created_at), ts: r.created_at, monto: r.monto, detalle: r.descripcion, id: r.id,
      })
    }

    // Compras en efectivo: no tocan el saldo (ya están netas en expected_cash de Loyverse),
    // se muestran solo para poder cruzar contra el paid_out del turno
    for (const c of comprasDia.items) {
      eventos.push({
        tipo: 'compra',
        hora: horaAR(c.created_at), ts: c.created_at, monto: c.monto,
        detalle: c.proveedor ? `${c.proveedor}${c.detalle ? ' · ' + c.detalle : ''}` : c.detalle,
      })
    }

    // Movimientos de caja (pay-in/pay-out) de Loyverse: no tocan el saldo (ya están
    // netos en expected_cash/actual_cash del turno), se muestran para reconciliar
    // cada salida contra sobres/compras — con tilde verde si matchea, sin marca si no.
    for (const mv of movimientosConEstado) {
      eventos.push({
        tipo: mv.tipo === 'PAY_IN' ? 'pago_in' : 'pago_out',
        hora: horaAR(mv.movimiento_en), ts: mv.movimiento_en, monto: mv.monto,
        detalle: mv.comentario, explicado: mv.explicado,
      })
    }

    if (ajuste) {
      if (tracked) saldo = ajuste.saldo_nuevo
      eventos.push({ tipo: 'ajuste', hora: horaAR(ajuste.created_at), ts: ajuste.created_at, monto: ajuste.saldo_nuevo, detalle: ajuste.motivo })
    }

    eventos.sort((a, b) => a.ts.localeCompare(b.ts))

    if (tracked) {
      saldoDia = saldo
      saldo_actual = saldo
    }

    // El efectivo/retiros del mes se muestran para TODO el mes, tenga o no seguimiento de saldo
    const inMes = day >= mesStart && day <= mesEnd
    if (inMes) {
      efectivo_mes += efectivo
      retiros_mes += retirosDia.total - retirosDia.sobres
      sobres_mes += retirosDia.sobres

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
        alerta_salida,
        salidas_sin_explicar,
      })
    }
  }

  return NextResponse.json({
    configurado: true,
    config,
    dias: diasDelMes.reverse(), // most recent first
    kpis: { efectivo_mes, retiros_mes, sobres_mes, saldo_actual, caja_fuerte },
  })
}
