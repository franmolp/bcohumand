// Solicitudes "Cambio de horario/día": antes de aprobar se verifica si hay espacio de trabajo libre con el mismo
// conteo del módulo Espacio de trabajo (topes por equipo, carriles y puestos aprobados); al aprobar se modifica el
// horario solo, y si después se rechaza o se borra, vuelve el horario que tenía (guardado en horario_previo).
// - mismo_dia: ese día pasa a tener el horario nuevo.
// - compensacion: no viene el día fecha_inicio, y el día fecha_compensacion se le suman las horas pedidas
//   (si ese día ya trabajaba de 15 a 20 y pide de 9 a 20, se le suma de 9 a 15).
import { supabaseAdmin } from '@/lib/supabase-admin'
import { defaultCapacity, findGapsForDay, isMasajistaODepiladora, isPeluqueria, isRecepcion, overlaps, restarAprobados, toMin, minToStr } from '@/lib/gaps'

type Sol = { id: string; usuario_id: string; tipo: string; estado?: string; subtipo_horario: string | null; fecha_inicio: string; fecha_compensacion: string | null; horario_nuevo: string | null; horario_previo?: Record<string, Fila[]> | null }
type Fila = { inicio_base: string; fin_base: string; horas_base: number | null }
export const esCambioHorario = (tipo: string) => tipo === 'Cambio de horario/día' || tipo === 'Cambio de Horario'
export const CAMPOS_SOL = 'id, usuario_id, tipo, estado, subtipo_horario, fecha_inicio, fecha_compensacion, horario_nuevo'

const fecha = (f: string | null) => (f ?? '').slice(0, 10)
const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado']
const fmt = (f: string) => `el ${DIAS[new Date(f + 'T12:00:00Z').getUTCDay()]} ${f.split('-').reverse().slice(0, 2).join('/')}`
const hm = (t: string) => String(t).slice(0, 5)
const espacio = (equipo: string) => isMasajistaODepiladora(equipo) ? ['un box', 'ningún box'] : isPeluqueria(equipo) ? ['un puesto de peluquería', 'ningún puesto de peluquería'] : isRecepcion(equipo) ? ['un puesto de recepción', 'ningún puesto de recepción'] : ['una mesa', 'ninguna mesa']

export function destinoDe(s: Sol) {
  const [desde, hasta] = (s.horario_nuevo ?? '').split('-').map(x => x?.trim().slice(0, 5))
  const dia = s.subtipo_horario === 'compensacion' ? fecha(s.fecha_compensacion) : fecha(s.fecha_inicio)
  if (!dia || !desde || !hasta || toMin(hasta) <= toMin(desde)) return null
  return { dia, desde, hasta, libre: s.subtipo_horario === 'compensacion' ? fecha(s.fecha_inicio) : null }
}

// Lo que se suma: en compensación, solo las horas que no trabajaba ya ese día
function tramosNuevos(s: Sol, d: NonNullable<ReturnType<typeof destinoDe>>, propios: { inicio: number; fin: number }[]) {
  let piezas = [{ start: toMin(d.desde), end: toMin(d.hasta) }]
  if (s.subtipo_horario === 'compensacion') for (const p of propios) piezas = piezas.flatMap(x => p.fin <= x.start || p.inicio >= x.end ? [x] : [...(p.inicio > x.start ? [{ start: x.start, end: p.inicio }] : []), ...(p.fin < x.end ? [{ start: p.fin, end: x.end }] : [])])
  return piezas.filter(p => p.end > p.start)
}

