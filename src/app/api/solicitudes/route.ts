import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { getSession } from '@/lib/auth'
import { crearNotificacion, crearNotificaciones, getAdminAndHRIds } from '@/lib/notificaciones'

export async function GET(request: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const estado   = searchParams.get('estado')   || ''
  const tipo     = searchParams.get('tipo')     || ''
  const empleado = searchParams.get('empleado') || ''  // usuario_id (UUID)
  const isAdmin  = session.rol === 'admin' || session.rol === 'Admin'
  const isHR     = session.rol === 'HR'
  const canViewAll = isAdmin || isHR

  let query = supabase
    .from('solicitudes')
    .select('*')
    .order('fecha_creacion', { ascending: false })

  if (!canViewAll) {
    query = query.eq('usuario_id', session.id)
  } else if (empleado) {
    query = query.eq('usuario_id', empleado)
  }

  if (estado)  query = query.eq('estado', estado)
  if (tipo)    query = query.eq('tipo', tipo)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json(data || [])
}

export async function POST(request: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  try {
    const body = await request.json()
    const {
      tipo, fecha_inicio, fecha_fin, dias, motivo,
      certificado_adjunto, subtipo_horario,
      horario_anterior, horario_nuevo, fecha_compensacion,
      comentario_admin, usuario_id: bodyUserId, empleado_nombre: bodyNombre,
      estado: estadoBody,
    } = body

    if (!tipo || !fecha_inicio) {
      return NextResponse.json({ error: 'Tipo y fecha inicio son requeridos' }, { status: 400 })
    }

    const isAdmin    = session.rol === 'admin' || session.rol === 'Admin'
    const isHR       = session.rol === 'HR'
    const canManage  = isAdmin || isHR

    if (tipo === 'Feriado/Local cerrado' && !isAdmin) {
      return NextResponse.json({ error: 'Sin permisos' }, { status: 403 })
    }

    // Admin/HR puede crear en nombre de otro empleado (bodyUserId = UUID del empleado)
    const targetUserId = canManage && bodyUserId ? bodyUserId : session.id
    const targetNombre = canManage && bodyNombre  ? bodyNombre  : session.nombre

    const isFeriado = tipo === 'Feriado/Local cerrado'

    const insertData: Record<string, unknown> = {
      usuario_id:      targetUserId,
      empleado_nombre: targetNombre,
      tipo,
      fecha_inicio,
      fecha_fin:       fecha_fin || null,
      dias:            dias      || null,
      motivo:          motivo    || null,
      estado:          isFeriado ? 'approved' : (canManage && estadoBody ? estadoBody : 'pending'),
    }

    if (certificado_adjunto)  insertData.certificado_adjunto  = certificado_adjunto
    if (subtipo_horario)      insertData.subtipo_horario       = subtipo_horario
    if (horario_anterior)     insertData.horario_anterior      = horario_anterior
    if (horario_nuevo)        insertData.horario_nuevo         = horario_nuevo
    if (fecha_compensacion)   insertData.fecha_compensacion    = fecha_compensacion

    if (comentario_admin) insertData.comentario_admin = comentario_admin

    // Si admin/HR crea directamente como aprobada, registrar quién y cuándo
    if (canManage && insertData.estado === 'approved') {
      insertData.moderador             = session.nombre
      insertData.hora_ultima_actividad = new Date().toISOString()
    }

    const { data, error } = await supabase
      .from('solicitudes')
      .insert(insertData)
      .select('*')
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    // Notificaciones
    const isFeriadoApproved = tipo === 'Feriado/Local cerrado'
    const adminCreatedForOther = canManage && targetUserId !== session.id

    if (isFeriadoApproved) {
      // Feriado: notificar a todos los usuarios activos
      const { data: allUsers } = await supabase.from('usuarios').select('id').eq('estado_cuenta', 'activo')
      const ids = (allUsers ?? []).map((u: { id: string }) => u.id).filter((id: string) => id !== session.id)
      await crearNotificaciones(ids, {
        titulo: `Feriado/Local cerrado: ${tipo}`,
        mensaje: `${targetNombre} — ${fecha_inicio}${fecha_fin && fecha_fin !== fecha_inicio ? ` → ${fecha_fin}` : ''}`,
        tipo: 'feriado',
      })
    } else if (adminCreatedForOther) {
      // Admin creó solicitud para empleado
      await crearNotificacion({
        usuario_id: targetUserId,
        titulo: `${session.nombre} creó una solicitud en tu nombre`,
        mensaje: `${tipo} — ${fecha_inicio}${fecha_fin && fecha_fin !== fecha_inicio ? ` → ${fecha_fin}` : ''}`,
        tipo: 'solicitud_creada_admin',
      })
    } else if (!canManage && insertData.estado === 'pending') {
      // Empleado creó solicitud → notificar admin+HR
      const adminIds = await getAdminAndHRIds()
      const fechaStr = fecha_fin && fecha_fin !== fecha_inicio ? `${fecha_inicio} → ${fecha_fin}` : fecha_inicio
      await crearNotificaciones(adminIds, {
        titulo: `Nueva solicitud de ${tipo.toLowerCase()} de ${session.nombre}`,
        mensaje: fechaStr + (motivo ? ` · ${motivo}` : ''),
        tipo: 'solicitud_nueva',
      })
    }

    return NextResponse.json(data, { status: 201 })
  } catch {
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
