import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { supabase } from '@/lib/supabase'

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
    supabase
      .from('solicitudes')
      .select('fecha_inicio, fecha_fin, tipo, motivo, comentario_admin')
      .eq('usuario_id', session.id)
      .in('estado', ['approved', 'pending'])
      .lte('fecha_inicio', fechaFin)
      .or(`fecha_fin.gte.${fechaInicio},fecha_fin.is.null`),
  ])

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Construir mapa fecha → solicitud igual que regenerar para garantizar matching correcto
  const solicitudMap = new Map<string, { tipo: string; motivo: string | null; comentario_admin: string | null }>()
  for (const sol of (solic ?? [])) {
    const inicio = sol.fecha_inicio.substring(0, 10)
    const fin = (sol.fecha_fin ?? sol.fecha_inicio).substring(0, 10)
    const d = new Date(inicio + 'T12:00:00')
    const endD = new Date(fin + 'T12:00:00')
    while (d <= endD) {
      const dateStr = d.toISOString().split('T')[0]
      if (!solicitudMap.has(dateStr)) {
        solicitudMap.set(dateStr, { tipo: sol.tipo, motivo: sol.motivo ?? null, comentario_admin: sol.comentario_admin ?? null })
      }
      d.setDate(d.getDate() + 1)
    }
  }

  const records = (data ?? []).map(r => {
    const sol = solicitudMap.get(r.fecha)
    return {
      ...r,
      tipo_ausencia: sol?.tipo ?? null,
      motivo: sol?.motivo ?? null,
      comentario_admin: sol?.comentario_admin ?? null,
    }
  })

  return NextResponse.json(records)
}
