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

export async function GET(request: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  if (!['admin', 'Admin', 'HR'].includes(session.rol)) return NextResponse.json({ error: 'Prohibido' }, { status: 403 })

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

  const citasNoCanc = (citas ?? []).filter(c => c.estado !== 'cancelado' && c.estado !== 'Cancelado')
  const citasCanceladas = (citas ?? []).filter(c => c.estado === 'cancelado' || c.estado === 'Cancelado')
  const ventasNetas = citasNoCanc.reduce((s, c) => s + (c.venta_neta || 0), 0)
  const gastos = (comprasData ?? []).reduce((s, c) => s + (c.monto || 0), 0)
  const proyeccion = diasTranscurridos < diasDelMes && diasTranscurridos > 0
    ? Math.round(ventasNetas / diasTranscurridos * diasDelMes)
    : null

  interface EmpData {
    nombre: string
    citas: number
    duracionMin: number
    ventaNeta: number
    diasPresente: number
    diasAusente: number
    tardanzas: number
    horasBase: number
  }
  const empMap = new Map<string, EmpData>()
  const getEmp = (uid: string, nombre: string) => {
    if (!empMap.has(uid)) empMap.set(uid, { nombre, citas: 0, duracionMin: 0, ventaNeta: 0, diasPresente: 0, diasAusente: 0, tardanzas: 0, horasBase: 0 })
    return empMap.get(uid)!
  }

  for (const c of citasNoCanc) {
    const e = getEmp(c.usuario_id, c.nombre_empleada)
    e.citas++
    e.ventaNeta += c.venta_neta || 0
    e.duracionMin += citaDurMin(c)
  }
  for (const a of (asistencia ?? [])) {
    const nombre = nombreMap.get(a.usuario_id) ?? '—'
    const e = getEmp(a.usuario_id, nombre)
    const chip = CHIP_INFO[a.estado ?? '']
    if (chip?.present) {
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
      diasPresente: e.diasPresente,
      tardanzas: e.tardanzas,
      duracionMin: e.duracionMin,
      horasBase: Math.round(e.horasBase * 10) / 10,
      ocupacionPct: e.horasBase > 0 ? Math.round(e.duracionMin / (e.horasBase * 60) * 100) : null,
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

  // Más pedidos: top 15 por cantidad
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

  // Rentabilidad: top 10 por $/hora
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
      tasaCancelacion: (citas?.length ?? 0) > 0 ? Math.round(citasCanceladas.length / citas!.length * 100) : 0,
      ventasNetas: Math.round(ventasNetas),
      gastos: Math.round(gastos),
      balance: Math.round(ventasNetas - gastos),
      proyeccion,
      diasTranscurridos,
      diasDelMes,
    },
    productividad,
    servicios,
    rentabilidad,
  })
}
