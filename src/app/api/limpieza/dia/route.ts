import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { esEquipoLimpieza, dowDeFecha, ordenarTareas, type LimpiezaTarea } from '@/lib/limpieza'

export const dynamic = 'force-dynamic'

function esAdmin(rol: string) { return rol === 'admin' || rol === 'Admin' }

// Tareas que aplican a una fecha (diarias + semanales del día + puntuales de la fecha),
// con el flag de si ya se tildaron ese día. Lo usa la vista del equipo de limpieza.
export async function GET(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  if (!esAdmin(session.rol) && !esEquipoLimpieza(session.equipo)) {
    return NextResponse.json({ error: 'Prohibido' }, { status: 403 })
  }

  const fecha = req.nextUrl.searchParams.get('fecha')
  if (!fecha || !/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
    return NextResponse.json({ error: 'fecha inválida' }, { status: 400 })
  }
  const dow = dowDeFecha(fecha)

  const [{ data: tareas }, { data: hechas }] = await Promise.all([
    supabaseAdmin
      .from('limpieza_tareas')
      .select('id, tipo, dia_semana, fecha, titulo, detalle, horario, orden, activo')
      .eq('activo', true)
      .or(`tipo.eq.diaria,and(tipo.eq.semanal,dia_semana.eq.${dow}),and(tipo.eq.puntual,fecha.eq.${fecha})`),
    supabaseAdmin
      .from('limpieza_hechas')
      .select('tarea_id, hecho_por, hecho_en')
      .eq('fecha', fecha),
  ])

  const hechasMap = new Map((hechas ?? []).map(h => [h.tarea_id as number, h]))
  const lista = ordenarTareas((tareas ?? []) as LimpiezaTarea[]).map(t => ({
    ...t,
    hecho: hechasMap.has(t.id),
    hecho_en: hechasMap.get(t.id)?.hecho_en ?? null,
  }))

  return NextResponse.json({ fecha, tareas: lista })
}
