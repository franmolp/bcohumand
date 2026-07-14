import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { getSession } from '@/lib/auth'
import { crearNotificacion, crearNotificaciones, getAdminAndHRIds } from '@/lib/notificaciones'

function fmtF(iso: string): string { const [, m, d] = iso.split('-'); return `${parseInt(d)}/${parseInt(m)}` }

const DEFAULT_CONFIG = { vacaciones_min_dias: 15, otros_min_dias: 10 }

async function getSolicitudesConfig() {
  const { data } = await supabaseAdmin
    .from('configuracion').select('valor').eq('clave', 'solicitudes_config').single()
  const v = data?.valor as { vacaciones_min_dias?: number; otros_min_dias?: number } | null
  return {
    vacaciones_min_dias: v?.vacaciones_min_dias ?? DEFAULT_CONFIG.vacaciones_min_dias,
    otros_min_dias:      v?.otros_min_dias      ?? DEFAULT_CONFIG.otros_min_dias,
  }
}

function addDays(dateStr: string, n: number): string {
  const [y, m, d] = dateStr.split('-').map(Number)
  const dt = new Date(y, m - 1, d + n)
  return `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,'0')}-${String(dt.getDate()).padStart(2,'0')}`
}

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

    // ─── Validación de plazos (solo empleados, no admin/HR) ───
    if (!canManage) {
      const todayAR = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' })

      if (fecha_inicio < todayAR) {
        return NextResponse.json({ error: 'No podés crear solicitudes con fechas anteriores a hoy' }, { status: 400 })
      }

      const cfg = await getSolicitudesConfig()

      if (tipo === 'Vacaciones') {
        const minFecha = addDays(todayAR, cfg.vacaciones_min_dias)
        if (fecha_inicio < minFecha) {
          return NextResponse.json({
            error: `Las vacaciones deben pedirse con al menos ${cfg.vacaciones_min_dias} días de anticipación`,
          }, { status: 400 })
        }
      } else if (tipo === 'Solicitud de Días' || tipo === 'Cambio de horario/día') {
        const minFecha = addDays(todayAR, cfg.otros_min_dias)
        if (fecha_inicio < minFecha) {
          return NextResponse.json({
            error: `Esta solicitud debe pedirse con al menos ${cfg.otros_min_dias} días de anticipación`,
          }, { status: 400 })
        }
        if (!body.motivo?.trim()) {
          return NextResponse.json({ error: 'El motivo es obligatorio para este tipo de solicitud' }, { status: 400 })
        }
      }
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

    // Si admin/HR crea en nombre de otro, guardar el creador real en ediciones
    if (canManage && targetUserId !== session.id) {
      insertData.ediciones = [{ tipo: 'creacion_admin', creadaPor: session.nombre, fecha: new Date().toISOString() }]
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
        mensaje: `${targetNombre} — ${fmtF(fecha_inicio)}${fecha_fin && fecha_fin !== fecha_inicio ? ` → ${fmtF(fecha_fin)}` : ''}`,
        tipo: 'feriado',
      })
    } else if (adminCreatedForOther) {
      // Admin creó solicitud para empleado
      await crearNotificacion({
        usuario_id: targetUserId,
        titulo: `${session.nombre} creó una solicitud en tu nombre`,
        mensaje: `${tipo} — ${fmtF(fecha_inicio)}${fecha_fin && fecha_fin !== fecha_inicio ? ` → ${fmtF(fecha_fin)}` : ''}`,
        tipo: 'solicitud_creada_admin',
      })
    } else if (!canManage && insertData.estado === 'pending') {
      // Empleado creó solicitud → notificar admin+HR
      const adminIds = await getAdminAndHRIds()
      const fechaStr = fecha_fin && fecha_fin !== fecha_inicio ? `${fmtF(fecha_inicio)} → ${fmtF(fecha_fin)}` : fmtF(fecha_inicio)
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
