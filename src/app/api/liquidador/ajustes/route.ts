import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { getSession } from '@/lib/auth'

export async function GET(request: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const isAdmin = session.rol === 'admin' || session.rol === 'Admin'

  const p = new URL(request.url).searchParams
  const anio = p.get('anio')
  const mes  = p.get('mes')
  const uid  = p.get('usuario_id')

  if (!anio || !mes) return NextResponse.json({ error: 'anio y mes requeridos' }, { status: 400 })

  let query = supabase
    .from('liquidacion_ajustes')
    .select('*')
    .eq('anio', parseInt(anio))
    .eq('mes', parseInt(mes))
    .order('created_at')

  if (!isAdmin) {
    query = query.eq('usuario_id', session.id)
  } else if (uid) {
    query = query.eq('usuario_id', uid)
  }

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data || [])
}

export async function POST(request: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const isAdmin = session.rol === 'admin' || session.rol === 'Admin'
  if (!isAdmin) return NextResponse.json({ error: 'Sin permisos' }, { status: 403 })

  const { anio, mes, usuario_id, tipo, concepto, monto, fecha } = await request.json()
  if (!anio || !mes || !usuario_id || !tipo || !concepto || monto === undefined) {
    return NextResponse.json({ error: 'Faltan campos requeridos' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('liquidacion_ajustes')
    .insert({ anio, mes, usuario_id, tipo, concepto, monto, fecha: fecha || null })
    .select().single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}

export async function DELETE(request: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const isAdmin = session.rol === 'admin' || session.rol === 'Admin'
  if (!isAdmin) return NextResponse.json({ error: 'Sin permisos' }, { status: 403 })

  const id = new URL(request.url).searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id requerido' }, { status: 400 })

  const { error } = await supabase.from('liquidacion_ajustes').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
