import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'

// Datos que BCO Turnos lee de Humand (solo lectura, con INTEGRACION_SECRET):
// roles, empleados (con el interruptor "Usa BCO Turnos"), solicitudes aprobadas, horarios y puestos aprobados.
const TIPOS_AUSENCIA = ['Vacaciones', 'Ausencia por Salud', 'Solicitud de Días', 'Ausencia Injustificada', 'Feriado/Local cerrado']

export async function GET(req: NextRequest) {
  const secreto = process.env.INTEGRACION_SECRET
  if (!secreto || req.headers.get('authorization') !== `Bearer ${secreto}`) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const hoy = new Date(Date.now() - 3 * 3600e3).toISOString().slice(0, 10)
  const sumar = (f: string, n: number) => new Date(Date.parse(f + 'T12:00:00Z') + n * 864e5).toISOString().slice(0, 10)
  const desde = req.nextUrl.searchParams.get('desde') || sumar(hoy, -7), hasta = req.nextUrl.searchParams.get('hasta') || sumar(hoy, 90)

  let usu = await supabaseAdmin.from('usuarios').select('id, nombre, email, telefono, dni, fecha_nacimiento, estado_cuenta, usa_bco_turnos, equipo:equipos(id,nombre), rol:roles(id,nombre)')
  // Sin bco_turnos.sql: todos menos limpieza
  if (usu.error && /usa_bco_turnos/.test(usu.error.message)) usu = await supabaseAdmin.from('usuarios').select('id, nombre, email, telefono, dni, fecha_nacimiento, estado_cuenta, equipo:equipos(id,nombre), rol:roles(id,nombre)') as typeof usu
  if (usu.error) return NextResponse.json({ error: usu.error.message }, { status: 500 })

  const [roles, sol, hor, pue] = await Promise.all([
    supabaseAdmin.from('roles').select('id, nombre').order('id'),
    supabaseAdmin.from('solicitudes').select('id, usuario_id, tipo, fecha_inicio, fecha_fin, motivo, comentario_admin, moderador').eq('estado', 'approved').in('tipo', TIPOS_AUSENCIA).gte('fecha_fin', desde).lte('fecha_inicio', hasta),
    // editado: cambiado en Humand (cambio de horario aprobado o corrección en Asistencia); el resto es el horario que manda BCO Turnos
    supabaseAdmin.from('horarios_base').select('usuario_id, fecha, inicio_base, fin_base, editado').gte('fecha', desde).lte('fecha', hasta).order('fecha').range(0, 9999),
    supabaseAdmin.from('solicitudes_puesto').select('id, usuario_id, equipo_nombre, tipo_recurso, fecha, hora_inicio, hora_fin').eq('estado', 'approved').gte('fecha', desde).lte('fecha', hasta),
  ])
  for (const r of [roles, sol, hor, pue]) if (r.error) return NextResponse.json({ error: r.error.message }, { status: 500 })

  const uno = <T,>(x: T | T[] | null) => (Array.isArray(x) ? x[0] : x) ?? null
  const empleados = (usu.data ?? []).map(u => {
    const equipo = uno(u.equipo as unknown as { id: number; nombre: string } | null), rol = uno(u.rol as unknown as { id: number; nombre: string } | null)
    const usa = 'usa_bco_turnos' in u ? !!(u as { usa_bco_turnos?: boolean }).usa_bco_turnos : !/limpieza/i.test(equipo?.nombre ?? '')
    return { id: u.id, nombre: u.nombre, email: u.email, telefono: u.telefono, dni: u.dni, fecha_nacimiento: u.fecha_nacimiento, estado: u.estado_cuenta, usa_bco_turnos: usa, equipo: equipo?.nombre ?? null, rol_id: rol?.id ?? null, rol: rol?.nombre ?? null }
  })
  const hm = (t: string | null) => (t ?? '').slice(0, 5)
  return NextResponse.json({
    desde, hasta, tipos_ausencia: TIPOS_AUSENCIA, roles: roles.data ?? [], empleados,
    ausencias: (sol.data ?? []).map(s => ({ id: s.id, usuario_id: s.usuario_id, tipo: s.tipo, desde: String(s.fecha_inicio).slice(0, 10), hasta: String(s.fecha_fin ?? s.fecha_inicio).slice(0, 10), motivo: s.motivo, comentario: s.comentario_admin, aprobado_por: s.moderador })),
    horarios: (hor.data ?? []).filter(h => h.inicio_base && h.fin_base).map(h => ({ usuario_id: h.usuario_id, fecha: String(h.fecha).slice(0, 10), desde: hm(h.inicio_base), hasta: hm(h.fin_base), editado: !!h.editado })),
    puestos: (pue.data ?? []).map(p => ({ id: p.id, usuario_id: p.usuario_id, recurso: p.tipo_recurso, equipo: p.equipo_nombre, fecha: String(p.fecha).slice(0, 10), desde: hm(p.hora_inicio), hasta: hm(p.hora_fin) })),
  })
}