// ¿Hay espacio de trabajo libre para el horario nuevo? (mismo cálculo que Espacio de trabajo → Disponibles)
export async function evaluarCambio(s: Sol): Promise<{ posible: boolean; mensaje: string }> {
  const d = destinoDe(s)
  if (!d) return { posible: false, mensaje: 'Falta el día o el horario nuevo en la solicitud.' }
  const { data: yo } = await supabaseAdmin.from('usuarios').select('equipo_id, equipo:equipos(nombre)').eq('id', s.usuario_id).single()
  const equipo = ((Array.isArray(yo?.equipo) ? yo?.equipo[0] : yo?.equipo) as { nombre: string } | null)?.nombre ?? ''
  const [uno, ninguno] = espacio(equipo)
  const [cfg, miembros, cerrado] = await Promise.all([
    supabaseAdmin.from('configuracion').select('valor').eq('clave', 'espacio_trabajo').maybeSingle(),
    yo?.equipo_id ? supabaseAdmin.from('usuarios').select('id').eq('equipo_id', yo.equipo_id).eq('estado_cuenta', 'activo') : Promise.resolve({ data: [] as { id: string }[] }),
    supabaseAdmin.from('solicitudes').select('id').eq('tipo', 'Feriado/Local cerrado').eq('estado', 'approved').lte('fecha_inicio', d.dia).or(`fecha_fin.gte.${d.dia},fecha_fin.is.null`).limit(1),
  ])
  if (cerrado.data?.length) return { posible: false, mensaje: `${fmt(d.dia)[0].toUpperCase()}${fmt(d.dia).slice(1)} el local está cerrado.` }
  const capacidad = (cfg.data?.valor as { capacidades?: Record<string, number> } | null)?.capacidades?.[equipo] ?? defaultCapacity(equipo)
  const ids = [...new Set([...(miembros.data ?? []).map(m => m.id), s.usuario_id])]
  const [hor, pue] = await Promise.all([
    supabaseAdmin.from('horarios_base').select('usuario_id, inicio_base, fin_base').eq('fecha', d.dia).in('usuario_id', ids),
    supabaseAdmin.from('solicitudes_puesto').select('usuario_id, hora_inicio, hora_fin, lane').eq('fecha', d.dia).eq('estado', 'approved').in('usuario_id', ids),
  ])
  const turnos = (hor.data ?? []).filter(h => h.inicio_base && h.fin_base).map(h => ({ usuario_id: h.usuario_id as string, inicio: hm(h.inicio_base), fin: hm(h.fin_base) }))
  const propios = turnos.filter(t => t.usuario_id === s.usuario_id).map(t => ({ inicio: toMin(t.inicio), fin: toMin(t.fin) }))
  // Mismo día: su turno de ese día se reemplaza, así que no ocupa lugar; compensación: lo conserva
  const delEquipo = s.subtipo_horario === 'compensacion' ? turnos : turnos.filter(t => t.usuario_id !== s.usuario_id)
  const aprobados = (pue.data ?? []).filter(p => !turnos.some(t => t.usuario_id === p.usuario_id && overlaps(toMin(hm(p.hora_inicio)), toMin(hm(p.hora_fin)), toMin(t.inicio), toMin(t.fin))))
    .map(p => ({ lane: p.lane, start: toMin(hm(p.hora_inicio)), end: toMin(hm(p.hora_fin)) }))
  const libres = restarAprobados(findGapsForDay(delEquipo, capacidad, 1), aprobados, 1)
  const piezas = tramosNuevos(s, d, propios)
  if (!piezas.length) return { posible: true, mensaje: `${fmt(d.dia)[0].toUpperCase()}${fmt(d.dia).slice(1)} ya trabaja en ese horario: no hace falta lugar extra.` }
  const falta = piezas.find(p => !libres.some(g => g.start <= p.start && g.end >= p.end))
  const rango = piezas.map(p => `de ${minToStr(p.start)} a ${minToStr(p.end)}`).join(' y ')
  return falta
    ? { posible: false, mensaje: `No hay ${ninguno} libre ${fmt(d.dia)} de ${minToStr(falta.start)} a ${minToStr(falta.end)}: en ese horario están todas ocupadas.` }
    : { posible: true, mensaje: `Hay ${uno} libre ${fmt(d.dia)} ${rango}.` }
}

const filasDe = async (usuario: string, f: string) => ((await supabaseAdmin.from('horarios_base').select('inicio_base, fin_base, horas_base').eq('usuario_id', usuario).eq('fecha', f)).data ?? []) as Fila[]
const horas = (a: number, b: number) => Math.round((b - a) / 6) / 10

