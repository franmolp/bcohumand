import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { tareaAplica, type LimpiezaTarea } from '@/lib/limpieza'

export const dynamic = 'force-dynamic'

function esAdmin(rol: string) { return rol === 'admin' || rol === 'Admin' }

// Cumplimiento por día en un rango: total de tareas que aplicaban y cuántas se tildaron.
export async function GET(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  if (!esAdmin(session.rol)) return NextResponse.json({ error: 'Prohibido' }, { status: 403 })

  const desde = req.nextUrl.searchParams.get('desde')
  const hasta = req.nextUrl.searchParams.get('hasta')
  if (!desde || !hasta || !/^\d{4}-\d{2}-\d{2}$/.test(desde) || !/^\d{4}-\d{2}-\d{2}$/.test(hasta)) {
    return NextResponse.json({ error: 'rango inválido' }, { status: 400 })
  }

  const [{ data: tareas }, { data: hechas }] = await Promise.all([
    supabaseAdmin
      .from('limpieza_tareas')
      .select('id, tipo, dia_semana, fecha, titulo, detalle, horario, orden, activo, parent_id')
      .eq('activo', true),
    supabaseAdmin
      .from('limpieza_hechas')
      .select('fecha')
      .gte('fecha', desde)
      .lte('fecha', hasta),
  ])

  const tareasList = (tareas ?? []) as LimpiezaTarea[]
  const padres = tareasList.filter(t => t.parent_id == null)
  const hijosPorPadre = new Map<number, number>()
  for (const t of tareasList) if (t.parent_id != null) hijosPorPadre.set(t.parent_id, (hijosPorPadre.get(t.parent_id) ?? 0) + 1)

  const hechasPorFecha = new Map<string, number>()
  for (const h of hechas ?? []) hechasPorFecha.set(h.fecha as string, (hechasPorFecha.get(h.fecha as string) ?? 0) + 1)

  // Recorre cada día del rango (tope de seguridad de ~200 días).
  const dias: { fecha: string; total: number; hechas: number }[] = []
  const cur = new Date(desde + 'T12:00:00Z')
  const fin = new Date(hasta + 'T12:00:00Z')
  let guard = 0
  while (cur <= fin && guard < 200) {
    const f = cur.toISOString().slice(0, 10)
    // Ítems tildables (hojas) que aplican: cada padre aporta sus subtareas, o 1 si no tiene.
    const total = padres.filter(t => tareaAplica(t, f)).reduce((acc, p) => acc + (hijosPorPadre.get(p.id) ?? 1), 0)
    dias.push({ fecha: f, total, hechas: hechasPorFecha.get(f) ?? 0 })
    cur.setUTCDate(cur.getUTCDate() + 1)
    guard++
  }

  return NextResponse.json({ dias })
}
