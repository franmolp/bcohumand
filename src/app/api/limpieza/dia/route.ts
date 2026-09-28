import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { esEquipoLimpieza, dowDeFecha, ordenarTareas, type LimpiezaTarea } from '@/lib/limpieza'

export const dynamic = 'force-dynamic'

function esAdmin(rol: string) { return rol === 'admin' || rol === 'Admin' }

// Tareas que aplican a una fecha (padres: diarias + semanales del día + puntuales de
// la fecha), cada una con sus subtareas, y el flag de si están tildadas ese día.
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

  // Tareas "padre" (parent_id null) que aplican a la fecha. Si la columna parent_id
  // todavía no existe (migración sin correr), se cae a la consulta clásica sin subtareas.
  const filtroAplica = `tipo.eq.diaria,and(tipo.eq.semanal,dia_semana.eq.${dow}),and(tipo.eq.puntual,fecha.eq.${fecha})`
  let conParent = true
  let padresData: LimpiezaTarea[] | null = null
  {
    const r = await supabaseAdmin
      .from('limpieza_tareas')
      .select('id, tipo, dia_semana, fecha, titulo, detalle, horario, orden, activo, parent_id')
      .eq('activo', true)
      .is('parent_id', null)
      .or(filtroAplica)
    if (r.error) {
      conParent = false
      const r2 = await supabaseAdmin
        .from('limpieza_tareas')
        .select('id, tipo, dia_semana, fecha, titulo, detalle, horario, orden, activo')
        .eq('activo', true)
        .or(filtroAplica)
      padresData = (r2.data ?? []) as LimpiezaTarea[]
    } else {
      padresData = (r.data ?? []) as LimpiezaTarea[]
    }
  }
  const padres = ordenarTareas(padresData ?? [])
  const padreIds = padres.map(p => p.id)

  const [{ data: subsData }, { data: hechas }] = await Promise.all([
    conParent && padreIds.length
      ? supabaseAdmin
          .from('limpieza_tareas')
          .select('id, titulo, detalle, horario, orden, parent_id')
          .eq('activo', true)
          .in('parent_id', padreIds)
          .order('orden')
      : Promise.resolve({ data: [] as { id: number; titulo: string; detalle: string | null; horario: string | null; orden: number; parent_id: number }[] }),
    supabaseAdmin.from('limpieza_hechas').select('tarea_id').eq('fecha', fecha),
  ])

  const hechasSet = new Set((hechas ?? []).map(h => h.tarea_id as number))
  const subsPorPadre = new Map<number, { id: number; titulo: string; detalle: string | null; horario: string | null; orden: number }[]>()
  for (const s of subsData ?? []) {
    const arr = subsPorPadre.get(s.parent_id as number) ?? []
    arr.push({ id: s.id as number, titulo: s.titulo as string, detalle: s.detalle, horario: s.horario, orden: s.orden as number })
    subsPorPadre.set(s.parent_id as number, arr)
  }

  const tareas = padres.map(p => {
    const subs = (subsPorPadre.get(p.id) ?? []).map(s => ({ ...s, hecho: hechasSet.has(s.id) }))
    return {
      id: p.id,
      tipo: p.tipo,
      titulo: p.titulo,
      detalle: p.detalle,
      horario: p.horario,
      // Un padre con subtareas no se tilda solo: queda "hecho" cuando todas sus subtareas lo están.
      hecho: subs.length ? subs.every(s => s.hecho) : hechasSet.has(p.id),
      subtareas: subs,
    }
  })

  return NextResponse.json({ fecha, tareas })
}