// Al aprobar: el horario queda como pide la solicitud (y se guarda el que tenía, para poder volver atrás)
export async function aplicarCambio(s: Sol) {
  const d = destinoDe(s)
  if (!d) return
  const dias = [d.dia, ...(d.libre ? [d.libre] : [])]
  if (!s.horario_previo) {
    const previo: Record<string, Fila[]> = {}
    for (const f of dias) previo[f] = await filasDe(s.usuario_id, f)
    await supabaseAdmin.from('solicitudes').update({ horario_previo: previo }).eq('id', s.id) // sin solicitudes_horario.sql no se guarda
    s.horario_previo = previo
  }
  // Se parte siempre del horario que tenía (así reaplicar después de importar Fresha no suma dos veces)
  const base = s.horario_previo[d.dia] ?? await filasDe(s.usuario_id, d.dia)
  if (d.libre) await supabaseAdmin.from('horarios_base').delete().eq('usuario_id', s.usuario_id).eq('fecha', d.libre)
  await supabaseAdmin.from('horarios_base').delete().eq('usuario_id', s.usuario_id).eq('fecha', d.dia)
  const filas = s.subtipo_horario === 'compensacion'
    ? [...base.map(b => ({ inicio_base: hm(b.inicio_base), fin_base: hm(b.fin_base), horas_base: b.horas_base })),
       ...tramosNuevos(s, d, base.map(b => ({ inicio: toMin(hm(b.inicio_base)), fin: toMin(hm(b.fin_base)) }))).map(p => ({ inicio_base: minToStr(p.start), fin_base: minToStr(p.end), horas_base: horas(p.start, p.end) }))]
    : [{ inicio_base: d.desde, fin_base: d.hasta, horas_base: horas(toMin(d.desde), toMin(d.hasta)) }]
  if (filas.length) await supabaseAdmin.from('horarios_base').insert(filas.map(f => ({ ...f, usuario_id: s.usuario_id, fecha: d.dia, editado: true })))
}

// Rechazada o borrada después de aprobada: vuelve el horario que tenía esos días
export async function revertirCambio(s: Sol) {
  const previo = s.horario_previo
  if (!previo) return
  for (const [f, filas] of Object.entries(previo)) {
    await supabaseAdmin.from('horarios_base').delete().eq('usuario_id', s.usuario_id).eq('fecha', f)
    if (filas.length) await supabaseAdmin.from('horarios_base').insert(filas.map(x => ({ ...x, usuario_id: s.usuario_id, fecha: f, editado: true })))
  }
  await supabaseAdmin.from('solicitudes').update({ horario_previo: null }).eq('id', s.id)
}

// La importación de Fresha reemplaza los horarios del rango: se vuelven a aplicar los cambios aprobados de esos días
export async function reaplicarCambios(desde: string, hasta: string) {
  let r = await supabaseAdmin.from('solicitudes').select(CAMPOS_SOL + ', horario_previo')
    .in('tipo', ['Cambio de horario/día', 'Cambio de Horario']).eq('estado', 'approved')
    .or(`and(fecha_inicio.gte.${desde},fecha_inicio.lte.${hasta}),and(fecha_compensacion.gte.${desde},fecha_compensacion.lte.${hasta})`)
  if (r.error) r = await supabaseAdmin.from('solicitudes').select(CAMPOS_SOL).in('tipo', ['Cambio de horario/día', 'Cambio de Horario']).eq('estado', 'approved')
    .or(`and(fecha_inicio.gte.${desde},fecha_inicio.lte.${hasta}),and(fecha_compensacion.gte.${desde},fecha_compensacion.lte.${hasta})`) as typeof r
  for (const s of (r.data ?? []) as unknown as Sol[]) {
    // Lo que trajo Fresha pasa a ser el horario "de antes" de esos días
    if (s.horario_previo) { s.horario_previo = null; await supabaseAdmin.from('solicitudes').update({ horario_previo: null }).eq('id', s.id) }
    await aplicarCambio(s)
  }
  return r.data?.length ?? 0
}

// Lee la solicitud con lo necesario para aplicar o revertir (horario_previo solo si ya se corrió el SQL)
export async function leerSolicitud(id: string): Promise<Sol | null> {
  let r = await supabaseAdmin.from('solicitudes').select(CAMPOS_SOL + ', horario_previo').eq('id', id).single()
  if (r.error) r = await supabaseAdmin.from('solicitudes').select(CAMPOS_SOL).eq('id', id).single() as typeof r
  return (r.data as unknown as Sol) ?? null
}
