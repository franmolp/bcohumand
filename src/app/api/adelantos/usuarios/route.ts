import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase-admin'

export async function GET() {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const puedeVer = ['admin', 'Admin', 'Encargada'].includes(session.rol)
  if (!puedeVer) return NextResponse.json({ error: 'Sin permiso' }, { status: 403 })

  const { data, error } = await supabaseAdmin
    .from('usuarios')
    .select('id, nombre')
    .eq('estado_cuenta', 'activo')
    .order('nombre')

  if (error) return NextResponse.json([], { status: 500 })
  return NextResponse.json(data ?? [])
}
