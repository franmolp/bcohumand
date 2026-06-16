import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { supabase } from '@/lib/supabase'
import { supabaseAdmin } from '@/lib/supabase-admin'

export async function GET() {
  const session = await getSession()
  if (!session || (session.rol !== 'admin' && session.rol !== 'Admin'))
    return NextResponse.json({ error: 'Prohibido' }, { status: 403 })

  const { data, error } = await supabase
    .from('usuarios')
    .select('id, nombre, monotributo_habilitado')
    .eq('estado_cuenta', 'activo')
    .order('nombre')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}

export async function PUT(req: NextRequest) {
  const session = await getSession()
  if (!session || (session.rol !== 'admin' && session.rol !== 'Admin'))
    return NextResponse.json({ error: 'Prohibido' }, { status: 403 })

  const { usuario_id, habilitado } = await req.json()
  const { error } = await supabaseAdmin.from('usuarios').update({ monotributo_habilitado: habilitado }).eq('id', usuario_id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
