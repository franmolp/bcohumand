import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { getSession } from '@/lib/auth'

export async function GET() {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const isAdmin = session.rol === 'admin' || session.rol === 'Admin'

  let query = supabaseAdmin
    .from('pedidos_items')
    .select('*, producto:pedidos_productos(id, nombre, marca, categoria, unidad, proveedor_id, proveedor:proveedores(id, nombre))')
    .in('estado', ['ordenado', 'faltante', 'recibido'])
    .eq('archivado', true)
    .order('archivado_en', { ascending: false })

  // For non-admin: filter by their categories
  if (!isAdmin) {
    const { data: perms } = await supabaseAdmin
      .from('pedidos_permisos')
      .select('categoria')
      .eq('usuario_id', session.id)

    const myCats = (perms ?? []).map(p => p.categoria)
    if (!myCats.length) return NextResponse.json([])
    // We'll filter in JS since the join makes it complex
  }

  const { data: items, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Filter by user categories if not admin
  let filtered = items ?? []
  if (!isAdmin) {
    const { data: perms } = await supabaseAdmin
      .from('pedidos_permisos')
      .select('categoria')
      .eq('usuario_id', session.id)
    const myCats = (perms ?? []).map(p => p.categoria)
    filtered = filtered.filter(i => {
      const prod = Array.isArray(i.producto) ? i.producto[0] : i.producto
      return !prod || myCats.includes((prod as { categoria: string }).categoria)
    })
  }

  // Fetch user names
  const userIds = [...new Set(filtered.map(i => i.usuario_id))]
  const { data: usuarios } = userIds.length
    ? await supabase.from('usuarios').select('id, nombre').in('id', userIds)
    : { data: [] as { id: string; nombre: string }[] }
  const userMap: Record<string, string> = {}
  for (const u of usuarios ?? []) userMap[u.id] = u.nombre

  // Group by date + proveedor
  type EnvioItem = {
    id: string; ciclo_id: string; nombre: string; marca: string | null
    cantidad: number; unidad: string; estado: string; notas: string | null
    urgente: boolean; usuario: string; producto_id: string | null; variante_id: string | null
  }
  type EnvioGroup = { fecha: string; proveedor_id: number | null; proveedor_nombre: string; items: EnvioItem[] }
  const groups: Record<string, EnvioGroup> = {}

  for (const item of filtered) {
    const prod = Array.isArray(item.producto) ? item.producto[0] : item.producto
    const p = prod as { nombre: string; marca: string; proveedor_id: number | null; proveedor: { id: number; nombre: string } | null } | null
    const fecha = item.archivado_en ? item.archivado_en.slice(0, 10) : 'sin_fecha'
    const provId = p?.proveedor?.id ?? null
    const provNombre = p?.proveedor?.nombre ?? 'Sin proveedor'
    const key = `${fecha}__${provId ?? 'null'}`
    if (!groups[key]) groups[key] = { fecha, proveedor_id: provId, proveedor_nombre: provNombre, items: [] }
    groups[key].items.push({
      id: item.id,
      ciclo_id: item.ciclo_id,
      nombre: p?.nombre ?? item.nombre_libre ?? 'Ítem',
      marca: p?.marca ?? null,
      cantidad: item.cantidad,
      unidad: item.unidad,
      estado: item.estado,
      notas: item.notas ?? null,
      urgente: item.urgente,
      usuario: userMap[item.usuario_id] ?? 'Usuario',
      producto_id: item.producto_id ?? null,
      variante_id: item.variante_id ?? null,
    })
  }

  // Sort: most recent date first, then proveedor name
  const result = Object.values(groups).sort((a, b) => {
    if (a.fecha !== b.fecha) return b.fecha.localeCompare(a.fecha)
    if (a.proveedor_nombre === 'Sin proveedor') return 1
    if (b.proveedor_nombre === 'Sin proveedor') return -1
    return a.proveedor_nombre.localeCompare(b.proveedor_nombre)
  })

  return NextResponse.json(result)
}
