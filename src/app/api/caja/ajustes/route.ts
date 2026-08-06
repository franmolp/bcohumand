import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase-admin'

export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  if (session.rol !== 'admin' && session.rol !== 'Admin') return NextResponse.json({ error: 'Prohibido' }, { status: 403 })

  const body = await req.json().catch(() => ({})) as {
    fecha?: string
    saldo_nuevo?: number | string
    motivo?: string
  }

  if (!body.fecha || body.saldo_nuevo === undefined || body.saldo_nuevo === null) {
    return NextResponse.json({ error: 'Datos inválidos' }, { status: 400 })
  }

  const { data, error } = await supabaseAdmin
    .from('caja_ajustes')
    .insert({
      fecha: body.fecha,
      saldo_nuevo: Number(body.saldo_nuevo),
      motivo: body.motivo || null,
      usuario_id: session.id,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
