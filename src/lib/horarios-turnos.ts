import { supabaseAdmin } from '@/lib/supabase-admin'
import { avisarTurnos } from '@/lib/bco-turnos'
import { reaplicarCambios } from '@/lib/cambio-horario'

// Horarios base desde BCO Turnos (reemplaza la importación de "turnos programados" de Fresha): BCO Turnos es donde se cargan
// los turnos programados del equipo y acá llenan horarios_base, que usan Asistencia, Espacio de trabajo y Mi horario.
// Lo que se cambió en Humand (cambio de horario aprobado o corrección en Asistencia: editado) se respeta.
// Se corre cuando BCO Turnos guarda un horario, todas las mañanas (cron diario) y con "Refrescar ahora" en Asistencia.
type Fila = { usuario_id: string; fecha: string; inicio: string; fin: string; horas: number }
const iso = (d: Date) => d.toISOString().slice(0, 10)
// Ventana por defecto: una semana atrás y 90 días adelante (BCO Turnos acepta hasta 120 días por pedido)
export const DIAS_ATRAS = 7, DIAS_ADELANTE = 90

export async function importarHorariosTurnos(desdeParam?: string | null, hastaParam?: string | null):
  Promise<{ status: number; body: Record<string, unknown> }> {
  const secreto = process.env.INTEGRACION_SECRET
  if (!secreto) return { status: 500, body: { error: 'Falta INTEGRACION_SECRET' } }
  const hoy = new Date(Date.now() - 3 * 3600e3)
  const fechaOk = (f?: string | null) => !!f && /^\d{4}-\d{2}-\d{2}$/.test(f)
  const desde = fechaOk(desdeParam) ? desdeParam! : iso(new Date(hoy.getTime() - DIAS_ATRAS * 864e5))
  const hasta = fechaOk(hastaParam) ? hastaParam! : iso(new Date(hoy.getTime() + DIAS_ADELANTE * 864e5))
  const url = (process.env.BCO_TURNOS_URL || 'https://bco-turnos.vercel.app').replace(/\/$/, '')
  const r = await fetch(`${url}/api/integraciones/humand/horarios?desde=${desde}&hasta=${hasta}`, { headers: { Authorization: `Bearer ${secreto}` }, cache: 'no-store', signal: AbortSignal.timeout(25000) }).catch(() => null)
  if (!r?.ok) return { status: 502, body: { error: `BCO Turnos respondió ${r?.status ?? 'sin conexión'}` } }
  const d = await r.json() as { usuarios: string[]; filas: Fila[] }
  if (!Array.isArray(d.usuarios) || !Array.isArray(d.filas)) return { status: 502, body: { error: 'Respuesta inválida de BCO Turnos' } }
  if (!d.usuarios.length) return { status: 200, body: { ok: 0 } }

  // Días cambiados en Humand: quedan como están (no se pisan con lo de BCO Turnos)
  const { data: editados } = await supabaseAdmin.from('horarios_base').select('usuario_id, fecha').eq('editado', true).in('usuario_id', d.usuarios).gte('fecha', desde).lte('fecha', hasta)
  const tocado = new Set((editados ?? []).map(e => `${e.usuario_id}|${String(e.fecha).slice(0, 10)}`))
  const { error: delErr } = await supabaseAdmin.from('horarios_base').delete().in('usuario_id', d.usuarios).gte('fecha', desde).lte('fecha', hasta).or('editado.is.null,editado.eq.false')
  if (delErr) return { status: 500, body: { error: delErr.message } }
  const filas = d.filas.filter(f => !tocado.has(`${f.usuario_id}|${f.fecha}`)).map(f => ({ usuario_id: f.usuario_id, fecha: f.fecha, inicio_base: f.inicio, fin_base: f.fin, horas_base: f.horas }))
  for (let i = 0; i < filas.length; i += 500) {
    const { error } = await supabaseAdmin.from('horarios_base').insert(filas.slice(i, i + 500))
    if (error) return { status: 500, body: { error: error.message } }
  }
  // Los cambios de horario aprobados en Humand mandan sobre lo que trae BCO Turnos
  await reaplicarCambios(desde, hasta)
  await supabaseAdmin.from('configuracion').upsert({ clave: 'ultima_importacion_turnos', valor: { fecha: new Date().toISOString(), origen: 'BCO Turnos' } }, { onConflict: 'clave' })
  avisarTurnos()
  return { status: 200, body: { ok: filas.length, respetados: tocado.size, desde, hasta } }
}
