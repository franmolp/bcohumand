import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { CHIP_INFO } from '@/lib/asistencia'

function toMin(t: string): number {
  const [h, m] = t.split(':').map(Number)
  return h * 60 + (m || 0)
}

function calcOcupado(intervals: Array<{ ini: number; fin: number }>, baseIni: number, baseFin: number): number {
  const clipped = intervals
    .map(iv => ({ ini: Math.max(iv.ini, baseIni), fin: Math.min(iv.fin, baseFin) }))
    .filter(iv => iv.fin > iv.ini)
  if (!clipped.length) return 0
  clipped.sort((a, b) => a.ini - b.ini)
  let total = 0, curIni = clipped[0].ini, curFin = clipped[0].fin
  for (let i = 1; i < clipped.length; i++) {
    if (clipped[i].ini <= curFin) curFin = Math.max(curFin, clipped[i].fin)
    else { total += curFin - curIni; curIni = clipped[i].ini; curFin = clipped[i].fin }
  }
  return total + (curFin - curIni)
}

const ESTADOS_CANCELADOS = new Set(['cancelado', 'cancelada', 'cancelled', 'canceled', 'no_presentado', 'no presentado', 'no show', 'no-show', 'noshow'])
function esCancelada(estado: string | null) {
  return ESTADOS_CANCELADOS.has((estado ?? '').toLowerCase().trim())
}

function normStr(s: string): string {
  return s.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
}

// "Brenda Pérez" → "brenda p"  |  "Brenda P" → "brenda p"
function shortNorm(name: string): string {
  const parts = normStr(name).split(/\s+/).filter(Boolean)
  if (parts.length < 2) return parts[0] ?? ''
  return `${parts[0]} ${parts[parts.length - 1][0]}`
}

