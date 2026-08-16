import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase-admin'

export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  if (session.rol !== 'admin' && session.rol !== 'Admin') return NextResponse.json({ error: 'Prohibido' }, { status: 403 })

  const body = await req.json().catch(() => ({})) as {
    fecha?: string
    movimiento_en?: string
    monto?: number | string
    comentario?: string | null
    empleado_id?: string
    empleado_nombre?: string
  }

  const monto = Number(body.monto ?? 0)
  if (!body.fecha || !body.movimiento_en || monto <= 0 || !body.empleado_id || !body.empleado_nombre) {
    return NextResponse.json({ error: 'Datos inválidos' }, { status: 400 })
  }

  const { data: yaAsignada } = await supabaseAdmin
    .from('caja_salidas_asignadas')
    .select('id')
    .eq('fecha', body.fecha)
    .eq('movimiento_en', body.movimiento_en)
    .eq('monto', monto)
    .maybeSingle()

  if (yaAsignada) return NextResponse.json({ error: 'Esta salida ya fue asignada' }, { status: 400 })

  const { data: adelanto, error: errAdelanto } = await supabaseAdmin
    .from('adelantos')
    .insert({
      usuario_id: body.empleado_id,
      empleado_nombre: body.empleado_nombre,
      monto,
      monto_aprobado: monto,
      estado: 'approved',
      tipo: 'servicio',
      comentario_admin: body.comentario || 'Salida de caja (Loyverse) asignada',
      aprobado_por: session.id,
      creado_por_admin: true,
      fecha_respuesta: new Date().toISOString(),
      created_at: body.movimiento_en,
    })
    .select('id')
    .single()

  if (errAdelanto) return NextResponse.json({ error: errAdelanto.message }, { status: 500 })

  const { error } = await supabaseAdmin
    .from('caja_salidas_asignadas')
    .insert({
      fecha: body.fecha,
      movimiento_en: body.movimiento_en,
      monto,
      comentario: body.comentario || null,
      empleado_id: body.empleado_id,
      empleado_nombre: body.empleado_nombre,
      adelanto_id: adelanto.id,
      asignado_por: session.id,
    })

  if (error) {
    // No quedó vinculada — deshacer el adelanto para no dejarlo huérfano
    await supabaseAdmin.from('adelantos').delete().eq('id', adelanto.id)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}

export async function DELETE(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  if (session.rol !== 'admin' && session.rol !== 'Admin') return NextResponse.json({ error: 'Prohibido' }, { status: 403 })

  const { searchParams } = new URL(req.url)
  const fecha = searchParams.get('fecha')
  const movimiento_en = searchParams.get('movimiento_en')
  const monto = Number(searchParams.get('monto') ?? 0)
  if (!fecha || !movimiento_en || monto <= 0) return NextResponse.json({ error: 'Datos inválidos' }, { status: 400 })

  const { data: asignada } = await supabaseAdmin
    .from('caja_salidas_asignadas')
    .select('id, adelanto_id')
    .eq('fecha', fecha)
    .eq('movimiento_en', movimiento_en)
    .eq('monto', monto)
    .maybeSingle()

  if (!asignada) return NextResponse.json({ error: 'No encontrada' }, { status: 404 })

  if (asignada.adelanto_id) {
    await supabaseAdmin.from('adelantos').delete().eq('id', asignada.adelanto_id)
  }
  const { error } = await supabaseAdmin.from('caja_salidas_asignadas').delete().eq('id', asignada.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
