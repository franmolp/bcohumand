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

  // Orden "aprendido": el orden en que la limpieza tildó las tareas/subtareas el último
  // día con actividad previo a la fecha. Así el checklist se acomoda solo a cómo lo hace
  // realmente (sin tocar el plan del admin). Lo no tildado queda al final por orden configurado.
  const { data: refRow } = await supabaseAdmin
    .from('limpieza_hechas').select('fecha').lt('fecha', fecha).order('fecha', { ascending: false }).limit(1)
  const refDay = refRow && refRow.length ? (refRow[0].fecha as string) : null
  const ordenRef = new Map<number, number>()
  if (refDay) {
    const { data: refHechas } = await supabaseAdmin
      .from('limpieza_hechas').select('tarea_id, hecho_en').eq('fecha', refDay).order('hecho_en', { ascending: true })
    ;(refHechas ?? []).forEach((h, i) => { if (!ordenRef.has(h.tarea_id as number)) ordenRef.set(h.tarea_id as number, i) })
  }
  const keyDe = (id: number) => ordenRef.has(id) ? ordenRef.get(id)! : Number.POSITIVE_INFINITY

  // Subtareas por orden aprendido, luego el configurado.
  for (const arr of subsPorPadre.values()) arr.sort((a, b) => keyDe(a.id) - keyDe(b.id) || a.orden - b.orden)

  // Padres: se mantiene el agrupado por tipo (diaria/semanal/puntual) y dentro se ordena
  // por el orden aprendido (para un padre con subtareas, su primera subtarea tildada).
  const pesoTipo: Record<string, number> = { diaria: 0, semanal: 1, puntual: 2 }
  const keyPadre = (p: LimpiezaTarea) => {
    const subs = subsPorPadre.get(p.id) ?? []
    return subs.length ? Math.min(...subs.map(s => keyDe(s.id))) : keyDe(p.id)
  }
  const padresOrdenados = [...padres].sort((a, b) =>
    (pesoTipo[a.tipo] ?? 9) - (pesoTipo[b.tipo] ?? 9) || keyPadre(a) - keyPadre(b) || a.orden - b.orden)

  const tareas = padresOrdenados.map(p => {
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
