import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { getSession } from '@/lib/auth'

function getMesCiclo(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' }).slice(0, 7)
}

// GET: pendientes + ranking del mes (solo admin)
export async function GET(request: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const isAdmin = session.rol === 'admin' || session.rol === 'Admin'
  if (!isAdmin) return NextResponse.json({ error: 'Sin permisos' }, { status: 403 })

  const { searchParams } = new URL(request.url)
  const mes = searchParams.get('mes') || getMesCiclo()

  const [pendientesRes, rankingRes] = await Promise.all([
    supabaseAdmin
      .from('reconocimientos')
      .select('id, id_emisor, id_receptor, categoria_pilar, mensaje, anonimo, fecha_creacion, mes_ciclo')
      .eq('estado', 'pendiente')
      .order('fecha_creacion', { ascending: true }),
    supabaseAdmin
      .from('reconocimientos')
      .select('id_receptor, categoria_pilar')
      .eq('mes_ciclo', mes)
      .eq('estado', 'aprobado'),
  ])

  if (pendientesRes.error) return NextResponse.json({ error: pendientesRes.error.message }, { status: 500 })

  const pendientes = pendientesRes.data ?? []
  const ranking = rankingRes.data ?? []

  // Collect all user IDs
  const allUserIds = [...new Set([
    ...pendientes.map(r => r.id_emisor),
    ...pendientes.map(r => r.id_receptor),
    ...ranking.map(r => r.id_receptor),
  ])]

  const { data: usuarios } = await supabase
    .from('usuarios')
    .select('id, nombre, foto_perfil')
    .in('id', allUserIds)

  const userMap: Record<string, { nombre: string; foto_perfil: string | null }> = {}
  for (const u of usuarios ?? []) {
    userMap[u.id] = { nombre: u.nombre, foto_perfil: (u as { foto_perfil?: string | null }).foto_perfil ?? null }
  }

  // Build ranking: group by receptor, count per pilar
  const rankingMap: Record<string, { nombre: string; foto_perfil: string | null; total: number; salvavidas: number; buena_vibra: number; iniciativa: number }> = {}
  for (const r of ranking) {
    if (!rankingMap[r.id_receptor]) {
      rankingMap[r.id_receptor] = {
        nombre: userMap[r.id_receptor]?.nombre ?? 'Usuario',
        foto_perfil: userMap[r.id_receptor]?.foto_perfil ?? null,
        total: 0, salvavidas: 0, buena_vibra: 0, iniciativa: 0,
      }
    }
    rankingMap[r.id_receptor].total++
    if (r.categoria_pilar in rankingMap[r.id_receptor]) {
      (rankingMap[r.id_receptor] as Record<string, unknown>)[r.categoria_pilar] = ((rankingMap[r.id_receptor] as Record<string, unknown>)[r.categoria_pilar] as number) + 1
    }
  }

  const rankingOrdenado = Object.entries(rankingMap)
    .map(([id, data]) => ({ id, ...data }))
    .sort((a, b) => b.total - a.total)

  return NextResponse.json({
    pendientes: pendientes.map(r => ({
      id: r.id,
      emisor: userMap[r.id_emisor] ?? { nombre: 'Usuario', foto_perfil: null },
      receptor: userMap[r.id_receptor] ?? { nombre: 'Usuario', foto_perfil: null },
      categoria_pilar: r.categoria_pilar,
      mensaje: r.mensaje,
      anonimo: r.anonimo,
      fecha_creacion: r.fecha_creacion,
      mes_ciclo: r.mes_ciclo,
    })),
    ranking: rankingOrdenado,
  })
}
