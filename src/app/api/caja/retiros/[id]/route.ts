import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { crearAdelantoServicio } from '../route'

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  if (session.rol !== 'admin' && session.rol !== 'Admin') return NextResponse.json({ error: 'Prohibido' }, { status: 403 })

  const { id } = await params
  const body = await req.json().catch(() => ({})) as {
    fecha?: string
    monto?: number | string
    descripcion?: string
    tipo?: string
    empleado_id?: string
    empleado_nombre?: string
  }

  const monto = Number(body.monto ?? 0)
  if (!body.fecha || monto <= 0) return NextResponse.json({ error: 'Datos inválidos' }, { status: 400 })

  const tipo = body.tipo === 'sobre' ? 'sobre' : 'retiro'
  const empleadoId = tipo === 'retiro' && body.empleado_id ? body.empleado_id : null
  const empleadoNombre = empleadoId ? (body.empleado_nombre || null) : null

  const { data, error } = await supabaseAdmin
    .from('retiros_caja')
    .update({
      fecha: body.fecha, monto, descripcion: body.descripcion || null, tipo,
      empleado_id: empleadoId, empleado_nombre: empleadoNombre,
    })
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Reconciliar el adelanto de servicio vinculado con la nueva asignación
  const { data: adelantoExistente } = await supabaseAdmin
    .from('adelantos')
    .select('id')
    .eq('retiro_caja_id', id)
    .maybeSingle()

  if (empleadoId) {
    if (adelantoExistente) {
      await supabaseAdmin
        .from('adelantos')
        .update({
          usuario_id: empleadoId,
          empleado_nombre: empleadoNombre ?? 'Empleado',
          monto,
          monto_aprobado: monto,
          comentario_admin: body.descripcion || 'Servicio/consumo registrado desde Caja',
          created_at: `${body.fecha}T12:00:00.000Z`,
        })
        .eq('id', adelantoExistente.id)
    } else {
      await crearAdelantoServicio({
        empleadoId, empleadoNombre: empleadoNombre ?? 'Empleado', monto,
        descripcion: body.descripcion || null, fecha: body.fecha,
        retiroId: id, adminId: session.id,
      })
    }
  } else if (adelantoExistente) {
    // Se desasignó de la empleada — el adelanto de servicio ya no corresponde
    await supabaseAdmin.from('adelantos').delete().eq('id', adelantoExistente.id)
  }

  return NextResponse.json(data)
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  if (session.rol !== 'admin' && session.rol !== 'Admin') return NextResponse.json({ error: 'Prohibido' }, { status: 403 })

  const { id } = await params
  // Si este retiro tenía un adelanto de servicio vinculado, se va con él
  await supabaseAdmin.from('adelantos').delete().eq('retiro_caja_id', id)

  const { error } = await supabaseAdmin.from('retiros_caja').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
