import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { getSession } from '@/lib/auth'
import { DEFAULT_CATEGORIAS } from '@/lib/liquidador'

export async function GET() {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { data, error } = await supabase
    .from('liquidacion_categorias')
    .select('*')
    .order('categoria')

  if (error || !data?.length) {
    const defaults = Object.entries(DEFAULT_CATEGORIAS).map(([categoria, porcentaje]) => ({ categoria, porcentaje }))
    return NextResponse.json(defaults)
  }
  return NextResponse.json(data)
}

export async function PUT(request: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const isAdmin = session.rol === 'admin' || session.rol === 'Admin'
  if (!isAdmin) return NextResponse.json({ error: 'Sin permisos' }, { status: 403 })

  const body = await request.json()
  if (!Array.isArray(body)) return NextResponse.json({ error: 'Array requerido' }, { status: 400 })

  const rows = body.map((r: { categoria: string; porcentaje: number }) => ({
    categoria: r.categoria,
    porcentaje: r.porcentaje,
    updated_at: new Date().toISOString(),
  }))

  const { error } = await supabase
    .from('liquidacion_categorias')
    .upsert(rows, { onConflict: 'categoria' })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

export async function POST(request: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const isAdmin = session.rol === 'admin' || session.rol === 'Admin'
  if (!isAdmin) return NextResponse.json({ error: 'Sin permisos' }, { status: 403 })

  const { categoria, porcentaje } = await request.json()
  if (!categoria || porcentaje === undefined) {
    return NextResponse.json({ error: 'categoria y porcentaje requeridos' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('liquidacion_categorias')
    .upsert({ categoria, porcentaje, updated_at: new Date().toISOString() }, { onConflict: 'categoria' })
    .select().single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function DELETE(request: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const isAdmin = session.rol === 'admin' || session.rol === 'Admin'
  if (!isAdmin) return NextResponse.json({ error: 'Sin permisos' }, { status: 403 })

  const categoria = new URL(request.url).searchParams.get('categoria')
  if (!categoria) return NextResponse.json({ error: 'categoria requerida' }, { status: 400 })

  const { error } = await supabase.from('liquidacion_categorias').delete().eq('categoria', categoria)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
