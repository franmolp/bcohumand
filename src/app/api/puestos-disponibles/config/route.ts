import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { getEquiposHabilitadosPuestos, setEquiposHabilitadosPuestos } from '@/lib/puestos'
import { tipoRecurso } from '@/lib/gaps'

function esAdmin(rol: string): boolean {
  return rol === 'admin' || rol === 'Admin'
}

export async function GET() {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  if (!esAdmin(session.rol)) return NextResponse.json({ error: 'Prohibido' }, { status: 403 })

  try {
    const [{ data: equipos, error }, habilitados] = await Promise.all([
      supabaseAdmin.from('equipos').select('id, nombre').order('nombre'),
      getEquiposHabilitadosPuestos(),
    ])
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    const lista = (equipos ?? []).map(e => ({
      id: e.id as number,
      nombre: e.nombre as string,
      tipo_recurso: tipoRecurso(e.nombre) ?? 'mesa',
      habilitado: habilitados.includes(e.id as number),
    }))

    return NextResponse.json({ equipos: lista })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Error inesperado' }, { status: 500 })
  }
}

export async function PUT(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  if (!esAdmin(session.rol)) return NextResponse.json({ error: 'Prohibido' }, { status: 403 })

  const body = await req.json().catch(() => ({})) as { equipoIds?: number[] }
  if (!Array.isArray(body.equipoIds) || body.equipoIds.some(id => typeof id !== 'number')) {
    return NextResponse.json({ error: 'Datos inválidos' }, { status: 400 })
  }

  await setEquiposHabilitadosPuestos(body.equipoIds)
  return NextResponse.json({ ok: true })
}
