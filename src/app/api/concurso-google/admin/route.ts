import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { getConcursoConfig, setConcursoConfig, mesActual, edadRelativaDias, esDelMesContest, type ConcursoConfig } from '@/lib/concurso-google'

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
      .select('id, review_key, author, avatar, rating, texto, fecha_texto, asignados, detectados, revisado')
      .eq('mes', mes),
    supabaseAdmin
      .from('usuarios')
      .select('id, nombre, foto_perfil')
      .eq('estado_cuenta', 'activo')
      .order('nombre'),
  ])

  // Orden: las más nuevas arriba (por la fecha relativa de Google); a igual
  // antigüedad, las capturadas más recientemente (id mayor) primero. Y se marca
  // cada una si cae en el mes del concurso (para señalar las de meses anteriores).
  const hoyISO = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' })
  const fechaAprox = (fechaTexto: string): string | null => {
    const dias = edadRelativaDias(fechaTexto)
    if (dias === null) return null
    const d = new Date(hoyISO + 'T12:00:00Z')
    d.setUTCDate(d.getUTCDate() - dias)
    return `${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')}/${d.getUTCFullYear()}`
  }
  const ordenadas = [...(reviews ?? [])]
    .sort((a, b) => {
      const da = edadRelativaDias(a.fecha_texto ?? '') ?? 99999
      const db = edadRelativaDias(b.fecha_texto ?? '') ?? 99999
      return da - db || (b.id as number) - (a.id as number)
    })
    .map(r => ({ ...r, delMes: esDelMesContest(r.fecha_texto ?? '', mes, hoyISO), fechaAprox: fechaAprox(r.fecha_texto ?? '') }))

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
