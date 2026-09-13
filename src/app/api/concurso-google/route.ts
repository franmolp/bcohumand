import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { getConcursoConfig } from '@/lib/concurso-google'

// Ranking público del concurso (todas las empleadas lo ven cuando está activo).
export async function GET() {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const cfg = await getConcursoConfig()
  if (!cfg.activo || !cfg.mes) return NextResponse.json({ activo: false })

  const { data: menciones } = await supabaseAdmin
    .from('google_menciones')
    .select('asignados')
    .eq('mes', cfg.mes)

  const counts = new Map<string, number>()
  let totalReviews = 0
  for (const m of menciones ?? []) {
    totalReviews++
    for (const uid of ((m.asignados as string[]) ?? [])) {
      counts.set(uid, (counts.get(uid) ?? 0) + 1)
    }
  }

  const ids = [...counts.keys()]
  const { data: usuarios } = ids.length
    ? await supabaseAdmin.from('usuarios').select('id, nombre, foto_perfil').in('id', ids)
    : { data: [] as { id: string; nombre: string; foto_perfil: string | null }[] }
  const umap = new Map((usuarios ?? []).map(u => [u.id, u]))

  const ranking = [...counts.entries()]
    .map(([id, menciones]) => ({
      id,
      nombre: umap.get(id)?.nombre ?? '—',
      foto: umap.get(id)?.foto_perfil ?? null,
      menciones,
    }))
    .sort((a, b) => b.menciones - a.menciones || a.nombre.localeCompare(b.nombre, 'es'))

  return NextResponse.json({ activo: true, mes: cfg.mes, totalReviews, ranking })
}
