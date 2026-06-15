import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { supabase } from '@/lib/supabase'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { DEFAULT_CONFIG } from '@/lib/asistencia'

const CLAVE = 'asistencia'

export async function GET() {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { data } = await supabase
    .from('configuracion')
    .select('valor')
    .eq('clave', CLAVE)
    .single()

  const config = data?.valor ? { ...DEFAULT_CONFIG, ...(data.valor as object) } : DEFAULT_CONFIG
  return NextResponse.json(config)
}

export async function PUT(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const isAdmin = session.rol === 'admin' || session.rol === 'Admin'
  if (!isAdmin) return NextResponse.json({ error: 'Prohibido' }, { status: 403 })

  const body = await req.json()

  const { error } = await supabaseAdmin
    .from('configuracion')
    .upsert({ clave: CLAVE, valor: body }, { onConflict: 'clave' })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
