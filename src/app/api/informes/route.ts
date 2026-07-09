import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { CHIP_INFO } from '@/lib/asistencia'

function citaDurMin(c: { duracion_min: number | null; franja_inicio: string | null; franja_fin: string | null }): number {
  if (c.duracion_min && c.duracion_min > 0) return c.duracion_min
  if (c.franja_inicio && c.franja_fin) {
    const toMin = (t: string) => { const [h, m] = t.split(':').map(Number); return h * 60 + (m || 0) }
    const diff = toMin(c.franja_fin) - toMin(c.franja_inicio)
    if (diff > 0) return diff
  }
  return 0
}

// Fresha puede exportar el estado de cancelación con distintas variantes
const ESTADOS_CANCELADOS = new Set([
  'cancelado', 'cancelada', 'cancelled', 'canceled',
  'no_presentado', 'no presentado', 'no show', 'no-show', 'noshow',
])
function esCancelada(estado: string | null) {
  return ESTADOS_CANCELADOS.has((estado ?? '').toLowerCase().trim())
}

// 'Sin fichada' tiene present=true en CHIP_INFO pero la empleada no concurrió realmente
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
  const hoy = new Date().toLocaleDateString('en-CA', { timeZone: tz })
  const diasTranscurridos = hoy >= fin
    ? diasDelMes
    : Math.max(1, parseInt(hoy.substring(8)))

  const [
    { data: citas },
    { data: atenciones },   // liquidacion_atenciones: fuente verificada de ventas/comisiones
    { data: asistencia },
    { data: comprasData },
    { data: usuarios },
  ] = await Promise.all([
    supabaseAdmin
      .from('fresha_citas_detalle')
      .select('usuario_id, nombre_empleada, estado, categoria, servicio, duracion_min, franja_inicio, franja_fin, venta_neta')
      .gte('fecha', inicio)
      .lte('fecha', fin),
    supabaseAdmin
      .from('liquidacion_atenciones')
      .select('usuario_id, venta_neta, comision, articulo, categoria')
      .eq('anio', y)
      .eq('mes', m),
    supabaseAdmin
      .from('asistencia_procesada')
      .select('usuario_id, estado, horas_fichadas, horas_base, minutos_tarde')
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

  // Citas: excluir canceladas/no-show con filtro normalizado
  const citasTodas = citas ?? []
  const citasNoCanc = citasTodas.filter(c => !esCancelada(c.estado))
  const citasCanceladas = citasTodas.filter(c => esCancelada(c.estado))

  // Fuente de ventas: liquidacion_atenciones (verificada por admin) si existe,
  // si no fallback a fresha_citas_detalle (estimado para mes en curso sin liquidar)
  const tieneAtenciones = (atenciones ?? []).length > 0
  const fuenteVentas: 'liquidacion' | 'fresha' = tieneAtenciones ? 'liquidacion' : 'fresha'

  const ventasNetas = tieneAtenciones
    ? (atenciones ?? []).reduce((s, a) => s + (a.venta_neta || 0), 0)
    : citasNoCanc.reduce((s, c) => s + (c.venta_neta || 0), 0)

  const gastos = (comprasData ?? []).reduce((s, c) => s + (c.monto || 0), 0)
  const proyeccion = diasTranscurridos < diasDelMes && diasTranscurridos > 0
    ? Math.round(ventasNetas / diasTranscurridos * diasDelMes)
    : null

  // Agregar ventas/comisiones por empleada desde liquidacion_atenciones
  const atencionByUid = new Map<string, { ventaNeta: number; comision: number }>()
  for (const a of (atenciones ?? [])) {
    const prev = atencionByUid.get(a.usuario_id) ?? { ventaNeta: 0, comision: 0 }
    atencionByUid.set(a.usuario_id, {
      ventaNeta: prev.ventaNeta + (a.venta_neta || 0),
      comision: prev.comision + (a.comision || 0),
    })
  }

  interface EmpData {
    nombre: string
    citas: number
    duracionMin: number
    ventaNeta: number
    comision: number
    diasPresente: number
    diasAusente: number
    tardanzas: number
    horasBase: number
  }
  const empMap = new Map<string, EmpData>()
  const getEmp = (uid: string, nombre: string) => {
    if (!empMap.has(uid)) empMap.set(uid, { nombre, citas: 0, duracionMin: 0, ventaNeta: 0, comision: 0, diasPresente: 0, diasAusente: 0, tardanzas: 0, horasBase: 0 })
    return empMap.get(uid)!
  }

  // Citas: count + duración (siempre desde fresha)
  for (const c of citasNoCanc) {
    const e = getEmp(c.usuario_id, c.nombre_empleada)
    e.citas++
    e.duracionMin += citaDurMin(c)
    if (!tieneAtenciones) e.ventaNeta += c.venta_neta || 0
  }

  // Ventas/comisiones verificadas desde liquidacion_atenciones
  if (tieneAtenciones) {
    for (const [uid, data] of atencionByUid) {
      const nombre = nombreMap.get(uid) ?? '—'
      const e = getEmp(uid, nombre)
      e.ventaNeta = data.ventaNeta
      e.comision = data.comision
    }
  }

  // Asistencia: 'Sin fichada' NO cuenta como presente aunque CHIP_INFO.present = true
  for (const a of (asistencia ?? [])) {
    const nombre = nombreMap.get(a.usuario_id) ?? '—'
    const e = getEmp(a.usuario_id, nombre)
    const chip = CHIP_INFO[a.estado ?? '']
    if (chip?.present && !ESTADO_NO_CONTAR_PRESENTE.has(a.estado ?? '')) {
      e.diasPresente++
      e.horasBase += a.horas_base || a.horas_fichadas || 0
    }
    if (chip && !chip.present && !chip.justificado) e.diasAusente++
    if (a.estado === 'Llegada tarde' || a.estado === 'Llegada tarde/Salida temprana') e.tardanzas++
  }

  const productividad = [...empMap.values()]
    .filter(e => e.citas > 0 || e.diasPresente > 0)
    .map(e => ({
      nombre: e.nombre,
      citas: e.citas,
      ventaNeta: Math.round(e.ventaNeta),
      comision: tieneAtenciones ? Math.round(e.comision) : null,
      diasPresente: e.diasPresente,
      diasAusente: e.diasAusente,
      tardanzas: e.tardanzas,
      duracionMin: e.duracionMin,
      horasBase: Math.round(e.horasBase * 10) / 10,
      ocupacionPct: e.horasBase > 0 ? Math.round(e.duracionMin / (e.horasBase * 60) * 100) : null,
    }))
    .sort((a, b) => b.ventaNeta - a.ventaNeta)

  // Servicios más pedidos y rentabilidad (siempre desde fresha — tiene duración)
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
