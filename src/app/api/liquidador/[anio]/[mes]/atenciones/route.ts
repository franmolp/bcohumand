import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { getSession } from '@/lib/auth'

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
  const uid  = new URL(request.url).searchParams.get('usuario_id')

  let query = supabase
    .from('liquidacion_atenciones')
    .select('*')
    .eq('anio', anio)
    .eq('mes', mes)
    .order('fecha')

  if (!isAdmin) {
    query = query.eq('usuario_id', session.id)
  } else if (uid) {
    query = query.eq('usuario_id', uid)
  }

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data || [])
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
  // body = { usuario_id, atenciones: AtencionComision[] }[]
  const groups: { usuario_id: string; atenciones: Record<string, unknown>[] }[] = Array.isArray(body) ? body : [body]

  // Delete existing atenciones for these users in this month
  const uids = groups.map(g => g.usuario_id)
  await supabase
    .from('liquidacion_atenciones')
    .delete()
    .eq('anio', anio)
    .eq('mes', mes)
    .in('usuario_id', uids)

  // Flatten and insert
  const rows = groups.flatMap(g =>
    g.atenciones.map(a => ({
      anio, mes,
      usuario_id:           g.usuario_id,
      fecha:                a.fecha ?? null,
      nombre_csv:           a.nombre_csv ?? null,
      categoria:            a.categoria ?? null,
      articulo:             a.articulo ?? null,
      venta_neta:           a.venta_neta ?? 0,
      comision:             a.comision ?? 0,
      es_compartido:        a.es_compartido ?? false,
      cantidad_profesionales: a.cantidad_profesionales ?? 1,
      importado_el:         new Date().toISOString(),
    }))
  )

  if (rows.length === 0) return NextResponse.json({ inserted: 0 })

  const { error } = await supabase.from('liquidacion_atenciones').insert(rows)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ inserted: rows.length })
}
