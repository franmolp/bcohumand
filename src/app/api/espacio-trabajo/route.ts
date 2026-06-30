import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { supabase } from '@/lib/supabase'
import { supabaseAdmin } from '@/lib/supabase-admin'

export const dynamic = 'force-dynamic'

type Seccion = 'manicura' | 'box' | 'peluqueria' | 'recepcion'

function getSeccion(equipoNombre: string | null): Seccion {
  if (!equipoNombre) return 'manicura'
  const n = equipoNombre.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  if (n.includes('peluq')) return 'peluqueria'
  if (n.includes('masaj') || n.includes('depilac')) return 'box'
  if (n.includes('recep')) return 'recepcion'
  return 'manicura'
}

const DEFAULT_CAPACIDADES = { manicura: 8, box: 2, peluqueria: 4 }

export async function GET(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const isAdmin = session.rol === 'admin' || session.rol === 'Admin'
  const isHR = session.rol === 'HR'
  const isEncargada = session.rol === 'Encargada'
  if (!isAdmin && !isHR && !isEncargada) {
    return NextResponse.json({ error: 'Prohibido' }, { status: 403 })
  }

  const { searchParams } = new URL(req.url)
  const fechaInicio = searchParams.get('fechaInicio')
  const fechaFin = searchParams.get('fechaFin')
  if (!fechaInicio || !fechaFin) {
    return NextResponse.json({ error: 'fechaInicio y fechaFin requeridos' }, { status: 400 })
  }

  const [configRes, horariosRes] = await Promise.all([
    supabase.from('configuracion').select('clave, valor').in('clave', ['espacio_trabajo', 'ultima_importacion_turnos']),
    supabaseAdmin
      .from('horarios_base')
      .select('usuario_id, fecha, inicio_base, fin_base')
      .gte('fecha', fechaInicio)
      .lte('fecha', fechaFin)
      .limit(5000),
  ])

  const configMap = new Map((configRes.data ?? []).map((c: { clave: string; valor: unknown }) => [c.clave, c.valor]))
  const espacioConfig = configMap.get('espacio_trabajo') as { capacidades?: typeof DEFAULT_CAPACIDADES } | undefined
  const capacidades = { ...DEFAULT_CAPACIDADES, ...(espacioConfig?.capacidades ?? {}) }
  const ultimaImportacionData = configMap.get('ultima_importacion_turnos') as { fecha?: string } | undefined
  const ultimaImportacion = ultimaImportacionData?.fecha ?? null

  const horarios = horariosRes.data ?? []
  if (horarios.length === 0) {
    return NextResponse.json({ turnos: [], ultimaImportacion, capacidades })
  }

  const userIds = [...new Set(horarios.map((h: { usuario_id: string }) => h.usuario_id))]
  const { data: usuarios } = await supabaseAdmin
    .from('usuarios')
    .select('id, nombre, equipos(nombre)')
    .in('id', userIds)

  const userMap = new Map<string, { nombre: string; equipo: string | null }>((usuarios ?? []).map((u: { id: string; nombre: string; equipos: { nombre: string } | { nombre: string }[] | null }) => {
    const equipoRaw = u.equipos
    const equipoNombre = !equipoRaw ? null
      : Array.isArray(equipoRaw) ? (equipoRaw[0]?.nombre ?? null)
      : (equipoRaw as { nombre: string }).nombre
    return [u.id, { nombre: u.nombre, equipo: equipoNombre }]
  }))

  const turnos = horarios.map((h: { usuario_id: string; fecha: string; inicio_base: string; fin_base: string }) => {
    const user = userMap.get(h.usuario_id)
    const equipo = user?.equipo ?? null
    return {
      usuario_id: h.usuario_id,
      nombre: user?.nombre ?? '—',
      equipo: equipo ?? '',
      seccion: getSeccion(equipo),
      fecha: h.fecha,
      inicio: h.inicio_base,
      fin: h.fin_base,
    }
  })

  return NextResponse.json({ turnos, ultimaImportacion, capacidades })
}
