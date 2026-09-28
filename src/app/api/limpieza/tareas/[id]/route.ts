import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase-admin'

function esAdmin(rol: string) { return rol === 'admin' || rol === 'Admin' }

// Edita una tarea del plan.
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  if (!esAdmin(session.rol)) return NextResponse.json({ error: 'Prohibido' }, { status: 403 })

  const { id } = await params
  const body = await req.json().catch(() => ({})) as {
    titulo?: string; detalle?: string | null; horario?: string | null
    dia_semana?: number | null; fecha?: string | null; orden?: number
  }
  const update: Record<string, unknown> = {}
  if (body.titulo !== undefined) {
    if (!body.titulo.trim()) return NextResponse.json({ error: 'Falta el título' }, { status: 400 })
    update.titulo = body.titulo.trim()
  }
  if (body.detalle !== undefined) update.detalle = body.detalle?.trim() || null
  if (body.horario !== undefined) update.horario = body.horario?.trim() || null
  if (body.dia_semana !== undefined) update.dia_semana = body.dia_semana
  if (body.fecha !== undefined) update.fecha = body.fecha
  if (body.orden !== undefined) update.orden = body.orden
  if (!Object.keys(update).length) return NextResponse.json({ error: 'Nada para actualizar' }, { status: 400 })

  const { error } = await supabaseAdmin.from('limpieza_tareas').update(update).eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

// Quita una tarea del plan (soft-delete para no perder el historial de cumplimiento).
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  if (!esAdmin(session.rol)) return NextResponse.json({ error: 'Prohibido' }, { status: 403 })

  const { id } = await params
  const { error } = await supabaseAdmin.from('limpieza_tareas').update({ activo: false }).eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
