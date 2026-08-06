import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { getSession } from '@/lib/auth'

export async function GET() {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const isAdmin = session.rol === 'admin' || session.rol === 'Admin'
  if (!isAdmin) return NextResponse.json({ error: 'Sin permisos' }, { status: 403 })

  const [permsRes, usuariosRes] = await Promise.all([
    supabaseAdmin.from('pedidos_permisos').select('usuario_id, categoria'),
    supabase.from('usuarios').select('id, nombre, foto_perfil').eq('estado_cuenta', 'activo').order('nombre'),
  ])

  return NextResponse.json({
    permisos: permsRes.data ?? [],
    usuarios: usuariosRes.data ?? [],
  })
}

export async function PUT(request: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const isAdmin = session.rol === 'admin' || session.rol === 'Admin'
  if (!isAdmin) return NextResponse.json({ error: 'Sin permisos' }, { status: 403 })

  const body = await request.json().catch(() => ({}))
  // body: { usuario_id: string, categorias: string[] }
  const { usuario_id, categorias } = body

  if (!usuario_id || !Array.isArray(categorias)) {
    return NextResponse.json({ error: 'Datos inválidos' }, { status: 400 })
  }

  const CATEGORIAS = ['cocina', 'limpieza', 'manicuria', 'masajes', 'cejas_pestanas', 'depilacion', 'peluqueria']
  const categoriasValidas = categorias.filter(c => CATEGORIAS.includes(c))

  // Reemplazar permisos del usuario
  await supabaseAdmin.from('pedidos_permisos').delete().eq('usuario_id', usuario_id)

  if (categoriasValidas.length) {
    const { error } = await supabaseAdmin
      .from('pedidos_permisos')
      .insert(categoriasValidas.map(c => ({ usuario_id, categoria: c })))
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
