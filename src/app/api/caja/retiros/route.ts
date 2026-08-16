import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase-admin'

export async function GET(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  if (session.rol !== 'admin' && session.rol !== 'Admin') return NextResponse.json({ error: 'Prohibido' }, { status: 403 })

  const { searchParams } = new URL(req.url)
  const mes = searchParams.get('mes')

  let query = supabaseAdmin
    .from('retiros_caja')
    .select('*')
    .order('fecha', { ascending: false })
    .order('created_at', { ascending: false })

  if (mes) {
    const [y, m] = mes.split('-').map(Number)
    const from = `${mes}-01`
    const lastDay = new Date(y, m, 0).getDate()
    const to = `${mes}-${String(lastDay).padStart(2, '0')}`
    query = query.gte('fecha', from).lte('fecha', to)
  }

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}

export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  if (session.rol !== 'admin' && session.rol !== 'Admin') return NextResponse.json({ error: 'Prohibido' }, { status: 403 })

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
  // Solo tiene sentido asignar un retiro personal a una empleada, nunca un sobre
  const empleadoId = tipo === 'retiro' && body.empleado_id ? body.empleado_id : null
  const empleadoNombre = empleadoId ? (body.empleado_nombre || null) : null

  const { data, error } = await supabaseAdmin
    .from('retiros_caja')
    .insert({
      fecha: body.fecha,
      monto,
      descripcion: body.descripcion || null,
      tipo,
      usuario_id: session.id,
      empleado_id: empleadoId,
      empleado_nombre: empleadoNombre,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  let avisoAdelanto: string | undefined
  if (empleadoId) {
    const r = await crearAdelantoServicio({
      empleadoId, empleadoNombre: empleadoNombre ?? 'Empleada', monto,
      descripcion: body.descripcion || null, fecha: body.fecha,
      retiroId: data.id, adminId: session.id,
    })
    if (!r.ok) avisoAdelanto = `El retiro se guardó, pero no se pudo asignar a la empleada: ${r.error}`
  }

  return NextResponse.json(avisoAdelanto ? { ...data, aviso: avisoAdelanto } : data)
}

// Crea el adelanto "de servicio" vinculado a un retiro de caja asignado a una empleada
export async function crearAdelantoServicio(params: {
  empleadoId: string; empleadoNombre: string; monto: number
  descripcion: string | null; fecha: string; retiroId: string; adminId: string
}): Promise<{ ok: boolean; error?: string }> {
  const { empleadoId, empleadoNombre, monto, descripcion, fecha, retiroId, adminId } = params
  const { error } = await supabaseAdmin.from('adelantos').insert({
    usuario_id: empleadoId,
    empleado_nombre: empleadoNombre,
    monto,
    monto_aprobado: monto,
    estado: 'approved',
    tipo: 'servicio',
    comentario_admin: descripcion || 'Servicio/consumo registrado desde Caja',
    aprobado_por: adminId,
    creado_por_admin: true,
    fecha_respuesta: new Date().toISOString(),
    created_at: `${fecha}T12:00:00.000Z`,
    retiro_caja_id: retiroId,
  })

  if (error) {
    console.error('[caja retiros] error al crear adelanto de servicio:', error.message)
    return { ok: false, error: error.message }
  }

  return { ok: true }
}
