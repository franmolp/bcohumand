import { supabaseAdmin } from '@/lib/supabase-admin'
import { toMin, turnosDeTipo } from '@/lib/gaps'

// ─── Cupos de vacaciones ─────────────────────────────────────────────────────────
// Reglas (reglamento de vacaciones):
//  - Se piden 7 o 14 días corridos, de lunes a domingo (las excepciones las carga admin/RRHH).
//  - Manicuría: como máximo 2 manicuras de vacaciones en la MISMA franja (mañana/tarde) del mismo día.
//    Como los turnos rotan, se mira día por día con el horario programado de cada una: solo se cruzan
//    los días y franjas en que de verdad hubieran trabajado juntas.
//  - Peluquería, Recepción y Masajes+Depilación (un solo grupo): como máximo 1 persona por semana.
//  - Cuentan las vacaciones aprobadas y las pendientes (se respeta el orden en que se pidieron:
//    la que pide después ya ve la semana ocupada).
//  - Para las semanas sin horario cargado todavía (se cargan 90 días adelante) se estima con el
//    patrón de las últimas semanas de cada persona (detecta rotaciones de 1 a 4 semanas).

export type Grupo = 'manicuria' | 'peluqueria' | 'masajes' | 'recepcion'
const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
export function grupoVacaciones(equipo: string | null | undefined): Grupo | null {
  const n = norm(equipo ?? '')
  if (n.includes('peluq')) return 'peluqueria'
  if (n.includes('masaj') || n.includes('depilac')) return 'masajes'
  if (n.includes('recep')) return 'recepcion'
  if (['manic', 'unas', 'manos', 'pedic', 'podolog'].some(k => n.includes(k))) return 'manicuria'
  return null
}
const CUPO_MANICURIA_FRANJA = 2
const NOMBRE_GRUPO: Record<Exclude<Grupo, 'manicuria'>, string> = {
  peluqueria: 'peluqueras', masajes: 'masajistas y depiladoras', recepcion: 'recepcionistas',
}

export interface Semana {
  lunes: string
  domingo: string
  libre: boolean
  motivo: string | null // por qué no (sin nombres)
  estimada: boolean // se calculó con el horario habitual (todavía no está el programado)
}

// ── Fechas (AAAA-MM-DD, mediodía UTC para no tener problemas de huso) ──
const d0 = (f: string) => new Date(f + 'T12:00:00Z')
const iso = (d: Date) => d.toISOString().slice(0, 10)
export const sumarDias = (f: string, n: number) => { const d = d0(f); d.setUTCDate(d.getUTCDate() + n); return iso(d) }
const diaSemana = (f: string) => (d0(f).getUTCDay() + 6) % 7 // 0 = lunes
export const lunesDe = (f: string) => sumarDias(f, -diaSemana(f))
const semanasEntre = (a: string, b: string) => Math.round((d0(b).getTime() - d0(a).getTime()) / (7 * 864e5))
const DIAS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']
const corta = (f: string) => `${DIAS[diaSemana(f)]} ${Number(f.slice(8))}/${Number(f.slice(5, 7))}`

// Franjas que cubre un turno (al menos 1 hora dentro de la franja de mañana o de tarde)
const FRANJAS = turnosDeTipo('mesa')
function franjasDe(inicio: string, fin: string): number[] {
  const a = toMin(inicio.slice(0, 5)), b = toMin(fin.slice(0, 5))
  return FRANJAS.map((f, i) => Math.min(b, f.fin) - Math.max(a, f.inicio) >= 60 ? i : -1).filter(i => i >= 0)
}

