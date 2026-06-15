import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { supabase } from '@/lib/supabase'

interface SolicitudRow {
  id?: string
  email: string
  nombre: string
  tipo: string
  dias: number | null
  fecha_inicio: string
  fecha_fin: string | null
  motivo: string | null
  estado: string
  fecha_creacion: string | null
  moderador: string | null
  comentario: string | null
  certificado: string | null
  subtipo_horario: string | null
  horario_anterior: string | null
  horario_nuevo: string | null
  fecha_compensacion: string | null
}

function normalizeTipo(t: string): string {
  const lower = t.toLowerCase()
  if (lower.includes('vacacion')) return 'Vacaciones'
  if (lower.includes('cambio') && (lower.includes('horario') || lower.includes('dia'))) return 'Cambio de Horario'
  if (lower.includes('salud')) return 'Ausencia por Salud'
  if (lower.includes('injustificad')) return 'Ausencia Injustificada'
  if (lower.includes('feriado') || lower.includes('local')) return 'Feriado/Local cerrado'
  if (lower.includes('d') && lower.match(/d.{0,4}(as|ias|ías)/)) return 'Solicitud de Días'
  if (lower.includes('licencia') || lower.includes('permiso')) return 'Solicitud de Días'
  return t
}

export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  if (session.rol !== 'admin' && session.rol !== 'Admin')
    return NextResponse.json({ error: 'Prohibido' }, { status: 403 })

  const { rows } = await req.json() as { rows: SolicitudRow[] }
  if (!Array.isArray(rows) || rows.length === 0)
    return NextResponse.json({ error: 'No se recibieron filas' }, { status: 400 })

  const { data: usuarios } = await supabase
    .from('usuarios')
    .select('id, email, nombre')
    .limit(1000)

  const emailMap = new Map<string, { id: string; nombre: string }>()
  for (const u of usuarios ?? []) {
    if (u.email) emailMap.set(u.email.toLowerCase().trim(), { id: u.id, nombre: u.nombre })
  }

  const noEncontrados: string[] = []
  const toInsert: Record<string, unknown>[] = []

  for (const row of rows) {
    const emailKey = row.email.toLowerCase().trim()
    const user = emailMap.get(emailKey)
    if (!user) {
      if (!noEncontrados.includes(row.email)) noEncontrados.push(row.email)
      continue
    }

    const tipo = normalizeTipo(row.tipo)
    const estado = ['approved', 'rejected', 'pending'].includes(row.estado?.toLowerCase())
      ? row.estado.toLowerCase()
      : 'pending'

    const record: Record<string, unknown> = {
      usuario_id: user.id,
      empleado_nombre: row.nombre || user.nombre,
      tipo,
      dias: row.dias ?? null,
      fecha_inicio: row.fecha_inicio,
      fecha_fin: row.fecha_fin || null,
      motivo: row.motivo || null,
      estado,
      moderador: row.moderador || null,
      comentario_admin: row.comentario || null,
      certificado_adjunto: row.certificado || null,
    }

    if (row.fecha_creacion) record.fecha_creacion = row.fecha_creacion

    if (tipo === 'Cambio de Horario') {
      record.subtipo_horario = row.subtipo_horario || null
      record.horario_anterior = row.horario_anterior || null
      record.horario_nuevo = row.horario_nuevo || null
      record.fecha_compensacion = row.fecha_compensacion || null
    }

    toInsert.push(record)
  }

  // Traer existentes para deduplicar por (usuario_id, tipo, fecha_inicio)
  const userIds = [...new Set(toInsert.map(r => r.usuario_id as string))]
  const { data: existentes } = await supabase
    .from('solicitudes')
    .select('usuario_id, tipo, fecha_inicio')
    .in('usuario_id', userIds)
    .limit(10000)

  const existSet = new Set((existentes ?? []).map(e => `${e.usuario_id}|${e.tipo}|${e.fecha_inicio}`))
  const nuevas = toInsert.filter(r => !existSet.has(`${r.usuario_id}|${r.tipo}|${r.fecha_inicio}`))

  let ok = 0
  const BATCH = 100
  for (let i = 0; i < nuevas.length; i += BATCH) {
    const chunk = nuevas.slice(i, i + BATCH)
    const { error } = await supabase
      .from('solicitudes')
      .insert(chunk)
    if (error) return NextResponse.json({ error: error.message, sample: chunk[0] }, { status: 500 })
    ok += chunk.length
  }

  return NextResponse.json({ ok, total: rows.length, noEncontrados, duplicados: toInsert.length - nuevas.length })
}
