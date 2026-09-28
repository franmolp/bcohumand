import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase-admin'

export const dynamic = 'force-dynamic'

function esAdmin(rol: string) { return rol === 'admin' || rol === 'Admin' }

// Todas las tareas del plan (para el editor del admin).
export async function GET() {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  if (!esAdmin(session.rol)) return NextResponse.json({ error: 'Prohibido' }, { status: 403 })

  const { data, error } = await supabaseAdmin
    .from('limpieza_tareas')
    .select('id, tipo, dia_semana, fecha, titulo, detalle, horario, orden, activo')
    .eq('activo', true)
    .order('tipo').order('dia_semana', { nullsFirst: true }).order('orden')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}

// Crea una tarea del plan.
export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  if (!esAdmin(session.rol)) return NextResponse.json({ error: 'Prohibido' }, { status: 403 })

  const body = await req.json().catch(() => ({})) as {
    tipo?: string; dia_semana?: number | null; fecha?: string | null
    titulo?: string; detalle?: string | null; horario?: string | null; orden?: number
  }
  const tipo = body.tipo
  if (!tipo || !['diaria', 'semanal', 'puntual'].includes(tipo)) {
    return NextResponse.json({ error: 'Tipo inválido' }, { status: 400 })
  }
  if (!body.titulo?.trim()) return NextResponse.json({ error: 'Falta el título' }, { status: 400 })
  if (tipo === 'semanal' && (body.dia_semana == null || body.dia_semana < 0 || body.dia_semana > 6)) {
    return NextResponse.json({ error: 'Falta el día de la semana' }, { status: 400 })
  }
  if (tipo === 'puntual' && !(body.fecha && /^\d{4}-\d{2}-\d{2}$/.test(body.fecha))) {
    return NextResponse.json({ error: 'Falta la fecha' }, { status: 400 })
  }

  const { data, error } = await supabaseAdmin
    .from('limpieza_tareas')
    .insert({
      tipo,
      dia_semana: tipo === 'semanal' ? body.dia_semana : null,
      fecha: tipo === 'puntual' ? body.fecha : null,
      titulo: body.titulo.trim(),
      detalle: body.detalle?.trim() || null,
      horario: body.horario?.trim() || null,
      orden: body.orden ?? 0,
    })
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
