import { NextRequest, NextResponse } from 'next/server'
import { supabase, supabaseAdmin } from '@/lib/supabase'
import { getSession } from '@/lib/auth'

const PRESENT_ESTADOS = [
  'Asistió', 'Llegada tarde', 'Salida temprana',
  'Llegada tarde/Salida temprana', 'Tarde justificado',
  'Tarde justificado/Salida temprana', 'Incompleto',
]

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ anio: string; mes: string }> }
) {
  const { anio: anioStr, mes: mesStr } = await params
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const isAdmin = session.rol === 'admin' || session.rol === 'Admin'

  const anio = parseInt(anioStr)
  const mes  = parseInt(mesStr)

  const db = isAdmin ? supabaseAdmin : supabase

  // Fetch liquidaciones
  let liqQuery = db
    .from('liquidaciones')
    .select('*')
    .eq('anio', anio)
    .eq('mes', mes)
  if (!isAdmin) liqQuery = liqQuery.eq('usuario_id', session.id)

  // Fetch dias asistidos from asistencia_procesada
  const fechaInicio = `${anio}-${String(mes).padStart(2, '0')}-01`
  const lastDay = new Date(anio, mes, 0).getDate()
  const fechaFin = `${anio}-${String(mes).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`

  let asistQuery = db
    .from('asistencia_procesada')
    .select('usuario_id, estado')
    .gte('fecha', fechaInicio)
    .lte('fecha', fechaFin)
    .in('estado', PRESENT_ESTADOS)
  if (!isAdmin) asistQuery = asistQuery.eq('usuario_id', session.id)

  const [liqRes, asistRes] = await Promise.all([liqQuery, asistQuery])

  if (liqRes.error) return NextResponse.json({ error: liqRes.error.message }, { status: 500 })

  // Build dias map
  const diasMap = new Map<string, number>()
  for (const row of asistRes.data ?? []) {
    diasMap.set(row.usuario_id, (diasMap.get(row.usuario_id) ?? 0) + 1)
  }

  const result = (liqRes.data ?? []).map(liq => ({
    ...liq,
    dias_asistidos: diasMap.get(liq.usuario_id) ?? liq.dias_asistidos ?? 0,
  }))

  return NextResponse.json({ liquidaciones: result, diasMap: Object.fromEntries(diasMap) })
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ anio: string; mes: string }> }
) {
  const { anio: anioStr, mes: mesStr } = await params
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const isAdmin = session.rol === 'admin' || session.rol === 'Admin'
  if (!isAdmin) return NextResponse.json({ error: 'Sin permisos' }, { status: 403 })

  const anio = parseInt(anioStr)
  const mes  = parseInt(mesStr)
  const body = await request.json()

  // body = array of liquidacion records OR single record
  const records = Array.isArray(body) ? body : [body]

  const rows = records.map((r: Record<string, unknown>) => ({
    anio, mes,
    usuario_id:           r.usuario_id,
    nombre:               r.nombre ?? null,
    total_comisiones:     r.total_comisiones     ?? 0,
    presentismo:          r.presentismo          ?? 0,
    basico:               r.basico               ?? 0,
    reintegro_monotributo: r.reintegro_monotributo ?? 0,
    adicional_compras:    r.adicional_compras    ?? 0,
    total_adicionales:    r.total_adicionales    ?? 0,
    total_adelantos:      r.total_adelantos      ?? 0,
    subtotal:             r.subtotal             ?? 0,
    total:                r.total                ?? 0,
    dias_asistidos:       r.dias_asistidos       ?? 0,
    estado:               r.estado               ?? 'borrador',
    pdf_url:              r.pdf_url              ?? null,
    updated_at:           new Date().toISOString(),
  }))

  const { data, error } = await supabase
    .from('liquidaciones')
    .upsert(rows, { onConflict: 'anio,mes,usuario_id' })
    .select()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
