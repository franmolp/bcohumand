import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase-admin'
import {
  defaultCapacity, findGapsForDay, restarAprobados, decomponerGap,
  toMin, minToStr, minGapParaEquipo, MIN_GAP_CONTIGUO, tipoRecurso,
} from '@/lib/gaps'

// Debug (solo admin): vuelca TODO lo que interviene en los puestos libres / doble turno
// de un día y un equipo, para ver por qué figura algo mal.
// Uso: /api/puestos-disponibles/debug?fecha=2026-10-27&equipo=Manicuras
export async function GET(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const isAdmin = session.rol === 'admin' || session.rol === 'Admin'
  if (!isAdmin) return NextResponse.json({ error: 'Prohibido' }, { status: 403 })

  const { searchParams } = new URL(req.url)
  const fecha = (searchParams.get('fecha') || '').trim()
  const equipoNombre = (searchParams.get('equipo') || 'Manicuras').trim()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
    return NextResponse.json({ error: 'Falta fecha YYYY-MM-DD' }, { status: 400 })
  }

  const { data: equipoRow } = await supabaseAdmin.from('equipos').select('id, nombre').ilike('nombre', equipoNombre).single()
  if (!equipoRow) return NextResponse.json({ error: `Equipo "${equipoNombre}" no encontrado` }, { status: 404 })

  const tipo = tipoRecurso(equipoRow.nombre) ?? 'mesa'
  const capacityOverride = ((await supabaseAdmin.from('configuracion').select('valor').eq('clave', 'espacio_trabajo').single()).data?.valor as { capacidades?: Record<string, number> } | null)?.capacidades ?? {}
  const capacity = capacityOverride[equipoRow.nombre] ?? defaultCapacity(equipoRow.nombre)

  const [miembrosRes, usuariosRes, horariosRes, puestosRes] = await Promise.all([
    supabaseAdmin.from('usuarios').select('id, nombre').eq('equipo_id', equipoRow.id).eq('estado_cuenta', 'activo'),
    supabaseAdmin.from('usuarios').select('id, nombre'),
    supabaseAdmin.from('horarios_base').select('usuario_id, inicio_base, fin_base, editado').eq('fecha', fecha),
    supabaseAdmin.from('solicitudes_puesto').select('id, usuario_id, hora_inicio, hora_fin, lane, estado, equipo_nombre').eq('equipo_id', equipoRow.id).eq('fecha', fecha),
  ])

  const nombre = new Map((usuariosRes.data ?? []).map(u => [u.id as string, u.nombre as string]))
  const miembroIds = new Set((miembrosRes.data ?? []).map(u => u.id as string))
  const hm = (t: string | null) => (t ? t.slice(0, 5) : '')

  // Turnos (horarios_base) de los miembros del equipo, que son la base del cálculo de huecos.
  const shiftsDia = (horariosRes.data ?? [])
    .filter(h => miembroIds.has(h.usuario_id as string))
    .map(h => ({ usuario_id: h.usuario_id as string, inicio: hm(h.inicio_base as string), fin: hm(h.fin_base as string) }))

  const puestos = (puestosRes.data ?? []) as { id: string; usuario_id: string; hora_inicio: string; hora_fin: string; lane: number; estado: string }[]
  const aprobados = puestos.filter(p => p.estado === 'approved')

  // Filtro "obsoleto" NUEVO (la base CONTIENE entero el puesto) vs VIEJO (solo se pisa).
  const contiene = (s: { hora_inicio: string; hora_fin: string; usuario_id: string }) => {
    const ini = toMin(hm(s.hora_inicio)), fin = toMin(hm(s.hora_fin))
    return shiftsDia.some(t => t.usuario_id === s.usuario_id && toMin(t.inicio) <= ini && toMin(t.fin) >= fin)
  }
  const sePisa = (s: { hora_inicio: string; hora_fin: string; usuario_id: string }) => {
    const ini = toMin(hm(s.hora_inicio)), fin = toMin(hm(s.hora_fin))
    return shiftsDia.some(t => t.usuario_id === s.usuario_id && ini < toMin(t.fin) && toMin(t.inicio) < fin)
  }

  const minGap = minGapParaEquipo(equipoRow.nombre)
  const piso = Math.min(minGap, MIN_GAP_CONTIGUO)
  const gapsCrudos = findGapsForDay(shiftsDia, capacity, piso)
  const aprobadosDiaNuevo = aprobados.filter(s => !contiene(s)).map(s => ({ lane: s.lane, start: toMin(hm(s.hora_inicio)), end: toMin(hm(s.hora_fin)) }))
  const gapsLibres = restarAprobados(gapsCrudos, aprobadosDiaNuevo, piso)

  const ofrecidos: { inicio: string; fin: string; turno: string | null; lane: number }[] = []
  for (const g of gapsLibres) {
    for (const pieza of decomponerGap(g, tipo, piso)) {
      ofrecidos.push({ inicio: minToStr(pieza.start), fin: minToStr(pieza.end), turno: pieza.label, lane: g.lane })
    }
  }

  return NextResponse.json({
    fecha, equipo: equipoRow.nombre, tipo_recurso: tipo, capacity,
    horarios_base_del_dia: shiftsDia
      .map(s => ({ empleada: nombre.get(s.usuario_id) ?? s.usuario_id, inicio: s.inicio, fin: s.fin }))
      .sort((a, b) => a.inicio.localeCompare(b.inicio)),
    horarios_base_no_miembros: (horariosRes.data ?? [])
      .filter(h => !miembroIds.has(h.usuario_id as string))
      .map(h => ({ usuario_id: h.usuario_id, nombre: nombre.get(h.usuario_id as string) ?? '?', inicio: hm(h.inicio_base as string), fin: hm(h.fin_base as string) })),
    solicitudes_puesto_del_dia: puestos
      .map(p => ({
        empleada: nombre.get(p.usuario_id) ?? p.usuario_id,
        estado: p.estado, horario: `${hm(p.hora_inicio)}-${hm(p.hora_fin)}`, lane: p.lane,
        // Para cada aprobado: ¿lo tapa su base? (nuevo) ¿apenas se pisa? (viejo)
        base_lo_contiene_entero: p.estado === 'approved' ? contiene(p) : null,
        apenas_se_pisa_con_base: p.estado === 'approved' ? sePisa(p) : null,
      }))
      .sort((a, b) => a.horario.localeCompare(b.horario)),
    gaps_crudos: gapsCrudos.map(g => ({ lane: g.lane, de: minToStr(g.start), a: minToStr(g.end) })),
    aprobados_que_ocupan_mesa: aprobadosDiaNuevo.map(a => ({ lane: a.lane, de: minToStr(a.start), a: minToStr(a.end) })),
    gaps_libres_tras_restar: gapsLibres.map(g => ({ lane: g.lane, de: minToStr(g.start), a: minToStr(g.end) })),
    puestos_que_se_ofrecerian_ahora: ofrecidos,
  }, { headers: { 'Cache-Control': 'no-store' } })
}
