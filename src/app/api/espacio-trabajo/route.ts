import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { supabase } from '@/lib/supabase'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { toMin, overlaps } from '@/lib/gaps'

export const dynamic = 'force-dynamic'

function defaultCapacity(equipoNombre: string): number {
  const n = equipoNombre.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  if (n.includes('peluq')) return 4
  if (n.includes('masaj') || n.includes('depilac')) return 2
  if (n.includes('recep')) return 1
  return 8
}

export async function GET(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const isAdmin = session.rol === 'admin' || session.rol === 'Admin'
  const isHR = session.rol === 'HR'
  const isEncargada = session.rol === 'Encargada'
  const isCompras = session.rol === 'Compras'
  if (!isAdmin && !isHR && !isEncargada && !isCompras) {
    return NextResponse.json({ error: 'Prohibido' }, { status: 403 })
  }

  const { searchParams } = new URL(req.url)
  const fechaInicio = searchParams.get('fechaInicio')
  const fechaFin = searchParams.get('fechaFin')
  if (!fechaInicio || !fechaFin) {
    return NextResponse.json({ error: 'fechaInicio y fechaFin requeridos' }, { status: 400 })
  }

  // Load config and schedules in parallel
  const [configRes, horariosRes, solicitudesRes] = await Promise.all([
    supabase.from('configuracion').select('clave, valor').in('clave', ['espacio_trabajo', 'ultima_importacion_turnos', 'ultima_importacion_fichadas']),
    supabaseAdmin
      .from('horarios_base')
      .select('usuario_id, fecha, inicio_base, fin_base')
      .gte('fecha', fechaInicio)
      .lte('fecha', fechaFin)
      .limit(5000),
    // Solicitudes de puesto ya aprobadas: se muestran como ocupación aunque Fresha
    // todavía no haya bajado el cambio, para que el puesto deje de figurar libre.
    supabaseAdmin
      .from('solicitudes_puesto')
      .select('usuario_id, equipo_nombre, fecha, hora_inicio, hora_fin')
      .eq('estado', 'approved')
      .gte('fecha', fechaInicio)
      .lte('fecha', fechaFin),
  ])

  const configMap = new Map((configRes.data ?? []).map((c: { clave: string; valor: unknown }) => [c.clave, c.valor]))
  const espacioConfig = configMap.get('espacio_trabajo') as { capacidades?: Record<string, number> } | undefined
  const capacidadesOverride: Record<string, number> = espacioConfig?.capacidades ?? {}
  const ultimaImportacionData = configMap.get('ultima_importacion_turnos') as { fecha?: string } | undefined
  const ultimaImportacion = ultimaImportacionData?.fecha ?? null
  const ultimaFichadasData = configMap.get('ultima_importacion_fichadas') as { fecha?: string } | undefined
  const ultimaFichadas = ultimaFichadasData?.fecha ?? null

  const horarios = horariosRes.data ?? []
  const solicitudesAprobadas = solicitudesRes.data ?? []

  if (horarios.length === 0 && solicitudesAprobadas.length === 0) {
    return NextResponse.json({ turnos: [], ultimaImportacion, ultimaFichadas, capacidades: {} })
  }

  // Two separate queries — avoid FK join which can fail silently
  const userIds = [...new Set([
    ...horarios.map((h: { usuario_id: string }) => h.usuario_id),
    ...solicitudesAprobadas.map(s => s.usuario_id as string),
  ])]

  const { data: usuarios } = await supabase
    .from('usuarios')
    .select('id, nombre, equipo_id')
    .in('id', userIds)

  const equipoIds = [...new Set(
    (usuarios ?? [])
      .map((u: { equipo_id: number | null }) => u.equipo_id)
      .filter((id): id is number => id != null)
  )]

  const { data: equipos } = equipoIds.length > 0
    ? await supabase.from('equipos').select('id, nombre').in('id', equipoIds)
    : { data: [] as { id: number; nombre: string }[] }

  const equipoMap = new Map((equipos ?? []).map((e: { id: number; nombre: string }) => [e.id, e.nombre]))

  const userMap = new Map((usuarios ?? []).map((u: { id: string; nombre: string; equipo_id: number | null }) => [
    u.id,
    {
      nombre: u.nombre,
      equipo: u.equipo_id != null ? (equipoMap.get(u.equipo_id) ?? '') : '',
    },
  ]))

  // Normalize time to HH:MM (Postgres may return HH:MM:SS)
  const normalizeTime = (t: string) => t ? t.slice(0, 5) : t

  // Build turnos list
  const turnosFresha = horarios.map((h: { usuario_id: string; fecha: string; inicio_base: string; fin_base: string }) => {
    const user = userMap.get(h.usuario_id)
    return {
      usuario_id: h.usuario_id,
      nombre: user?.nombre ?? '—',
      equipo: user?.equipo ?? '',
      fecha: h.fecha,
      inicio: normalizeTime(h.inicio_base),
      fin: normalizeTime(h.fin_base),
    }
  })

  // Solicitudes de puesto aprobadas: se ocupa el equipo/lane del recurso solicitado
  // (no el equipo real de quien pidió el puesto), para que aparezca en la sección
  // correcta de Ocupación y deje de contarse como hueco libre en Disponibles.
  // Es solo un overlay TEMPORAL: si ya bajó de Fresha un turno real de esa misma
  // persona ese día que se pisa con el horario pedido, se asume que Fresha ya
  // formalizó el cambio y se deja de mostrar el sintético para no duplicar la mesa.
  const turnosRealesPorUsuarioFecha = new Map<string, { inicio: number; fin: number }[]>()
  for (const t of turnosFresha) {
    const key = `${t.usuario_id}|${t.fecha}`
    if (!turnosRealesPorUsuarioFecha.has(key)) turnosRealesPorUsuarioFecha.set(key, [])
    turnosRealesPorUsuarioFecha.get(key)!.push({ inicio: toMin(t.inicio), fin: toMin(t.fin) })
  }

  const turnosSolicitudes = solicitudesAprobadas
    .filter(s => {
      const reales = turnosRealesPorUsuarioFecha.get(`${s.usuario_id}|${s.fecha}`) ?? []
      const inicio = toMin(normalizeTime(s.hora_inicio as string))
      const fin = toMin(normalizeTime(s.hora_fin as string))
      return !reales.some(r => overlaps(inicio, fin, r.inicio, r.fin))
    })
    .map(s => {
      const user = userMap.get(s.usuario_id as string)
      return {
        usuario_id: s.usuario_id as string,
        nombre: user?.nombre ?? '—',
        equipo: s.equipo_nombre as string,
        fecha: s.fecha as string,
        inicio: normalizeTime(s.hora_inicio as string),
        fin: normalizeTime(s.hora_fin as string),
      }
    })

  const turnos = [...turnosFresha, ...turnosSolicitudes]

  // Build capacidades map: equipo_nombre → capacity
  const equipoNames = [...new Set(turnos.map(t => t.equipo).filter(Boolean))]
  const capacidades: Record<string, number> = {}
  for (const name of equipoNames) {
    capacidades[name] = capacidadesOverride[name] ?? defaultCapacity(name)
  }

  return NextResponse.json({ turnos, ultimaImportacion, ultimaFichadas, capacidades })
}
