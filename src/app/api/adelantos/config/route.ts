import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase-admin'

const CLAVE = 'adelantos_config'
export const DEFAULT_CONFIG = {
  monto_minimo: 10000,
  monto_maximo: 100000,
  dia_habilitacion: 15,
  max_por_mes: 1,
}

export async function GET() {
  const { data } = await supabaseAdmin
    .from('configuracion')
    .select('valor')
    .eq('clave', CLAVE)
    .maybeSingle()
  return NextResponse.json(data?.valor ?? DEFAULT_CONFIG)
}

export async function PUT(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const isAdmin = session.rol === 'admin' || session.rol === 'Admin'
  if (!isAdmin) return NextResponse.json({ error: 'Sin permiso' }, { status: 403 })

  const body = await req.json()
  const valor = { ...DEFAULT_CONFIG, ...body }

  const { error } = await supabaseAdmin
    .from('configuracion')
    .upsert({ clave: CLAVE, valor }, { onConflict: 'clave' })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
