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

  const isAdmin = session.rol === 'admin' || session.rol === 'Admin'

  const [itemsRes, permsRes] = await Promise.all([
    supabaseAdmin
      .from('pedidos_items')
      .select('*, producto:pedidos_productos(id, nombre, marca, categoria, unidad, proveedor_id, proveedor:proveedores(id, nombre))')
      .eq('ciclo_id', id)
      .order('created_at', { ascending: true }),
    supabaseAdmin
      .from('pedidos_permisos')
      .select('usuario_id, categoria'),
  ])

  if (itemsRes.error) return NextResponse.json({ error: itemsRes.error.message }, { status: 500 })

  const items = itemsRes.data ?? []
  const userIds = [...new Set(items.map(i => i.usuario_id))]

  const { data: usuarios } = userIds.length
    ? await supabase.from('usuarios').select('id, nombre, foto_perfil').in('id', userIds)
    : { data: [] as { id: string; nombre: string; foto_perfil: string | null }[] }

  const userMap: Record<string, { nombre: string; foto_perfil: string | null }> = {}
  for (const u of usuarios ?? []) {
    userMap[u.id] = { nombre: u.nombre, foto_perfil: (u as { foto_perfil?: string | null }).foto_perfil ?? null }
  }

  // For non-admin: find which categories the user can see
  let myCats: string[] = []
  if (!isAdmin) {
    const { data: myPerms } = await supabaseAdmin
      .from('pedidos_permisos')
      .select('categoria')
      .eq('usuario_id', session.id)
    myCats = (myPerms ?? []).map(p => p.categoria)
  }

  const itemsConUsuario = items.map(i => ({
    ...i,
    usuario: userMap[i.usuario_id] ?? { nombre: 'Usuario', foto_perfil: null },
  }))

  // Filter items by category for non-admin (always show own items)
  const filtrar = (list: typeof itemsConUsuario) => {
    if (isAdmin) return list
    return list.filter(i => {
      const prod = Array.isArray(i.producto) ? i.producto[0] : i.producto
      const cat = (prod as { categoria?: string } | null)?.categoria
      return i.usuario_id === session.id || (cat && myCats.includes(cat))
    })
  }

  const activos = filtrar(itemsConUsuario.filter(i => !i.archivado))
  // Manual archives: estado='pendiente' (not sent-to-proveedor)
  const archivados = filtrar(itemsConUsuario.filter(i => i.archivado && i.estado === 'pendiente'))

  return NextResponse.json({
    items: activos,
    archivados,
    permisos: permsRes.data ?? [],
    myCats,
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

  const isAdmin = session.rol === 'admin' || session.rol === 'Admin'

  const body = await request.json().catch(() => ({}))
  const { producto_id, nombre_libre, cantidad, unidad, notas, urgente } = body

  if (!producto_id && !nombre_libre?.trim()) {
    return NextResponse.json({ error: 'Se requiere producto o nombre' }, { status: 400 })
  }
  if (!cantidad || isNaN(Number(cantidad)) || Number(cantidad) <= 0) {
    return NextResponse.json({ error: 'Cantidad inválida' }, { status: 400 })
  }

  // Non-admin: validate the product's category is in their permissions
  if (!isAdmin && producto_id) {
    const { data: prod } = await supabaseAdmin
      .from('pedidos_productos')
      .select('categoria')
      .eq('id', producto_id)
      .single()
    if (prod) {
      const { data: perm } = await supabaseAdmin
        .from('pedidos_permisos')
        .select('categoria')
        .eq('usuario_id', session.id)
        .eq('categoria', prod.categoria)
        .maybeSingle()
      if (!perm) return NextResponse.json({ error: 'Sin permisos para esta categoría' }, { status: 403 })
    }
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
