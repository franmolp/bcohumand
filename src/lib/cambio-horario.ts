// Solicitudes "Cambio de horario/día": antes de aprobar se verifica si hay espacio de trabajo libre
// (mesas, boxes o puestos del equipo) en el horario nuevo; al aprobar, se modifica el horario base solo.
// - mismo_dia: ese día pasa a tener el horario nuevo.
// - compensacion: no viene el día fecha_inicio y viene el día fecha_compensacion con el horario nuevo.
import { supabaseAdmin } from '@/lib/supabase-admin'
import { defaultCapacity, isMasajistaODepiladora, isPeluqueria, isRecepcion, minToStr, toMin } from '@/lib/gaps'

type Sol = { id: string; usuario_id: string; tipo: string; subtipo_horario: string | null; fecha_inicio: string; fecha_compensacion: string | null; horario_nuevo: string | null }
export const esCambioHorario = (tipo: string) => tipo === 'Cambio de horario/día' || tipo === 'Cambio de Horario'

const fecha = (f: string | null) => (f ?? '').slice(0, 10)
const fmt = (f: string) => f.split('-').reverse().slice(0, 2).join('/')
const espacio = (equipo: string, n: number) => {
  const [uno, varios] = isMasajistaODepiladora(equipo) ? ['box', 'boxes'] : isPeluqueria(equipo) ? ['puesto de peluquería', 'puestos de peluquería'] : isRecepcion(equipo) ? ['puesto de recepción', 'puestos de recepción'] : ['mesa', 'mesas']
  return n === 1 ? uno : varios
}

export function destinoDe(s: Sol) {
  const [desde, hasta] = (s.horario_nuevo ?? '').split('-').map(x => x?.trim().slice(0, 5))
  const dia = s.subtipo_horario === 'compensacion' ? fecha(s.fecha_compensacion) : fecha(s.fecha_inicio)
  if (!dia || !desde || !hasta || toMin(hasta) <= toMin(desde)) return null
  return { dia, desde, hasta, libre: s.subtipo_horario === 'compensacion' ? fecha(s.fecha_inicio) : null }
}

// ¿Hay lugar para el horario nuevo? Cuenta a las del mismo equipo que trabajan ese día (y los puestos aprobados) a cada minuto
export async function evaluarCambio(s: Sol): Promise<{ posible: boolean; mensaje: string }> {
  const d = destinoDe(s)
  if (!d) return { posible: false, mensaje: 'Falta el día o el horario nuevo de la solicitud.' }
  const { data: yo } = await supabaseAdmin.from('usuarios').select('equipo_id, equipo:equipos(nombre)').eq('id', s.usuario_id).single()
  const equipo = ((Array.isArray(yo?.equipo) ? yo?.equipo[0] : yo?.equipo) as { nombre: string } | null)?.nombre ?? ''
  const [cfg, companeras, cerrado] = await Promise.all([
    supabaseAdmin.from('configuracion').select('valor').eq('clave', 'espacio_trabajo').maybeSingle(),
    yo?.equipo_id ? supabaseAdmin.from('usuarios').select('id').eq('equipo_id', yo.equipo_id).neq('id', s.usuario_id).neq('estado_cuenta', 'archivado') : Promise.resolve({ data: [] as { id: string }[] }),
    supabaseAdmin.from('solicitudes').select('id').eq('tipo', 'Feriado/Local cerrado').eq('estado', 'approved').lte('fecha_inicio', d.dia).or(`fecha_fin.gte.${d.dia},fecha_fin.is.null`).limit(1),
  ])
  if (cerrado.data?.length) return { posible: false, mensaje: `El ${fmt(d.dia)} el local está cerrado.` }
  const capacidad = (cfg.data?.valor as { capacidades?: Record<string, number> } | null)?.capacidades?.[equipo] ?? defaultCapacity(equipo)
  const ids = (companeras.data ?? []).map(c => c.id)
  const [hor, pue] = ids.length ? await Promise.all([
    supabaseAdmin.from('horarios_base').select('inicio_base, fin_base').eq('fecha', d.dia).in('usuario_id', ids),
    supabaseAdmin.from('solicitudes_puesto').select('hora_inicio, hora_fin').eq('fecha', d.dia).eq('estado', 'approved').in('usuario_id', ids),
  ]) : [{ data: [] }, { data: [] }]
  const tramos = [...(hor.data ?? []).map(h => [h.inicio_base, h.fin_base]), ...(pue.data ?? []).map(p => [p.hora_inicio, p.hora_fin])]
    .filter(([a, b]) => a && b).map(([a, b]) => [toMin(String(a)), toMin(String(b))])
  const ini = toMin(d.desde), fin = toMin(d.hasta)
  let max = 0, peor = ini
  for (let m = ini; m < fin; m += 15) {
    const n = tramos.filter(([a, b]) => a <= m && b > m).length
    if (n > max) { max = n; peor = m }
  }
  const libres = capacidad - max
  const cuando = `el ${fmt(d.dia)} de ${d.desde} a ${d.hasta}`
  return libres > 0
    ? { posible: true, mensaje: `Hay lugar ${cuando}: en el momento más ocupado quedan ${libres} ${espacio(equipo, libres)} de ${capacidad}.` }
    : { posible: false, mensaje: `No hay ${espacio(equipo, 1)} libre ${cuando}: a las ${minToStr(peor)} están ocupados ${max} de ${capacidad}.` }
}

// Al aprobar: el horario base queda como pide la solicitud
export async function aplicarCambio(s: Sol) {
  const d = destinoDe(s)
  if (!d) return
  const horas = Math.round((toMin(d.hasta) - toMin(d.desde)) / 6) / 10
  if (d.libre) await supabaseAdmin.from('horarios_base').delete().eq('usuario_id', s.usuario_id).eq('fecha', d.libre)
  // Mismo día: se reemplaza el horario del día; compensación: se suma el bloque nuevo (si ya trabajaba ese día, se reemplaza el que se pisa)
  if (s.subtipo_horario !== 'compensacion') await supabaseAdmin.from('horarios_base').delete().eq('usuario_id', s.usuario_id).eq('fecha', d.dia)
  else {
    const { data: ese } = await supabaseAdmin.from('horarios_base').select('id, inicio_base, fin_base').eq('usuario_id', s.usuario_id).eq('fecha', d.dia)
    const pisa = (ese ?? []).filter(h => toMin(String(h.inicio_base)) < toMin(d.hasta) && toMin(String(h.fin_base)) > toMin(d.desde)).map(h => h.id)
    if (pisa.length) await supabaseAdmin.from('horarios_base').delete().in('id', pisa)
  }
  await supabaseAdmin.from('horarios_base').insert({ usuario_id: s.usuario_id, fecha: d.dia, inicio_base: d.desde, fin_base: d.hasta, horas_base: horas, editado: true })
}

// La importación de Fresha reemplaza los horarios del rango: se vuelven a aplicar los cambios aprobados de esos días
export async function reaplicarCambios(desde: string, hasta: string) {
  const { data } = await supabaseAdmin.from('solicitudes').select('id, usuario_id, tipo, subtipo_horario, fecha_inicio, fecha_compensacion, horario_nuevo')
    .in('tipo', ['Cambio de horario/día', 'Cambio de Horario']).eq('estado', 'approved')
    .or(`and(fecha_inicio.gte.${desde},fecha_inicio.lte.${hasta}),and(fecha_compensacion.gte.${desde},fecha_compensacion.lte.${hasta})`)
  for (const s of (data ?? []) as Sol[]) await aplicarCambio(s)
  return data?.length ?? 0
}
