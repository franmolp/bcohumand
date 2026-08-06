import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase-admin'

const CONFIG_KEY = 'caja_config'

export async function GET() {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  if (session.rol !== 'admin' && session.rol !== 'Admin') return NextResponse.json({ error: 'Prohibido' }, { status: 403 })

  const { data } = await supabaseAdmin.from('configuracion').select('valor').eq('clave', CONFIG_KEY).single()
  return NextResponse.json({ config: data?.valor ?? null, configurado: !!data?.valor })
}

export async function PUT(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  if (session.rol !== 'admin' && session.rol !== 'Admin') return NextResponse.json({ error: 'Prohibido' }, { status: 403 })

  const body = await req.json().catch(() => ({})) as {
    saldo_inicial?: number
    fecha_inicio?: string
    payment_name_efectivo?: string
  }

  const hoy = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' })
  const config = {
    saldo_inicial: Number(body.saldo_inicial ?? 0),
    fecha_inicio: body.fecha_inicio ?? hoy,
    payment_name_efectivo: body.payment_name_efectivo ?? 'Efectivo',
  }

  const { error } = await supabaseAdmin.from('configuracion').upsert(
    { clave: CONFIG_KEY, valor: config },
    { onConflict: 'clave' }
  )
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true, config })
}
