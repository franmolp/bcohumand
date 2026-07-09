import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { CHIP_INFO } from '@/lib/asistencia'

function citaDurMin(c: { duracion_min: number | null; franja_inicio: string | null; franja_fin: string | null }): number {
  if (c.duracion_min && c.duracion_min > 0) return c.duracion_min
  if (c.franja_inicio && c.franja_fin) {
    const diff = toMin(c.franja_fin) - toMin(c.franja_inicio)
    if (diff > 0) return diff
  }
  return 0
}

function toMin(t: string): number {
  const [h, m] = t.split(':').map(Number)
  return h * 60 + (m || 0)
}

// Merge overlapping intervals clipped to [baseIni, baseFin] and return total occupied minutes
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

const ESTADOS_CANCELADOS = new Set([
  'cancelado', 'cancelada', 'cancelled', 'canceled',
  'no_presentado', 'no presentado', 'no show', 'no-show', 'noshow',
])
function esCancelada(estado: string | null) {
  return ESTADOS_CANCELADOS.has((estado ?? '').toLowerCase().trim())
}

const ESTADO_NO_CONTAR_PRESENTE = new Set(['Sin fichada'])

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

  const tz = 'America/Argentina/Buenos_Aires'
  const ahora = new Date()
  const horaArg = parseInt(ahora.toLocaleString('en-CA', { timeZone: tz, hour: 'numeric', hour12: false }))
  const offsetDias = horaArg < 6 ? 2 : 1
  const ultDiaCerrado = new Date(ahora)
  ultDiaCerrado.setDate(ultDiaCerrado.getDate() - offsetDias)
  const finCitas = ultDiaCerrado.toLocaleDateString('en-CA', { timeZone: tz })

  const diasTranscurridos = finCitas >= fin
    ? diasDelMes
    : Math.max(1, parseInt(finCitas.substring(8)))

  const [
    { data: citas },
    { data: atenciones },
    { data: asistencia },
    { data: comprasData },
    { data: usuarios },
  ] = await Promise.all([
    supabaseAdmin
      .from('fresha_citas_detalle')
      .select('usuario_id, nombre_empleada, estado, categoria, servicio, duracion_min, franja_inicio, franja_fin, venta_neta, fecha')
      .gte('fecha', inicio)
      .lte('fecha', finCitas),
    supabaseAdmin
      .from('liquidacion_atenciones')
      .select('usuario_id, venta_neta, comision, articulo, categoria')
      .eq('anio', y)
      .eq('mes', m),
    supabaseAdmin
      .from('asistencia_procesada')
      .select('usuario_id, estado, horas_base, fecha, horario_base_entrada, horario_base_salida')
      .gte('fecha', inicio)
      .lte('fecha', fin),
    supabaseAdmin
      .from('compras')
      .select('monto')
      .gte('fecha', inicio)
      .lte('fecha', fin),
    supabaseAdmin.from('usuarios').select('id, nombre'),
  ])

  const nombreMap = new Map((usuarios ?? []).map(u => [u.id, u.nombre]))

  const citasTodas = citas ?? []
  const citasNoCanc = citasTodas.filter(c => !esCancelada(c.estado))
  const citasCanceladas = citasTodas.filter(c => esCancelada(c.estado))

  const tieneAtenciones = (atenciones ?? []).length > 0
  const fuenteVentas: 'liquidacion' | 'fresha' = tieneAtenciones ? 'liquidacion' : 'fresha'

  const ventasNetas = tieneAtenciones
    ? (atenciones ?? []).reduce((s, a) => s + (a.venta_neta || 0), 0)
    : citasNoCanc.reduce((s, c) => s + (c.venta_neta || 0), 0)

  const gastos = (comprasData ?? []).reduce((s, c) => s + (c.monto || 0), 0)
  const proyeccion = diasTranscurridos < diasDelMes && diasTranscurridos > 0
    ? Math.round(ventasNetas / diasTranscurridos * diasDelMes)
    : null

  const atencionByUid = new Map<string, { ventaNeta: number; comision: number }>()
  for (const a of (atenciones ?? [])) {
    const prev = atencionByUid.get(a.usuario_id) ?? { ventaNeta: 0, comision: 0 }
    atencionByUid.set(a.usuario_id, {
      ventaNeta: prev.ventaNeta + (a.venta_neta || 0),
      comision: prev.comision + (a.comision || 0),
    })
  }

  // Franjas de citas por empleada/fecha para calcular ocupación real
  const citasFranjaMap = new Map<string, Array<{ ini: number; fin: number }>>()
  for (const c of citasNoCanc) {
    if (!c.franja_inicio || !c.franja_fin || !c.fecha) continue
    const key = `${c.usuario_id}|${c.fecha}`
    if (!citasFranjaMap.has(key)) citasFranjaMap.set(key, [])
    citasFranjaMap.get(key)!.push({ ini: toMin(c.franja_inicio), fin: toMin(c.franja_fin) })
  }

  interface EmpData {
    nombre: string
    citas: number
    ventaNeta: number
    comision: number
    diasPresente: number
    diasHabiles: number
    minBase: number
    minOcupada: number
  }
  const empMap = new Map<string, EmpData>()
  const getEmp = (uid: string, nombre: string) => {
    if (!empMap.has(uid)) empMap.set(uid, { nombre, citas: 0, ventaNeta: 0, comision: 0, diasPresente: 0, diasHabiles: 0, minBase: 0, minOcupada: 0 })
    return empMap.get(uid)!
  }

  for (const c of citasNoCanc) {
    const e = getEmp(c.usuario_id, c.nombre_empleada)
    e.citas++
    if (!tieneAtenciones) e.ventaNeta += c.venta_neta || 0
  }

  if (tieneAtenciones) {
    for (const [uid, data] of atencionByUid) {
      const nombre = nombreMap.get(uid) ?? '—'
      const e = getEmp(uid, nombre)
      e.ventaNeta = data.ventaNeta
      e.comision = data.comision
    }
  }

  for (const a of (asistencia ?? [])) {
    const nombre = nombreMap.get(a.usuario_id) ?? '—'
    const e = getEmp(a.usuario_id, nombre)
    const chip = CHIP_INFO[a.estado ?? '']
    const esPresente = chip?.present && !ESTADO_NO_CONTAR_PRESENTE.has(a.estado ?? '')

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

  const productividad = [...empMap.values()]
    .filter(e => e.citas > 0 || e.diasPresente > 0)
    .map(e => ({
      nombre: e.nombre,
      citas: e.citas,
      ventaNeta: Math.round(e.ventaNeta),
      comision: tieneAtenciones ? Math.round(e.comision) : null,
      minOcupada: e.minOcupada,
      minLibre: Math.max(0, e.minBase - e.minOcupada),
      ocupacionPct: e.minBase > 0 ? Math.round(e.minOcupada / e.minBase * 100) : null,
      diasPresente: e.diasPresente,
      diasHabiles: e.diasHabiles,
    }))
    .sort((a, b) => b.ventaNeta - a.ventaNeta)

  const srvMap = new Map<string, { categoria: string; cantidad: number; ventaNeta: number; duracionMin: number }>()
  for (const c of citasNoCanc) {
    const key = c.servicio || 'Sin servicio'
    const dur = citaDurMin(c)
    const prev = srvMap.get(key) ?? { categoria: c.categoria || '', cantidad: 0, ventaNeta: 0, duracionMin: 0 }
    srvMap.set(key, {
      categoria: prev.categoria || c.categoria || '',
      cantidad: prev.cantidad + 1,
      ventaNeta: prev.ventaNeta + (c.venta_neta || 0),
      duracionMin: prev.duracionMin + dur,
    })
  }

  const servicios = [...srvMap.entries()]
    .map(([servicio, d]) => ({
      servicio,
      categoria: d.categoria,
      cantidad: d.cantidad,
      ventaNeta: Math.round(d.ventaNeta),
      duracionMin: d.duracionMin,
      precioPorHora: d.duracionMin > 0
        ? Math.round((d.ventaNeta / d.cantidad) / ((d.duracionMin / d.cantidad) / 60))
        : null,
    }))
    .sort((a, b) => b.cantidad - a.cantidad)
    .slice(0, 15)

  const rentabilidad = [...srvMap.entries()]
    .map(([servicio, d]) => ({
      servicio,
      categoria: d.categoria,
      cantidad: d.cantidad,
      ventaNeta: Math.round(d.ventaNeta),
      duracionMin: d.duracionMin,
      precioPorHora: d.duracionMin > 0
        ? Math.round((d.ventaNeta / d.cantidad) / ((d.duracionMin / d.cantidad) / 60))
        : null,
    }))
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
      balance: Math.round(ventasNetas - gastos),
      proyeccion,
      diasTranscurridos,
      diasDelMes,
      fuenteVentas,
    },
    productividad,
    servicios,
    rentabilidad,
  })
}
