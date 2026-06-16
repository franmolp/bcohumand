import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { getSession } from '@/lib/auth'

const CLAVE = 'solicitudes_config'
const DEFAULT = { vacaciones_min_dias: 15, otros_min_dias: 10 }

export async function GET() {
  const { data } = await supabaseAdmin
    .from('configuracion')
    .select('valor')
    .eq('clave', CLAVE)
    .single()

  return NextResponse.json(data?.valor ?? DEFAULT)
}

export async function PUT(request: NextRequest) {
  const session = await getSession()
  if (!session || (session.rol !== 'Admin' && session.rol !== 'admin' && session.rol !== 'HR'))
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 })

  const body = await request.json().catch(() => ({}))
  const vacaciones_min_dias = Number(body.vacaciones_min_dias) || DEFAULT.vacaciones_min_dias
  const otros_min_dias      = Number(body.otros_min_dias)      || DEFAULT.otros_min_dias
  const valor = { vacaciones_min_dias, otros_min_dias }

  const { error } = await supabaseAdmin
    .from('configuracion')
    .upsert({ clave: CLAVE, valor }, { onConflict: 'clave' })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(valor)
}
