import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { getConcursoConfig, setConcursoConfig, mesActual, edadRelativaDias, type ConcursoConfig } from '@/lib/concurso-google'

function esAdmin(rol: string) { return rol === 'admin' || rol === 'Admin' }

// Datos para el panel admin: config + reseñas del mes + empleadas para asignar.
export async function GET() {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  if (!esAdmin(session.rol)) return NextResponse.json({ error: 'Prohibido' }, { status: 403 })

  const cfg = await getConcursoConfig()
  const mes = cfg.mes || mesActual()

  const [{ data: reviews }, { data: empleadas }] = await Promise.all([
    supabaseAdmin
      .from('google_menciones')
      .select('id, review_key, author, avatar, rating, texto, fecha_texto, fecha_iso, asignados, detectados, revisado')
      .eq('mes', mes),
    supabaseAdmin
      .from('usuarios')
      .select('id, nombre, foto_perfil')
      .eq('estado_cuenta', 'activo')
      .order('nombre'),
  ])

  // Info de fecha por reseña: exacta (iso_date de SerpAPI) si está, o aproximada
  // desde la fecha relativa. Se usa para mostrarla, ordenar (más nuevas arriba) y
  // marcar si cae en el mes del concurso.
  const TZ = 'America/Argentina/Buenos_Aires'
  const hoyISO = new Date().toLocaleDateString('en-CA', { timeZone: TZ })
  type Info = { fecha: string | null; exacta: boolean; delMes: boolean; ord: number }
  const infoFecha = (r: { fecha_iso?: string | null; fecha_texto?: string | null }): Info => {
    if (r.fecha_iso) {
      const ymd = new Date(r.fecha_iso).toLocaleDateString('en-CA', { timeZone: TZ }) // YYYY-MM-DD
      const [y, m, d] = ymd.split('-')
      return { fecha: `${d}/${m}/${y}`, exacta: true, delMes: ymd.slice(0, 7) === mes, ord: new Date(r.fecha_iso).getTime() }
    }
    const dias = edadRelativaDias(r.fecha_texto ?? '')
    if (dias === null) return { fecha: null, exacta: false, delMes: true, ord: -1 }
    const dt = new Date(hoyISO + 'T12:00:00Z'); dt.setUTCDate(dt.getUTCDate() - dias)
    const ymd = dt.toISOString().slice(0, 10)
    const [y, m, d] = ymd.split('-')
    return { fecha: `${d}/${m}/${y}`, exacta: false, delMes: ymd.slice(0, 7) === mes, ord: dt.getTime() }
  }
  const ordenadas = [...(reviews ?? [])]
    .map(r => ({ r, info: infoFecha(r) }))
    .sort((a, b) => b.info.ord - a.info.ord || (b.r.id as number) - (a.r.id as number))
    .map(({ r, info }) => ({ ...r, fecha: info.fecha, exacta: info.exacta, delMes: info.delMes }))

  return NextResponse.json({ config: cfg, mes, reviews: ordenadas, empleadas: empleadas ?? [] })
}

// Actualiza la configuración: activar/desactivar, mes y apodos.
export async function PUT(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  if (!esAdmin(session.rol)) return NextResponse.json({ error: 'Prohibido' }, { status: 403 })

  const body = await req.json().catch(() => ({})) as Partial<ConcursoConfig>
  const actual = await getConcursoConfig()
  const activo = typeof body.activo === 'boolean' ? body.activo : actual.activo
  // Al activar sin mes, se usa el mes en curso
  const mes = body.mes || actual.mes || (activo ? mesActual() : '')
  const aliases = body.aliases ?? actual.aliases

  await setConcursoConfig({ activo, mes, aliases, recordatorioIdx: actual.recordatorioIdx ?? 0 })
  return NextResponse.json({ ok: true, config: { activo, mes, aliases } })
}

// Corrige la asignación de una reseña (qué empleadas cuentan).
export async function PATCH(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  if (!esAdmin(session.rol)) return NextResponse.json({ error: 'Prohibido' }, { status: 403 })

  const { id, asignados } = await req.json().catch(() => ({})) as { id?: number; asignados?: string[] }
  if (!id || !Array.isArray(asignados)) return NextResponse.json({ error: 'Datos inválidos' }, { status: 400 })

  const { error } = await supabaseAdmin
    .from('google_menciones')
    .update({ asignados, revisado: true })
    .eq('id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

// Quita una reseña del concurso (ej. quedó de un mes anterior o es spam).
export async function DELETE(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  if (!esAdmin(session.rol)) return NextResponse.json({ error: 'Prohibido' }, { status: 403 })

  const { id } = await req.json().catch(() => ({})) as { id?: number }
  if (!id) return NextResponse.json({ error: 'Falta id' }, { status: 400 })

  const { error } = await supabaseAdmin.from('google_menciones').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
