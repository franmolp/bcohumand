import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase-admin'

export async function PUT(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const isAdmin = session.rol === 'admin' || session.rol === 'Admin'
  if (!isAdmin) return NextResponse.json({ error: 'Prohibido' }, { status: 403 })

  const { usuario_id, fecha, estado, fichada_entrada, fichada_salida, horas_fichadas, horario_base_entrada, horario_base_salida, horas_base } = await req.json()
  if (!usuario_id || !fecha) return NextResponse.json({ error: 'Faltan parámetros' }, { status: 400 })

  const updateData: Record<string, unknown> = {
    estado,
    fichada_entrada: fichada_entrada ?? null,
    fichada_salida: fichada_salida ?? null,
    horas_fichadas: horas_fichadas ?? null,
    editado_manual: true,
    ultima_actualizacion: new Date().toISOString(),
  }
  if (horario_base_entrada !== undefined) updateData.horario_base_entrada = horario_base_entrada ?? null
  if (horario_base_salida !== undefined) updateData.horario_base_salida = horario_base_salida ?? null
  if (horas_base !== undefined) updateData.horas_base = horas_base ?? null

  const { error } = await supabaseAdmin
    .from('asistencia_procesada')
    .update(updateData)
    .eq('usuario_id', usuario_id)
    .eq('fecha', fecha)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
