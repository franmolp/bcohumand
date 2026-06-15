import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { requireAdmin } from '@/lib/auth'

export async function GET(request: NextRequest) {
  try {
    await requireAdmin()
    const { searchParams } = new URL(request.url)
    const tipo = searchParams.get('tipo') || ''
    const search = searchParams.get('search') || ''
    const desde = searchParams.get('desde') || ''
    const limit = parseInt(searchParams.get('limit') || '300')

    let query = supabaseAdmin
      .from('log_seguridad')
      .select('*, usuario:usuarios(nombre, usuario)')
      .order('created_at', { ascending: false })
      .limit(limit)

    if (tipo) query = query.eq('accion', tipo)
    if (desde) query = query.gte('created_at', desde)
    if (search) query = query.ilike('usuario_texto', `%${search}%`)

    const { data, error } = await query
    if (error) throw error
    return NextResponse.json(data)
  } catch {
    return NextResponse.json({ error: 'Error al obtener logs' }, { status: 500 })
  }
}
