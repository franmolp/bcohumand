import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { esEquipoLimpieza } from '@/lib/limpieza'

export const dynamic = 'force-dynamic'

function esAdmin(rol: string) { return rol === 'admin' || rol === 'Admin' }

// Pedidos de limpieza = reparaciones con categoría 'limpieza'. Los ve el equipo de
// limpieza (para resolverlos) y el admin.
export async function GET() {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  if (!esAdmin(session.rol) && !esEquipoLimpieza(session.equipo)) {
    return NextResponse.json({ error: 'Prohibido' }, { status: 403 })
  }

  const { data, error } = await supabaseAdmin
    .from('reparaciones')
    .select('id, titulo, descripcion, prioridad, estado, nombre_empleada, creado_en, resuelto_en')
    .eq('categoria', 'limpieza')
    .order('creado_en', { ascending: false })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}
