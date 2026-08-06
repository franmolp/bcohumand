import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase-admin'

export async function GET(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  if (session.rol !== 'admin' && session.rol !== 'Admin') return NextResponse.json({ error: 'Prohibido' }, { status: 403 })

  const { searchParams } = new URL(req.url)
  const mes = searchParams.get('mes')

  let query = supabaseAdmin
    .from('retiros_caja')
    .select('*')
    .order('fecha', { ascending: false })
    .order('created_at', { ascending: false })

  if (mes) {
    const [y, m] = mes.split('-').map(Number)
    const from = `${mes}-01`
    const lastDay = new Date(y, m, 0).getDate()
    const to = `${mes}-${String(lastDay).padStart(2, '0')}`
    query = query.gte('fecha', from).lte('fecha', to)
  }

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}

export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  if (session.rol !== 'admin' && session.rol !== 'Admin') return NextResponse.json({ error: 'Prohibido' }, { status: 403 })

  const body = await req.json().catch(() => ({})) as {
    fecha?: string
    monto?: number | string
    descripcion?: string
  }

  const monto = Number(body.monto ?? 0)
  if (!body.fecha || monto <= 0) return NextResponse.json({ error: 'Datos inválidos' }, { status: 400 })

  const { data, error } = await supabaseAdmin
    .from('retiros_caja')
    .insert({
      fecha: body.fecha,
      monto,
      descripcion: body.descripcion || null,
      usuario_id: session.id,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
