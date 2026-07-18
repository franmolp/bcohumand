import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { getSession } from '@/lib/auth'

function getMesCiclo(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' }).slice(0, 7)
}

// GET: reconocimientos enviados por el usuario actual (mes actual)
export async function GET(request: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const mes = searchParams.get('mes') || getMesCiclo()

  const { data: recs, error } = await supabaseAdmin
    .from('reconocimientos')
    .select('id, id_receptor, categoria_pilar, mensaje, anonimo, estado, mes_ciclo, fecha_creacion')
    .eq('id_emisor', session.id)
    .eq('mes_ciclo', mes)
    .order('fecha_creacion', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!recs?.length) return NextResponse.json([])

  const receptorIds = [...new Set(recs.map(r => r.id_receptor))]
  const { data: usuarios } = await supabase
    .from('usuarios')
    .select('id, nombre, foto_perfil')
    .in('id', receptorIds)

  const userMap: Record<string, { nombre: string; foto_perfil: string | null }> = {}
  for (const u of usuarios ?? []) {
    userMap[u.id] = { nombre: u.nombre, foto_perfil: (u as { foto_perfil?: string | null }).foto_perfil ?? null }
  }

  return NextResponse.json(recs.map(r => ({
    id: r.id,
    receptor: userMap[r.id_receptor] ?? { nombre: 'Usuario', foto_perfil: null },
    categoria_pilar: r.categoria_pilar,
    mensaje: r.mensaje,
    anonimo: r.anonimo,
    estado: r.estado,
    mes_ciclo: r.mes_ciclo,
    fecha_creacion: r.fecha_creacion,
  })))
}
