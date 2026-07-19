import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { supabase } from '@/lib/supabase'

export async function GET() {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { data } = await supabase
    .from('usuarios')
    .select('id, nombre, foto_perfil')
    .eq('estado_cuenta', 'activo')
    .not('nombre', 'ilike', 'prueba')
    .order('nombre')

  return NextResponse.json(data ?? [])
}
