import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase-admin'

export async function PUT(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const isAdmin = session.rol === 'admin' || session.rol === 'Admin'
  const isHR = session.rol === 'HR'
  if (!isAdmin && !isHR) return NextResponse.json({ error: 'Prohibido' }, { status: 403 })

  const { usuario_id, fecha, estado, fichada_entrada, fichada_salida, horas_fichadas, horario_base_entrada, horario_base_salida, horas_base } = await req.json()
  if (!usuario_id || !fecha) return NextResponse.json({ error: 'Faltan parámetros' }, { status: 400 })

  // Validar que las horas no sean negativas
  if (horas_fichadas !== null && horas_fichadas !== undefined && Number(horas_fichadas) < 0) {
    return NextResponse.json({ error: 'Las horas no pueden ser negativas' }, { status: 400 })
  }
  if (horas_base !== null && horas_base !== undefined && Number(horas_base) < 0) {
    return NextResponse.json({ error: 'Las horas base no pueden ser negativas' }, { status: 400 })
  }

  const updateData: Record<string, unknown> = {
    estado,
    fichada_entrada: fichada_entrada ?? null,
    fichada_salida: fichada_salida ?? null,
    horas_fichadas: horas_fichadas ?? null,
    // Resetear minutos de tardanza/salida temprana al editar manualmente
    minutos_tarde: null,
    minutos_antes: null,
    editado_manual: true,
    ultima_actualizacion: new Date().toISOString(),
  }
  if (horario_base_entrada !== undefined) updateData.horario_base_entrada = horario_base_entrada ?? null
  if (horario_base_salida !== undefined) updateData.horario_base_salida = horario_base_salida ?? null
  if (horas_base !== undefined) updateData.horas_base = horas_base ?? null

  const { error, count } = await supabaseAdmin
    .from('asistencia_procesada')
    .update(updateData, { count: 'exact' })
    .eq('usuario_id', usuario_id)
    .eq('fecha', fecha)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (count === 0) return NextResponse.json({ error: 'Registro no encontrado' }, { status: 404 })

  // Invalidar cache de informes del mes editado: cambiar estado/horario base de un
  // día afecta la ocupación y los días presentes de la productividad, sin cambiar
  // el conteo de filas (por eso el fingerprint no lo detectaría).
  if (typeof fecha === 'string') {
    await supabaseAdmin.from('informes_cache').delete().eq('mes', fecha.slice(0, 7))
  }

  return NextResponse.json({ ok: true })
}
