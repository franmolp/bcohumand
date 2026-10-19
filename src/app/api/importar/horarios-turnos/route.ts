import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { avisarTurnos } from '@/lib/bco-turnos'
import { reaplicarCambios } from '@/lib/cambio-horario'

// Horarios base desde BCO Turnos (reemplaza la importación de "turnos programados" de Fresha): BCO Turnos es donde se cargan
// los turnos programados del equipo y acá llenan horarios_base, que usan Asistencia, Espacio de trabajo y Mi horario.
// Lo que se cambió en Humand (cambio de horario aprobado o corrección en Asistencia: editado) se respeta.
// La llama BCO Turnos al guardar un horario (INTEGRACION_SECRET), el proceso nocturno (CRON_SECRET) o un admin.
type Fila = { usuario_id: string; fecha: string; inicio: string; fin: string; horas: number }
const iso = (d: Date) => d.toISOString().slice(0, 10)

async function correr(req: NextRequest) {
  const auth = req.headers.get('authorization')
  const secreto = process.env.INTEGRACION_SECRET
  const viaCron = (!!process.env.CRON_SECRET && auth === `Bearer ${process.env.CRON_SECRET}`) || (!!secreto && auth === `Bearer ${secreto}`)
  if (!viaCron) {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    if (session.rol !== 'admin' && session.rol !== 'Admin') return NextResponse.json({ error: 'Prohibido' }, { status: 403 })
  }
  if (!secreto) return NextResponse.json({ error: 'Falta INTEGRACION_SECRET' }, { status: 500 })
  const p = req.nextUrl.searchParams, hoy = new Date(Date.now() - 3 * 3600e3)
  const desde = /^\d{4}-\d{2}-\d{2}$/.test(p.get('desde') ?? '') ? p.get('desde')! : iso(new Date(hoy.getTime() - 7 * 864e5))
  const hasta = /^\d{4}-\d{2}-\d{2}$/.test(p.get('hasta') ?? '') ? p.get('hasta')! : iso(new Date(hoy.getTime() + 62 * 864e5))
  const url = (process.env.BCO_TURNOS_URL || 'https://bco-turnos.vercel.app').replace(/\/$/, '')
  const r = await fetch(`${url}/api/integraciones/humand/horarios?desde=${desde}&hasta=${hasta}`, { headers: { Authorization: `Bearer ${secreto}` }, cache: 'no-store', signal: AbortSignal.timeout(25000) }).catch(() => null)
  if (!r?.ok) return NextResponse.json({ error: `BCO Turnos respondió ${r?.status ?? 'sin conexión'}` }, { status: 502 })
  const d = await r.json() as { usuarios: string[]; filas: Fila[] }
  if (!Array.isArray(d.usuarios) || !Array.isArray(d.filas)) return NextResponse.json({ error: 'Respuesta inválida de BCO Turnos' }, { status: 502 })
  if (!d.usuarios.length) return NextResponse.json({ ok: 0 })

  // Días cambiados en Humand: quedan como están (no se pisan con lo de BCO Turnos)
  const { data: editados } = await supabaseAdmin.from('horarios_base').select('usuario_id, fecha').eq('editado', true).in('usuario_id', d.usuarios).gte('fecha', desde).lte('fecha', hasta)
  const tocado = new Set((editados ?? []).map(e => `${e.usuario_id}|${String(e.fecha).slice(0, 10)}`))
  const { error: delErr } = await supabaseAdmin.from('horarios_base').delete().in('usuario_id', d.usuarios).gte('fecha', desde).lte('fecha', hasta).or('editado.is.null,editado.eq.false')
  if (delErr) return NextResponse.json({ error: delErr.message }, { status: 500 })
  const filas = d.filas.filter(f => !tocado.has(`${f.usuario_id}|${f.fecha}`)).map(f => ({ usuario_id: f.usuario_id, fecha: f.fecha, inicio_base: f.inicio, fin_base: f.fin, horas_base: f.horas }))
  for (let i = 0; i < filas.length; i += 500) {
    const { error } = await supabaseAdmin.from('horarios_base').insert(filas.slice(i, i + 500))
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }
  // Los cambios de horario aprobados en Humand mandan sobre lo que trae BCO Turnos
  await reaplicarCambios(desde, hasta)
  await supabaseAdmin.from('configuracion').upsert({ clave: 'ultima_importacion_turnos', valor: { fecha: new Date().toISOString(), origen: 'BCO Turnos' } }, { onConflict: 'clave' })
  avisarTurnos()
  return NextResponse.json({ ok: filas.length, respetados: tocado.size, desde, hasta })
}

export const POST = correr
export const GET = correr
export const maxDuration = 60
