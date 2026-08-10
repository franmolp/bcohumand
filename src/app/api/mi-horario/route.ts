import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { toMin, overlaps } from '@/lib/gaps'

function addDays(date: string, n: number): string {
  const d = new Date(date + 'T12:00:00Z')
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

interface Turno { inicio: string; fin: string; origen: 'fresha' | 'aprobado'; equipo: string }

// Mi horario personal (esta semana + la próxima): turnos reales de Fresha más
// puestos extra ya aprobados que todavía no bajaron de Fresha — con el mismo
// criterio anti-duplicado que Ocupación (si ya hay un turno real que se pisa
// con el horario aprobado, se asume formalizado y no se muestra el sintético).
export async function GET() {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const hoy = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' })
  const dow = new Date(hoy + 'T12:00:00Z').getUTCDay() // 0=Dom..6=Sáb
  const lunesEstaSemana = addDays(hoy, dow === 0 ? -6 : 1 - dow)

  // Lunes a sábado, esta semana y la próxima — el domingo se salta siempre
  // (la peluquería no abre ese día, no se muestra ni aunque haya datos).
  const fechasSemana: string[] = []
  for (let semana = 0; semana < 2; semana++) {
    for (let d = 0; d < 6; d++) fechasSemana.push(addDays(lunesEstaSemana, semana * 7 + d))
  }
  const sabadoProxima = fechasSemana[fechasSemana.length - 1]

  const [horariosRes, solicitudesRes, ausenciasRes] = await Promise.all([
    supabaseAdmin
      .from('horarios_base')
      .select('fecha, inicio_base, fin_base')
      .eq('usuario_id', session.id)
      .gte('fecha', lunesEstaSemana)
      .lte('fecha', sabadoProxima),
    supabaseAdmin
      .from('solicitudes_puesto')
      .select('fecha, hora_inicio, hora_fin, equipo_nombre')
      .eq('usuario_id', session.id)
      .eq('estado', 'approved')
      .gte('fecha', lunesEstaSemana)
      .lte('fecha', sabadoProxima),
    // Vacaciones / días / ausencias aprobadas que caen en el rango — para marcar
    // esos días en vez de mostrarlos como "Sin turnos" sin más explicación.
    supabaseAdmin
      .from('solicitudes')
      .select('tipo, fecha_inicio, fecha_fin')
      .eq('usuario_id', session.id)
      .eq('estado', 'approved')
      .in('tipo', ['Vacaciones', 'Solicitud de Días', 'Ausencia por Salud', 'Feriado/Local cerrado'])
      .lte('fecha_inicio', sabadoProxima)
      .gte('fecha_inicio', addDays(lunesEstaSemana, -60)),
  ])

  if (horariosRes.error) return NextResponse.json({ error: horariosRes.error.message }, { status: 500 })
  if (solicitudesRes.error) return NextResponse.json({ error: solicitudesRes.error.message }, { status: 500 })
  if (ausenciasRes.error) return NextResponse.json({ error: ausenciasRes.error.message }, { status: 500 })

  const normalizeTime = (t: string) => t ? t.slice(0, 5) : t

  const porDia = new Map<string, Turno[]>()
  for (const fecha of fechasSemana) porDia.set(fecha, [])

  for (const h of horariosRes.data ?? []) {
    const lista = porDia.get(h.fecha)
    if (lista) lista.push({ inicio: normalizeTime(h.inicio_base), fin: normalizeTime(h.fin_base), origen: 'fresha', equipo: session.equipo })
  }

  for (const s of solicitudesRes.data ?? []) {
    const reales = porDia.get(s.fecha)?.filter(t => t.origen === 'fresha') ?? []
    const inicio = toMin(normalizeTime(s.hora_inicio))
    const fin = toMin(normalizeTime(s.hora_fin))
    const yaFormalizado = reales.some(r => overlaps(inicio, fin, toMin(r.inicio), toMin(r.fin)))
    if (yaFormalizado) continue
    const lista = porDia.get(s.fecha)
    if (lista) lista.push({ inicio: normalizeTime(s.hora_inicio), fin: normalizeTime(s.hora_fin), origen: 'aprobado', equipo: s.equipo_nombre })
  }

  const ausenciaPorDia = new Map<string, string>()
  for (const a of ausenciasRes.data ?? []) {
    const fin = a.fecha_fin || a.fecha_inicio
    for (const fecha of fechasSemana) {
      if (fecha >= a.fecha_inicio && fecha <= fin && !ausenciaPorDia.has(fecha)) {
        ausenciaPorDia.set(fecha, a.tipo)
      }
    }
  }

  const dias = [...porDia.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([fecha, turnos]) => ({
      fecha,
      turnos: turnos.sort((a, b) => a.inicio.localeCompare(b.inicio)),
      ausencia: ausenciaPorDia.get(fecha) ?? null,
    }))

  return NextResponse.json({ hoy, dias })
}
