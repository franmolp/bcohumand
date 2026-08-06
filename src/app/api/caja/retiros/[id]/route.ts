import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase-admin'

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  if (session.rol !== 'admin' && session.rol !== 'Admin') return NextResponse.json({ error: 'Prohibido' }, { status: 403 })

  const { id } = await params
  const body = await req.json().catch(() => ({})) as {
    fecha?: string
    monto?: number | string
    descripcion?: string
  }

  const monto = Number(body.monto ?? 0)
  if (!body.fecha || monto <= 0) return NextResponse.json({ error: 'Datos inválidos' }, { status: 400 })

  const { data, error } = await supabaseAdmin
    .from('retiros_caja')
    .update({ fecha: body.fecha, monto, descripcion: body.descripcion || null })
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  if (session.rol !== 'admin' && session.rol !== 'Admin') return NextResponse.json({ error: 'Prohibido' }, { status: 403 })

  const { id } = await params
  const { error } = await supabaseAdmin.from('retiros_caja').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
