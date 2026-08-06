import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { getSession } from '@/lib/auth'

export async function GET() {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const isAdmin = session.rol === 'admin' || session.rol === 'Admin'
  if (!isAdmin) return NextResponse.json({ error: 'Sin permisos' }, { status: 403 })

  const [expsRes, usuariosRes] = await Promise.all([
    supabaseAdmin.from('pedidos_exportadores').select('usuario_id'),
    supabase.from('usuarios').select('id, nombre, foto_perfil').eq('estado_cuenta', 'activo').order('nombre'),
  ])

  return NextResponse.json({
    exportadores: (expsRes.data ?? []).map(e => e.usuario_id),
    usuarios: usuariosRes.data ?? [],
  })
}

export async function PUT(request: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const isAdmin = session.rol === 'admin' || session.rol === 'Admin'
  if (!isAdmin) return NextResponse.json({ error: 'Sin permisos' }, { status: 403 })

  const body = await request.json().catch(() => ({}))
  const { usuario_id, puede } = body // puede: boolean

  if (!usuario_id || typeof puede !== 'boolean') {
    return NextResponse.json({ error: 'Datos inválidos' }, { status: 400 })
  }

  if (puede) {
    const { error } = await supabaseAdmin
      .from('pedidos_exportadores')
      .upsert({ usuario_id }, { onConflict: 'usuario_id' })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  } else {
    const { error } = await supabaseAdmin
      .from('pedidos_exportadores')
      .delete()
      .eq('usuario_id', usuario_id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
