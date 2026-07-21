import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { getSession } from '@/lib/auth'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { id } = await params

  const [itemsRes, permsRes] = await Promise.all([
    supabaseAdmin
      .from('pedidos_items')
      .select('*, producto:pedidos_productos(id, nombre, categoria, unidad, proveedor_id, proveedor:proveedores(id, nombre))')
      .eq('ciclo_id', id)
      .order('created_at', { ascending: true }),
    supabaseAdmin
      .from('pedidos_permisos')
      .select('usuario_id, categoria'),
  ])

  if (itemsRes.error) return NextResponse.json({ error: itemsRes.error.message }, { status: 500 })

  const items = itemsRes.data ?? []
  const userIds = [...new Set(items.map(i => i.usuario_id))]

  const { data: usuarios } = await supabase
    .from('usuarios')
    .select('id, nombre, foto_perfil')
    .in('id', userIds)

  const userMap: Record<string, { nombre: string; foto_perfil: string | null }> = {}
  for (const u of usuarios ?? []) {
    userMap[u.id] = { nombre: u.nombre, foto_perfil: (u as { foto_perfil?: string | null }).foto_perfil ?? null }
  }

  const itemsConUsuario = items.map(i => ({
    ...i,
    usuario: userMap[i.usuario_id] ?? { nombre: 'Usuario', foto_perfil: null },
  }))

  return NextResponse.json({
    items: itemsConUsuario,
    permisos: permsRes.data ?? [],
  })
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { id } = await params

  // Verificar que el ciclo esté abierto
  const { data: ciclo } = await supabaseAdmin
    .from('pedidos_ciclos')
    .select('estado')
    .eq('id', id)
    .single()

  if (!ciclo) return NextResponse.json({ error: 'Ciclo no encontrado' }, { status: 404 })
  if (ciclo.estado !== 'abierto') return NextResponse.json({ error: 'El pedido ya está cerrado' }, { status: 400 })

  const body = await request.json().catch(() => ({}))
  const { producto_id, nombre_libre, cantidad, unidad, notas, urgente } = body

  if (!producto_id && !nombre_libre?.trim()) {
    return NextResponse.json({ error: 'Se requiere producto o nombre' }, { status: 400 })
  }
  if (!cantidad || isNaN(Number(cantidad)) || Number(cantidad) <= 0) {
    return NextResponse.json({ error: 'Cantidad inválida' }, { status: 400 })
  }

  const { data, error } = await supabaseAdmin
    .from('pedidos_items')
    .insert({
      ciclo_id: id,
      producto_id: producto_id ?? null,
      nombre_libre: nombre_libre?.trim() ?? null,
      cantidad: Number(cantidad),
      unidad: unidad ?? 'unidad',
      notas: notas?.trim() ?? null,
      urgente: urgente === true,
      usuario_id: session.id,
      estado: 'pendiente',
    })
    .select('*, producto:pedidos_productos(id, nombre, categoria, unidad, proveedor_id, proveedor:proveedores(id, nombre))')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const { data: u } = await supabase
    .from('usuarios')
    .select('nombre, foto_perfil')
    .eq('id', session.id)
    .single()

  return NextResponse.json({
    ...data,
    usuario: { nombre: (u as { nombre: string; foto_perfil?: string | null } | null)?.nombre ?? session.nombre, foto_perfil: (u as { nombre: string; foto_perfil?: string | null } | null)?.foto_perfil ?? null },
  })
}
