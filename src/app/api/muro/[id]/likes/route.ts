import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { getSession } from '@/lib/auth'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { id } = await params

  const { data: likes } = await supabaseAdmin
    .from('muro_likes')
    .select('usuario_id')
    .eq('post_id', id)

  if (!likes?.length) return NextResponse.json([])

  const ids = likes.map(l => l.usuario_id)
  const { data: usuarios } = await supabase.from('usuarios').select('id, nombre').in('id', ids)

  return NextResponse.json((usuarios ?? []).map(u => u.nombre))
}
