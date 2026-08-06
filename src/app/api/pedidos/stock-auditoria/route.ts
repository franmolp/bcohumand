import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { supabase } from '@/lib/supabase'
import { getSession } from '@/lib/auth'

export async function GET(request: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const productoId = searchParams.get('producto_id')
  const varianteId = searchParams.get('variante_id')

  if (!productoId && !varianteId) {
    return NextResponse.json({ error: 'Se requiere producto_id o variante_id' }, { status: 400 })
  }

  let query = supabaseAdmin
    .from('pedidos_stock_auditoria')
    .select('id, usuario_id, stock_anterior, stock_nuevo, created_at')
    .order('created_at', { ascending: false })
    .limit(30)

  if (varianteId) {
    query = query.eq('variante_id', varianteId).is('producto_id', null)
  } else {
    query = query.eq('producto_id', productoId!).is('variante_id', null)
  }

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const userIds = [...new Set((data ?? []).map(r => r.usuario_id))]
  const { data: usuarios } = userIds.length
    ? await supabase.from('usuarios').select('id, nombre').in('id', userIds)
    : { data: [] as { id: string; nombre: string }[] }

  const userMap: Record<string, string> = {}
  for (const u of (usuarios ?? [])) userMap[u.id] = u.nombre

  return NextResponse.json(
    (data ?? []).map(r => ({
      ...r,
      usuario_nombre: userMap[r.usuario_id] ?? 'Usuario',
    }))
  )
}

export async function POST(request: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const body = await request.json().catch(() => ({}))
  const { producto_id, variante_id, stock_anterior, stock_nuevo } = body

  if (!producto_id && !variante_id) {
    return NextResponse.json({ error: 'Se requiere producto_id o variante_id' }, { status: 400 })
  }
  if (stock_nuevo === undefined || stock_nuevo === null) {
    return NextResponse.json({ error: 'stock_nuevo requerido' }, { status: 400 })
  }

  const insert: Record<string, unknown> = {
    usuario_id: session.id,
    stock_nuevo: Number(stock_nuevo),
    stock_anterior: stock_anterior !== undefined && stock_anterior !== null ? Number(stock_anterior) : null,
  }
  if (variante_id) insert.variante_id = variante_id
  else insert.producto_id = producto_id

  const { error } = await supabaseAdmin.from('pedidos_stock_auditoria').insert(insert)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