// Horario por persona y día: conjunto de franjas (vacío = no trabaja). Con lo programado y, más allá,
// estimado con su patrón habitual.
type Horarios = { franjas: (uid: string, fecha: string) => Set<number> | null; estimado: (fecha: string) => boolean }
async function cargarHorarios(uids: string[], hasta: string): Promise<Horarios> {
  const hoy = iso(new Date(Date.now() - 3 * 3600e3))
  const desde = sumarDias(lunesDe(hoy), -8 * 7)
  const filas: { usuario_id: string; fecha: string; inicio_base: string; fin_base: string }[] = []
  for (let off = 0; ; off += 1000) {
    const { data } = await supabaseAdmin.from('horarios_base').select('usuario_id, fecha, inicio_base, fin_base')
      .in('usuario_id', uids).gte('fecha', desde).lte('fecha', hasta).order('fecha').range(off, off + 999)
    filas.push(...(data ?? []))
    if (!data || data.length < 1000) break
  }
  const porDia = new Map<string, Set<number>>() // `${uid}|${fecha}`
  let ultimoDato = ''
  for (const f of filas) {
    const fecha = String(f.fecha).slice(0, 10), k = `${f.usuario_id}|${fecha}`
    if (!porDia.has(k)) porDia.set(k, new Set())
    for (const i of franjasDe(f.inicio_base, f.fin_base)) porDia.get(k)!.add(i)
    if (fecha > ultimoDato) ultimoDato = fecha
  }
  // Hasta dónde hay horario programado: la última semana completa con datos
  const finProgramado = ultimoDato ? sumarDias(lunesDe(ultimoDato), diaSemana(ultimoDato) === 6 ? 6 : -1) : ''

  // Patrón semanal de cada persona: firma por semana y período de rotación (1 a 4 semanas)
  const patron = new Map<string, { semanas: Map<string, string[]>; periodo: number; ultimas: string[] }>()
  const lunesDatos: string[] = []
  if (finProgramado) for (let l = desde; l <= lunesDe(finProgramado); l = sumarDias(l, 7)) lunesDatos.push(l)
  for (const uid of uids) {
    const semanas = new Map<string, string[]>()
    for (const l of lunesDatos) semanas.set(l, Array.from({ length: 7 }, (_, i) => [...(porDia.get(`${uid}|${sumarDias(l, i)}`) ?? [])].sort().join(',')))
    const ultimas = lunesDatos.slice(-8)
    const firma = (l: string) => semanas.get(l)!.join('|')
    let periodo = 1, mejor = -1
    for (const p of [1, 2, 3, 4]) {
      let iguales = 0, total = 0
      for (let i = p; i < ultimas.length; i++) { total++; if (firma(ultimas[i]) === firma(ultimas[i - p])) iguales++ }
      const ratio = total ? iguales / total : 0
      if (ratio > mejor + 0.05) { mejor = ratio; periodo = p } // a igualdad, el período más corto
    }
    patron.set(uid, { semanas, periodo, ultimas })
  }

  return {
    estimado: fecha => !finProgramado || fecha > finProgramado,
    franjas: (uid, fecha) => {
      if (finProgramado && fecha <= finProgramado) return porDia.get(`${uid}|${fecha}`) ?? new Set()
      const p = patron.get(uid)
      if (!p || !p.ultimas.length) return null // sin datos: no se sabe
      const lunes = lunesDe(fecha)
      // La semana con datos más reciente que cae en la misma posición de la rotación
      const base = [...p.ultimas].reverse().find(l => ((semanasEntre(l, lunes) % p.periodo) + p.periodo) % p.periodo === 0) ?? p.ultimas.at(-1)!
      const s = p.semanas.get(base)![diaSemana(fecha)]
      return new Set(s ? s.split(',').map(Number) : [])
    },
  }
}

