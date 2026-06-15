import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { supabase } from '@/lib/supabase'

// GET /api/usuarios/fotos?ids=id1,id2,...
// Returns { id1: url | null, ... }
export async function GET(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({}, { status: 401 })

  const ids = req.nextUrl.searchParams.get('ids')?.split(',').filter(Boolean) ?? []
  if (!ids.length) return NextResponse.json({})

  const { data } = await supabase
    .from('usuarios')
    .select('id, foto_perfil')
    .in('id', ids)

  const map: Record<string, string | null> = {}
  for (const u of data ?? []) map[u.id] = (u as { foto_perfil?: string | null }).foto_perfil ?? null
  return NextResponse.json(map)
}
