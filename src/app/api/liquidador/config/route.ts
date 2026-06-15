import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { getSession } from '@/lib/auth'

export async function GET() {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const isAdmin = session.rol === 'admin' || session.rol === 'Admin'

  let query = supabase
    .from('liquidacion_config')
    .select('*, usuarios(nombre, usuario)')

  if (!isAdmin) query = query.eq('usuario_id', session.id)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data || [])
}

export async function POST(request: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const isAdmin = session.rol === 'admin' || session.rol === 'Admin'
  if (!isAdmin) return NextResponse.json({ error: 'Sin permisos' }, { status: 403 })

  const body = await request.json()
  const { usuario_id, tipo_pago, monto_presentismo, presentismo_extra, monto_basico,
    horas_base_semanal, reintegro_monotributo, monto_reintegro, adicional_compras } = body

  if (!usuario_id) return NextResponse.json({ error: 'usuario_id requerido' }, { status: 400 })

  const { data, error } = await supabase
    .from('liquidacion_config')
    .upsert({
      usuario_id,
      tipo_pago:            tipo_pago            ?? 'ninguno',
      monto_presentismo:    monto_presentismo    ?? 0,
      presentismo_extra:    presentismo_extra    ?? 0,
      monto_basico:         monto_basico         ?? 0,
      horas_base_semanal:   horas_base_semanal   ?? 40,
      reintegro_monotributo: reintegro_monotributo ?? false,
      monto_reintegro:      monto_reintegro      ?? 0,
      adicional_compras:    adicional_compras    ?? 0,
      updated_at:           new Date().toISOString(),
    }, { onConflict: 'usuario_id' })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
