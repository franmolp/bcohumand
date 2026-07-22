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

  const isAdmin = session.rol === 'admin' || session.rol === 'Admin'
  if (!isAdmin) return NextResponse.json({ error: 'Sin permisos' }, { status: 403 })

  const { id } = await params

  const { data: items, error } = await supabaseAdmin
    .from('pedidos_items')
    .select('*, producto:pedidos_productos(nombre, marca, categoria, proveedor_id, proveedor:proveedores(id, nombre))')
    .eq('ciclo_id', id)
    .eq('archivado', false)
    .order('urgente', { ascending: false })
    .order('created_at', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const userIds = [...new Set((items ?? []).map(i => i.usuario_id))]
  const { data: usuarios } = await supabase
    .from('usuarios')
    .select('id, nombre')
    .in('id', userIds)

  const userMap: Record<string, string> = {}
  for (const u of usuarios ?? []) userMap[u.id] = u.nombre

  type ItemExport = {
    id: string
    nombre: string
    marca: string | null
    cantidad: number
    unidad: string
    notas: string | null
    urgente: boolean
    estado: string
    usuario: string
    nombre_libre: string | null
    categoria: string | null
  }
  type Group = { proveedor_id: number | null; nombre_proveedor: string; items: ItemExport[] }
  const porProveedor: Record<string, Group> = {}

  for (const item of items ?? []) {
    const prod = item.producto as { nombre: string; marca: string; categoria: string; proveedor_id: number | null; proveedor: { id: number; nombre: string } | null } | null
    const provId = prod?.proveedor?.id?.toString() ?? 'sin_proveedor'
    const provNombre = prod?.proveedor?.nombre ?? 'Sin proveedor'
    if (!porProveedor[provId]) porProveedor[provId] = { proveedor_id: prod?.proveedor?.id ?? null, nombre_proveedor: provNombre, items: [] }
    porProveedor[provId].items.push({
      id: item.id,
      nombre: prod?.nombre ?? item.nombre_libre ?? 'Item sin nombre',
      marca: prod?.marca ?? null,
      cantidad: item.cantidad,
      unidad: item.unidad,
      notas: item.notas ?? null,
      urgente: item.urgente,
      estado: item.estado,
      usuario: userMap[item.usuario_id] ?? 'Usuario',
      nombre_libre: item.nombre_libre ?? null,
      categoria: prod?.categoria ?? null,
    })
  }

  const ordenado = Object.entries(porProveedor).sort(([a], [b]) => {
    if (a === 'sin_proveedor') return 1
    if (b === 'sin_proveedor') return -1
    return porProveedor[a].nombre_proveedor.localeCompare(porProveedor[b].nombre_proveedor)
  })

  return NextResponse.json(ordenado.map(([, v]) => v))
}
