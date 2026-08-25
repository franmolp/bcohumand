import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { getSession } from '@/lib/auth'

const VACACIONES_DEFAULT = 14

export async function GET() {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  // Ciclo de vacaciones: 1 de abril al 31 de marzo del año siguiente (no año
  // calendario). Coincide con el criterio de /api/empleados/vacaciones y las
  // cards de "vacaciones restantes".
  const hoy = new Date()
  const cicloYear = hoy.getMonth() >= 3 ? hoy.getFullYear() : hoy.getFullYear() - 1
  const cicloDesde = `${cicloYear}-04-01`
  const cicloHasta = `${cicloYear + 1}-03-31`

  const [userRes, vacUsadasRes, configRes] = await Promise.all([
    supabase.from('usuarios')
      .select('id, usuario, nombre, email, telefono, dni, fecha_nacimiento, estado_cuenta, foto_perfil, equipo:equipos(nombre), rol:roles(nombre)')
      .eq('id', session.id)
      .single(),

    // Suma de días de vacaciones usados en el ciclo vigente (1/4 al 31/3)
    supabase.from('solicitudes')
      .select('dias')
      .eq('usuario_id', session.id)
      .eq('tipo', 'Vacaciones')
      .eq('estado', 'approved')
      .gte('fecha_inicio', cicloDesde)
      .lte('fecha_inicio', cicloHasta),

    // Try to get allocated days from liquidacion_config
    supabase.from('liquidacion_config')
      .select('dias_vacaciones')
      .eq('usuario_id', session.id)
      .maybeSingle(),
  ])

  if (userRes.error || !userRes.data) {
    return NextResponse.json({ error: 'Usuario no encontrado' }, { status: 404 })
  }

  const usadas = (vacUsadasRes.data ?? []).reduce((sum, r) => sum + (r.dias ?? 0), 0)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const asignadas = (configRes.data as any)?.dias_vacaciones ?? VACACIONES_DEFAULT

  return NextResponse.json({
    ...userRes.data,
    vacaciones_usadas: usadas,
    vacaciones_total: asignadas,
  })
}
