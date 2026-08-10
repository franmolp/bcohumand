import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { getSession } from '@/lib/auth'

interface LogEntry {
  id: string
  tipo: 'stock' | 'item'
  mensaje: string
  usuario_nombre: string
  created_at: string
}

export async function GET(request: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const isAdmin = session.rol === 'admin' || session.rol === 'Admin'
  const isEncargada = session.rol === 'encargada' || session.rol === 'Encargada'
  if (!isAdmin && !isEncargada) return NextResponse.json({ error: 'Sin permisos' }, { status: 403 })

  const limit = Math.min(Number(new URL(request.url).searchParams.get('limit')) || 100, 300)

  const [stockRes, itemsAudRes] = await Promise.all([
    supabaseAdmin
      .from('pedidos_stock_auditoria')
      .select('id, producto_id, variante_id, usuario_id, stock_anterior, stock_nuevo, created_at')
      .order('created_at', { ascending: false })
      .limit(limit),
    supabaseAdmin
      .from('pedidos_items_auditoria')
      .select('id, item_id, usuario_id, accion, detalle, created_at')
      .order('created_at', { ascending: false })
      .limit(limit),
  ])

  if (stockRes.error) return NextResponse.json({ error: stockRes.error.message }, { status: 500 })
  if (itemsAudRes.error) return NextResponse.json({ error: itemsAudRes.error.message }, { status: 500 })

  const stockRows = stockRes.data ?? []
  const itemAudRows = itemsAudRes.data ?? []

  const productoIds = new Set<string>()
  const varianteIds = new Set<string>()
  for (const r of stockRows) {
    if (r.producto_id) productoIds.add(r.producto_id)
    if (r.variante_id) varianteIds.add(r.variante_id)
  }

  const itemIds = [...new Set(itemAudRows.map(r => r.item_id))]
  const { data: itemsData } = itemIds.length
    ? await supabaseAdmin.from('pedidos_items').select('id, producto_id, variante_id, nombre_libre').in('id', itemIds)
    : { data: [] as { id: string; producto_id: string | null; variante_id: string | null; nombre_libre: string | null }[] }

  for (const it of itemsData ?? []) {
    if (it.producto_id) productoIds.add(it.producto_id)
    if (it.variante_id) varianteIds.add(it.variante_id)
  }

  const [{ data: productos }, { data: variantes }] = await Promise.all([
    productoIds.size
      ? supabaseAdmin.from('pedidos_productos').select('id, nombre, marca').in('id', [...productoIds])
      : Promise.resolve({ data: [] as { id: string; nombre: string; marca: string }[] }),
    varianteIds.size
      ? supabaseAdmin.from('pedidos_variantes').select('id, nombre, producto_id').in('id', [...varianteIds])
      : Promise.resolve({ data: [] as { id: string; nombre: string; producto_id: string }[] }),
  ])

  const prodMap: Record<string, { nombre: string; marca: string }> = {}
  for (const p of productos ?? []) prodMap[p.id] = { nombre: p.nombre, marca: p.marca }
  const varMap: Record<string, { nombre: string; producto_id: string }> = {}
  for (const v of variantes ?? []) varMap[v.id] = { nombre: v.nombre, producto_id: v.producto_id }
  const itemMap: Record<string, { producto_id: string | null; variante_id: string | null; nombre_libre: string | null }> = {}
  for (const it of itemsData ?? []) itemMap[it.id] = it

  const userIds = [...new Set([...stockRows.map(r => r.usuario_id), ...itemAudRows.map(r => r.usuario_id)])]
  const { data: usuarios } = userIds.length
    ? await supabase.from('usuarios').select('id, nombre').in('id', userIds)
    : { data: [] as { id: string; nombre: string }[] }
  const userMap: Record<string, string> = {}
  for (const u of usuarios ?? []) userMap[u.id] = u.nombre

  function labelProducto(productoId: string | null, varianteId: string | null): string {
    if (varianteId) {
      const v = varMap[varianteId]
      if (!v) return 'un producto'
      const p = prodMap[v.producto_id]
      return p ? `${p.marca} ${p.nombre} - ${v.nombre}` : v.nombre
    }
    if (productoId) {
      const p = prodMap[productoId]
      return p ? `${p.marca} ${p.nombre}` : 'un producto'
    }
    return 'un producto'
  }

  const stockEntries: LogEntry[] = stockRows.map(r => {
    const label = labelProducto(r.producto_id, r.variante_id)
    const anterior = r.stock_anterior ?? '?'
    return {
      id: `stock-${r.id}`,
      tipo: 'stock',
      mensaje: `actualizó el stock de ${label} de ${anterior} a ${r.stock_nuevo}`,
      usuario_nombre: userMap[r.usuario_id] ?? 'Usuario',
      created_at: r.created_at,
    }
  })

  const itemEntries: LogEntry[] = itemAudRows.map(r => {
    const item = itemMap[r.item_id]
    const label = item
      ? (item.nombre_libre ?? labelProducto(item.producto_id, item.variante_id))
      : 'un ítem'
    const detalle = r.detalle ? ` (${r.detalle})` : ''
    let mensaje: string
    if (r.accion === 'creó') mensaje = `agregó "${label}" al pedido`
    else if (r.accion === 'archivó') mensaje = `marcó "${label}" como pedido`
    else if (r.accion === 'eliminó') mensaje = `eliminó "${label}" del pedido`
    else mensaje = `editó "${label}"${detalle}`
    return {
      id: `item-${r.id}`,
      tipo: 'item',
      mensaje,
      usuario_nombre: userMap[r.usuario_id] ?? 'Usuario',
      created_at: r.created_at,
    }
  })

  const merged = [...stockEntries, ...itemEntries]
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, limit)

  return NextResponse.json(merged)
}
