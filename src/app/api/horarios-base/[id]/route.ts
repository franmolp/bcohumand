import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { supabase } from '@/lib/supabase'

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const isAdmin = session.rol === 'admin' || session.rol === 'Admin'
  if (!isAdmin) return NextResponse.json({ error: 'Prohibido' }, { status: 403 })

  const id = parseInt(params.id, 10)
  const body = await req.json()
  const { inicio_base, fin_base, horas_base } = body as {
    inicio_base?: string
    fin_base?: string
    horas_base?: number
  }

  const update: Record<string, unknown> = { editado: true }
  if (inicio_base !== undefined) update.inicio_base = inicio_base
  if (fin_base !== undefined) update.fin_base = fin_base

  if (horas_base !== undefined) {
    update.horas_base = horas_base
  } else if (inicio_base && fin_base) {
    const [hi, mi] = inicio_base.split(':').map(Number)
    const [hf, mf] = fin_base.split(':').map(Number)
    update.horas_base = parseFloat(((hf * 60 + mf - (hi * 60 + mi)) / 60).toFixed(2))
  }

  const { data, error } = await supabase
    .from('horarios_base')
    .update(update)
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const isAdmin = session.rol === 'admin' || session.rol === 'Admin'
  if (!isAdmin) return NextResponse.json({ error: 'Prohibido' }, { status: 403 })

  const id = parseInt(params.id, 10)
  const { error } = await supabase.from('horarios_base').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
