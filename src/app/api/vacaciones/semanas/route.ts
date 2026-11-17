import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { semanasVacaciones, horizonteVacaciones, sumarDias } from '@/lib/vacaciones-cupos'

export const dynamic = 'force-dynamic'

// Semanas (lunes a domingo) en que la persona puede pedir vacaciones según los cupos de su área.
// Empleadas: las propias. Admin/RRHH: ?usuario_id= de cualquiera (para ver si una fecha supera el cupo).
export async function GET(req: NextRequest) {
  const s = await getSession()
  if (!s) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const gestiona = ['admin', 'Admin', 'HR'].includes(s.rol)
  const pedido = req.nextUrl.searchParams.get('usuario_id')
  const uid = gestiona && pedido ? pedido : s.id
  const hoy = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' })
  // Las empleadas, desde la anticipación mínima; admin/RRHH, desde hoy
  let desde = hoy
  if (!gestiona) {
    const { data } = await supabaseAdmin.from('configuracion').select('valor').eq('clave', 'solicitudes_config').maybeSingle()
    desde = sumarDias(hoy, (data?.valor as { vacaciones_min_dias?: number } | null)?.vacaciones_min_dias ?? 15)
  }
  const r = await semanasVacaciones(uid, desde, horizonteVacaciones(hoy))
  return NextResponse.json(r)
}
