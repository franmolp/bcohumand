import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { supabase } from '@/lib/supabase'

export async function GET(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const mes = searchParams.get('mes')
  const empleadoParam = searchParams.get('empleado')

  const isAdmin = session.rol === 'admin' || session.rol === 'Admin'

  let query = supabase.from('horarios_base').select('*')

  if (mes) {
    const [year, month] = mes.split('-').map(Number)
    const lastDay = new Date(year, month, 0).getDate()
    query = query.gte('fecha', `${mes}-01`).lte('fecha', `${mes}-${String(lastDay).padStart(2, '0')}`)
  }

  if (!isAdmin) {
    query = query.eq('usuario_id', session.id)
  } else if (empleadoParam) {
    query = query.eq('usuario_id', empleadoParam)
  }

  query = query.order('fecha', { ascending: true })

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}

export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const isAdmin = session.rol === 'admin' || session.rol === 'Admin'
  if (!isAdmin) return NextResponse.json({ error: 'Prohibido' }, { status: 403 })

  const body = await req.json()
  const items = Array.isArray(body) ? body : [body]

  const toInsert = items.map((item: {
    usuario_id: string
    fecha: string
    inicio_base: string
    fin_base: string
    horas_base?: number
  }) => {
    let horas = item.horas_base
    if (horas === undefined || horas === null) {
      const [hi, mi] = item.inicio_base.split(':').map(Number)
      const [hf, mf] = item.fin_base.split(':').map(Number)
      horas = parseFloat(((hf * 60 + mf - (hi * 60 + mi)) / 60).toFixed(2))
    }
    return {
      usuario_id: item.usuario_id,
      fecha: item.fecha,
      inicio_base: item.inicio_base,
      fin_base: item.fin_base,
      horas_base: horas,
    }
  })

  const { data, error } = await supabase
    .from('horarios_base')
    .upsert(toInsert, { onConflict: 'usuario_id,fecha' })
    .select()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