// Semanas (lunes a domingo) entre `desde` y `hasta` para pedir vacaciones, con si hay cupo para esta persona.
// `excluirId`: solicitud que no se cuenta (la propia, si se está revisando una ya cargada).
export async function semanasVacaciones(usuarioId: string, desde: string, hasta: string, excluirId?: string): Promise<{ grupo: Grupo | null; semanas: Semana[] }> {
  const primerLunes = diaSemana(desde) === 0 ? desde : sumarDias(lunesDe(desde), 7)
  const lunesLista: string[] = []
  for (let l = primerLunes; l <= hasta; l = sumarDias(l, 7)) lunesLista.push(l)
  const fin = lunesLista.length ? sumarDias(lunesLista.at(-1)!, 6) : hasta

  const { data: yo } = await supabaseAdmin.from('usuarios').select('id, equipo:equipos(nombre)').eq('id', usuarioId).single()
  const grupo = grupoVacaciones((yo?.equipo as unknown as { nombre: string } | null)?.nombre)
  const todasLibres = () => lunesLista.map(l => ({ lunes: l, domingo: sumarDias(l, 6), libre: true, motivo: null, estimada: false }))
  if (!grupo) return { grupo, semanas: todasLibres() }

  // Compañeras del mismo grupo (activas) y sus vacaciones aprobadas o pendientes en el rango
  const { data: usuarios } = await supabaseAdmin.from('usuarios').select('id, equipo:equipos(nombre)').eq('estado_cuenta', 'activo')
  const grupoIds = (usuarios ?? []).filter(u => grupoVacaciones((u.equipo as unknown as { nombre: string } | null)?.nombre) === grupo).map(u => u.id as string)
  const otras = grupoIds.filter(id => id !== usuarioId)
  if (!otras.length) return { grupo, semanas: todasLibres() }
  let q = supabaseAdmin.from('solicitudes').select('id, usuario_id, fecha_inicio, fecha_fin')
    .eq('tipo', 'Vacaciones').in('estado', ['pending', 'approved']).in('usuario_id', otras)
    .lte('fecha_inicio', fin).or(`fecha_fin.gte.${primerLunes},fecha_fin.is.null`)
  if (excluirId) q = q.neq('id', excluirId)
  const { data: vacs } = await q
  // Quién está de vacaciones cada día
  const ausentes = new Map<string, Set<string>>()
  for (const v of vacs ?? []) {
    const ini = String(v.fecha_inicio).slice(0, 10), hastaV = String(v.fecha_fin ?? v.fecha_inicio).slice(0, 10)
    for (let f = ini < primerLunes ? primerLunes : ini; f <= hastaV && f <= fin; f = sumarDias(f, 1)) {
      if (!ausentes.has(f)) ausentes.set(f, new Set())
      ausentes.get(f)!.add(v.usuario_id as string)
    }
  }

  if (grupo !== 'manicuria') {
    // 1 persona por semana: alcanza con que otra del grupo tenga algún día de vacaciones esa semana
    return {
      grupo,
      semanas: lunesLista.map(l => {
        const ocupada = Array.from({ length: 7 }, (_, i) => sumarDias(l, i)).some(f => (ausentes.get(f)?.size ?? 0) > 0)
        return { lunes: l, domingo: sumarDias(l, 6), libre: !ocupada, motivo: ocupada ? `Excede el número de ${NOMBRE_GRUPO[grupo]} por semana` : null, estimada: false }
      }),
    }
  }

  // Manicuría: día por día y franja por franja
  const h = await cargarHorarios([usuarioId, ...otras], fin)
  return {
    grupo,
    semanas: lunesLista.map(l => {
      let motivo: string | null = null, estimada = false
      for (let i = 0; i < 7 && !motivo; i++) {
        const f = sumarDias(l, i)
        if (h.estimado(f)) estimada = true
        const mias = h.franjas(usuarioId, f) ?? new Set([0, 1]) // sin horario: se asume que trabaja todo el día
        if (!mias.size) continue // ese día no trabaja: su ausencia no le saca a nadie
        for (const fr of mias) {
          const otrasAusentes = [...(ausentes.get(f) ?? [])].filter(uid => (h.franjas(uid, f) ?? new Set([0, 1])).has(fr)).length
          if (otrasAusentes >= CUPO_MANICURIA_FRANJA) { motivo = 'Excede el número de manicuras de tu mismo turno'; break }
        }
      }
      return { lunes: l, domingo: sumarDias(l, 6), libre: !motivo, motivo, estimada }
    }),
  }
}

// Hasta cuándo se ofrecen semanas: al menos hasta el 31 de marzo siguiente
export function horizonteVacaciones(hoy: string) {
  const anio = Number(hoy.slice(0, 4)), mes = Number(hoy.slice(5, 7))
  return `${mes >= 4 ? anio + 1 : anio}-03-31`
}

// Valida un pedido de vacaciones de una empleada: lunes a domingo, 7 o 14 días, y con cupo en cada semana
export async function validarPedidoVacaciones(usuarioId: string, inicio: string, fin: string | null): Promise<string | null> {
  const finReal = fin ?? inicio
  const dias = Math.round((d0(finReal).getTime() - d0(inicio).getTime()) / 864e5) + 1
  if (diaSemana(inicio) !== 0 || diaSemana(finReal) !== 6 || (dias !== 7 && dias !== 14)) {
    return 'Las vacaciones se piden de Lunes a Domingo, por 7 o 14 días corridos'
  }
  const { semanas } = await semanasVacaciones(usuarioId, inicio, finReal)
  const ocupada = semanas.find(s => !s.libre)
  return ocupada ? `No hay cupo la semana del ${corta(ocupada.lunes)}: ${ocupada.motivo}` : null
}
