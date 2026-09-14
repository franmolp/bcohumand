import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { getConcursoConfig, setConcursoConfig, mesActual, type ConcursoConfig } from '@/lib/concurso-google'

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
      .eq('mes', mes)
      .order('created_at', { ascending: false }),
    supabaseAdmin
      .from('usuarios')
      .select('id, nombre, foto_perfil')
      .eq('estado_cuenta', 'activo')
      .order('nombre'),
  ])

  return NextResponse.json({ config: cfg, mes, reviews: reviews ?? [], empleadas: empleadas ?? [] })
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
