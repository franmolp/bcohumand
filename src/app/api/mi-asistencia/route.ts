import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase-admin'

export async function GET(request: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const mes = searchParams.get('mes')
  if (!mes || !/^\d{4}-\d{2}$/.test(mes)) {
    return NextResponse.json({ error: 'Parámetro mes requerido (YYYY-MM)' }, { status: 400 })
  }

  const [y, m] = mes.split('-').map(Number)
  const fechaInicio = `${mes}-01`
  const lastDay = new Date(y, m, 0).getDate()
  const fechaFin = `${mes}-${String(lastDay).padStart(2, '0')}`

  const [{ data, error }, { data: solic }] = await Promise.all([
    supabaseAdmin
      .from('asistencia_procesada')
      .select('fecha, dia_semana, estado, fichada_entrada, fichada_salida, horas_fichadas, horas_base, minutos_tarde, minutos_antes, tiene_justificacion, horario_base_entrada, horario_base_salida')
      .eq('usuario_id', session.id)
      .gte('fecha', fechaInicio)
      .lte('fecha', fechaFin)
      .order('fecha', { ascending: true }),
    supabaseAdmin
      .from('solicitudes')
      .select('fecha_inicio, fecha_fin, tipo, motivo, comentario_admin')
      .eq('usuario_id', session.id)
      .in('estado', ['approved', 'pending'])
      .or(`fecha_fin.gte.${fechaInicio},fecha_fin.is.null`)
      .lte('fecha_inicio', fechaFin),
  ])

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const records = (data ?? []).map(r => {
    const sol = (solic ?? []).find(s => r.fecha >= s.fecha_inicio && r.fecha <= (s.fecha_fin ?? s.fecha_inicio))
    return {
      ...r,
      tipo_ausencia: sol?.tipo ?? null,
      motivo: sol?.motivo ?? null,
      comentario_admin: sol?.comentario_admin ?? null,
    }
  })

  return NextResponse.json(records)
}
