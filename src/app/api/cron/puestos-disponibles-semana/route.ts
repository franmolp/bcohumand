import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { tipoRecurso, defaultCapacity, findGapsForDay, toMin, minToStr, overlaps } from '@/lib/gaps'
import { getEquiposHabilitadosPuestos } from '@/lib/puestos'
import { fmtFechaLarga } from '@/lib/fecha'
import { crearNotificaciones, getUserIdsByEquipo } from '@/lib/notificaciones'

function addDays(date: string, n: number): string {
  const d = new Date(date + 'T12:00:00Z')
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

function puedeAprobar(rol: string): boolean {
  return rol === 'admin' || rol === 'Admin' || rol === 'Encargada'
}

// Por cada equipo habilitado por el admin, si hay puestos libres para la semana que viene
// (lunes a sábado), avisa a todo el equipo. Si no hay nada, no manda nada.
async function enviarAvisoSemanal() {
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' })
  const dow = new Date(today + 'T12:00:00Z').getUTCDay() // 0=Dom..6=Sáb
  const diasHastaLunes = (8 - dow) % 7
  const lunes = addDays(today, diasHastaLunes)
  const sabado = addDays(lunes, 5)

  const [{ data: equipos }, habilitados] = await Promise.all([
    supabaseAdmin.from('equipos').select('id, nombre'),
    getEquiposHabilitadosPuestos(),
  ])
  const elegibles = (equipos ?? []).filter(e => habilitados.includes(e.id))

  const { data: configData } = await supabaseAdmin.from('configuracion').select('valor').eq('clave', 'espacio_trabajo').single()
  const capacidadesOverride = (configData?.valor as { capacidades?: Record<string, number> } | null)?.capacidades ?? {}

  const resultados: { equipo: string; huecos: number; notificados: number }[] = []

  for (const equipo of elegibles) {
    const tipo = tipoRecurso(equipo.nombre) ?? 'mesa'
    const capacity = capacidadesOverride[equipo.nombre] ?? defaultCapacity(equipo.nombre)

    const { data: miembros } = await supabaseAdmin.from('usuarios').select('id').eq('equipo_id', equipo.id).eq('estado_cuenta', 'activo')
    const miembroIds = (miembros ?? []).map(u => u.id as string)
    if (miembroIds.length === 0) continue

    const [horariosRes, solicitudesRes] = await Promise.all([
      supabaseAdmin.from('horarios_base').select('usuario_id, fecha, inicio_base, fin_base')
        .in('usuario_id', miembroIds).gte('fecha', lunes).lte('fecha', sabado),
      supabaseAdmin.from('solicitudes_puesto').select('fecha, lane, hora_inicio, hora_fin')
        .eq('equipo_id', equipo.id).eq('estado', 'approved').gte('fecha', lunes).lte('fecha', sabado),
    ])

    const normalizeTime = (t: string) => (t ? t.slice(0, 5) : t)
    const turnosPorFecha = new Map<string, { usuario_id: string; inicio: string; fin: string }[]>()
    for (const h of (horariosRes.data ?? [])) {
      const f = h.fecha as string
      if (!turnosPorFecha.has(f)) turnosPorFecha.set(f, [])
      turnosPorFecha.get(f)!.push({ usuario_id: h.usuario_id as string, inicio: normalizeTime(h.inicio_base as string), fin: normalizeTime(h.fin_base as string) })
    }

    const aprobadosPorFecha = new Map<string, { lane: number; start: number; end: number }[]>()
    for (const s of (solicitudesRes.data ?? [])) {
      const f = s.fecha as string
      if (!aprobadosPorFecha.has(f)) aprobadosPorFecha.set(f, [])
      aprobadosPorFecha.get(f)!.push({ lane: s.lane as number, start: toMin((s.hora_inicio as string).slice(0, 5)), end: toMin((s.hora_fin as string).slice(0, 5)) })
    }

    let huecosTotal = 0
    let masProximo: { fecha: string; inicio: string; fin: string } | null = null

    for (const [fecha, shiftsDia] of turnosPorFecha.entries()) {
      const gaps = findGapsForDay(shiftsDia, capacity)
      const aprobadosDia = aprobadosPorFecha.get(fecha) ?? []
      for (const gap of gaps) {
        const yaAprobado = aprobadosDia.some(a => a.lane === gap.lane && overlaps(gap.start, gap.end, a.start, a.end))
        if (yaAprobado) continue
        huecosTotal++
        if (!masProximo || fecha < masProximo.fecha || (fecha === masProximo.fecha && gap.start < toMin(masProximo.inicio))) {
          masProximo = { fecha, inicio: minToStr(gap.start), fin: minToStr(gap.end) }
        }
      }
    }

    // Días de la semana sin ningún turno cargado no generan huecos (sin datos, no se avisa por error)
    if (huecosTotal === 0) { resultados.push({ equipo: equipo.nombre, huecos: 0, notificados: 0 }); continue }

    const destinatarios = await getUserIdsByEquipo(equipo.nombre)
    if (destinatarios.length > 0 && masProximo) {
      const m = masProximo as { fecha: string; inicio: string; fin: string }
      await crearNotificaciones(destinatarios, {
        titulo: `Hay ${tipo === 'box' ? 'boxes' : 'mesas'} libres la próxima semana`,
        mensaje: `${huecosTotal} puesto${huecosTotal !== 1 ? 's' : ''} disponible${huecosTotal !== 1 ? 's' : ''} en ${equipo.nombre}. El más próximo: ${fmtFechaLarga(m.fecha)}, de ${m.inicio} a ${m.fin}.`,
        tipo: 'puestos_disponibles_semana',
        url: '/dashboard/espacio-trabajo',
      }).catch(() => {})
    }

    resultados.push({ equipo: equipo.nombre, huecos: huecosTotal, notificados: destinatarios.length })
  }

  return { ok: true, semana: { lunes, sabado }, resultados }
}

// Cron automático (Vercel cron, sábados)
export async function GET(req: NextRequest) {
  const secret = req.nextUrl.searchParams.get('secret')
  const authHeader = req.headers.get('authorization')
  const bearerSecret = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null
  if (secret !== process.env.CRON_SECRET && bearerSecret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  const result = await enviarAvisoSemanal()
  return NextResponse.json(result)
}

// Trigger manual desde el panel de Ajustes (Admin/Encargada)
export async function POST() {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  if (!puedeAprobar(session.rol)) return NextResponse.json({ error: 'Prohibido' }, { status: 403 })

  const result = await enviarAvisoSemanal()
  return NextResponse.json(result)
}
