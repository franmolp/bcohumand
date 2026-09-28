import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase-admin'

function esAdmin(rol: string) { return rol === 'admin' || rol === 'Admin' }

// Repite una tarea semanal existente (con sus subtareas) en otros días de la semana.
// Crea una copia por cada día elegido. { dias: number[] } (0=Dom..6=Sáb).
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  if (!esAdmin(session.rol)) return NextResponse.json({ error: 'Prohibido' }, { status: 403 })

  const { id } = await params
  const { dias } = await req.json().catch(() => ({})) as { dias?: number[] }
  const targetDays = [...new Set((dias ?? []).filter(d => typeof d === 'number' && d >= 0 && d <= 6))]
  if (!targetDays.length) return NextResponse.json({ error: 'Elegí al menos un día' }, { status: 400 })

  const { data: src } = await supabaseAdmin
    .from('limpieza_tareas')
    .select('id, tipo, dia_semana, titulo, detalle, horario, orden')
    .eq('id', id).is('parent_id', null).single()
  if (!src || src.tipo !== 'semanal') {
    return NextResponse.json({ error: 'Solo se pueden repetir tareas semanales' }, { status: 400 })
  }

  const { data: subs } = await supabaseAdmin
    .from('limpieza_tareas')
    .select('titulo, detalle, horario, orden')
    .eq('parent_id', id).eq('activo', true).order('orden')

  let creados = 0
  for (const d of targetDays) {
    if (d === src.dia_semana) continue // ya existe en su propio día
    const { data: nuevoPadre, error: e1 } = await supabaseAdmin
      .from('limpieza_tareas')
      .insert({ tipo: 'semanal', dia_semana: d, fecha: null, titulo: src.titulo, detalle: src.detalle, horario: src.horario, orden: src.orden })
      .select('id').single()
    if (e1 || !nuevoPadre) continue
    creados++
    if (subs && subs.length) {
      await supabaseAdmin.from('limpieza_tareas').insert(
        subs.map(s => ({ tipo: 'semanal', dia_semana: null, fecha: null, parent_id: nuevoPadre.id, titulo: s.titulo, detalle: s.detalle, horario: s.horario, orden: s.orden }))
      )
    }
  }

  return NextResponse.json({ ok: true, creados })
}
