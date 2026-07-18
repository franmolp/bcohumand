import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { getSession } from '@/lib/auth'

// GET: reconocimientos recibidos por el usuario actual
export async function GET(request: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const mes = searchParams.get('mes') // null = todos

  let query = supabaseAdmin
    .from('reconocimientos')
    .select('id, id_emisor, categoria_pilar, mensaje, anonimo, estado, mes_ciclo, fecha_creacion')
    .eq('id_receptor', session.id)
    .eq('estado', 'aprobado')
    .order('fecha_creacion', { ascending: false })

  if (mes) query = query.eq('mes_ciclo', mes)

  const { data: recs, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!recs?.length) return NextResponse.json([])

  const emisoresIds = [...new Set(recs.filter(r => !r.anonimo).map(r => r.id_emisor))]
  const userMap: Record<string, { nombre: string; foto_perfil: string | null }> = {}

  if (emisoresIds.length) {
    const { data: usuarios } = await supabase
      .from('usuarios')
      .select('id, nombre, foto_perfil')
      .in('id', emisoresIds)
    for (const u of usuarios ?? []) {
      userMap[u.id] = { nombre: u.nombre, foto_perfil: (u as { foto_perfil?: string | null }).foto_perfil ?? null }
    }
  }

  return NextResponse.json(recs.map(r => ({
    id: r.id,
    emisor: r.anonimo ? null : (userMap[r.id_emisor] ?? { nombre: 'Usuario', foto_perfil: null }),
    anonimo: r.anonimo,
    categoria_pilar: r.categoria_pilar,
    mensaje: r.mensaje,
    mes_ciclo: r.mes_ciclo,
    fecha_creacion: r.fecha_creacion,
  })))
}