export async function GET(request: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  if (!['admin', 'Admin'].includes(session.rol)) return NextResponse.json({ error: 'Prohibido' }, { status: 403 })

  const mes = request.nextUrl.searchParams.get('mes')
  if (!mes || !/^\d{4}-\d{2}$/.test(mes)) return NextResponse.json({ error: 'mes inválido' }, { status: 400 })

  const [y, m] = mes.split('-').map(Number)
  const inicio = `${mes}-01`
  const diasDelMes = new Date(y, m, 0).getDate()
  const fin = `${y}-${String(m).padStart(2, '0')}-${String(diasDelMes).padStart(2, '0')}`

  // Hasta ayer (importación Loyverse corre a las 21hs, así que ayer siempre tiene datos)
  const tz = 'America/Argentina/Buenos_Aires'
  const ahora = new Date()
  const ayerAR = new Date(ahora)
  ayerAR.setDate(ayerAR.getDate() - 1)
  const ayerStr = ayerAR.toLocaleDateString('en-CA', { timeZone: tz })
  const finDatos = ayerStr < fin ? ayerStr : fin

  const diasTranscurridos = finDatos >= fin ? diasDelMes : Math.max(1, parseInt(finDatos.substring(8)))

  // Rango UTC para Loyverse (AR = UTC-3, entonces 00hs AR = 03:00 UTC)
  const inicioUTC = `${inicio}T03:00:00.000Z`
  const finDatosDplusOne = new Date(finDatos)
  finDatosDplusOne.setDate(finDatosDplusOne.getDate() + 1)
  const finDatosUTC = `${finDatosDplusOne.toISOString().slice(0, 10)}T02:59:59.999Z`

  // Paginación para tablas con >1000 filas (límite por defecto de Supabase)
  async function fetchAll<T>(query: () => ReturnType<typeof supabaseAdmin.from>['select']): Promise<T[]> {
    const PAGE = 1000
    const rows: T[] = []
    let offset = 0
    while (true) {
      const { data, error } = await (query() as any).range(offset, offset + PAGE - 1)
      if (error) throw new Error(error.message)
      rows.push(...(data ?? []))
      if (!data || data.length < PAGE) break
      offset += PAGE
    }
    return rows
  }

  const [
    citas,
    loyTickets,
    loyPagos,
    { data: asistencia },
    { data: comprasData },
    { data: usuarios },
    { data: sueldosData },
  ] = await Promise.all([
    fetchAll(() => supabaseAdmin
      .from('fresha_citas_detalle')
      .select('usuario_id, nombre_empleada, estado, categoria, servicio, duracion_min, franja_inicio, franja_fin, venta_neta, fecha')
      .gte('fecha', inicio)
      .lte('fecha', finDatos)
    ),
    fetchAll(() => supabaseAdmin
      .from('loyverse_tickets')
      .select('profesional, total_money, total_discount, receipt_date')
      .gte('receipt_date', inicioUTC)
      .lte('receipt_date', finDatosUTC)
    ),
    fetchAll(() => supabaseAdmin
      .from('loyverse_pagos')
      .select('payment_name, payment_money')
      .gte('receipt_date', inicioUTC)
      .lte('receipt_date', finDatosUTC)
    ).catch(() => [] as { payment_name: string; payment_money: number }[]),
    supabaseAdmin
      .from('asistencia_procesada')
      .select('usuario_id, estado, horas_base, fecha, horario_base_entrada, horario_base_salida')
      .gte('fecha', inicio)
      .lte('fecha', finDatos),
    supabaseAdmin
      .from('compras')
      .select('monto')
      .gte('fecha', inicio)
      .lte('fecha', fin),
    supabaseAdmin.from('usuarios').select('id, nombre'),
    supabaseAdmin
      .from('liquidaciones_pagos')
      .select('usuario_id, nombre_excel, total')
      .eq('anio', y)
      .eq('mes', m),
  ])

  // Map: shortNorm(nombre) → usuario_id  (para cruzar Loyverse con empleadas)
  const shortToUid = new Map<string, string>()
  const nombreMap = new Map<string, string>()
  for (const u of usuarios ?? []) {
    shortToUid.set(shortNorm(u.nombre), u.id)
    nombreMap.set(u.id, u.nombre)
  }

  // ─── Loyverse: ventas netas desde loyverse_tickets ──────────────────────────
  // total_money por ítem YA incluye el descuento aplicado (es el neto).
  // loyverse_pagos se usa solo para el desglose por medio de pago.
  const pagos = loyPagos
  const tickets = loyTickets
  const ventasNetas = tickets.reduce((s, t) => s + (t.total_money || 0), 0)
  const proyeccion = diasTranscurridos < diasDelMes && diasTranscurridos > 0
    ? Math.round(ventasNetas / diasTranscurridos * diasDelMes)
    : null
  const gastos = (comprasData ?? []).reduce((s, c) => s + (c.monto || 0), 0)

  // Ventas por medio de pago (un row por recibo × método, sin combinar)
  const pagoMap = new Map<string, number>()
  for (const p of pagos) {
    const tipo = p.payment_name || 'Otro'
    pagoMap.set(tipo, (pagoMap.get(tipo) ?? 0) + (p.payment_money || 0))
  }
  const pagosPorTipo = [...pagoMap.entries()]
    .filter(([, total]) => Math.abs(total) > 0)
    .map(([tipo, total]) => ({ tipo, total: Math.round(total) }))
    .sort((a, b) => b.total - a.total)

  // Ventas Loyverse por profesional (total_money ya es neto por ítem)
  // Usa shortNorm para que coincida con los mapas de lookup (p.ej. "Romina DG" → "romina d")
  const loyVentaMap = new Map<string, number>()
  for (const t of tickets) {
    if (!t.profesional) continue
    const key = shortNorm(t.profesional)
    loyVentaMap.set(key, (loyVentaMap.get(key) ?? 0) + (t.total_money || 0))
  }

  // ─── Fresha: citas y ocupación ───────────────────────────────────────────────
  const citasTodas = citas
  const citasNoCanc = citasTodas.filter(c => !esCancelada(c.estado))
  const citasCanceladas = citasTodas.filter(c => esCancelada(c.estado))

  const citasFranjaMap = new Map<string, Array<{ ini: number; fin: number }>>()
  for (const c of citasNoCanc) {
    if (!c.franja_inicio || !c.franja_fin || !c.fecha) continue
    const key = `${c.usuario_id}|${c.fecha}`
    if (!citasFranjaMap.has(key)) citasFranjaMap.set(key, [])
    citasFranjaMap.get(key)!.push({ ini: toMin(c.franja_inicio), fin: toMin(c.franja_fin) })
  }

  // ─── Productividad por empleada ───────────────────────────────────────────────
  interface EmpData {
    nombre: string
    citas: number
    ventaNeta: number   // de Loyverse
    diasPresente: number
    diasHabiles: number
    minBase: number
    minOcupada: number
  }
  const empMap = new Map<string, EmpData>()
  const getEmp = (uid: string, nombre: string) => {
    if (!empMap.has(uid)) empMap.set(uid, { nombre, citas: 0, ventaNeta: 0, diasPresente: 0, diasHabiles: 0, minBase: 0, minOcupada: 0 })
    return empMap.get(uid)!
  }

  // Citas de Fresha → usuario_id + nombre + franjas de ocupación
  // También construimos shortNorm(nombre_empleada) → uid para cruzar con Loyverse
  const freshaShortToUid = new Map<string, string>()
  for (const c of citasNoCanc) {
    getEmp(c.usuario_id, c.nombre_empleada).citas++
    if (c.nombre_empleada) freshaShortToUid.set(shortNorm(c.nombre_empleada), c.usuario_id)
  }

  // Asistencia → diasPresente, minBase, minOcupada
  for (const a of (asistencia ?? [])) {
    const nombre = nombreMap.get(a.usuario_id) ?? '—'
    const e = getEmp(a.usuario_id, nombre)
    const chip = CHIP_INFO[a.estado ?? '']
    const esPresente = chip?.present && a.estado !== 'Sin fichada'
    if (a.horario_base_entrada && a.horario_base_salida) {
      const baseIni = toMin(a.horario_base_entrada)
      const baseFin = toMin(a.horario_base_salida)
      const baseMin = baseFin - baseIni
      if (baseMin > 0) {
        e.diasHabiles++
        if (esPresente) {
          e.diasPresente++
          e.minBase += baseMin
          const franjas = citasFranjaMap.get(`${a.usuario_id}|${a.fecha}`) ?? []
          e.minOcupada += calcOcupado(franjas, baseIni, baseFin)
        }
      }
    }
  }

  // Montos de Loyverse → cruzar por shortNorm del nombre del profesional
  for (const [loyNorm, ventaNeta] of loyVentaMap) {
    // Primero intenta match directo en usuarios, sino en Fresha
    const uid = shortToUid.get(loyNorm)
      ?? freshaShortToUid.get(loyNorm)
      ?? shortToUid.get(loyNorm.split(' ')[0]) // fallback solo por primer nombre
    if (uid) {
      const nombre = nombreMap.get(uid) ?? loyNorm
      getEmp(uid, nombre).ventaNeta = ventaNeta
    }
  }

  // Sueldos: uid → total cobrado del mes
  const sueldoMap = new Map<string, number>()
  let totalSueldos = 0
  for (const p of (sueldosData ?? [])) {
    totalSueldos += p.total || 0
    if (p.usuario_id) sueldoMap.set(p.usuario_id, (sueldoMap.get(p.usuario_id) ?? 0) + (p.total || 0))
  }

  const productividad = [...empMap.entries()]
    .filter(([, e]) => e.citas > 0 || e.diasPresente > 0)
    .map(([uid, e]) => ({
      nombre: e.nombre,
      citas: e.citas,
      ventaNeta: Math.round(e.ventaNeta),
      sueldo: sueldoMap.has(uid) ? Math.round(sueldoMap.get(uid)!) : null,
      minOcupada: e.minOcupada,
      minLibre: Math.max(0, e.minBase - e.minOcupada),
      ocupacionPct: e.minBase > 0 ? Math.round(e.minOcupada / e.minBase * 100) : null,
      diasPresente: e.diasPresente,
      diasHabiles: e.diasHabiles,
    }))
    .sort((a, b) => b.ventaNeta - a.ventaNeta)

  // ─── Servicios (Fresha) ───────────────────────────────────────────────────────
  const srvMap = new Map<string, { categoria: string; cantidad: number; ventaNeta: number; duracionMin: number; cantConDur: number }>()
  for (const c of citasNoCanc) {
    const key = c.servicio || 'Sin servicio'
    const dur = (c.duracion_min && c.duracion_min >= 15) ? c.duracion_min : 0
    const prev = srvMap.get(key) ?? { categoria: c.categoria || '', cantidad: 0, ventaNeta: 0, duracionMin: 0, cantConDur: 0 }
    srvMap.set(key, {
      categoria: prev.categoria || c.categoria || '',
      cantidad: prev.cantidad + 1,
      ventaNeta: prev.ventaNeta + (c.venta_neta || 0),
      duracionMin: prev.duracionMin + dur,
      cantConDur: prev.cantConDur + (dur > 0 ? 1 : 0),
    })
  }

  const calcPPH = (d: { ventaNeta: number; cantidad: number; duracionMin: number; cantConDur: number }) =>
    d.cantConDur > 0 ? Math.round((d.ventaNeta / d.cantidad) / ((d.duracionMin / d.cantConDur) / 60)) : null

  const servicios = [...srvMap.entries()]
    .map(([servicio, d]) => ({ servicio, categoria: d.categoria, cantidad: d.cantidad, ventaNeta: Math.round(d.ventaNeta), duracionMin: d.cantConDur > 0 ? Math.round(d.duracionMin / d.cantConDur) : null, precioPorHora: calcPPH(d) }))
    .sort((a, b) => b.cantidad - a.cantidad)
    .slice(0, 15)

  const rentabilidad = [...srvMap.entries()]
    .map(([servicio, d]) => ({ servicio, categoria: d.categoria, cantidad: d.cantidad, ventaNeta: Math.round(d.ventaNeta), duracionMin: d.cantConDur > 0 ? Math.round(d.duracionMin / d.cantConDur) : null, precioPorHora: calcPPH(d) }))
    .filter(s => s.precioPorHora !== null)
    .sort((a, b) => (b.precioPorHora ?? 0) - (a.precioPorHora ?? 0))
    .slice(0, 10)

  return NextResponse.json({
    kpis: {
      totalCitas: citasNoCanc.length,
      canceladas: citasCanceladas.length,
      tasaCancelacion: citasTodas.length > 0 ? Math.round(citasCanceladas.length / citasTodas.length * 100) : 0,
      ventasNetas: Math.round(ventasNetas),
      gastos: Math.round(gastos),
      sueldos: Math.round(totalSueldos),
      balance: Math.round(ventasNetas - gastos),
      proyeccion,
      diasTranscurridos,
      diasDelMes,
    },
    pagosPorTipo,
    productividad,
    servicios,
    rentabilidad,
  })
}
