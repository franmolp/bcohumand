import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { supabase } from '@/lib/supabase'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { computeChip, getTeamType, DEFAULT_CONFIG, AsistenciaConfig } from '@/lib/asistencia'
import { isRecepcion } from '@/lib/gaps'

// Endpoint de diagnóstico (solo admin): dado un nombre parcial + fecha, vuelca
// TODO lo que interviene en el cálculo del chip de asistencia de ese día, para
// entender por qué figura un estado determinado. Read-only.
// Uso: /api/asistencia/debug?nombre=Lucila&fecha=2026-09-18
export async function GET(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const isAdmin = session.rol === 'admin' || session.rol === 'Admin'
  if (!isAdmin) return NextResponse.json({ error: 'Prohibido' }, { status: 403 })

  const { searchParams } = new URL(req.url)
  const nombre = (searchParams.get('nombre') || '').trim().toLowerCase()
  const fecha = (searchParams.get('fecha') || '').trim()
  if (!nombre || !fecha) {
    return NextResponse.json({ error: 'Faltan parámetros: nombre y fecha (YYYY-MM-DD)' }, { status: 400 })
  }

  // Buscar usuarios cuyo nombre contenga el texto
  const { data: usuarios } = await supabase
    .from('usuarios')
    .select('id, nombre, reloj, equipo_id, equipos(nombre)')
  const matches = (usuarios ?? []).filter(u => (u.nombre as string).toLowerCase().includes(nombre))

  if (!matches.length) {
    return NextResponse.json({ error: `Sin usuarios que contengan "${nombre}"`, usuariosTotales: usuarios?.length ?? 0 })
  }

  // Config de asistencia
  const { data: configData } = await supabase
    .from('configuracion').select('valor').eq('clave', 'asistencia').single()
  const config: AsistenciaConfig = configData?.valor
    ? { ...DEFAULT_CONFIG, ...(configData.valor as object) }
    : DEFAULT_CONFIG

  const out = []
  for (const u of matches) {
    const equipoRaw = u.equipos as { nombre: string } | { nombre: string }[] | null
    const equipoNombre = !equipoRaw ? null
      : Array.isArray(equipoRaw) ? (equipoRaw[0]?.nombre ?? null)
      : equipoRaw.nombre
    const teamType = getTeamType(equipoNombre, config)
    const esRecepcion = equipoNombre ? isRecepcion(equipoNombre) : false

    const [horarios, raw, primerTurno, procesada, citas] = await Promise.all([
      supabaseAdmin.from('horarios_base').select('inicio_base, fin_base, horas_base').eq('usuario_id', u.id).eq('fecha', fecha),
      supabaseAdmin.from('asistencia_raw').select('hora').eq('usuario_id', u.id).eq('fecha', fecha),
      supabaseAdmin.from('primer_turno_dia').select('primer_turno, ultimo_turno, cant_citas').eq('usuario_id', u.id).eq('fecha', fecha),
      supabaseAdmin.from('asistencia_procesada').select('*').eq('usuario_id', u.id).eq('fecha', fecha),
      supabaseAdmin.from('fresha_citas_detalle').select('estado, categoria, servicio, franja_inicio, franja_fin, duracion_min').eq('usuario_id', u.id).eq('fecha', fecha).order('franja_inicio', { ascending: true }),
    ])

    // Reconstruir horario base (puede haber varias filas → rango exterior + suma horas)
    let horario: { inicio: string; fin: string; horas: number } | null = null
    for (const h of horarios.data ?? []) {
      if (!horario) horario = { inicio: h.inicio_base, fin: h.fin_base, horas: h.horas_base ?? 0 }
      else horario = {
        inicio: h.inicio_base < horario.inicio ? h.inicio_base : horario.inicio,
        fin: h.fin_base > horario.fin ? h.fin_base : horario.fin,
        horas: horario.horas + (h.horas_base ?? 0),
      }
    }

    const fichadas = (raw.data ?? []).map(r => r.hora as string)
    const pt = primerTurno.data?.[0] ?? null

    const recomputed = computeChip({
      horario,
      fichadas,
      primerTurno: pt?.primer_turno ?? null,
      cantCitas: pt?.cant_citas ?? (pt ? 1 : 0),
      solicitudTipo: null,
      solicitudEstado: null,
      teamType,
      config,
      esRecepcion,
    })

    out.push({
      usuario: { id: u.id, nombre: u.nombre, reloj: u.reloj, equipo: equipoNombre, teamType, esRecepcion },
      horario_base: horarios.data ?? [],
      horario_base_efectivo: horario,
      fichadas_raw: fichadas,
      primer_turno_dia: pt,
      fresha_citas_detalle: citas.data ?? [],
      asistencia_procesada_guardada: procesada.data?.[0] ?? null,
      chip_recalculado_ahora: recomputed,
      nota_editado_manual: procesada.data?.[0]?.editado_manual
        ? 'ESTE DÍA ESTÁ MARCADO COMO EDITADO MANUALMENTE → la regeneración NO lo pisa.'
        : 'No está editado manualmente.',
    })
  }

  return NextResponse.json({ fecha, config: { toleranciaEntrada: config.toleranciaEntrada }, resultados: out }, {
    headers: { 'Cache-Control': 'no-store' },
  })
}
