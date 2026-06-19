import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { getSession } from '@/lib/auth'
import { crearNotificaciones, getAllUserIds, getUserIdsByEquipo, getUserIdsByRol } from '@/lib/notificaciones'

export async function GET(request: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const isAdmin    = session.rol === 'admin' || session.rol === 'Admin'
  const canViewAll = isAdmin || session.rol === 'HR' || session.rol === 'Encargada'

  const p = new URL(request.url).searchParams
  const anio = parseInt(p.get('anio') ?? String(new Date().getFullYear()))
  const mes  = parseInt(p.get('mes')  ?? String(new Date().getMonth() + 1))

  const firstDay = `${anio}-${String(mes).padStart(2, '0')}-01`
  const lastDayNum = new Date(anio, mes, 0).getDate()
  const lastDay  = `${anio}-${String(mes).padStart(2, '0')}-${String(lastDayNum).padStart(2, '0')}`

  const [solsRes, usersRes, evRes] = await Promise.all([
    supabase.from('solicitudes')
      .select('id, usuario_id, empleado_nombre, tipo, fecha_inicio, fecha_fin, estado, subtipo_horario, horario_anterior, horario_nuevo, fecha_compensacion')
      .in('estado', ['approved', 'pending'])
      .lte('fecha_inicio', lastDay)
      .or(`fecha_fin.gte.${firstDay},fecha_fin.is.null`),

    supabase.from('usuarios')
      .select('id, nombre, fecha_nacimiento, foto_perfil, equipos(nombre), roles(nombre)')
      .eq('estado_cuenta', 'activo'),

    supabaseAdmin.from('eventos_especiales')
      .select('*')
      .gte('fecha', firstDay)
      .lte('fecha', lastDay),
  ])

  const users = usersRes.data ?? []
  const userMap = new Map(users.map(u => [u.id, u]))

  // Supabase returns related rows as array or object depending on cardinality
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const relNombre = (rel: any): string | null => {
    if (!rel) return null
    if (Array.isArray(rel)) return rel[0]?.nombre ?? null
    return rel.nombre ?? null
  }

  // Enrich solicitudes with equipo/rol
  let solicitudes = (solsRes.data ?? []).map(s => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const u = userMap.get(s.usuario_id) as any
    return {
      ...s,
      equipo_nombre: relNombre(u?.equipos),
      rol_nombre: relNombre(u?.roles),
    }
  })

  if (!canViewAll) {
    solicitudes = solicitudes.filter(s => s.usuario_id === session.id)
  }

  // Cumpleaños del mes
  const mesStr = String(mes).padStart(2, '0')
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const cumpleanos = (users as any[])
    .filter(u => u.fecha_nacimiento && (u.fecha_nacimiento as string).slice(5, 7) === mesStr)
    .map(u => ({
      usuario_id: u.id,
      nombre: u.nombre,
      fecha_nacimiento: u.fecha_nacimiento as string,
      foto_perfil: u.foto_perfil ?? null,
      equipo_nombre: relNombre(u.equipos),
      rol_nombre: relNombre(u.roles),
    }))

  // Filter eventos for employee
  let eventos = evRes.data ?? []
  if (!canViewAll) {
    eventos = eventos.filter(ev => {
      if (ev.tipo_destinatario === 'all') return true
      if (ev.tipo_destinatario === 'employee') return ev.valor_destinatario === session.id
      if (ev.tipo_destinatario === 'team') return ev.valor_destinatario === session.equipo
      if (ev.tipo_destinatario === 'role') return ev.valor_destinatario === session.rol
      return false
    })
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const empleados = (users as any[]).map(u => ({
    id: u.id,
    nombre: u.nombre,
    equipo_nombre: relNombre(u.equipos),
    rol_nombre: relNombre(u.roles),
  }))

  const equipos = [...new Set(empleados.map(e => e.equipo_nombre).filter(Boolean))] as string[]
  const roles   = [...new Set(empleados.map(e => e.rol_nombre).filter(Boolean))] as string[]

  return NextResponse.json({ solicitudes, cumpleanos, eventos, empleados, equipos, roles })
}

export async function POST(request: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const isAdmin = session.rol === 'admin' || session.rol === 'Admin'
  if (!isAdmin) return NextResponse.json({ error: 'Sin permisos' }, { status: 403 })

  const { titulo, emoji, fecha, todo_el_dia, hora_desde, hora_hasta, descripcion, tipo_destinatario, valor_destinatario } = await request.json()

  if (!titulo || !fecha || !tipo_destinatario) {
    return NextResponse.json({ error: 'Campos requeridos: titulo, fecha, tipo_destinatario' }, { status: 400 })
  }

  const { data, error } = await supabaseAdmin.from('eventos_especiales').insert({
    titulo,
    emoji: emoji || null,
    fecha,
    todo_el_dia: todo_el_dia ?? true,
    hora_desde: hora_desde || null,
    hora_hasta: hora_hasta || null,
    descripcion: descripcion || null,
    tipo_destinatario,
    valor_destinatario: valor_destinatario || null,
    creado_por: session.id,
  }).select().single()

  if (error) {
    console.error('[calendario POST]', error.message, error.details, error.hint)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Notificar a los destinatarios del evento (excepto el admin creador)
  try {
    let targetIds: string[] = []
    if (tipo_destinatario === 'all') {
      targetIds = await getAllUserIds(session.id)
    } else if (tipo_destinatario === 'employee' && valor_destinatario) {
      targetIds = [valor_destinatario]
    } else if (tipo_destinatario === 'team' && valor_destinatario) {
      targetIds = (await getUserIdsByEquipo(valor_destinatario)).filter(id => id !== session.id)
    } else if (tipo_destinatario === 'role' && valor_destinatario) {
      targetIds = (await getUserIdsByRol(valor_destinatario)).filter(id => id !== session.id)
    }
    if (targetIds.length) {
      const DIAS = ['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado']
      const [fy, fm, fd] = fecha.split('-').map(Number)
      const fechaObj = new Date(fy, fm - 1, fd)
      let mensajeFecha = `${DIAS[fechaObj.getDay()]} ${fd}`
      if (!todo_el_dia && hora_desde) {
        mensajeFecha += ` ${hora_desde.substring(0, 5)}`
        if (hora_hasta) mensajeFecha += ` - ${hora_hasta.substring(0, 5)}`
      }
      await crearNotificaciones(targetIds, {
        titulo: `${emoji ?? '📅'} Nuevo evento: ${titulo}`,
        mensaje: mensajeFecha + (descripcion ? ` — ${descripcion}` : ''),
        tipo: 'evento_especial',
      })
    }
  } catch { /* silently ignore notification errors */ }

  return NextResponse.json(data, { status: 201 })
}
